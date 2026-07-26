/**
 * 書き出し用の字幕取得（ユーザーが URL を貼って明示的に押したときだけ動く）。
 *
 * 通常再生では絶対に呼ばない。timedtext を連打すると IP 単位で 429 になり、
 * 拡張を切っても YouTube 本体の字幕まで数日出なくなる事故につながるため、
 * ここでは「1 本ずつ・間隔を空ける・429 を見たら長く休む」を必ず守る。
 * 参照: .cursor/rules/youtube-timedtext-429.mdc
 *
 * 取得順:
 * 1) YouTube タブのページ文脈（ログイン Cookie・PoToken が効く）← 本命
 * 2) 拡張 SW からの Innertube / watch（フォールバック。403 や空本文になりやすい）
 */

import {
  INNERTUBE_CLIENTS,
  fetchCaptionTrackData,
  fetchInnertubePlayerResponse,
  fetchPlayerResponseFromWatchPage,
  getCaptionTracksFromPlayerResponse,
  isTimedTextRateLimitError,
  isTimedTextRateLimited,
  noteTimedTextRateLimit
} from "./youtube-captions.js";

/** 連続取得の最短間隔 */
export const EXPORT_MIN_INTERVAL_MS = 20_000;
/** 429 を踏んだあとの休止時間。短い再試行は状況を悪化させるだけ */
export const EXPORT_RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;

let lastFetchAt = 0;
let inFlight = false;

/** テスト用にガード状態を戻す */
export function resetExportFetchGuards() {
  lastFetchAt = 0;
  inFlight = false;
}

/**
 * 日本語の「手動」字幕トラックだけを選ぶ。
 * 自動生成（ASR）は書き起こし精度が足りないので対象外。
 * @param {{ languageCode?: string, kind?: string, name?: { simpleText?: string }, vssId?: string }[]} tracks
 */
export function pickManualJapaneseTrack(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  const japanese = list.filter((track) =>
    String(track?.languageCode || "").toLowerCase().startsWith("ja")
  );
  if (!japanese.length) return null;
  return japanese.find((track) => track.kind !== "asr") || null;
}

/**
 * 日本語トラックはあるが自動生成しか無いか。
 * @param {{ languageCode?: string, kind?: string }[]} tracks
 */
export function hasOnlyAsrJapanese(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  const japanese = list.filter((track) =>
    String(track?.languageCode || "").toLowerCase().startsWith("ja")
  );
  return japanese.length > 0 && japanese.every((track) => track.kind === "asr");
}

/**
 * @param {{ name?: { simpleText?: string, runs?: { text?: string }[] }, languageCode?: string }} track
 */
export function describeTrack(track) {
  const name =
    track?.name?.simpleText ||
    track?.name?.runs?.map((run) => run?.text || "").join("") ||
    "";
  return name || String(track?.languageCode || "ja");
}

/**
 * @param {unknown} playerResponse
 */
export function getVideoTitle(playerResponse) {
  return String(playerResponse?.videoDetails?.title || "");
}

/**
 * 対象動画の YouTube タブを用意し、ページ文脈で字幕を取る。
 * Innertube を SW から叩くと 403／空本文になりやすいので、こちらを本命にする。
 * @param {string} videoId
 */
