import {
  fetchJapaneseCaptionLines,
  getYouTubeVideoId,
  uniqueCaptionTexts
} from "./youtube-captions.js";

const BRIDGE_FLAG = "data-yt-furigana-bridge";

export function injectPageCaptionBridge() {
  if (document.documentElement.hasAttribute(BRIDGE_FLAG)) return;
  document.documentElement.setAttribute(BRIDGE_FLAG, "1");

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("dist/page-caption-bridge.js");
  script.async = false;
  script.onload = () => script.remove();
  script.onerror = () => {
    document.documentElement.removeAttribute(BRIDGE_FLAG);
    console.warn("[YT Furigana] page caption bridge failed to load");
  };
  (document.head || document.documentElement).appendChild(script);
}

function requestCaptionsFromPage(videoId, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const requestId = `cap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("page caption bridge timeout"));
    }, timeoutMs);

    function onMessage(event) {
      if (event.source !== window) return;
      if (event.data?.type !== "YT_FURIGANA_CAPTIONS") return;
      if (event.data?.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (!event.data.ok) {
        reject(new Error(event.data.error || "page caption bridge failed"));
        return;
      }
      resolve({
        lines: event.data.lines || [],
        track: event.data.track || null
      });
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      { type: "YT_FURIGANA_GET_CAPTIONS", requestId, videoId },
      "*"
    );
  });
}

function yieldToMain() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

async function mapPool(items, concurrency, mapper, signal) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
      // Keep the YouTube UI responsive during long prefetch runs.
      await yieldToMain();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Load unique caption lines for the current video.
 * Prefer ANDROID timedtext (no UI). Skip transcript-panel DOM open — it freezes YouTube.
 */
export async function loadVideoCaptionTexts(videoId, normalize) {
  const errors = [];

  try {
    const fromAndroid = await fetchJapaneseCaptionLines(videoId, { normalize });
    if (fromAndroid.lines.length > 0) {
      return {
        videoId,
        lines: fromAndroid.lines,
        source: fromAndroid.source || "android",
        track: fromAndroid.track
      };
    }
  } catch (error) {
    errors.push(`android: ${error.message}`);
    console.warn("[YT Furigana] ANDROID caption fetch failed:", error.message);
  }

  injectPageCaptionBridge();
  try {
    const fromPage = await requestCaptionsFromPage(videoId);
    const lines = uniqueCaptionTexts(fromPage.lines || [], normalize);
    if (lines.length > 0) {
      return {
        videoId,
        lines,
        source: "page",
        track: fromPage.track
      };
    }
  } catch (error) {
    errors.push(`page: ${error.message}`);
    console.warn("[YT Furigana] page caption fetch failed:", error.message);
  }

  throw new Error(
    `字幕を取得できませんでした (${errors.join(" / ") || "unknown"})`
  );
}

/**
 * Prefetch furigana for all unique caption lines into cache.
 */
export async function prefetchCaptionFurigana({
  videoId,
  normalize,
  convert,
  cacheHas,
  cacheSet,
  concurrency = 4,
  onProgress,
  signal,
  loadLines
}) {
  const id = videoId || getYouTubeVideoId();
  if (!id) {
    throw new Error("動画IDが取得できません");
  }

  onProgress?.({
    phase: "fetch",
    percent: 0,
    message: "字幕トラックを取得中…",
    done: 0,
    total: 0
  });

  const loaded = loadLines
    ? await loadLines(id)
    : await loadVideoCaptionTexts(id, normalize);
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const lines = uniqueCaptionTexts(loaded.lines || [], normalize ?? ((t) => t));
  const pending = lines.filter((line) => !cacheHas(line));
  const total = lines.length;
  const already = total - pending.length;

  onProgress?.({
    phase: "convert",
    percent: total === 0 ? 100 : Math.round((already / total) * 100),
    message:
      pending.length === 0
        ? `字幕 ${total} 行はキャッシュ済み`
        : `字幕を事前処理中… 0/${pending.length}`,
    done: already,
    total,
    source: loaded.source
  });

  if (pending.length === 0) {
    onProgress?.({
      phase: "ready",
      percent: 100,
      message: `字幕 ${total} 行を準備済み`,
      done: total,
      total,
      source: loaded.source
    });
    return { videoId: id, lines, converted: 0, skipped: total, source: loaded.source };
  }

  let done = already;
  await mapPool(
    pending,
    concurrency,
    async (line) => {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (cacheHas(line)) {
        done += 1;
        return null;
      }
      const html = await convert(line);
      cacheSet(line, html);
      done += 1;
      onProgress?.({
        phase: "convert",
        percent: Math.round((done / total) * 100),
        message: `字幕を事前処理中… ${done - already}/${pending.length}`,
        done,
        total,
        source: loaded.source
      });
      return html;
    },
    signal
  );

  onProgress?.({
    phase: "ready",
    percent: 100,
    message: `字幕 ${total} 行を事前処理しました`,
    done: total,
    total,
    source: loaded.source
  });

  return {
    videoId: id,
    lines,
    converted: pending.length,
    skipped: already,
    source: loaded.source,
    track: loaded.track
  };
}
