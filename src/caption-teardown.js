/**
 * 拡張をOFFにしたとき、字幕DOMを YouTube/TVer ネイティブに近づける。
 * （残留 ruby / inline style / 属性が OFF 後も残ると行数・見た目が崩れる）
 */

export const ORIGINAL_ATTR = "data-yt-furigana-original";
/** content.js が使う処理済みフラグ（歴史的に -done） */
export const PROCESSED_ATTR = "data-yt-furigana-done";
export const PROCESSING_ATTR = "data-yt-furigana-processing";
export const FLOAT_MODE_ATTR = "data-yt-furigana-float-mode";
export const FONT_SIZE_ATTR = "data-yt-furigana-font-size";
/** 拡張が触る前の YouTube 生 style（OFF/再ON 復元用） */
export const PRIOR_STYLE_ATTR = "data-yt-furigana-prior-style";

const EXTENSION_ATTRS = [
  ORIGINAL_ATTR,
  PROCESSED_ATTR,
  PROCESSING_ATTR,
  FLOAT_MODE_ATTR,
  FONT_SIZE_ATTR,
  PRIOR_STYLE_ATTR,
  "data-yt-furigana-styled",
  "data-yt-furigana-keep-one-line",
  "data-yt-furigana-line-width",
  "data-yt-furigana-needed-width",
  "data-yt-furigana-outline",
  "data-yt-furigana-readable",
  "data-yt-furigana-bg",
  "data-yt-furigana-processed",
  // youtube-reading-floats の NATIVE_SKIP_ATTR と同じ文字列
  "data-yt-furigana-native-skip"
];

/**
 * OFF 後に font-size だけ残った style など、復元に使ってはいけない残骸か。
 * @param {string | null | undefined} styleAttr
 */
export function isCorruptCaptionInlineStyle(styleAttr) {
  const s = String(styleAttr || "").trim();
  if (!s) return false;
  if (/^font-size:\s*[^;]+;?\s*$/i.test(s)) return true;
  // position/overflow だけの残骸
  if (/^(position|overflow):\s*[^;]+;?\s*$/i.test(s)) return true;
  return false;
}

/**
 * textContent of ruby includes <rt>, which must never be sent to converters.
 * @param {Element | { textContent?: string } | null | undefined} element
 */
export function plainTextWithoutRuby(element) {
  if (!(element instanceof HTMLElement)) {
    return normalizeCaptionPlain(String(element?.textContent ?? ""));
  }
  const clone = element.cloneNode(true);
  clone
    .querySelectorAll(
      "rt, rp, [data-yt-furigana-float-host], .yt-furigana-float-rt, .yt-furigana-float-host"
    )
    .forEach((node) => node.remove());
  return normalizeCaptionPlain(clone.textContent ?? "");
}

/**
 * @param {string} value
 */
