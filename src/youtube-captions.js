/**
 * @typedef {{ baseUrl: string, languageCode?: string, kind?: string, name?: { simpleText?: string } }} CaptionTrack
 */

/** @type {Map<string, { videoId: string, track: CaptionTrack, lines: string[], cues: TimedCaptionCue[], styled: boolean, source: string, at: number }>} */
const captionResultCache = new Map();
const CAPTION_CACHE_TTL_MS = 10 * 60 * 1000;
let timedTextCooldownUntil = 0;

/** Store content build sets `globalThis.__YTF_STORE_SAFE__ = true` via esbuild banner. */
function storeSafeTimedTextDisabled() {
  return globalThis.__YTF_STORE_SAFE__ === true;
}

function assertTimedTextAllowed() {
  if (storeSafeTimedTextDisabled()) {
    throw new Error("timedtext disabled in store build");
  }
}

export function isTimedTextRateLimited() {
  return Date.now() < timedTextCooldownUntil;
}

export function noteTimedTextRateLimit(cooldownMs = 90_000) {
  timedTextCooldownUntil = Math.max(
    timedTextCooldownUntil,
    Date.now() + cooldownMs
  );
}

export function isTimedTextRateLimitError(error) {
  const msg = String(error?.message || error || "");
  return /\b429\b/.test(msg);
}

function getCachedCaptionResult(videoId) {
  const hit = captionResultCache.get(videoId);
  if (!hit) return null;
  if (Date.now() - hit.at > CAPTION_CACHE_TTL_MS) {
    captionResultCache.delete(videoId);
    return null;
  }
  return hit;
}

function setCachedCaptionResult(result) {
  if (!result?.videoId) return result;
  captionResultCache.set(result.videoId, { ...result, at: Date.now() });
  return result;
}

export function getYouTubeVideoId(href = globalThis.location?.href ?? "") {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }
      const shorts = url.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shorts) return shorts[1];
      const embed = url.pathname.match(/^\/embed\/([^/?]+)/);
      if (embed) return embed[1];
      const live = url.pathname.match(/^\/live\/([^/?]+)/);
      if (live) return live[1];
    }
  } catch {
    return null;
  }
  return null;
}

