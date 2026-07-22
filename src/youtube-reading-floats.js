/**
 * 縁取り／色追従字幕向け: ネイティブ本文は触らず、読みだけを上に浮かせる。
 * timedtext は使わない（DOM 上の既存字幕 + 変換結果の読みマップのみ）。
 */

const HOST_ATTR = "data-yt-furigana-float-host";
const FLOAT_CLASS = "yt-furigana-float-rt";
const MODE_ATTR = "data-yt-furigana-float-mode";

/**
 * furigana HTML から (表層, 読み) を順に取り出す。
 * @param {string} furiganaHtml
 * @returns {{ surface: string, reading: string }[]}
 */
export function extractReadingAnchors(furiganaHtml) {
  const html = String(furiganaHtml || "");
  /** @type {{ surface: string, reading: string }[]} */
  const out = [];
  const tagRe = /<span\b[^>]*>/gi;
  let match;
  while ((match = tagRe.exec(html))) {
    const tag = match[0];
    if (!/\byt-furigana-word\b/.test(tag)) continue;
    if (/\byt-furigana-word--tip\b/.test(tag)) continue;
    const surface = /data-surface="([^"]*)"/.exec(tag)?.[1];
    const reading = /data-reading="([^"]*)"/.exec(tag)?.[1];
    if (!surface || !reading) continue;
    out.push({
      surface: decodeHtmlAttr(surface),
      reading: decodeHtmlAttr(reading)
    });
  }
  return out;
}

