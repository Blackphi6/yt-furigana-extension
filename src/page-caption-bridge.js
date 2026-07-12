(() => {
  if (window.__ytFuriganaCaptionBridge) return;
  window.__ytFuriganaCaptionBridge = true;

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

  function parseJson3(data) {
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

  async function fetchLinesViaAndroid(videoId) {
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
    const timedtext = await fetch(buildJson3Url(track.baseUrl), {
      credentials: "include"
    });
    if (!timedtext.ok) {
      throw new Error(`page ANDROID timedtext failed (${timedtext.status})`);
    }
    const body = await timedtext.text();
    if (!body.trim()) {
      throw new Error("page ANDROID timedtext empty");
    }
    return {
      track,
      lines: parseJson3(JSON.parse(body)),
      playerResponse
    };
  }

  async function fetchLinesFromPlayer(videoId) {
    try {
      if (videoId) {
        return await fetchLinesViaAndroid(videoId);
      }
    } catch (androidError) {
      // fall through to WEB player response
      console.warn("[YT Furigana bridge]", androidError.message);
    }

    const playerResponse = getPlayerResponse();
    const tracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ??
      [];
    const track = pickJapaneseTrack(tracks);
    if (!track?.baseUrl) {
      throw new Error("page: Japanese caption track not found");
    }

    const response = await fetch(buildJson3Url(track.baseUrl), {
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error(`page timedtext failed (${response.status})`);
    }
    const body = await response.text();
    if (!body.trim()) {
      throw new Error("page timedtext empty");
    }
    return {
      track,
      lines: parseJson3(JSON.parse(body)),
      playerResponse
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
          track: result.track,
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
