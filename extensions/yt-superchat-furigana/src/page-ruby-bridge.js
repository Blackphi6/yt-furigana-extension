/**
 * Orion/iOS 向け: contentDocument が取れないときでも、
 * MAIN 世界の live_chat iframe と postMessage でルビをやり取りする。
 * （台帳の PAGE_PAID_* と同じ橋）
 */

export const PAGE_RUBY_LIST_REQUEST = "YTSCF_PAGE_RUBY_LIST_REQUEST";
export const PAGE_RUBY_LIST_RESULT = "YTSCF_PAGE_RUBY_LIST_RESULT";
export const PAGE_RUBY_APPLY_REQUEST = "YTSCF_PAGE_RUBY_APPLY_REQUEST";
export const PAGE_RUBY_APPLY_RESULT = "YTSCF_PAGE_RUBY_APPLY_RESULT";
export const PAGE_RUBY_ENSURE_CSS = "YTSCF_PAGE_RUBY_ENSURE_CSS";

export const PAGE_RUBY_KEY_ATTR = "data-ytscf-ruby-key";

/**
 * 親ドキュメントから same-origin のチャット iframe Window を集める。
 * contentDocument が null でも contentWindow は取れることがある。
 * @param {Document | null | undefined} rootDoc
 * @returns {Window[]}
 */
export function listChatFrameWindows(rootDoc) {
  /** @type {Window[]} */
  const out = [];
  /** @type {Set<Window>} */
  const seen = new Set();
  /**
   * @param {Window | null | undefined} win
   */
  function addWin(win) {
    if (!win || seen.has(win)) return;
    seen.add(win);
    out.push(win);
  }
  const doc = rootDoc || (typeof document !== "undefined" ? document : null);
  if (!doc) return out;
  try {
    if (doc.defaultView) addWin(doc.defaultView);
  } catch {
    /* ignore */
  }
  try {
    const frames = doc.querySelectorAll(
      "#chatframe, iframe#chatframe, iframe[src*='live_chat'], ytd-live-chat-frame iframe, iframe"
    );
    for (const frame of frames) {
      try {
        const nested = /** @type {HTMLIFrameElement} */ (frame).contentWindow;
        addWin(nested);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * @param {Window} win
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @param {number} [timeoutMs]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export function requestPageRubyMessage(win, type, payload, timeoutMs = 600) {
  if (!win || typeof win.postMessage !== "function") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    let done = false;
    const resultType =
      type === PAGE_RUBY_LIST_REQUEST
        ? PAGE_RUBY_LIST_RESULT
        : type === PAGE_RUBY_APPLY_REQUEST
          ? PAGE_RUBY_APPLY_RESULT
          : "";
    const timer = setTimeout(() => finish(null), timeoutMs);
    /**
     * @param {MessageEvent} ev
     */
    function onMsg(ev) {
      if (ev.source !== win) return;
      const d = ev.data;
      if (!d || d.id !== id) return;
      if (resultType && d.type !== resultType) return;
      if (!resultType && d.type !== PAGE_RUBY_LIST_RESULT && d.type !== PAGE_RUBY_APPLY_RESULT) {
        return;
      }
      finish(d && typeof d === "object" ? /** @type {Record<string, unknown>} */ (d) : null);
    }
    /**
     * @param {Record<string, unknown> | null} data
     */
    function finish(data) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        win.removeEventListener("message", onMsg);
      } catch {
        /* ignore */
      }
      resolve(data);
    }
    try {
      win.addEventListener("message", onMsg);
      win.postMessage({ type, id, ...payload }, "*");
    } catch {
      finish(null);
    }
  });
}

/**
 * @param {Window[]} wins
 * @param {string} [cssHref]
 * @returns {Promise<Array<{ key: string, plain: string, kind: string, done: boolean }>>}
 */
export async function listPageRubyTargets(wins, cssHref = "") {
  /** @type {Array<{ key: string, plain: string, kind: string, done: boolean }>} */
  const out = [];
  const seen = new Set();
  await Promise.all(
    (wins || []).map(async (win) => {
      if (cssHref) {
        try {
          win.postMessage(
            { type: PAGE_RUBY_ENSURE_CSS, href: cssHref },
            "*"
          );
        } catch {
          /* ignore */
        }
      }
      const res = await requestPageRubyMessage(win, PAGE_RUBY_LIST_REQUEST, {});
      const messages = Array.isArray(res?.messages) ? res.messages : [];
      for (const raw of messages) {
        if (!raw || typeof raw !== "object") continue;
        const m = /** @type {Record<string, unknown>} */ (raw);
        const key = String(m.key || "").trim();
        const plain = String(m.plain || "").trim();
        if (!key || !plain || seen.has(key)) continue;
        seen.add(key);
        out.push({
          key,
          plain,
          kind: String(m.kind || "chat"),
          done: Boolean(m.done)
        });
      }
    })
  );
  return out;
}

/**
 * @param {Window[]} wins
 * @param {Array<{ key: string, html: string, original: string }>} items
 * @returns {Promise<number>}
 */
export async function applyPageRubyItems(wins, items) {
  if (!items?.length) return 0;
  let applied = 0;
  await Promise.all(
    (wins || []).map(async (win) => {
      const res = await requestPageRubyMessage(win, PAGE_RUBY_APPLY_REQUEST, {
        items
      });
      applied += Number(res?.applied) || 0;
    })
  );
  return applied;
}