export function normalizeCaptionPlain(value) {
  return String(value || "")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ルビ注入前のプレーン判定用に、残留 ruby を ORIGINAL / plain に戻す。
 * @param {HTMLElement} element
 */
export function prepareCaptionForLineFitCapture(element) {
  if (!(element instanceof HTMLElement)) return;
  element.removeAttribute("data-yt-furigana-keep-one-line");
  element.removeAttribute("data-yt-furigana-line-width");
  element.removeAttribute("data-yt-furigana-needed-width");
  if (!element.querySelector("ruby, rt, .yt-furigana-one-line")) return;
  const original = element.getAttribute(ORIGINAL_ATTR);
  if (original != null) {
    element.textContent = original;
    return;
  }
  const plain = plainTextWithoutRuby(element);
  if (plain) {
    element.setAttribute(ORIGINAL_ATTR, plain);
    element.textContent = plain;
  }
}

/**
 * fitRubyReadings / styleGuard が付けた inline を可能な範囲で剥がす。
 * @param {HTMLElement} element
 */
export function clearExtensionRubyInlineStyles(element) {
  if (!(element instanceof HTMLElement)) return;
  const props = [
    "display",
    "flex-direction",
    "align-items",
    "justify-content",
    "vertical-align",
    "position",
    "line-height",
    "overflow",
    "ruby-position",
    "min-width",
    "letter-spacing",
    "padding-top",
    "padding-bottom",
    "padding-inline",
    "background-color",
    "box-decoration-break",
    "-webkit-box-decoration-break",
    "white-space",
    "word-break",
    "line-break",
    "overflow-wrap",
    "font-size",
    "transform",
    "top",
    "bottom",
    "left",
    "right",
    "width",
    "max-width",
    "text-align",
    "margin",
    "order",
    "font-weight",
    "transform-origin"
  ];
  for (const node of element.querySelectorAll("ruby, rt, .yt-furigana-one-line")) {
    if (!(node instanceof HTMLElement)) continue;
    for (const prop of props) node.style.removeProperty(prop);
  }
}

/** 拡張が字幕に差し込んだマークアップが残っているか */
export function hasExtensionCaptionMarkup(element) {
  if (!(element instanceof HTMLElement)) return false;
  // 拡張固有のクラス／ホストがあれば確実に「我々の加工」
  if (
    element.querySelector(
      ".yt-furigana-word, .yt-furigana-one-line, .yt-furigana-rb, [data-yt-furigana-float-host], .yt-furigana-float-host"
    )
  ) {
    return true;
  }
  // 処理済みフラグ＋ ruby は拡張が差し込んだもの（ネイティブ SRV3 ルビはフラグ無し）
  const marked =
    element.hasAttribute(PROCESSED_ATTR) ||
    element.getAttribute("data-yt-furigana-styled") === "1" ||
    element.getAttribute(FLOAT_MODE_ATTR) === "1";
  if (!marked) return false;
  return Boolean(element.querySelector("ruby, rt"));
}

/**
 * 処理済みフラグはあるがルビ DOM が消えている（シーク等で YouTube が子を差し替えた）。
 * @param {HTMLElement} element
 */
export function isCaptionExtensionStale(element) {
  if (!(element instanceof HTMLElement)) return false;
  const marked =
    element.hasAttribute(PROCESSED_ATTR) ||
    element.getAttribute("data-yt-furigana-styled") === "1" ||
    element.getAttribute(FLOAT_MODE_ATTR) === "1";
  if (!marked) return false;
  return !hasExtensionCaptionMarkup(element);
}

/** @type {WeakSet<HTMLElement>} */
const touchedCaptionWindows = new WeakSet();

/**
 * caption-window 側に残る overflow だけ戻す。
 * left/width/transform は絶対に触らない（YouTube の中央寄せを壊す）。
 * @param {HTMLElement} element
 */
export function clearYouTubeCaptionWindowArtifacts(element) {
  if (!(element instanceof HTMLElement)) return;
  const win =
    element.closest?.(".caption-window") ||
    element.closest?.(".captions-text") ||
    element.closest?.(".ytp-caption-window-container");
  if (!(win instanceof HTMLElement)) return;

  const nodes = [
    win,
    ...win.querySelectorAll(".captions-text, .caption-visual-line, .caption-window")
  ];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    // 触った窓は releaseAllCaptionWindowStyles に任せる
    if (touchedCaptionWindows.has(node)) continue;
    for (const prop of ["overflow", "height", "max-height"]) {
      node.style.removeProperty(prop);
    }
    node.style.removeProperty("--ytf-yt-lift");
  }
}

/**
 * 拡張が overflow 等を触った窓を記録する。
 * 以前は style 属性を丸ごと保存していたが、シーク後に古い left/top を
 * 書き戻すと字幕が画面中央へ飛ぶため、触った事実だけ残す。
 * @param {HTMLElement} node
 */
export function rememberCaptionWindowStyle(node) {
  if (!(node instanceof HTMLElement)) return;
  touchedCaptionWindows.add(node);
}

/**
 * 拡張が付けた overflow 等だけ剥がし、YouTube の left/width/transform は残す。
 * @param {HTMLElement} node
 * @returns {boolean}
 */
export function restoreCaptionWindowStyle(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (!touchedCaptionWindows.has(node)) return false;
  touchedCaptionWindows.delete(node);
  for (const prop of ["overflow", "height", "max-height"]) {
    node.style.removeProperty(prop);
  }
  node.style.removeProperty("--ytf-yt-lift");
  return true;
}

/**
 * プレイヤー内の字幕窓から、拡張が付けた overflow をすべて外す（disable 時）。
 * @param {ParentNode | Document | null | undefined} root
 */
export function restoreAllCaptionWindowStyles(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  for (const node of root.querySelectorAll(
    ".caption-window, .captions-text, .caption-visual-line, .ytp-caption-window-container"
  )) {
    if (node instanceof HTMLElement) restoreCaptionWindowStyle(node);
  }
}

/**
 * @param {HTMLElement} element
 * @param {{ original?: string | null }} [options]
 * @returns {string} restored plain text
 */
export function flattenCaptionToPlainText(element, options = {}) {
  if (!(element instanceof HTMLElement)) return "";
  const fromAttr =
    options.original != null
      ? options.original
      : element.getAttribute(ORIGINAL_ATTR);
  const plain =
    fromAttr != null && String(fromAttr) !== ""
      ? normalizeCaptionPlain(fromAttr)
      : plainTextWithoutRuby(element);
  // ruby / one-line / float が残っていなくても、属性だけ残っている場合は本文を揃える
  const dirty = Boolean(
    element.querySelector(
      "ruby, rt, .yt-furigana-one-line, [data-yt-furigana-float-host], .yt-furigana-float-host"
    )
  );
  if (dirty || fromAttr != null) {
    element.textContent = plain;
  }
  return plain;
}

/**
 * 拡張が付けた data-* を字幕ノードから外す。
 * @param {HTMLElement} element
 */
export function clearExtensionCaptionAttrs(element) {
  if (!(element instanceof HTMLElement)) return;
  for (const name of EXTENSION_ATTRS) {
    element.removeAttribute(name);
  }
}