export async function fetchCaptionsViaYouTubeTab(videoId) {
  const chromeApi = globalThis.chrome;
  if (!chromeApi?.tabs?.create || !chromeApi?.scripting?.executeScript) {
    throw new Error("page scripting unavailable");
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let tabId = null;
  let created = false;

  const existing = await chromeApi.tabs.query({
    url: ["*://www.youtube.com/watch*", "*://www.youtube.com/live/*"]
  });
  const hit = (existing || []).find((tab) => {
    try {
      return new URL(tab.url || "").searchParams.get("v") === videoId;
    } catch {
      return false;
    }
  });

  if (hit?.id != null) {
    tabId = hit.id;
  } else {
    const tab = await chromeApi.tabs.create({ url: watchUrl, active: false });
    tabId = tab.id;
    created = true;
  }

  if (tabId == null) throw new Error("YouTube タブを開けませんでした");

  try {
    await waitForTabComplete(chromeApi, tabId, 25_000);
    // ytInitialPlayerResponse 注入待ち
    await new Promise((r) => setTimeout(r, 800));

    // ネスト関数は import を閉じ込まない（executeScript が toString でページへ運ぶ）
    const results = await chromeApi.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [videoId],
      func: async (targetVideoId) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        function pickManualJa(tracks) {
          const list = Array.isArray(tracks) ? tracks : [];
          const japanese = list.filter((t) =>
            String(t?.languageCode || "").toLowerCase().startsWith("ja")
          );
          if (!japanese.length) return { track: null, asrOnly: false };
          const manual = japanese.find((t) => t.kind !== "asr") || null;
          return {
            track: manual,
            asrOnly: !manual && japanese.every((t) => t.kind === "asr")
          };
        }

        function getTracks(playerResponse) {
          return (
            playerResponse?.captions?.playerCaptionsTracklistRenderer
              ?.captionTracks || []
          );
        }

        function parseJson3Cues(data) {
          const events = Array.isArray(data?.events) ? data.events : [];
          const cues = [];
          for (const event of events) {
            const segs = Array.isArray(event?.segs) ? event.segs : [];
            const text = segs
              .map((s) => s?.utf8 || "")
              .join("")
              .replace(/\n/g, " ")
              .trim();
            if (!text) continue;
            const startMs = Number(event?.tStartMs) || 0;
            const endMs = startMs + (Number(event?.dDurationMs) || 0);
            cues.push({ startMs, endMs, text });
          }
          return cues;
        }

        async function fetchJson3(track) {
          const base = String(track?.baseUrl || "");
          if (!base) throw new Error("caption track has no baseUrl");
          const url = new URL(base);
          url.searchParams.set("fmt", "json3");
          const res = await fetch(url.toString(), { credentials: "include" });
          if (res.status === 429) throw new Error("timedtext fetch failed (429)");
          if (!res.ok) throw new Error(`timedtext fetch failed (${res.status})`);
          const body = await res.text();
          if (!body.trim()) throw new Error("timedtext returned empty body");
          return JSON.parse(body);
        }

        let playerResponse =
          globalThis.ytInitialPlayerResponse ||
          globalThis.ytplayer?.config?.args?.raw_player_response ||
          null;

        for (let i = 0; i < 12 && !getTracks(playerResponse).length; i += 1) {
          await sleep(300);
          playerResponse =
            globalThis.ytInitialPlayerResponse ||
            globalThis.ytplayer?.config?.args?.raw_player_response ||
            playerResponse;
        }

        let { track, asrOnly } = pickManualJa(getTracks(playerResponse));

        // ページ内 WEB が空のときだけ、ユーザー操作起点で ANDROID を 1 回
        if (!track?.baseUrl) {
          const res = await fetch(
            "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                context: {
                  client: {
                    clientName: "ANDROID",
                    clientVersion: "20.10.38",
                    hl: "ja",
                    gl: "JP"
                  }
                },
                videoId: targetVideoId
              })
            }
          );
          if (res.status === 429) throw new Error("page ANDROID player failed (429)");
          if (!res.ok) throw new Error(`page ANDROID player failed (${res.status})`);
          playerResponse = await res.json();
          ({ track, asrOnly } = pickManualJa(getTracks(playerResponse)));
        }

        if (!track?.baseUrl) {
          if (asrOnly) {
            throw new Error(
              "この動画は自動生成（音声認識）字幕のみのため対象外です。手動で付けられた日本語字幕が必要です。"
            );
          }
          throw new Error("日本語の手動字幕がありません");
        }

        const data = await fetchJson3(track);
        const cues = parseJson3Cues(data);
        if (!cues.length) throw new Error("字幕テキストが空でした");

        const trackName =
          track?.name?.simpleText ||
          (Array.isArray(track?.name?.runs)
            ? track.name.runs.map((r) => r?.text || "").join("")
            : "") ||
          track?.languageCode ||
          "ja";

        return {
          videoId: targetVideoId,
          title: String(playerResponse?.videoDetails?.title || ""),
          trackName,
          source: "youtube-tab",
          cues
        };
      }
    });

    const payload = results?.[0]?.result;
    if (!payload?.cues?.length) {
      throw new Error("ページから字幕を取得できませんでした");
    }
    return payload;
  } finally {
    // 書き出しのためだけに開いたタブは閉じる（既存タブは触らない）
    if (created && tabId != null) {
      try {
        await chromeApi.tabs.remove(tabId);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * @param {typeof chrome} chromeApi
 * @param {number} tabId
 * @param {number} timeoutMs
 */
function waitForTabComplete(chromeApi, tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      chromeApi.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };

    const timer = setTimeout(
      () => finish(new Error("YouTube ページの読み込みがタイムアウトしました")),
      timeoutMs
    );

    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    chromeApi.tabs.onUpdated.addListener(onUpdated);

    chromeApi.tabs.get(tabId, (tab) => {
      if (chromeApi.runtime?.lastError) {
        finish(new Error(chromeApi.runtime.lastError.message));
        return;
      }
      if (tab?.status === "complete") finish();
    });
  });
}

