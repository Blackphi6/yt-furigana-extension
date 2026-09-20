/**
 * YouTube ページ世界（MAIN）で帯の Polymer データを読む。
 * 隔離世界の content.js からは .data / showItemEndpoint が見えない。
 * クリックしなくても本文を台帳へ渡すためだけに使う。timedtext は使わない。
 */
(() => {
  if (window.__ytscfScPageBridge) return;
  window.__ytscfScPageBridge = true;

  const REQ = "YTSCF_PAGE_PAID_REQUEST";
  const RES = "YTSCF_PAGE_PAID_RESULT";
  const TICKER_SEL =
    "yt-live-chat-ticker-paid-message-item-renderer, yt-live-chat-ticker-paid-sticker-item-renderer";
  const PAID_SEL =
    "yt-live-chat-paid-message-renderer, yt-live-chat-paid-sticker-renderer";

  function simpleText(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value !== "object") return "";
    const o = /** @type {Record<string, unknown>} */ (value);
    if (typeof o.simpleText === "string") return o.simpleText;
    if (Array.isArray(o.runs)) {
      return o.runs
        .map((r) => {
          if (!r || typeof r !== "object") return "";
          const t = /** @type {{ text?: unknown }} */ (r).text;
          return typeof t === "string" ? t : "";
        })
        .join("");
    }
    return "";
  }

  /**
   * @param {unknown} value
   */
  function colorIntToHex(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    const u = n >>> 0;
    const r = (u >> 16) & 0xff;
    const g = (u >> 8) & 0xff;
    const b = u & 0xff;
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  }

  /**
   * @param {string} raw
   */
  function cssToHex(raw) {
    const s = String(raw || "").trim();
    const hex6 = s.match(/^#([0-9a-f]{6})/i);
    if (hex6) return `#${hex6[1].toLowerCase()}`;
    const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!rgb) return "";
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((x) => Number(x).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  /**
   * @param {Element} el
   */
  function colorsFromHost(el) {
    try {
      const cs = getComputedStyle(el);
      const body =
        cssToHex(cs.getPropertyValue("--yt-live-chat-paid-message-primary-color")) ||
        cssToHex(cs.getPropertyValue("--yt-live-chat-paid-message-background-color")) ||
        cssToHex(cs.backgroundColor);
      const header =
        cssToHex(
          cs.getPropertyValue("--yt-live-chat-paid-message-secondary-color")
        ) ||
        cssToHex(
          cs.getPropertyValue("--yt-live-chat-paid-message-header-background-color")
        );
      return { colorHex: body, headerColorHex: header };
    } catch {
      return { colorHex: "", headerColorHex: "" };
    }
  }

  /**
   * @param {unknown} node
   * @param {number} [depth]
   * @returns {Record<string, unknown> | null}
   */
  function findPaid(node, depth = 0) {
    if (!node || depth > 10) return null;
    if (typeof node !== "object") return null;
    if (typeof /** @type {{ nodeType?: unknown }} */ (node).nodeType === "number") {
      return null;
    }
    if (Array.isArray(node)) {
      for (const n of node) {
        const hit = findPaid(n, depth + 1);
        if (hit) return hit;
      }
      return null;
    }
    const o = /** @type {Record<string, unknown>} */ (node);
    if (o.liveChatPaidMessageRenderer && typeof o.liveChatPaidMessageRenderer === "object") {
      return /** @type {Record<string, unknown>} */ (o.liveChatPaidMessageRenderer);
    }
    if (o.liveChatPaidStickerRenderer && typeof o.liveChatPaidStickerRenderer === "object") {
      return /** @type {Record<string, unknown>} */ (o.liveChatPaidStickerRenderer);
    }
    const showItem = o.showItemEndpoint;
    const endpoint =
      o.showLiveChatItemEndpoint ||
      (showItem && typeof showItem === "object"
        ? /** @type {Record<string, unknown>} */ (showItem).showLiveChatItemEndpoint
        : null);
    if (endpoint && typeof endpoint === "object") {
      const renderer = /** @type {Record<string, unknown>} */ (endpoint).renderer;
      const itemToShow = /** @type {Record<string, unknown>} */ (endpoint).itemToShow;
      const hit = findPaid(renderer || itemToShow || endpoint, depth + 1);
      if (hit) return hit;
    }
    if (o.purchaseAmountText && (o.authorName || o.message || o.id)) return o;
    for (const v of Object.values(o)) {
      if (!v || typeof v !== "object") continue;
      const hit = findPaid(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  /**
   * @param {Element} el
   */
  function hostData(el) {
    try {
      const rec = /** @type {Record<string, unknown>} */ (
        /** @type {unknown} */ (el)
      );
      if (rec.data && typeof rec.data === "object") return rec.data;
      if (rec.__data && typeof rec.__data === "object") return rec.__data;
      const ctrl = rec.polymerController;
      if (ctrl && typeof ctrl === "object") {
        const cdata = /** @type {Record<string, unknown>} */ (ctrl).data;
        if (cdata && typeof cdata === "object") return cdata;
      }
      if (rec.showItemEndpoint && typeof rec.showItemEndpoint === "object") {
        return { showItemEndpoint: rec.showItemEndpoint };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * @param {ParentNode | null | undefined} root
   * @param {string} selector
   * @returns {Element[]}
   */
  function queryDeep(root, selector) {
    if (!root || typeof /** @type {{ querySelectorAll?: unknown }} */ (root).querySelectorAll !== "function") {
      return [];
    }
    /** @type {Element[]} */
    const out = [];
    const seen = new Set();
    /**
     * @param {ParentNode} node
     */
    function walk(node) {
      let hits = [];
      try {
        hits = [...node.querySelectorAll(selector)];
      } catch {
        hits = [];
      }
      for (const el of hits) {
        if (!seen.has(el)) {
          seen.add(el);
          out.push(el);
        }
      }
      let all = [];
      try {
        all = [...node.querySelectorAll("*")];
      } catch {
        all = [];
      }
      for (const el of all) {
        const sr = /** @type {Element & { shadowRoot?: ShadowRoot | null }} */ (el)
          .shadowRoot;
        if (sr) walk(sr);
      }
    }
    walk(root);
    const rootSr = /** @type {{ shadowRoot?: ShadowRoot | null }} */ (root).shadowRoot;
    if (rootSr) walk(rootSr);
    return out;
  }

  /**
   * @param {Record<string, unknown>} rec
   */
  function flatten(rec) {
    const author = simpleText(rec.authorName);
    const amount = simpleText(rec.purchaseAmountText) || simpleText(rec.amountText) || simpleText(rec.amount);
    const message = simpleText(rec.message).trim();
    const sticker =
      typeof rec.altText === "string"
        ? rec.altText
        : simpleText(
            /** @type {{ accessibility?: { accessibilityData?: { label?: string } } }} */ (
              rec
            ).accessibility?.accessibilityData?.label
          );
    const text = message || String(sticker || "").trim();
    if (!author && !amount && !text) return null;
    const thumbs =
      rec.authorPhoto && typeof rec.authorPhoto === "object"
        ? /** @type {{ thumbnails?: { url?: string }[] }} */ (rec.authorPhoto)
            .thumbnails
        : null;
    const photo =
      Array.isArray(thumbs) && thumbs.length
        ? String(thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || "")
        : "";
    return {
      id: String(rec.id || "").trim(),
      author,
      amount,
      message: text,
      timestamp: simpleText(rec.timestampText).trim(),
      authorPhotoUrl: /^https?:\/\//i.test(photo) ? photo : "",
      colorHex: colorIntToHex(rec.bodyBackgroundColor),
      headerColorHex: colorIntToHex(rec.headerBackgroundColor)
    };
  }

  /**
   * @param {unknown} node
   * @param {unknown[]} out
   * @param {Set<string>} seen
   * @param {number} [depth]
   */
  function walkInitial(node, out, seen, depth = 0) {
    if (!node || depth > 14) return;
    if (typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) walkInitial(n, out, seen, depth + 1);
      return;
    }
    const o = /** @type {Record<string, unknown>} */ (node);
    const rec =
      (o.liveChatPaidMessageRenderer && typeof o.liveChatPaidMessageRenderer === "object"
        ? /** @type {Record<string, unknown>} */ (o.liveChatPaidMessageRenderer)
        : null) ||
      (o.liveChatPaidStickerRenderer && typeof o.liveChatPaidStickerRenderer === "object"
        ? /** @type {Record<string, unknown>} */ (o.liveChatPaidStickerRenderer)
        : null);
    if (rec) {
      const dto = flatten(rec);
      if (dto) {
        const key = dto.id || `${dto.author}\u0001${dto.amount}\u0001${dto.message}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(dto);
        }
      }
      return;
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") walkInitial(v, out, seen, depth + 1);
    }
  }

  function collect() {
    const isChat =
      /\/live_chat/i.test(location.pathname || "") ||
      Boolean(document.querySelector("yt-live-chat-app"));
    if (!isChat) return [];
    /** @type {unknown[]} */
    const out = [];
    const seen = new Set();
    const els = [
      ...queryDeep(document, TICKER_SEL),
      ...queryDeep(document, PAID_SEL)
    ];
    for (const el of els) {
      let rec = findPaid(hostData(el));
      if (!rec) {
        try {
          const ep = /** @type {{ showItemEndpoint?: unknown }} */ (el).showItemEndpoint;
          if (ep) rec = findPaid({ showItemEndpoint: ep });
        } catch {
          rec = null;
        }
      }
      if (!rec) continue;
      const dto = flatten(rec);
      if (!dto) continue;
      if (!dto.colorHex || !dto.headerColorHex) {
        const css = colorsFromHost(el);
        if (!dto.colorHex && css.colorHex) dto.colorHex = css.colorHex;
        if (!dto.headerColorHex && css.headerColorHex) {
          dto.headerColorHex = css.headerColorHex;
        }
      }
      const key = dto.id || `${dto.author}\u0001${dto.amount}\u0001${dto.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(dto);
    }
    try {
      const data = window.ytInitialData;
      const actions =
        data?.continuationContents?.liveChatContinuation?.actions ||
        data?.contents?.liveChatRenderer?.actions;
      if (actions) walkInitial(actions, out, seen);
    } catch {
      /* ignore */
    }
    return out;
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.type !== REQ || typeof d.id !== "string") return;
    let entries = [];
    try {
      entries = collect();
    } catch {
      entries = [];
    }
    window.postMessage({ type: RES, id: d.id, entries }, "*");
  });
})();
