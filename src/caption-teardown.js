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

const EXTENSION_ATTRS = [
  ORIGINAL_ATTR,
  PROCESSED_ATTR,
  PROCESSING_ATTR,
  FLOAT_MODE_ATTR,
  FONT_SIZE_ATTR,
  "data-yt-furigana-styled",
  "data-yt-furigana-keep-one-line",
  "data-yt-furigana-line-width",
  "data-yt-furigana-needed-width",
  "data-yt-furigana-outline",
  "data-yt-furigana-readable",
  "data-yt-furigana-bg",
  "data-yt-furigana-processed"
];

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

/**
 * caption-window 側に残る幅・overflow・持ち上げを戻す。
 * @param {HTMLElement} element
 */
export function clearYouTubeCaptionWindowArtifacts(element) {
  if (!(element instanceof HTMLElement)) return;
  const win =
    element.closest?.(".caption-window") ||
    element.closest?.(".captions-text") ||
    element.closest?.(".ytp-caption-window-container");
  if (!(win instanceof HTMLElement)) return;
  for (const prop of [
    "width",
    "max-width",
    "overflow",
    "transform",
    "height",
    "max-height"
  ]) {
    win.style.removeProperty(prop);
  }
  win.style.removeProperty("--ytf-yt-lift");
  for (const nested of win.querySelectorAll(
    ".captions-text, .caption-visual-line, .caption-window"
  )) {
    if (!(nested instanceof HTMLElement)) continue;
    nested.style.removeProperty("overflow");
    nested.style.removeProperty("width");
    nested.style.removeProperty("max-width");
    nested.style.removeProperty("transform");
    nested.style.removeProperty("--ytf-yt-lift");
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
