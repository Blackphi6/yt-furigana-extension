/**
 * 書き出し用の字幕取得（ユーザーが URL を貼って明示的に押したときだけ動く）。
 *
 * 通常再生では絶対に呼ばない。timedtext を連打すると IP 単位で 429 になり、
 * 拡張を切っても YouTube 本体の字幕まで数日出なくなる事故につながるため、
 * ここでは「1 本ずつ・間隔を空ける・429 を見たら長く休む」を必ず守る。
 * 参照: .cursor/rules/youtube-timedtext-429.mdc
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
 * 日本語の手動字幕を 1 本だけ取得する。
 * @param {string} videoId
 * @param {{ fetchImpl?: typeof fetch, now?: () => number }} [options]
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
      `日本語の手動字幕を取得できませんでした（${errors.join(" / ") || "原因不明"}）`
    );
  } finally {
    inFlight = false;
  }
}