function decodeHtmlAttr(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * ホスト内のテキストを結合（自前 float は除外）。
 * @param {HTMLElement} root
 */
export function collectCaptionPlainText(root) {
  if (!(root instanceof HTMLElement)) return "";
  const parts = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (
        parent.closest(
          `[${HOST_ATTR}], .${FLOAT_CLASS}, rt, rp, .yt-furigana-float-host`
        )
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) {
    parts.push(walker.currentNode.textContent || "");
  }
  return parts.join("");
}

/**
 * @param {HTMLElement} root
 * @param {number} start
 * @param {number} end
 * @returns {Range | null}
 */
export function rangeFromTextOffsets(root, start, end) {
  if (!(root instanceof HTMLElement) || end <= start) return null;
  let pos = 0;
  /** @type {Text | null} */
  let startNode = null;
  let startOff = 0;
  /** @type {Text | null} */
  let endNode = null;
  let endOff = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (
        parent.closest(
          `[${HOST_ATTR}], .${FLOAT_CLASS}, rt, rp, .yt-furigana-float-host`
        )
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    const node = /** @type {Text} */ (walker.currentNode);
    const len = node.data.length;
    if (startNode == null && pos + len > start) {
      startNode = node;
      startOff = start - pos;
    }
    if (endNode == null && pos + len >= end) {
      endNode = node;
      endOff = end - pos;
      break;
    }
    pos += len;
  }

  if (!startNode || !endNode) return null;
  try {
    const range = document.createRange();
    range.setStart(startNode, Math.max(0, startOff));
    range.setEnd(endNode, Math.min(endNode.data.length, endOff));
    return range;
  } catch {
    return null;
  }
}

/**
 * @param {DOMRectList | DOMRect[]} rects
 * @returns {{ left: number, top: number, width: number, height: number } | null}
 */
export function unionClientRects(rects) {
  const list = Array.from(rects || []);
  if (list.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of list) {
    if (r.width <= 0 && r.height <= 0) continue;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  if (!Number.isFinite(left)) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * @param {HTMLElement} segment
 */
function ensureFloatHost(segment) {
  let host = segment.querySelector(`:scope > [${HOST_ATTR}]`);
  if (host instanceof HTMLElement) return host;

  const computed = getComputedStyle(segment);
  if (computed.position === "static") {
    segment.style.setProperty("position", "relative", "important");
  }
  // 読みのための上余白（本文はネイティブのまま）
  segment.style.setProperty("padding-top", "0.35em", "important");
  segment.style.setProperty("overflow", "visible", "important");

  host = document.createElement("div");
  host.setAttribute(HOST_ATTR, "1");
  host.className = "yt-furigana-float-host";
  host.setAttribute("aria-hidden", "true");
  segment.appendChild(host);
  return host;
}

/**
 * @param {HTMLElement} segment
 */
export function clearReadingFloats(segment) {
  if (!(segment instanceof HTMLElement)) return;
  segment.removeAttribute(MODE_ATTR);
  for (const host of segment.querySelectorAll(`:scope > [${HOST_ATTR}]`)) {
    host.remove();
  }
  segment.style.removeProperty("padding-top");
}

/**
 * 同じ字幕窓内の読みフロートを全部消す（親子二重適用の残骸防止）。
 * @param {HTMLElement} segment
 */
export function clearReadingFloatsInWindow(segment) {
  if (!(segment instanceof HTMLElement)) return;
  const win =
    segment.closest(".caption-window, .captions-text") || segment;
  if (!(win instanceof HTMLElement)) {
    clearReadingFloats(segment);
    return;
  }
  for (const host of [...win.querySelectorAll(`[${HOST_ATTR}]`)]) {
    const owner = host.parentElement;
    host.remove();
    if (owner instanceof HTMLElement) {
      owner.removeAttribute(MODE_ATTR);
      owner.style.removeProperty("padding-top");
    }
  }
}

/**
 * ネイティブの <ruby> が既に読みを持っているか（拡張の二重載せ防止）。
 * @param {Range} range
 */
export function isRangeInsideNativeRuby(range) {
  if (!range?.startContainer) return false;
  const node = range.startContainer;
  const el =
    node.nodeType === 3 /* TEXT_NODE */ ? node.parentElement : node;
  if (!(el instanceof Element)) return false;
  const ruby = el.closest("ruby");
  if (!ruby || ruby.closest(`[${HOST_ATTR}], .${FLOAT_CLASS}`)) return false;
  return Boolean(ruby.querySelector("rt"));
}

/**
 * ネイティブ ruby の親文字一覧（rt 除外）。
 * @param {HTMLElement} root
 * @returns {string[]}
 */
export function listNativeRubyBases(root) {
  if (!(root instanceof HTMLElement)) return [];
  /** @type {string[]} */
  const bases = [];
  for (const ruby of root.querySelectorAll("ruby")) {
    if (ruby.closest(`[${HOST_ATTR}], .${FLOAT_CLASS}`)) continue;
    if (!ruby.querySelector("rt")) continue;
    const clone = ruby.cloneNode(true);
    clone.querySelectorAll("rt, rp").forEach((n) => n.remove());
    const base = String(clone.textContent || "").replace(/\s+/g, "");
    if (base) bases.push(base);
  }
  return bases;
}

/**
 * 既にネイティブ読みがある表層はスキップする。
 * @param {{ surface: string, reading: string }[]} anchors
 * @param {string[]} nativeBases
 */
export function filterAnchorsWithoutNativeRuby(anchors, nativeBases) {
  const covered = new Set(
    (nativeBases || []).map((s) => String(s || "").replace(/\s+/g, ""))
  );
  if (covered.size === 0) return anchors;
  return anchors.filter((a) => !covered.has(String(a.surface || "").replace(/\s+/g, "")));
}

/**
 * YouTube が <ruby> 以外（小サイズかな span 等）で既にふりがなを出しているか。
 * デザイン字幕で二重載せを防ぐ。
 * @param {HTMLElement} segment
 */
export function nativeCaptionAlreadyShowsReadings(segment) {
  if (!(segment instanceof HTMLElement)) return false;
  if (listNativeRubyBases(segment).length > 0) return true;

  const baseFs = Number.parseFloat(getComputedStyle(segment).fontSize) || 0;
  if (baseFs <= 0) return false;

  let smallKanaHits = 0;
  for (const el of segment.querySelectorAll("span, rt, ruby")) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest(`[${HOST_ATTR}], .${FLOAT_CLASS}, .yt-furigana-float-host`)) {
      continue;
    }
    if (el === segment) continue;
    let fs = 0;
    try {
      fs = Number.parseFloat(getComputedStyle(el).fontSize) || 0;
    } catch {
      continue;
    }
    if (!(fs > 0 && fs <= baseFs * 0.72)) continue;
    const text = String(el.textContent || "")
      .replace(/\s+/g, "")
      .replace(/[\u200b\u200c\u200d\ufeff]/g, "");
    if (!text) continue;
    // ふりがな行っぽい（かな主体）
    if (/^[\u3040-\u309f\u30a0-\u30ffーゝゞヽヾ]+$/.test(text)) {
      smallKanaHits += 1;
    }
  }
  if (smallKanaHits >= 1) return true;

  // 1行なのにルビ分の高さがある（YouTube が既に上余白／読み行を確保）
  try {
    const rect = segment.getBoundingClientRect();
    const lhRaw = getComputedStyle(segment).lineHeight;
    const lh =
      lhRaw === "normal"
        ? baseFs * 1.2
        : Number.parseFloat(lhRaw) || baseFs * 1.2;
    const plain = collectCaptionPlainText(segment).replace(/\s+/g, "");
    if (
      plain &&
      plain.length <= 48 &&
      rect.height >= Math.max(lh * 1.5, baseFs * 1.55)
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }

  // 同じ窓に「かなだけの別セグメント」があり、この行の上に重なっている
  const win = segment.closest(".caption-window, .captions-text");
  if (!(win instanceof HTMLElement)) return false;
  const selfRect = segment.getBoundingClientRect();
  if (selfRect.width < 2 || selfRect.height < 2) return false;

  for (const other of win.querySelectorAll(
    ".ytp-caption-segment, .caption-visual-line"
  )) {
    if (!(other instanceof HTMLElement) || other === segment) continue;
    if (segment.contains(other) || other.contains(segment)) continue;
    const plain = collectCaptionPlainText(other).replace(/\s+/g, "");
    if (!plain || plain.length < 1) continue;
    if (!/^[\u3040-\u309f\u30a0-\u30ffーゝゞヽヾ　]+$/.test(plain)) continue;
    const r = other.getBoundingClientRect();
    if (r.height < 2) continue;
    // ほぼ同じ横位置で、少し上にあるかな行
    const overlapX =
      Math.min(selfRect.right, r.right) - Math.max(selfRect.left, r.left);
    if (overlapX < selfRect.width * 0.3) continue;
    if (r.bottom <= selfRect.top + selfRect.height * 0.35) {
      return true;
    }
  }
  return false;
}

/**
 * ネイティブ字形を残したまま、読みだけを漢字上に載せる。
 * 既に YouTube 側のふりがながある箇所は載せない（二重ふりがな防止）。
 * @param {HTMLElement} segment
 * @param {string} furiganaHtml
 * @returns {number} 配置した読みの数
 */
export function applyReadingFloatsOverNative(segment, furiganaHtml) {
  if (!(segment instanceof HTMLElement)) return 0;
  clearReadingFloatsInWindow(segment);

  // caption-visual-line が segment を内包しているときは line 側では何もしない
  if (
    segment.matches?.(".caption-visual-line") &&
    segment.querySelector(".ytp-caption-segment")
  ) {
    segment.setAttribute(MODE_ATTR, "1");
    return 0;
  }

  if (nativeCaptionAlreadyShowsReadings(segment)) {
    segment.setAttribute(MODE_ATTR, "1");
    return 0;
  }

  const nativeBases = listNativeRubyBases(segment);
  const anchors = filterAnchorsWithoutNativeRuby(
    extractReadingAnchors(furiganaHtml),
    nativeBases
  );
  if (anchors.length === 0) {
    segment.setAttribute(MODE_ATTR, "1");
    return 0;
  }

  const plain = collectCaptionPlainText(segment);
  if (!plain) return 0;

  const host = ensureFloatHost(segment);
  const hostRect = host.getBoundingClientRect();
  const fontPx =
    Number.parseFloat(getComputedStyle(segment).fontSize) || 24;

  let searchFrom = 0;
  let placed = 0;

  for (const { surface, reading } of anchors) {
    const idx = plain.indexOf(surface, searchFrom);
    if (idx < 0) continue;
    searchFrom = idx + Math.max(1, surface.length);

    const range = rangeFromTextOffsets(segment, idx, idx + surface.length);
    if (!range) continue;
    if (isRangeInsideNativeRuby(range)) continue;
    const box = unionClientRects(range.getClientRects());
    if (!box || box.width < 1) continue;

    const el = document.createElement("span");
    el.className = `yt-furigana-word ${FLOAT_CLASS}`;
    el.setAttribute("data-surface", surface);
    el.setAttribute("data-reading", reading);
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("title", "クリックで読み候補");
    el.textContent = reading;

    const centerX = box.left + box.width / 2 - hostRect.left;
    const top = box.top - hostRect.top;
    el.style.left = `${centerX}px`;
    el.style.top = `${top}px`;
    el.style.fontSize = `${Math.max(10, fontPx * 0.48)}px`;
    // 本文に近づける（transform は CSS 側で -100% 近辺）

    host.appendChild(el);
    placed += 1;
  }

  segment.setAttribute(MODE_ATTR, "1");
  return placed;
}

export const READING_FLOAT_MODE_ATTR = MODE_ATTR;