/**
 * 日本語の手動字幕を 1 本だけ取得する。
 * @param {string} videoId
 * @param {{ fetchImpl?: typeof fetch, now?: () => number, skipPage?: boolean }} [options]
 * @returns {Promise<{ videoId: string, title: string, trackName: string, source: string, cues: { startMs: number, endMs: number, text: string }[] }>}
 */
export async function fetchJapaneseCaptionCuesForExport(videoId, options = {}) {
  const id = String(videoId || "").trim();
  if (!/^[\w-]{11}$/.test(id)) {
    throw new Error("動画 ID の形式が正しくありません。");
  }

  if (isTimedTextRateLimited()) {
    throw new Error(
      "YouTube 側から一時的に制限されています。しばらく時間をおいてからお試しください。"
    );
  }
  if (inFlight) {
    throw new Error("取得中です。1 本ずつ処理しています。");
  }

  const now = options.now ?? (() => Date.now());
  const since = now() - lastFetchAt;
  if (lastFetchAt > 0 && since < EXPORT_MIN_INTERVAL_MS) {
    const wait = Math.ceil((EXPORT_MIN_INTERVAL_MS - since) / 1000);
    throw new Error(`連続取得を避けるため、あと ${wait} 秒お待ちください。`);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  inFlight = true;
  lastFetchAt = now();

  /** @type {string[]} */
  const errors = [];
  let sawJapaneseAsrOnly = false;

  /**
   * @param {unknown} playerResponse
   * @param {string} source
   */
  const fromPlayerResponse = async (playerResponse, source) => {
    const tracks = getCaptionTracksFromPlayerResponse(playerResponse);
    const track = pickManualJapaneseTrack(tracks);
    if (!track) {
      if (hasOnlyAsrJapanese(tracks)) sawJapaneseAsrOnly = true;
      throw new Error("日本語の手動字幕がありません");
    }
    const { cues } = await fetchCaptionTrackData(track, fetchImpl);
    if (!cues.length) throw new Error("字幕テキストが空でした");
    return {
      videoId: id,
      title: getVideoTitle(playerResponse),
      trackName: describeTrack(track),
      source,
      cues
    };
  };

  try {
    // テストのモック経路ではページ注入を飛ばす
    const canUsePage =
      !options.skipPage &&
      !options.fetchImpl &&
      Boolean(globalThis.chrome?.scripting?.executeScript);

    if (canUsePage) {
      try {
        return await fetchCaptionsViaYouTubeTab(id);
      } catch (error) {
        errors.push(`page: ${error.message}`);
        if (isTimedTextRateLimitError(error)) {
          noteTimedTextRateLimit(EXPORT_RATE_LIMIT_COOLDOWN_MS);
          throw new Error(
            "YouTube 側から一時的に制限されました（429）。しばらく取得を停止します。"
          );
        }
        // ASR のみなど確定エラーはそのまま上げる
        if (/自動生成|手動字幕がありません/.test(String(error.message || ""))) {
          throw error;
        }
      }
    }

    for (const client of INNERTUBE_CLIENTS) {
      if (isTimedTextRateLimited()) break;
      try {
        const playerResponse = await fetchInnertubePlayerResponse(
          id,
          { clientName: client.name, clientVersion: client.version },
          fetchImpl
        );
        return await fromPlayerResponse(playerResponse, client.source);
      } catch (error) {
        errors.push(`${client.source}: ${error.message}`);
        if (isTimedTextRateLimitError(error)) {
          noteTimedTextRateLimit(EXPORT_RATE_LIMIT_COOLDOWN_MS);
          throw new Error(
            "YouTube 側から一時的に制限されました（429）。しばらく取得を停止します。"
          );
        }
      }
    }

    try {
      const playerResponse = await fetchPlayerResponseFromWatchPage(id, fetchImpl);
      return await fromPlayerResponse(playerResponse, "watch");
    } catch (error) {
      errors.push(`watch: ${error.message}`);
      if (isTimedTextRateLimitError(error)) {
        noteTimedTextRateLimit(EXPORT_RATE_LIMIT_COOLDOWN_MS);
        throw new Error(
          "YouTube 側から一時的に制限されました（429）。しばらく取得を停止します。"
        );
      }
    }

    if (sawJapaneseAsrOnly) {
      throw new Error(
        "この動画は自動生成（音声認識）字幕のみのため対象外です。手動で付けられた日本語字幕が必要です。"
      );
    }
    throw new Error(
      `日本語の手動字幕を取得できませんでした（${errors.join(" / ") || "原因不明"}）。` +
        "字幕ファイルを書き出して「字幕ファイルを貼る」タブでも使えます。"
    );
  } finally {
    inFlight = false;
  }
}
