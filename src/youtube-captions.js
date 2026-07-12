/** @typedef {{ baseUrl: string, languageCode?: string, kind?: string, name?: { simpleText?: string } }} CaptionTrack */

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

export function parseTimedTextJson3(data) {
  const events = Array.isArray(data?.events) ? data.events : [];
  const lines = [];

  for (const event of events) {
    if (!Array.isArray(event?.segs) || event.segs.length === 0) continue;
    const text = event.segs
      .map((seg) => seg?.utf8 ?? "")
      .join("")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) lines.push(text);
  }

  return lines;
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

export async function fetchCaptionLinesFromTrack(track, fetchImpl = fetch) {
  if (!track?.baseUrl) {
    throw new Error("caption track has no baseUrl");
  }

  const url = buildTimedTextJson3Url(track.baseUrl);
  const response = await fetchImpl(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`timedtext fetch failed (${response.status})`);
  }

  const body = await response.text();
  if (!body.trim()) {
    throw new Error("timedtext returned empty body");
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("timedtext was not JSON3");
  }

  return parseTimedTextJson3(data);
}

/**
 * WEB timedtext often returns empty (PoToken). ANDROID Innertube player URLs still work.
 */
export async function fetchAndroidPlayerResponse(videoId, fetchImpl = fetch) {
  const response = await fetchImpl(
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
        videoId
      })
    }
  );

  if (!response.ok) {
    throw new Error(`ANDROID player failed (${response.status})`);
  }

  const data = await response.json();
  if (!data || typeof data !== "object") {
    throw new Error("ANDROID player returned invalid JSON");
  }
  return data;
}

/**
 * Fetch unique Japanese caption lines for a video.
 * Tries ANDROID Innertube first (avoids empty WEB timedtext), then watch-page WEB tracks.
 * @returns {Promise<{ videoId: string, track: CaptionTrack, lines: string[], source: string }>}
 */
export async function fetchJapaneseCaptionLines(videoId, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const normalize = options.normalize ?? ((text) => text.replace(/\s+/g, " ").trim());
  const errors = [];

  const tryFromPlayerResponse = async (playerResponse, source) => {
    const tracks = getCaptionTracksFromPlayerResponse(playerResponse);
    const track = pickJapaneseCaptionTrack(tracks);
    if (!track) {
      throw new Error("日本語字幕トラックが見つかりません");
    }
    const rawLines = await fetchCaptionLinesFromTrack(track, fetchImpl);
    const lines = uniqueCaptionTexts(rawLines, normalize);
    if (lines.length === 0) {
      throw new Error("字幕テキストが空です");
    }
    return { videoId, track, lines, source };
  };

  if (!options.playerResponse) {
    try {
      const androidResponse = await fetchAndroidPlayerResponse(videoId, fetchImpl);
      return await tryFromPlayerResponse(androidResponse, "android");
    } catch (error) {
      errors.push(`android: ${error.message}`);
    }
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
    throw new Error(errors.join(" / ") || error.message);
  }
}
