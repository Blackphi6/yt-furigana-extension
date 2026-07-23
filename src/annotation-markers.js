/**
 * 教科書・字幕の注釈マーカー（⑫）（13）① などを解析用テキストから外す。
 * 「見物（⑫）人」「一日（⑭）中」が形態素で割れるのを防ぐ。
 * 読みカッコ「音（ね）」は触らない（inline-paren-reading 側）。
 */

/** 丸数字・囲み数字など */
const CIRCLED =
  "\u2460-\u2473\u3251-\u325F\u32B1-\u32BF"; // ①-⑳ ㉑-㉟ ㊱-㊿

/**
 * 注釈っぽいカッコ内容か（かな読みは除外）。
 * @param {string} inner
 */
export function isAnnotationMarkerInner(inner) {
  const s = String(inner || "").normalize("NFKC").trim();
  if (!s) return false;
  // かなのみ → 読みカッコの可能性。ここでは外さない
  if (/^[\u3040-\u309f\u30a0-\u30ffー]+$/.test(s)) return false;
  // 数字・丸数字・短い記号番号
  if (/^[0-9]+$/.test(s)) return true;
  if (new RegExp(`^[${CIRCLED}]+$`, "u").test(s)) return true;
  if (/^[0-9]+[\u3040-\u309f]?$/.test(s) && s.length <= 4) return true;
  return false;
}

/**
 * 注釈マーカーを除去した本文を返す。
 * @param {string} text
 * @returns {string}
 */
export function stripAnnotationMarkers(text) {
  const source = String(text ?? "");
  if (!source) return "";

  return source.replace(/[（(]([^）)]{1,8})[）)]/g, (full, inner) =>
    isAnnotationMarkerInner(inner) ? "" : full
  );
}
