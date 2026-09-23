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
  const RUBY_LIST_REQ = "YTSCF_PAGE_RUBY_LIST_REQUEST";
  const RUBY_LIST_RES = "YTSCF_PAGE_RUBY_LIST_RESULT";
  const RUBY_APPLY_REQ = "YTSCF_PAGE_RUBY_APPLY_REQUEST";
  const RUBY_APPLY_RES = "YTSCF_PAGE_RUBY_APPLY_RESULT";
  const RUBY_ENSURE_CSS = "YTSCF_PAGE_RUBY_ENSURE_CSS";
  const RUBY_KEY_ATTR = "data-ytscf-ruby-key";
  const DONE_ATTR = "data-ytscf-done";
  const ORIGINAL_ATTR = "data-ytscf-original";
  const TICKER_SEL =
    "yt-live-chat-ticker-paid-message-item-renderer, yt-live-chat-ticker-paid-sticker-item-renderer";
  const PAID_SEL =
    "yt-live-chat-paid-message-renderer, yt-live-chat-paid-sticker-renderer";
  const TEXT_SEL = "yt-live-chat-text-message-renderer";

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

  /**
   * @param {Element} host
   * @param {string} kind
   * @param {number} index
   */
  function ensureRubyKey(host, kind, index) {
    let key = host.getAttribute(RUBY_KEY_ATTR);
    if (key) return key;
    const rec = hostData(host);
    const id =
      (rec && typeof rec.id === "string" && rec.id) ||
      host.getAttribute("id") ||
      "";
    key = id
      ? `${kind}:${id}`
      : `${kind}:${index}:${String(host.textContent || "").slice(0, 24)}`;
    try {
      host.setAttribute(RUBY_KEY_ATTR, key);
    } catch {
      /* ignore */
    }
    return key;
  }

  /**
   * @param {Element} host
   * @returns {HTMLElement | null}
   */
  function messageElFromHost(host) {
    const deep = queryDeep(host, "#message");
    if (deep[0] && deep[0] instanceof HTMLElement) return deep[0];
    try {
      const el = host.querySelector("#message");
      if (el instanceof HTMLElement) return el;
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * @param {HTMLElement} el
   */
  function plainFromMessage(el) {
    const saved = el.getAttribute(ORIGINAL_ATTR);
    if (saved != null && saved !== "") return saved;
    try {
      const clone = el.cloneNode(true);
      if (clone instanceof HTMLElement) {
        clone.querySelectorAll("rt").forEach((n) => n.remove());
        return String(clone.textContent || "")
          .replace(/\u200b/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }
    } catch {
      /* ignore */
    }
    return String(el.textContent || "")
      .replace(/\u200b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function listRubyTargets() {
    const isChat =
      /\/live_chat/i.test(location.pathname || "") ||
      Boolean(document.querySelector("yt-live-chat-app"));
    if (!isChat) return [];
    /** @type {Array<{ key: string, plain: string, kind: string, done: boolean }>} */
    const out = [];
    const groups = [
      { kind: "superchat", sel: PAID_SEL },
      { kind: "ticker", sel: TICKER_SEL },
      { kind: "chat", sel: TEXT_SEL }
    ];
    let index = 0;
    for (const g of groups) {
      const hosts = queryDeep(document, g.sel);
      for (const host of hosts) {
        const msg = messageElFromHost(host);
        if (!msg) continue;
        const plain = plainFromMessage(msg);
        if (!plain) continue;
        const key = ensureRubyKey(host, g.kind, index++);
        out.push({
          key,
          plain,
          kind: g.kind,
          done: msg.hasAttribute(DONE_ATTR)
        });
      }
    }
    return out;
  }

  /**
   * @param {Array<{ key?: string, html?: string, original?: string }>} items
   */
  function applyRubyItems(items) {
    if (!Array.isArray(items) || !items.length) return 0;
    /** @type {Map<string, HTMLElement>} */
    const byKey = new Map();
    for (const host of [
      ...queryDeep(document, PAID_SEL),
      ...queryDeep(document, TICKER_SEL),
      ...queryDeep(document, TEXT_SEL)
    ]) {
      const key = host.getAttribute(RUBY_KEY_ATTR);
      if (!key) continue;
      const msg = messageElFromHost(host);
      if (msg) byKey.set(key, msg);
    }
    let applied = 0;
    for (const item of items) {
      const key = String(item?.key || "").trim();
      const html = String(item?.html || "");
      const original = String(item?.original || "");
      if (!key || !html) continue;
      const el = byKey.get(key);
      if (!el) continue;
      try {
        el.setAttribute(ORIGINAL_ATTR, original || plainFromMessage(el));
        el.setAttribute(DONE_ATTR, "1");
        el.classList.add("ytscf-done");
        el.innerHTML = html;
        applied += 1;
      } catch {
        /* ignore */
      }
    }
    return applied;
  }

  /**
   * @param {string} href
   */
  function ensureCss(href) {
    const url = String(href || "").trim();
    if (!url || !/^https?:|^chrome-extension:|^safari-web-extension:/i.test(url)) {
      return;
    }
    if (document.getElementById("ytscf-injected-css")) return;
    try {
      const link = document.createElement("link");
      link.id = "ytscf-injected-css";
      link.rel = "stylesheet";
      link.href = url;
      (document.head || document.documentElement).appendChild(link);
    } catch {
      /* ignore */
    }
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || typeof d !== "object") return;

    if (d.type === RUBY_ENSURE_CSS) {
      ensureCss(String(d.href || ""));
      return;
    }

    if (d.type === REQ && typeof d.id === "string") {
      let entries = [];
      try {
        entries = collect();
      } catch {
        entries = [];
      }
      window.postMessage({ type: RES, id: d.id, entries }, "*");
      return;
    }

    if (d.type === RUBY_LIST_REQ && typeof d.id === "string") {
      let messages = [];
      try {
        messages = listRubyTargets();
      } catch {
        messages = [];
      }
      window.postMessage({ type: RUBY_LIST_RES, id: d.id, messages }, "*");
      return;
    }

    if (d.type === RUBY_APPLY_REQ && typeof d.id === "string") {
      let applied = 0;
      try {
        applied = applyRubyItems(Array.isArray(d.items) ? d.items : []);
      } catch {
        applied = 0;
      }
      window.postMessage({ type: RUBY_APPLY_RES, id: d.id, applied }, "*");
    }
  });
})();
