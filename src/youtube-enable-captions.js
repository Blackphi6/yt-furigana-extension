/**
 * YouTube プレイヤー API で日本語字幕をオンにする（timedtext は叩かない）。
 * 字幕 DOM にルビを載せる前提として、ユーザーが CC を押し忘れている／オフのときだけ補う。
 */

/**
 * @typedef {{
 *   languageCode?: string,
 *   languageName?: string,
 *   displayName?: string,
 *   kind?: string,
 *   name?: string,
 *   is_servable?: boolean,
 *   is_translateable?: boolean,
 *   vss_id?: string,
 *   id?: string | null
 * }} YtCaptionTrack
 */

/**
 * @param {unknown} track
 * @returns {track is YtCaptionTrack}
 */
export function isCaptionTrackLike(track) {
  return Boolean(track && typeof track === "object");
}

/**
 * @param {YtCaptionTrack | null | undefined} track
 */
export function isJapaneseCaptionTrack(track) {
  if (!isCaptionTrackLike(track)) return false;
  const code = String(track.languageCode || "").toLowerCase();
  if (code === "ja" || code.startsWith("ja-")) return true;
  const label = `${track.displayName || ""} ${track.languageName || ""} ${track.name || ""}`;
  return /日本語|japanese/i.test(label);
}

/**
 * 配信不能と明示されているトラックは選ばない。
 * @param {YtCaptionTrack | null | undefined} track
 */
export function isServableCaptionTrack(track) {
  if (!isCaptionTrackLike(track)) return false;
  return track.is_servable !== false;
}

/**
 * 手動日本語 → 自動生成日本語 → その他 ja* の順。
 * @param {YtCaptionTrack[]} tracklist
 * @returns {YtCaptionTrack | null}
 */
export function pickJapaneseCaptionTrack(tracklist) {
  const list = Array.isArray(tracklist) ? tracklist.filter(isCaptionTrackLike) : [];
  const ja = list.filter(isJapaneseCaptionTrack).filter(isServableCaptionTrack);
  if (!ja.length) return null;

  const manual = ja.find((t) => String(t.kind || "") !== "asr");
  if (manual) return manual;
  const asr = ja.find((t) => String(t.kind || "") === "asr");
  return asr || ja[0];
}

/**
 * @param {ParentNode | null | undefined} root
 */
export function countVisibleCaptionSegments(root = document) {
  if (!root?.querySelectorAll) return 0;
  return root.querySelectorAll(
    ".ytp-caption-segment, .caption-visual-line .ytp-caption-segment, .caption-visual-line"
  ).length;
}

/**
 * @param {Element | null | undefined} player
 */
export function isYouTubeAdShowing(player) {
  if (!player?.classList) return false;
  if (player.classList.contains("ad-showing")) return true;
  const doc = globalThis.document;
  return Boolean(
    player.querySelector?.(".ytp-ad-player-overlay, .video-ads .ad-showing") ||
      doc?.querySelector?.(".ad-showing .html5-video-player, .ytp-ad-player-overlay")
  );
}

/**
 * @param {any} player  #movie_player
 * @returns {{ ok: boolean, reason: string, track?: YtCaptionTrack | null }}
 */
export function ensureYouTubeJapaneseCaptions(player) {
  if (!player || typeof player.getOption !== "function" || typeof player.setOption !== "function") {
    return { ok: false, reason: "no-player-api" };
  }

  if (isYouTubeAdShowing(player)) {
    return { ok: false, reason: "ad-playing" };
  }

  // すでに画面上に字幕行があるなら触らない（ネイティブ配信が生きている）
  const doc = globalThis.document;
  if (
    countVisibleCaptionSegments(player) > 0 ||
    (doc && countVisibleCaptionSegments(doc) > 0)
  ) {
    return { ok: true, reason: "segments-already-visible" };
  }

  /** @type {YtCaptionTrack[]} */
  let tracklist = [];
  try {
    const raw = player.getOption("captions", "tracklist");
    tracklist = Array.isArray(raw) ? raw : [];
  } catch {
    return { ok: false, reason: "tracklist-unavailable" };
  }

  // tracklist が空のときは reload を一度だけ試す（timedtext 連打ではない）
  if (!tracklist.length) {
    try {
      player.setOption("captions", "reload", true);
      const raw = player.getOption("captions", "tracklist");
      tracklist = Array.isArray(raw) ? raw : [];
    } catch {
      /* ignore */
    }
  }

  const picked = pickJapaneseCaptionTrack(tracklist);
  if (!picked) {
    // 配信不能な日本語しか無い／トラック自体が無い
    const anyJa = (Array.isArray(tracklist) ? tracklist : []).filter(isJapaneseCaptionTrack);
    if (anyJa.some((t) => t.is_servable === false)) {
      return { ok: false, reason: "japanese-unservable", track: anyJa[0] };
    }
    return { ok: false, reason: "no-japanese-track" };
  }

  /** @type {YtCaptionTrack | null} */
  let current = null;
  try {
    current = player.getOption("captions", "track") || null;
  } catch {
    current = null;
  }

  const sameLang =
    isJapaneseCaptionTrack(current) &&
    String(current?.kind || "") === String(picked.kind || "") &&
    String(current?.languageCode || "") === String(picked.languageCode || "");

  if (sameLang && isServableCaptionTrack(current)) {
    // 選択は ja だが行がまだ無い → 再セットで起こす
    try {
      player.setOption("captions", "track", picked);
    } catch {
      return { ok: false, reason: "set-track-failed", track: picked };
    }
    return { ok: true, reason: "reasserted", track: picked };
  }

  try {
    player.setOption("captions", "track", picked);
  } catch {
    // フォールバック: 言語コードだけ指定
    try {
      player.setOption("captions", "track", { languageCode: "ja" });
    } catch {
      return { ok: false, reason: "set-track-failed", track: picked };
    }
  }

  return { ok: true, reason: "enabled", track: picked };
}

/**
 * ユーザー向け短文。
 * @param {{ ok: boolean, reason: string }} result
 */
export function describeCaptionEnsureResult(result) {
  switch (result?.reason) {
    case "segments-already-visible":
    case "enabled":
    case "reasserted":
      return "";
    case "ad-playing":
      return "広告中です。本編で日本語字幕をオンにします。";
    case "japanese-unservable":
      return "この動画の日本語字幕を YouTube が配信できていません（回線制限の可能性）。";
    case "no-japanese-track":
      return "この動画に日本語字幕トラックがありません。";
    case "no-player-api":
      return "プレイヤー API を取得できませんでした。";
    case "tracklist-unavailable":
      return "字幕トラック一覧を取得できませんでした。";
    case "set-track-failed":
      return "日本語字幕のオンに失敗しました。";
    default:
      return "";
  }
}
