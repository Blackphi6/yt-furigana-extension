/**
 * 視聴ページ top frame 用の累積スパチャパネル。
 */

import {
  SC_LEDGER_STORAGE_KEY,
  adoptUnknownLedgerItems,
  clearLedgerForVideo,
  filterLedgerBySearch,
  filterLedgerByTimecodeRange,
  formatFetchAllSuperChatsStatus,
  ingestPaidMessagesFromDocument,
  ledgerItemsToCsv,
  loadLedgerStore,
  parseTimecodeToSeconds,
  resolveVideoId,
  saveLedgerStore,
  toggleLedgerEntryRead,
  upsertLedgerEntries
} from "./sc-ledger.js";
import {
  detectIsChatReplayPage,
  detectIsLiveNow,
  fetchAllSuperChatsFromReplay,
  fetchLiveChatReplayBootstrap,
  readChatBootstrapFromDocument
} from "./chat-replay-sc.js";
import {
  downloadScCardPng,
  downloadScCardPngBatch,
  copyScCardPngToClipboard,
  buildScPreviewCardHtml
} from "./sc-card-export.js";
import { normalizeYtscfState } from "./state.js";

const ROOT_ID = "ytscf-sc-ledger-panel";
const STATE_KEY = "ytscfState";
const COLLAPSED_KEY = "ytscfLedgerPanelCollapsed";
const POS_KEY = "ytscfLedgerPanelPos";
const DRAG_THRESHOLD_PX = 4;

/** 画面外にはみ出しても掴める最小幅（px） */
const CLAMP_KEEP_WIDTH = 80;
/** タイトルバー相当。全体高さでクランプすると展開時にほぼ動けない */
const CLAMP_KEEP_HEIGHT = 40;

/**
 * パネル位置を画面内に収める。
 * 展開時はパネル全体ではなく「掴み代」だけ残す（自由に寄せられる）。
 * @param {number} left
 * @param {number} top
 * @param {number} width
 * @param {number} height
 * @param {number} vw
 * @param {number} vh
 * @param {number} [margin]
 * @returns {{ left: number, top: number }}
 */
export function clampPanelPosition(left, top, width, height, vw, vh, margin = 8) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const viewW = Math.max(0, Number(vw) || 0);
  const viewH = Math.max(0, Number(vh) || 0);
  const m = Math.max(0, Number(margin) || 0);
  const keepW = Math.min(CLAMP_KEEP_WIDTH, w || CLAMP_KEEP_WIDTH);
  const keepH = Math.min(CLAMP_KEEP_HEIGHT, h || CLAMP_KEEP_HEIGHT);
  // 左右: 大半はみ出し可。上下: バーは画面内に残す（上にはみ出しすぎない）
  const minL = m - Math.max(0, w - keepW);
  const maxL = Math.max(minL, viewW - keepW - m);
  const minT = m;
  const maxT = Math.max(minT, viewH - keepH - m);
  return {
    left: Math.min(maxL, Math.max(minL, Number(left) || 0)),
    top: Math.min(maxT, Math.max(minT, Number(top) || 0))
  };
}

/**
 * @param {unknown} raw
 * @returns {{ left: number, top: number } | null}
 */
