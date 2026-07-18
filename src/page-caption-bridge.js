(() => {
  if (window.__ytFuriganaCaptionBridge) return;
  window.__ytFuriganaCaptionBridge = true;

  let cooldownUntil = 0;

  function isCoolingDown() {
    return Date.now() < cooldownUntil;
  }

  function note429() {
    cooldownUntil = Date.now() + 90_000;
  }

  function getPlayerResponse() {
    if (window.ytInitialPlayerResponse?.captions) {
      return window.ytInitialPlayerResponse;
    }

    try {
      const player = document.getElementById("movie_player");
      if (player && typeof player.getPlayerResponse === "function") {
        const response = player.getPlayerResponse();
        if (response?.captions) return response;
      }
    } catch {
      // ignore
    }

    try {
      const raw = window.ytplayer?.config?.args?.raw_player_response;
      if (raw) {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      }
      const encoded = window.ytplayer?.config?.args?.player_response;
      if (encoded) {
        return typeof encoded === "string" ? JSON.parse(encoded) : encoded;
      }
    } catch {
      // ignore
    }

    return window.ytInitialPlayerResponse || null;
  }

  function pickJapaneseTrack(tracks) {
    const list = Array.isArray(tracks) ? tracks : [];
    const japanese = list.filter((track) =>
      String(track.languageCode || "")
        .toLowerCase()
        .startsWith("ja")
    );
    if (japanese.length === 0) return null;
    return japanese.find((track) => track.kind !== "asr") || japanese[0];
  }

  function buildJson3Url(baseUrl) {
    const url = new URL(baseUrl, location.origin);
    url.searchParams.delete("fmt");
    url.searchParams.set("fmt", "json3");
    return url.toString();
  }

  function isStyledPaintOn(data) {
    const pens = Array.isArray(data?.pens) ? data.pens : [];
    const events = Array.isArray(data?.events) ? data.events : [];
    let withPen = 0;
    for (const event of events) {
      if (event?.pPenId != null) withPen += 1;
      if (withPen >= 8 && pens.length >= 8) return true;
    }
    return withPen >= 8 && pens.length >= 8;
  }

  function parseJson3Cues(data) {
    const events = Array.isArray(data?.events) ? data.events : [];
    const raw = [];
    for (const event of events) {
      if (!Array.isArray(event?.segs) || event.segs.length === 0) continue;
      const text = event.segs
        .map((seg) => seg?.utf8 ?? "")
        .join("")
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
      if (cue.durationMs != null) endMs = cue.startMs + cue.durationMs;
      else if (index + 1 < raw.length) endMs = raw[index + 1].startMs;
      else endMs = cue.startMs + 5000;
      return { startMs: cue.startMs, endMs, text: cue.text };
    });
  }

  async function fetchTimedText(track) {
    if (isCoolingDown()) {
      throw new Error("page timedtext cooling down after 429");
    }
    const response = await fetch(buildJson3Url(track.baseUrl), {
      credentials: "include"
    });
    if (response.status === 429) {
      note429();
      throw new Error("page timedtext failed (429)");
    }
    if (!response.ok) {
      throw new Error(`page timedtext failed (${response.status})`);
    }
    const body = await response.text();
    if (!body.trim()) {
      throw new Error("page timedtext empty");
    }
    return JSON.parse(body);
  }

  async function fetchFromWebPlayer() {
    // SPA 遷移直後は playerResponse がまだ無いことがある
    let playerResponse = null;
    let tracks = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      playerResponse = getPlayerResponse();
      tracks =
        playerResponse?.captions?.playerCaptionsTracklistRenderer
          ?.captionTracks ?? [];
      if (pickJapaneseTrack(tracks)?.baseUrl) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const track = pickJapaneseTrack(tracks);
    if (!track?.baseUrl) {
      throw new Error("page: Japanese caption track not found");
    }
    const data = await fetchTimedText(track);
    const cues = parseJson3Cues(data);
    return {
      track,
      lines: cues.map((c) => c.text),
      cues,
      styled: isStyledPaintOn(data),
      playerResponse,
      source: "page-web"
    };
  }

  async function fetchLinesFromPlayer(videoId) {
    // まずページ内の WEB playerResponse（追加の Innertube を打たない）
    try {
      return await fetchFromWebPlayer();
    } catch (webError) {
      if (/\b429\b/.test(String(webError?.message || ""))) {
        throw webError;
      }
      // WEB 未準備 / PoToken / 日本語トラック無し → 静かに ANDROID へ
    }

    if (!videoId || isCoolingDown()) {
      throw new Error("page timedtext unavailable");
    }

    const response = await fetch(
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
    if (response.status === 429) {
      note429();
      throw new Error("page ANDROID player failed (429)");
    }
    if (!response.ok) {
      throw new Error(`page ANDROID player failed (${response.status})`);
    }
    const playerResponse = await response.json();
    const tracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ??
      [];
    const track = pickJapaneseTrack(tracks);
    if (!track?.baseUrl) {
      throw new Error("page ANDROID: Japanese caption track not found");
    }
    const data = await fetchTimedText(track);
    const cues = parseJson3Cues(data);
    return {
      track,
      lines: cues.map((c) => c.text),
      cues,
      styled: isStyledPaintOn(data),
      playerResponse,
      source: "page-android"
    };
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "YT_FURIGANA_GET_CAPTIONS") return;

    const { requestId, videoId } = event.data;
    try {
      const result = await fetchLinesFromPlayer(videoId);
      window.postMessage(
        {
          type: "YT_FURIGANA_CAPTIONS",
          requestId,
          ok: true,
          lines: result.lines,
          cues: result.cues,
          styled: result.styled,
          track: result.track,
          source: result.source,
          hasPlayerResponse: Boolean(result.playerResponse)
        },
        "*"
      );
    } catch (error) {
      window.postMessage(
        {
          type: "YT_FURIGANA_CAPTIONS",
          requestId,
          ok: false,
          error: error?.message || String(error)
        },
        "*"
      );
    }
  });
})();