export function extractJsonAssignment(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return null;

  const braceStart = source.indexOf("{", start);
  if (braceStart < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(braceStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

export function getCaptionTracksFromPlayerResponse(playerResponse) {
  return (
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ??
    []
  );
}

/**
 * Prefer human Japanese captions, then ASR Japanese.
 * @param {CaptionTrack[]} tracks
 */
export function pickJapaneseCaptionTrack(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  const japanese = list.filter((track) =>
    String(track.languageCode || "").toLowerCase().startsWith("ja")
  );
  if (japanese.length === 0) return null;

  const manual = japanese.find((track) => track.kind !== "asr");
  return manual || japanese[0];
}

export function buildTimedTextJson3Url(baseUrl) {
  const url = new URL(baseUrl, "https://www.youtube.com");
  url.searchParams.delete("fmt");
  url.searchParams.set("fmt", "json3");
  return url.toString();
}

/**
 * @typedef {{ startMs: number, endMs: number, text: string }} TimedCaptionCue
 */

/**
 * json3 timedtext → 時刻付きキュー。
 * duration が無いイベントは次キュー開始を終端にする。
 * @param {unknown} data
 * @returns {TimedCaptionCue[]}
 */
export function parseTimedTextJson3Cues(data) {
  const events = Array.isArray(data?.events) ? data.events : [];
  /** @type {{ startMs: number, durationMs: number | null, text: string }[]} */
  const raw = [];

  for (const event of events) {
    if (!Array.isArray(event?.segs) || event.segs.length === 0) continue;
    const text = event.segs
      .map((seg) => seg?.utf8 ?? "")
      .join("")
      // カラオケ字幕に多いゼロ幅文字
      .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const startMs = Number(event.tStartMs) || 0;
    const durationMs = Number(event.dDurationMs);
    raw.push({
      startMs,
      durationMs:
        Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null,
      text
    });
  }

  return raw.map((cue, index) => {
    let endMs;
    if (cue.durationMs != null) {
      endMs = cue.startMs + cue.durationMs;
    } else if (index + 1 < raw.length) {
      endMs = raw[index + 1].startMs;
    } else {
      endMs = cue.startMs + 5000;
    }
    return { startMs: cue.startMs, endMs, text: cue.text };
  });
}

/**
 * @param {unknown} data
 * @returns {string[]}
 */
export function parseTimedTextJson3(data) {
  return parseTimedTextJson3Cues(data).map((cue) => cue.text);
}

/**
 * 再生時刻に該当するキュー（重なりうるので複数可）。
 * @param {TimedCaptionCue[]} cues
 * @param {number} timeMs
 * @returns {TimedCaptionCue[]}
 */
export function findActiveTimedCaptionCues(cues, timeMs) {
  const list = Array.isArray(cues) ? cues : [];
  const t = Number(timeMs);
  if (!Number.isFinite(t)) return [];
  return list.filter((cue) => t >= cue.startMs && t < cue.endMs);
}

export function uniqueCaptionTexts(lines, normalize = (text) => text) {
  const seen = new Set();
  const unique = [];
  for (const line of lines) {
    const normalized = normalize(line);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

export async function fetchPlayerResponseFromWatchPage(videoId, fetchImpl = fetch) {
  const response = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}`, {
    credentials: "include",
    headers: { "Accept-Language": "ja,en;q=0.8" }
  });
  if (!response.ok) {
    throw new Error(`watch page fetch failed (${response.status})`);
  }
  const html = await response.text();
  const playerResponse =
    extractJsonAssignment(html, "ytInitialPlayerResponse") ||
    extractJsonAssignment(html, "var ytInitialPlayerResponse =");
  if (!playerResponse) {
    throw new Error("ytInitialPlayerResponse not found");
  }
  return playerResponse;
}

/**
 * カラオケ／paint-on（色が変わる）字幕トラックか。
 * pens 定義が多く、かつ実際に pPenId 付きイベントがあるときだけ true。
 * @param {unknown} data
 */
export function isStyledPaintOnCaptionData(data) {
  const pens = Array.isArray(data?.pens) ? data.pens : [];
  const events = Array.isArray(data?.events) ? data.events : [];
  let withPen = 0;
  for (const event of events) {
    if (event?.pPenId != null) withPen += 1;
    if (withPen >= 8 && pens.length >= 8) return true;
  }
  return withPen >= 8 && pens.length >= 8;
}

async function fetchTimedTextJson3(track, fetchImpl = fetch) {
  assertTimedTextAllowed();
  if (!track?.baseUrl) {
    throw new Error("caption track has no baseUrl");
  }
  if (isTimedTextRateLimited()) {
    throw new Error("timedtext fetch cooling down after 429");
  }

  const url = buildTimedTextJson3Url(track.baseUrl);
  const response = await fetchImpl(url, { credentials: "include" });
  if (response.status === 429) {
    noteTimedTextRateLimit();
    throw new Error("timedtext fetch failed (429)");
  }
  if (!response.ok) {
    throw new Error(`timedtext fetch failed (${response.status})`);
  }

  const body = await response.text();
  if (!body.trim()) {
    throw new Error("timedtext returned empty body");
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error("timedtext was not JSON3");
  }
}

/**
 * @param {CaptionTrack} track
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ cues: TimedCaptionCue[], styled: boolean }>}
 */
export async function fetchCaptionTrackData(track, fetchImpl = fetch) {
  const data = await fetchTimedTextJson3(track, fetchImpl);
  return {
    cues: parseTimedTextJson3Cues(data),
    styled: isStyledPaintOnCaptionData(data)
  };
}

/**
 * @param {CaptionTrack} track
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<TimedCaptionCue[]>}
 */
export async function fetchCaptionCuesFromTrack(track, fetchImpl = fetch) {
  const { cues } = await fetchCaptionTrackData(track, fetchImpl);
  return cues;
}

export async function fetchCaptionLinesFromTrack(track, fetchImpl = fetch) {
  const cues = await fetchCaptionCuesFromTrack(track, fetchImpl);
  return cues.map((cue) => cue.text);
}

/**
 * Innertube player. ANDROID は速いが、MV などでは日本語トラックが欠けることがある。
 * IOS はスタイル付き歌詞トラックを返しやすい。
 */
export const INNERTUBE_CLIENTS = [
  { name: "ANDROID", version: "20.10.38", source: "android" },
  { name: "IOS", version: "20.10.4", source: "ios" }
];

/**
 * @param {string} videoId
 * @param {{ clientName: string, clientVersion: string }} client
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchInnertubePlayerResponse(
  videoId,
  client,
  fetchImpl = fetch
) {
  const response = await fetchImpl(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: {
          client: {
            clientName: client.clientName,
            clientVersion: client.clientVersion,
            hl: "ja",
            gl: "JP"
          }
        },
        videoId
      })
    }
  );

  if (!response.ok) {
    throw new Error(`${client.clientName} player failed (${response.status})`);
  }

  const data = await response.json();
  if (!data || typeof data !== "object") {
    throw new Error(`${client.clientName} player returned invalid JSON`);
  }
  return data;
}

/**
 * WEB timedtext often returns empty (PoToken). ANDROID Innertube player URLs still work.
 * @deprecated Prefer fetchInnertubePlayerResponse with INNERTUBE_CLIENTS
 */
export async function fetchAndroidPlayerResponse(videoId, fetchImpl = fetch) {
  return fetchInnertubePlayerResponse(
    videoId,
    { clientName: "ANDROID", clientVersion: "20.10.38" },
    fetchImpl
  );
}

/**
 * Fetch unique Japanese caption lines for a video.
 * Tries ANDROID → IOS Innertube, then watch-page WEB tracks.
 * 429 が出たら以降のクライアントは試さない（連打で悪化するため）。
 * @returns {Promise<{ videoId: string, track: CaptionTrack, lines: string[], cues: TimedCaptionCue[], styled: boolean, source: string }>}
 */
export async function fetchJapaneseCaptionLines(videoId, options = {}) {
  assertTimedTextAllowed();
  const cached = getCachedCaptionResult(videoId);
  if (cached) {
    return {
      videoId: cached.videoId,
      track: cached.track,
      lines: cached.lines,
      cues: cached.cues,
      styled: cached.styled,
      source: `${cached.source}+cache`
    };
  }

  if (isTimedTextRateLimited()) {
    throw new Error("timedtext fetch cooling down after 429");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const normalize =
    options.normalize ??
    ((text) =>
      text
        .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
        .replace(/\s+/g, " ")
        .trim());
  const errors = [];

  const tryFromPlayerResponse = async (playerResponse, source) => {
    const tracks = getCaptionTracksFromPlayerResponse(playerResponse);
    const track = pickJapaneseCaptionTrack(tracks);
    if (!track) {
      throw new Error("日本語字幕トラックが見つかりません");
    }
    const { cues, styled } = await fetchCaptionTrackData(track, fetchImpl);
    const lines = uniqueCaptionTexts(
      cues.map((cue) => cue.text),
      normalize
    );
    if (lines.length === 0) {
      throw new Error("字幕テキストが空です");
    }
    return setCachedCaptionResult({
      videoId,
      track,
      lines,
      cues,
      styled,
      source
    });
  };

  if (!options.playerResponse) {
    for (const client of INNERTUBE_CLIENTS) {
      if (isTimedTextRateLimited()) break;
      try {
        const playerResponse = await fetchInnertubePlayerResponse(
          videoId,
          { clientName: client.name, clientVersion: client.version },
          fetchImpl
        );
        return await tryFromPlayerResponse(playerResponse, client.source);
      } catch (error) {
        errors.push(`${client.source}: ${error.message}`);
        if (isTimedTextRateLimitError(error)) {
          noteTimedTextRateLimit();
          break;
        }
      }
    }
  }

  if (isTimedTextRateLimited()) {
    throw new Error(errors.join(" / ") || "timedtext fetch cooling down after 429");
  }

  try {
    const playerResponse =
      options.playerResponse ??
      (await fetchPlayerResponseFromWatchPage(videoId, fetchImpl));
    return await tryFromPlayerResponse(
      playerResponse,
      options.playerResponse ? "provided" : "watch"
    );
  } catch (error) {
    errors.push(`watch: ${error.message}`);
    if (isTimedTextRateLimitError(error)) noteTimedTextRateLimit();
    throw new Error(errors.join(" / ") || error.message);
  }
}