export function parseStoredPanelPos(raw) {
  if (!raw || typeof raw !== "object") return null;
  const left = Number(/** @type {{ left?: unknown }} */ (raw).left);
  const top = Number(/** @type {{ top?: unknown }} */ (raw).top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { left, top };
}

/**
 * 累積パネルを出してよい top frame か。
 * Shorts はスパチャが無いので除外（/shorts・/shorts/ID とも）。
 * @param {string} [href]
 * @returns {boolean}
 */
export function isTopYoutubeWatchFrame(href = location.href) {
  try {
    if (typeof window !== "undefined" && window !== window.top) return false;
  } catch {
    return false;
  }
  try {
    const u = new URL(String(href || ""), "https://www.youtube.com");
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "youtube.com" && host !== "m.youtube.com") return false;
    // Shorts フィード・個別 Shorts
    if (u.pathname === "/shorts" || u.pathname.startsWith("/shorts/")) {
      return false;
    }
    if (u.pathname === "/watch" || u.pathname.startsWith("/watch/")) return true;
    if (/^\/live\/[A-Za-z0-9_-]+/.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * click の target が Text ノードでも Element を返す（閉じるボタン用）。
 * @param {EventTarget | null | undefined} target
 * @returns {Element | null}
 */
export function eventTargetElement(target) {
  if (!target || typeof target !== "object") return null;
  // Text ノードには closest が無い
  if (typeof /** @type {{ closest?: unknown }} */ (target).closest === "function") {
    return /** @type {Element} */ (target);
  }
  const parent = /** @type {{ parentElement?: Element | null }} */ (target)
    .parentElement;
  return parent && typeof parent.closest === "function" ? parent : null;
}

/**
 * プレビュー外枠・閉じるボタンなら閉じる。
 * @param {EventTarget | null | undefined} target
 * @param {Element | null | undefined} overlay
 */
export function shouldCloseScPreview(target, overlay) {
  if (!overlay || target == null) return false;
  if (target === overlay) return true;
  const el = eventTargetElement(target);
  if (!el) return false;
  return Boolean(el.closest?.("[data-act=previewClose]"));
}

/**
 * プレビュー待ち中の円形スピナー HTML。
 */
export function buildScPreviewLoadingHtml() {
  return `<div class="ytscf-sc-preview__loading" role="status" aria-live="polite">
    <div class="ytscf-sc-preview__spinner" aria-hidden="true"></div>
    <p class="ytscf-sc-preview__loading-text">プレビューを準備しています…</p>
    <button type="button" class="ytscf-sc-preview__close" data-act="previewClose">閉じる</button>
  </div>`;
}

/**
 * @param {{
 *   getLedgerEnabled: () => boolean,
 *   getVideoId?: () => string,
 *   convertFurigana?: (text: string) => Promise<string> | string
 * }} deps
 */
export function installScLedgerPanel(deps) {
  if (!isTopYoutubeWatchFrame()) return { destroy() {} };
  if (document.getElementById(ROOT_ID)) {
    return { destroy() {} };
  }

  let destroyed = false;
  /** @type {AbortController | null} */
  let fetchAbort = null;
  let collapsed = false;

  const root = document.createElement("aside");
  root.id = ROOT_ID;
  root.className = "ytscf-ledger-panel";
  root.setAttribute("aria-label", "スパチャ台帳");
  // ポップアップの「累積パネル」オフ時は最初から出さない
  root.hidden = !deps.getLedgerEnabled();
  root.innerHTML = `
    <div class="ytscf-ledger-panel__bar" title="ドラッグで移動">
      <button type="button" class="ytscf-ledger-panel__toggle" data-act="toggle" aria-expanded="true">スパチャ累積</button>
      <span class="ytscf-ledger-panel__count" data-el="count">0</span>
      <button type="button" class="ytscf-ledger-panel__close" data-act="close" title="閉じる" aria-label="スパチャ累積を閉じる">×</button>
    </div>
    <div class="ytscf-ledger-panel__body" data-el="body">
      <p class="ytscf-ledger-panel__hint" data-el="hint">配信中に流れた SC を累積表示します。低額で消えてもここに残ります。</p>
      <div class="ytscf-ledger-panel__actions">
        <button type="button" class="ytscf-ledger-panel__btn" data-act="fetch" hidden>全件取得</button>
        <button type="button" class="ytscf-ledger-panel__btn" data-act="csv">CSV</button>
        <button type="button" class="ytscf-ledger-panel__btn ghost" data-act="clear">クリア</button>
      </div>
      <div class="ytscf-ledger-panel__search">
        <input type="search" data-el="searchQ" placeholder="名前・本文・金額で検索" autocomplete="off" />
        <select data-el="searchField" title="検索対象">
          <option value="all">すべて</option>
          <option value="author">ユーザー名</option>
          <option value="message">本文</option>
          <option value="amount">金額</option>
        </select>
      </div>
      <div class="ytscf-ledger-panel__range ytscf-ledger-panel__amount-range">
        <label>金額 <input type="number" data-el="amountMin" placeholder="最小" min="0" step="any" /></label>
        <span>〜</span>
        <label><input type="number" data-el="amountMax" placeholder="最大" min="0" step="any" /></label>
      </div>
      <div class="ytscf-ledger-panel__range">
        <label>範囲 <input type="text" data-el="rangeStart" placeholder="0:00" /></label>
        <span>〜</span>
        <label><input type="text" data-el="rangeEnd" placeholder="終了" /></label>
        <button type="button" class="ytscf-ledger-panel__btn" data-act="pngRange">範囲画像</button>
      </div>
      <div class="ytscf-ledger-panel__select-bar">
        <label class="ytscf-ledger-panel__check-all">
          <input type="checkbox" data-el="selectAll" /> 全選択
        </label>
        <button type="button" class="ytscf-ledger-panel__btn" data-act="pngSelected">選択画像</button>
      </div>
      <div class="ytscf-ledger-panel__progress" data-el="progressWrap" hidden>
        <progress data-el="progress" max="100" value="0"></progress>
        <span data-el="progressLabel"></span>
      </div>
      <p class="ytscf-ledger-panel__status" data-el="status" role="status"></p>
      <ul class="ytscf-ledger-panel__list" data-el="list"></ul>
    </div>
  `;
  document.documentElement.appendChild(root);

  const els = {
    count: root.querySelector("[data-el=count]"),
    body: root.querySelector("[data-el=body]"),
    hint: root.querySelector("[data-el=hint]"),
    status: root.querySelector("[data-el=status]"),
    list: root.querySelector("[data-el=list]"),
    rangeStart: root.querySelector("[data-el=rangeStart]"),
    rangeEnd: root.querySelector("[data-el=rangeEnd]"),
    selectAll: root.querySelector("[data-el=selectAll]"),
    progressWrap: root.querySelector("[data-el=progressWrap]"),
    progress: root.querySelector("[data-el=progress]"),
    progressLabel: root.querySelector("[data-el=progressLabel]"),
    fetchBtn: root.querySelector("[data-act=fetch]"),
    toggleBtn: root.querySelector("[data-act=toggle]"),
    searchQ: root.querySelector("[data-el=searchQ]"),
    searchField: root.querySelector("[data-el=searchField]"),
    amountMin: root.querySelector("[data-el=amountMin]"),
    amountMax: root.querySelector("[data-el=amountMax]")
  };

  /** @type {import("./sc-ledger.js").ScLedgerEntry[]} */
  let allItems = [];
  /** @type {import("./sc-ledger.js").ScLedgerEntry[]} */
  let items = [];
  /** チェック状態（再描画でも維持） */
  const selectedIds = new Set();
  let videoId = "";

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg || "";
  }

  /** × / ポップアップオフと同じく累積パネルを消す（蓄積も止まる） */
  async function disableLedgerPanel() {
    root.hidden = true;
    try {
      const data = await chrome.storage.local.get(STATE_KEY);
      const next = {
        ...normalizeYtscfState(data?.[STATE_KEY]),
        ledgerEnabled: false
      };
      await chrome.storage.local.set({ [STATE_KEY]: next });
    } catch {
      /* ignore */
    }
  }

  /**
   * @returns {number | null} 動画尺 ms
   */
  function videoDurationMs() {
    const video =
      document.querySelector("video.html5-main-video") ||
      document.querySelector("video");
    if (!video) return null;
    const d = Number(/** @type {HTMLVideoElement} */ (video).duration);
    if (Number.isFinite(d) && d > 0) return Math.floor(d * 1000);
    try {
      const seekable = /** @type {HTMLVideoElement} */ (video).seekable;
      if (seekable && seekable.length > 0) {
        const end = seekable.end(seekable.length - 1);
        if (Number.isFinite(end) && end > 0) return Math.floor(end * 1000);
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * @param {{
   *   visible?: boolean,
   *   ratio?: number | null,
   *   label?: string,
   *   indeterminate?: boolean
   * }} opts
   */
  function setFetchProgress(opts) {
    const wrap = /** @type {HTMLElement | null} */ (els.progressWrap);
    const bar = /** @type {HTMLProgressElement | null} */ (els.progress);
    const label = els.progressLabel;
    if (!wrap || !bar) return;
    const visible = opts.visible !== false;
    wrap.hidden = !visible;
    if (!visible) {
      bar.removeAttribute("value");
      bar.value = 0;
      if (label) label.textContent = "";
      return;
    }
    if (opts.indeterminate || opts.ratio == null || !Number.isFinite(opts.ratio)) {
      bar.removeAttribute("value");
    } else {
      const pct = Math.max(0, Math.min(100, Math.round(opts.ratio * 100)));
      bar.value = pct;
    }
    if (label) label.textContent = opts.label || "";
  }

  function currentVideoId() {
    return (
      (deps.getVideoId && deps.getVideoId()) ||
      resolveVideoId({ href: location.href, doc: document }) ||
      videoId
    );
  }

  async function loadCollapsed() {
    try {
      const data = await chrome.storage.local.get(COLLAPSED_KEY);
      collapsed = data?.[COLLAPSED_KEY] === true;
    } catch {
      collapsed = false;
    }
    applyCollapsed();
  }

  /** @type {{ left: number, top: number } | null} */
  let storedPos = null;

  function applyPosition(pos) {
    storedPos = pos;
    if (!pos) {
      root.style.left = "";
      root.style.top = "";
      root.classList.remove("is-moved");
      return;
    }
    if (root.hidden) return;
    const rect = root.getBoundingClientRect();
    const clamped = clampPanelPosition(
      pos.left,
      pos.top,
      rect.width || 360,
      rect.height || 48,
      window.innerWidth,
      window.innerHeight
    );
    root.classList.add("is-moved");
    root.style.left = `${Math.round(clamped.left)}px`;
    root.style.top = `${Math.round(clamped.top)}px`;
  }

  async function loadPosition() {
    try {
      const data = await chrome.storage.local.get(POS_KEY);
      applyPosition(parseStoredPanelPos(data?.[POS_KEY]));
    } catch {
      applyPosition(null);
    }
  }

  function savePosition(pos) {
    storedPos = pos;
    try {
      chrome.storage.local.set({ [POS_KEY]: pos });
    } catch {
      /* ignore */
    }
  }

  function applyCollapsed() {
    root.classList.toggle("is-collapsed", collapsed);
    if (els.toggleBtn) {
      els.toggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
    if (storedPos) applyPosition(storedPos);
  }

  async function refreshReplayButton() {
    // chatframe の src も見る（watch 本体 HTML だけだと見逃しやすい）
    let isReplay = detectIsChatReplayPage(document);
    let isLive = detectIsLiveNow(document);
    if (!isReplay || !isLive) {
      try {
        const frame = document.querySelector(
          "#chatframe, iframe#chatframe, iframe[src*='live_chat']"
        );
        const doc = /** @type {HTMLIFrameElement | null} */ (frame)
          ?.contentDocument;
        if (doc) {
          if (!isReplay) isReplay = detectIsChatReplayPage(doc);
          // 配信中判定は watch 側のバッジ／duration を優先（iframe の live_chat だけでは決めない）
        }
        const src =
          /** @type {HTMLIFrameElement | null} */ (frame)?.src || "";
        if (/live_chat_replay/i.test(src)) {
          isReplay = true;
          isLive = false;
        }
      } catch {
        /* ignore */
      }
    }
    // アーカイブ再生なら配信中ではない
    if (isReplay) isLive = false;
    if (els.fetchBtn) {
      els.fetchBtn.hidden = false;
      els.fetchBtn.disabled = false;
      els.fetchBtn.textContent = isLive ? "開始〜今まで取得" : "全件取得";
      els.fetchBtn.title = isLive
        ? "配信中はコメントを巻き戻せません。いま見えているスパチャ（上部の帯を含む）を取り込みます。開始からの全件は配信終了後です。"
        : "チャット再生から Super Chat を全件取得";
    }
    if (els.hint) {
      els.hint.textContent = isLive
        ? "これから流れる SC と、上部の帯に残っている SC を累積します。配信中は動画を巻き戻せてもコメントは巻き戻せません。開始からの全件は配信終了後に「全件取得」。"
        : isReplay
          ? "アーカイブ: 「全件取得」で再生位置に関係なく SC を集めます（手動・低頻度）。見える SC も自動で台帳に入ります。"
          : "画面に流れた SC を累積表示します。アーカイブなら「全件取得」で開始から集められます。";
    }
  }

  /**
   * @returns {import("./sc-ledger.js").LedgerSearchQuery}
   */
  function readSearchQuery() {
    const q = /** @type {HTMLInputElement | null} */ (els.searchQ)?.value || "";
    const fieldRaw =
      /** @type {HTMLSelectElement | null} */ (els.searchField)?.value || "all";
    const minRaw = /** @type {HTMLInputElement | null} */ (els.amountMin)?.value;
    const maxRaw = /** @type {HTMLInputElement | null} */ (els.amountMax)?.value;
    const amountMin = minRaw?.trim() ? Number(minRaw) : null;
    const amountMax = maxRaw?.trim() ? Number(maxRaw) : null;
    return {
      query: q,
      field: fieldRaw,
      amountMin: Number.isFinite(amountMin) ? amountMin : null,
      amountMax: Number.isFinite(amountMax) ? amountMax : null
    };
  }

  /**
   * @param {import("./sc-ledger.js").ScLedgerEntry[]} list
   */
  function visibleItemsFrom(list) {
    return filterLedgerBySearch(list, readSearchQuery());
  }

  function rerenderFiltered() {
    renderList(visibleItemsFrom(allItems));
  }

  /**
   * @param {import("./sc-ledger.js").ScLedgerEntry[]} list
   */
  function renderList(list) {
    items = list;
    if (els.count) {
      els.count.textContent =
        allItems.length && list.length !== allItems.length
          ? `${list.length}/${allItems.length}`
          : String(allItems.length || list.length);
    }
    if (!els.list) return;
    // 存在しない id の選択を捨てる
    for (const id of [...selectedIds]) {
      if (!list.some((x) => x.id === id)) selectedIds.delete(id);
    }
    if (!list.length) {
      els.list.innerHTML =
        '<li class="ytscf-ledger-panel__empty">まだありません</li>';
      syncSelectAllCheckbox();
      return;
    }
    // タイムコード昇順（merge 済みだが明示）。表示は先頭 200 件
    const shown = list.slice(0, 200);
    els.list.innerHTML = shown
      .map((item) => {
        const tc = item.videoTimecode
          ? `<button type="button" class="ytscf-ledger-panel__tc" data-act="seek" data-sec="${escapeHtml(
              String(item.videoTimecodeSec ?? "")
            )}">${escapeHtml(item.videoTimecode)}</button>`
          : `<span class="ytscf-ledger-panel__tc muted">—</span>`;
        const checked = selectedIds.has(item.id) ? " checked" : "";
        const readClass = item.readAt ? " is-read" : "";
        const readTitle = item.readAt ? "未読に戻す" : "読んだ";
        const readPressed = item.readAt ? ' aria-pressed="true"' : ' aria-pressed="false"';
        return `<li class="ytscf-ledger-panel__item${readClass}" style="${
          item.colorHex
            ? `border-left:4px solid ${escapeHtml(item.colorHex)}`
            : ""
        }">
          <div class="ytscf-ledger-panel__meta">
            <button type="button" class="ytscf-ledger-panel__read${readClass}" data-act="toggleRead" data-id="${escapeHtml(
              item.id
            )}" title="${readTitle}" aria-label="${readTitle}"${readPressed}>✓</button>
            <input type="checkbox" class="ytscf-ledger-panel__check" data-act="toggleOne" data-id="${escapeHtml(
              item.id
            )}"${checked} />
            ${tc}
            <strong class="ytscf-ledger-panel__amount">${escapeHtml(
              item.amount || "—"
            )}</strong>
            <span class="ytscf-ledger-panel__author">${escapeHtml(
              item.author || "—"
            )}</span>
            <span class="ytscf-ledger-panel__minis">
              <button type="button" class="ytscf-ledger-panel__mini" data-act="previewOne" data-id="${escapeHtml(
                item.id
              )}">プレビュー</button>
              <button type="button" class="ytscf-ledger-panel__mini" data-act="copyOne" data-id="${escapeHtml(
                item.id
              )}">コピー</button>
              <button type="button" class="ytscf-ledger-panel__mini" data-act="pngOne" data-id="${escapeHtml(
                item.id
              )}">画像</button>
            </span>
          </div>
          <p class="ytscf-ledger-panel__msg">${escapeHtml(
            item.message || "（本文なし）"
          )}</p>
        </li>`;
      })
      .join("");
    syncSelectAllCheckbox();
  }

  function syncSelectAllCheckbox() {
    const box = /** @type {HTMLInputElement | null} */ (els.selectAll);
    if (!box) return;
    if (!items.length) {
      box.checked = false;
      box.indeterminate = false;
      return;
    }
    const n = selectedIds.size;
    box.checked = n > 0 && n >= items.length;
    box.indeterminate = n > 0 && n < items.length;
  }

  /**
   * @returns {import("./sc-ledger.js").ScLedgerEntry[]}
   */
  function selectedEntries() {
    return items.filter((x) => selectedIds.has(x.id));
  }

  async function refreshFromStore() {
    if (destroyed) return;
    // 設定オフ・Shorts 等では完全非表示（SPA で watch→shorts しても残さない）
    if (!deps.getLedgerEnabled() || !isTopYoutubeWatchFrame()) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    if (storedPos) applyPosition(storedPos);
    videoId = currentVideoId();
    if (videoId) await adoptUnknownLedgerItems(videoId);
    const store = await loadLedgerStore();
    const list = videoId ? store.byVideo[videoId]?.items || [] : [];
    allItems = list;
    renderList(visibleItemsFrom(list));
    await refreshReplayButton();
  }

  function seekTo(sec) {
    const n = Number(sec);
    if (!Number.isFinite(n) || n < 0) return;
    const video =
      document.querySelector("video.html5-main-video") ||
      document.querySelector("video");
    if (!video) {
      setStatus("動画要素が見つかりません");
      return;
    }
    try {
      video.currentTime = n;
      void video.play?.();
      setStatus(`シーク ${Math.floor(n)} 秒`);
    } catch (err) {
      setStatus(String(err?.message || err));
    }
  }

  /** @type {HTMLElement | null} */
  let previewRoot = null;

  function closePreview() {
    previewRoot?.remove();
    previewRoot = null;
    document.removeEventListener("keydown", onPreviewKey);
  }

  /**
   * @param {KeyboardEvent} ev
   */
  function onPreviewKey(ev) {
    if (ev.key === "Escape") closePreview();
  }

  /**
   * @param {string} text
   */
  async function furiganaHtml(text) {
    const plain = String(text || "");
    if (!plain) return "";
    if (!deps.convertFurigana) return escapeHtml(plain);
    try {
      const html = await deps.convertFurigana(plain);
      if (!html || html === plain) return escapeHtml(plain);
      return html;
    } catch {
      return escapeHtml(plain);
    }
  }

  /**
   * @param {import("./sc-ledger.js").ScLedgerEntry} entry
   */
  async function cardFuriganaOpts(entry) {
    const message = String(entry.message || "").trim();
    if (!message || !deps.convertFurigana) return {};
    const messageHtml = await furiganaHtml(message);
    return messageHtml ? { messageHtml } : {};
  }

  /**
   * @param {import("./sc-ledger.js").ScLedgerEntry} entry
   */
  async function openPreview(entry) {
    closePreview();
    setStatus("プレビュー生成中…");
    const overlay = document.createElement("div");
    overlay.className = "ytscf-sc-preview";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "スパチャプレビュー");
    overlay.setAttribute("aria-busy", "true");
    overlay.innerHTML = buildScPreviewLoadingHtml();
    overlay.addEventListener("click", (ev) => {
      if (shouldCloseScPreview(ev.target, overlay)) closePreview();
    });
    document.documentElement.appendChild(overlay);
    previewRoot = overlay;
    document.addEventListener("keydown", onPreviewKey);

    let authorHtml = "";
    let messageHtml = "";
    try {
      [authorHtml, messageHtml] = await Promise.all([
        furiganaHtml(entry.author || ""),
        furiganaHtml(String(entry.message || "").trim())
      ]);
    } catch (err) {
      if (previewRoot !== overlay) return;
      closePreview();
      throw err;
    }
    // 待ちのあいだに閉じられていたら差し替えない
    if (previewRoot !== overlay) return;
    overlay.removeAttribute("aria-busy");
    overlay.innerHTML = `
      <div class="ytscf-sc-preview__card">
        <div class="ytscf-sc-preview__bar">
          <span>プレビュー</span>
          <button type="button" class="ytscf-sc-preview__close" data-act="previewClose">閉じる</button>
        </div>
        ${buildScPreviewCardHtml(entry, { authorHtml, messageHtml })}
      </div>
    `;
    setStatus("プレビュー表示中（Esc で閉じる）");
  }

  /**
   * 配信中はチャット再生 API が 400 になる。見えている SC だけ取り込む。
   * @param {string} vid
   * @param {boolean} [isLive]
   */
  async function ingestVisibleLiveFallback(vid, isLive = true) {
    const visible = await ingestPaidMessagesFromDocument(document, {
      videoId: vid,
      href: location.href
    });
    setFetchProgress({ visible: false });
    setStatus(
      isLive
        ? `配信中はコメントを巻き戻せません。いま見えているスパチャを取り込みました（${visible.total}件）。開始からの全件は配信終了後に「全件取得」できます。`
        : `全件取得に失敗したため、いま見えているスパチャだけ取り込みました（${visible.total}件）。チャットを開き直すか、ページを再読み込みしてからもう一度「全件取得」してください。`
    );
    await refreshFromStore();
  }

  async function runFetchAll() {
    if (fetchAbort) {
      fetchAbort.abort();
      fetchAbort = null;
      setStatus("取得を中断しました");
      setFetchProgress({ visible: false });
      void refreshReplayButton();
      return;
    }
    const vid = currentVideoId();
    if (!vid) {
      setStatus("videoId が分かりません");
      return;
    }
    let boot = readChatBootstrapFromDocument(document);
    if (!boot.continuation) {
      try {
        const frame = document.querySelector(
          "#chatframe, iframe[src*='live_chat']"
        );
        const doc = /** @type {HTMLIFrameElement | null} */ (frame)
          ?.contentDocument;
        if (doc) boot = readChatBootstrapFromDocument(doc);
      } catch {
        /* cross-origin 等 */
      }
    }
    if (!boot?.continuation) {
      setStatus(
        "チャットの continuation が見つかりません。右のライブチャットを開いて再試行してください。"
      );
      return;
    }
    if (!boot.apiKey) {
      setStatus("INNERTUBE_API_KEY が見つかりません。ページを再読み込みしてください。");
      return;
    }
    fetchAbort = new AbortController();
    if (els.fetchBtn) els.fetchBtn.textContent = "中断";
    const durationMs = videoDurationMs();
    // アーカイブ再生なら配信中扱いにしない
    const isLive =
      detectIsLiveNow(document) && !detectIsChatReplayPage(document);
    setStatus("取得中…");
    setFetchProgress({
      visible: true,
      ratio: durationMs ? 0 : null,
      indeterminate: !durationMs,
      label: durationMs ? "0%" : "取得中…"
    });
    try {
      let replayBoot = boot;
      try {
        const fromStart = await fetchLiveChatReplayBootstrap({
          continuation: boot.continuation,
          videoId: vid,
          signal: fetchAbort.signal
        });
        replayBoot = {
          apiKey: fromStart.apiKey || boot.apiKey,
          clientVersion: fromStart.clientVersion || boot.clientVersion,
          continuation: fromStart.continuation,
          isReplay: true
        };
      } catch (bootErr) {
        if (isLive) {
          await ingestVisibleLiveFallback(vid, true);
          return;
        }
        if (!boot.isReplay) throw bootErr;
      }
      const entries = await fetchAllSuperChatsFromReplay({
        videoId: vid,
        apiKey: replayBoot.apiKey,
        clientVersion: replayBoot.clientVersion,
        continuation: replayBoot.continuation,
        untilMs: isLive ? durationMs : null,
        signal: fetchAbort.signal,
        onPage: ({ page, added, totalSeen, playerOffsetMs }) => {
          const ratio =
            durationMs && playerOffsetMs != null
              ? Math.min(0.99, playerOffsetMs / durationMs)
              : null;
          const pct =
            ratio != null ? `${Math.round(ratio * 100)}%` : `page ${page}`;
          setFetchProgress({
            visible: true,
            ratio,
            indeterminate: ratio == null,
            label: `${pct} · 計 ${totalSeen}`
          });
          setStatus(
            `取得中… ${pct} · page ${page} · +${added} · 計 ${totalSeen}`
          );
        }
      });
      let added = 0;
      // 0 件のとき storage を触らない（拡張リロード直後の invalidated を避ける）
      if (entries.length) {
        const store = await loadLedgerStore();
        const merged = upsertLedgerEntries(store, vid, entries);
        added = merged.added;
        await saveLedgerStore(merged.store);
      }
      setFetchProgress({
        visible: true,
        ratio: entries.length ? 1 : null,
        indeterminate: !entries.length,
        label: entries.length ? `100% · 計 ${entries.length}` : "—"
      });
      setStatus(formatFetchAllSuperChatsStatus(entries, added));
      if (isLive && !entries.length) {
        await ingestVisibleLiveFallback(vid, true);
        return;
      }
      await refreshFromStore();
      window.setTimeout(() => setFetchProgress({ visible: false }), 2500);
    } catch (err) {
      if (fetchAbort?.signal.aborted) {
        setStatus("中断（途中まで保存済みの場合あり）");
        await refreshFromStore();
      } else {
        const msg = String(err?.message || err);
        if (/Extension context invalidated/i.test(msg)) {
          setStatus(
            "拡張を再読み込みしました。YouTube を更新してからもう一度お試しください。"
          );
        } else if (/巻き戻し|チャット再生（巻き戻し）|HTTP 400|HTTP 404/i.test(msg)) {
          await ingestVisibleLiveFallback(vid, isLive);
        } else {
          setStatus(`失敗: ${msg}`);
        }
      }
      setFetchProgress({ visible: false });
    } finally {
      fetchAbort = null;
      void refreshReplayButton();
    }
  }

  let searchTimer = 0;
  const onSearchInput = () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchTimer = 0;
      rerenderFiltered();
    }, 80);
  };
  els.searchQ?.addEventListener("input", onSearchInput);
  els.searchField?.addEventListener("change", () => rerenderFiltered());
  els.amountMin?.addEventListener("input", onSearchInput);
  els.amountMax?.addEventListener("input", onSearchInput);

  root.addEventListener("change", (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target);
    if (t === els.selectAll || t?.getAttribute?.("data-el") === "selectAll") {
      const on = /** @type {HTMLInputElement} */ (els.selectAll).checked;
      selectedIds.clear();
      if (on) {
        for (const item of items) selectedIds.add(item.id);
      }
      renderList(items);
      return;
    }
    const one = t.closest?.("[data-act=toggleOne]");
    if (one) {
      const id = one.getAttribute("data-id");
      if (!id) return;
      if (/** @type {HTMLInputElement} */ (one).checked) selectedIds.add(id);
      else selectedIds.delete(id);
      syncSelectAllCheckbox();
    }
  });

  root.addEventListener("click", (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target);
    const actEl = t.closest?.("[data-act]");
    if (!actEl) return;
    const act = actEl.getAttribute("data-act");
    if (act === "toggleOne") return;
    if (act === "toggleRead") {
      const id = actEl.getAttribute("data-id");
      const vid = currentVideoId();
      if (!id || !vid) return;
      void (async () => {
        const store = await loadLedgerStore();
        const { store: next, changed } = toggleLedgerEntryRead(store, vid, id);
        if (!changed) return;
        await saveLedgerStore(next);
        allItems = next.byVideo[vid]?.items || [];
        rerenderFiltered();
      })();
      return;
    }
    if (act === "close") {
      void disableLedgerPanel();
      return;
    }
    if (act === "toggle") {
      // ドラッグ直後の click は折りたたみに使わない
      if (suppressToggleClick) {
        suppressToggleClick = false;
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      collapsed = !collapsed;
      applyCollapsed();
      void chrome.storage.local.set({ [COLLAPSED_KEY]: collapsed });
      return;
    }
    if (act === "seek") {
      seekTo(actEl.getAttribute("data-sec"));
      return;
    }
    if (act === "pngOne") {
      const id = actEl.getAttribute("data-id");
      const entry = items.find((x) => x.id === id);
      if (!entry) return;
      void cardFuriganaOpts(entry)
        .then((opts) => downloadScCardPng(entry, opts))
        .then(() => setStatus("画像を保存しました"))
        .catch((err) => setStatus(String(err?.message || err)));
      return;
    }
    if (act === "copyOne") {
      const id = actEl.getAttribute("data-id");
      const entry = items.find((x) => x.id === id);
      if (!entry) return;
      void cardFuriganaOpts(entry)
        .then((opts) => copyScCardPngToClipboard(entry, opts))
        .then(() => setStatus("クリップボードにコピーしました"))
        .catch((err) => setStatus(String(err?.message || err)));
      return;
    }
    if (act === "previewOne") {
      const id = actEl.getAttribute("data-id");
      const entry = items.find((x) => x.id === id);
      if (!entry) return;
      void openPreview(entry).catch((err) =>
        setStatus(String(err?.message || err))
      );
      return;
    }
    if (act === "pngSelected") {
      const selected = selectedEntries();
      if (!selected.length) {
        setStatus("チェックした SC がありません（全選択可）");
        return;
      }
      setStatus(`画像書き出し 0/${selected.length}`);
      void downloadScCardPngBatch(selected, {
        resolveOpts: (e) => cardFuriganaOpts(e),
        onProgress: (i, n) => setStatus(`画像書き出し ${i}/${n}`)
      })
        .then(() => setStatus(`選択 ${selected.length} 枚完了`))
        .catch((err) => setStatus(String(err?.message || err)));
      return;
    }
    if (act === "fetch") {
      void runFetchAll();
      return;
    }
    if (act === "csv") {
      if (!items.length) return;
      const csv = ledgerItemsToCsv(items);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `yt-sc-ledger-${currentVideoId() || "unknown"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (act === "clear") {
      const vid = currentVideoId();
      if (!vid) return;
      selectedIds.clear();
      void clearLedgerForVideo(vid).then(() => refreshFromStore());
      return;
    }
    if (act === "pngRange") {
      const start = parseTimecodeToSeconds(
        /** @type {HTMLInputElement} */ (els.rangeStart)?.value || ""
      );
      const end = parseTimecodeToSeconds(
        /** @type {HTMLInputElement} */ (els.rangeEnd)?.value || ""
      );
      const startSec =
        /** @type {HTMLInputElement} */ (els.rangeStart)?.value?.trim()
          ? start
          : null;
      const endSec =
        /** @type {HTMLInputElement} */ (els.rangeEnd)?.value?.trim()
          ? end
          : null;
      if (
        (/** @type {HTMLInputElement} */ (els.rangeStart)?.value?.trim() &&
          startSec == null) ||
        (/** @type {HTMLInputElement} */ (els.rangeEnd)?.value?.trim() &&
          endSec == null)
      ) {
        setStatus("範囲の時刻形式が不正です（例: 1:23:45）");
        return;
      }
      const filtered = filterLedgerByTimecodeRange(items, startSec, endSec);
      if (!filtered.length) {
        setStatus("範囲に該当する SC がありません");
        return;
      }
      setStatus(`画像書き出し 0/${filtered.length}`);
      void downloadScCardPngBatch(filtered, {
        resolveOpts: (e) => cardFuriganaOpts(e),
        onProgress: (i, n) => setStatus(`画像書き出し ${i}/${n}`)
      }).then(() => setStatus(`画像 ${filtered.length} 枚完了`));
    }
  });

  const onStorage = (changes, area) => {
    if (area !== "session" && area !== "local") return;
    if (changes[SC_LEDGER_STORAGE_KEY] || changes.ytscfState) {
      void refreshFromStore();
    }
  };
  chrome.storage.onChanged.addListener(onStorage);

  const bar = root.querySelector(".ytscf-ledger-panel__bar");
  let dragPointerId = 0;
  let dragging = false;
  let dragMoved = false;
  let suppressToggleClick = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOrigLeft = 0;
  let dragOrigTop = 0;

  function detachDragWindowListeners() {
    window.removeEventListener("pointermove", onBarPointerMove, true);
    window.removeEventListener("pointerup", onBarPointerUp, true);
    window.removeEventListener("pointercancel", onBarPointerUp, true);
  }

  function onBarPointerDown(ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    // 閉じる・入力はドラッグ対象外
    const t = /** @type {HTMLElement | null} */ (ev.target);
    if (t?.closest?.("[data-act=close], [data-act=toggleRead], input, textarea, select, a")) return;
    const rect = root.getBoundingClientRect();
    dragging = true;
    dragMoved = false;
    dragPointerId = ev.pointerId;
    dragStartX = ev.clientX;
    dragStartY = ev.clientY;
    dragOrigLeft = rect.left;
    dragOrigTop = rect.top;
    // bar 上の capture だけだとポインタが外れた瞬間に止まるので window でも追う
    window.addEventListener("pointermove", onBarPointerMove, true);
    window.addEventListener("pointerup", onBarPointerUp, true);
    window.addEventListener("pointercancel", onBarPointerUp, true);
    try {
      bar?.setPointerCapture?.(ev.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onBarPointerMove(ev) {
    if (!dragging || ev.pointerId !== dragPointerId) return;
    const dx = ev.clientX - dragStartX;
    const dy = ev.clientY - dragStartY;
    if (!dragMoved && dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      return;
    }
    if (!dragMoved) {
      dragMoved = true;
      suppressToggleClick = true;
      root.classList.add("is-dragging");
      try {
        ev.preventDefault();
      } catch {
        /* ignore */
      }
    }
    applyPosition({ left: dragOrigLeft + dx, top: dragOrigTop + dy });
  }

  function onBarPointerUp(ev) {
    if (!dragging || ev.pointerId !== dragPointerId) return;
    dragging = false;
    root.classList.remove("is-dragging");
    detachDragWindowListeners();
    try {
      bar?.releasePointerCapture?.(ev.pointerId);
    } catch {
      /* ignore */
    }
    if (!dragMoved) return;
    const rect = root.getBoundingClientRect();
    const pos = clampPanelPosition(
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      window.innerWidth,
      window.innerHeight
    );
    applyPosition(pos);
    savePosition(pos);
  }

  function onViewportResize() {
    if (!storedPos) return;
    applyPosition(storedPos);
  }

  bar?.addEventListener("pointerdown", onBarPointerDown);
  window.addEventListener("resize", onViewportResize);

  // SPA 遷移は軽く監視（subtree 全変更で HTML スキャンしない）
  let moTimer = 0;
  const mo = new MutationObserver(() => {
    if (moTimer) return;
    moTimer = window.setTimeout(() => {
      moTimer = 0;
      // videoId が変わらなくても /watch → /shorts なら隠す
      void refreshFromStore();
    }, 800);
  });
  mo.observe(document.documentElement, { childList: true, subtree: false });
  // yt の履歴遷移
  window.addEventListener("yt-navigate-finish", () => {
    void refreshFromStore();
  });
  window.addEventListener("popstate", () => {
    void refreshFromStore();
  });
  // chatframe の差し替えだけ拾う
  const chatHost =
    document.querySelector("#chat-container, ytd-live-chat-frame, #secondary") ||
    document.body;
  const chatMo = new MutationObserver(() => {
    if (moTimer) return;
    moTimer = window.setTimeout(() => {
      moTimer = 0;
      void refreshReplayButton();
    }, 1500);
  });
  if (chatHost) {
    chatMo.observe(chatHost, { childList: true, subtree: false });
  }

  void loadCollapsed()
    .then(() => loadPosition())
    .then(() => refreshFromStore());

  return {
    refresh: () => void refreshFromStore(),
    destroy() {
      destroyed = true;
      fetchAbort?.abort();
      closePreview();
      chrome.storage.onChanged.removeListener(onStorage);
      bar?.removeEventListener("pointerdown", onBarPointerDown);
      detachDragWindowListeners();
      window.removeEventListener("resize", onViewportResize);
      mo.disconnect();
      chatMo.disconnect();
      root.remove();
    }
  };
}
