import { isAnyTargetEnabled, normalizeYtscfState } from "../src/state.js";
import {
  SC_LEDGER_STORAGE_KEY,
  clearLedgerForVideo,
  extractVideoIdFromHref,
  filterLedgerBySearch,
  ledgerItemsToCsv,
  loadLedgerStore,
  saveLedgerStore,
  toggleLedgerEntryRead
} from "../src/sc-ledger.js";

const STORAGE_KEY = "ytscfState";

const els = {
  superChatEnabled: document.querySelector("#superChatEnabled"),
  chatEnabled: document.querySelector("#chatEnabled"),
  hideTextMessages: document.querySelector("#hideTextMessages"),
  ledgerEnabled: document.querySelector("#ledgerEnabled"),
  readingApiEnabled: document.querySelector("#readingApiEnabled"),
  status: document.querySelector("#status"),
  diag: document.querySelector("#diag"),
  ledgerCount: document.querySelector("#ledgerCount"),
  ledgerHint: document.querySelector("#ledgerHint"),
  ledgerList: document.querySelector("#ledgerList"),
  exportCsv: document.querySelector("#exportCsv"),
  clearLedger: document.querySelector("#clearLedger"),
  ledgerSearch: document.querySelector("#ledgerSearch"),
  ledgerSearchField: document.querySelector("#ledgerSearchField"),
  ledgerAmountMin: document.querySelector("#ledgerAmountMin"),
  ledgerAmountMax: document.querySelector("#ledgerAmountMax"),
  closeLedger: document.querySelector("#closeLedger")
};

/** @type {import("../src/sc-ledger.js").ScLedgerEntry[]} */
let allLedgerItems = [];
/** @type {import("../src/sc-ledger.js").ScLedgerEntry[]} */
let currentItems = [];
let currentVideoId = "";

function setStatus(message, kind = "") {
  els.status.textContent = message || "";
  if (kind) els.status.dataset.state = kind;
  else delete els.status.dataset.state;
}

/**
 * 実機デバッグ用（storage の ytscfRuntime）。
 * @param {Record<string, unknown> | null | undefined} runtime
 */
function setDiag(runtime) {
  if (!els.diag) return;
  if (!runtime || typeof runtime !== "object") {
    els.diag.hidden = true;
    els.diag.textContent = "";
    return;
  }
  const parts = [
    `engine=${runtime.engine || "?"}`,
    `tokFail=${runtime.tokenizerFailed ? "yes" : "no"}`,
    `apiFb=${runtime.readingApiFallback ? "yes" : "no"}`,
    `chatWin=${runtime.chatWindows ?? "?"}`,
    `chatDocs=${runtime.chatDocs ?? "?"}`,
    `parent=${runtime.preferParentChatEngine ? "yes" : "no"}`,
    `ios=${runtime.iosLike ? "yes" : "no"}`,
    `n=${runtime.processedCount ?? 0}`
  ];
  if (runtime.notice) parts.push(String(runtime.notice));
  els.diag.textContent = parts.join(" · ");
  els.diag.hidden = false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatObserved(ms) {
  try {
    return new Date(ms).toLocaleTimeString("ja-JP", { hour12: false });
  } catch {
    return "";
  }
}

async function readState() {
  const data = await chrome.storage.local.get([STORAGE_KEY, "ytscfRuntime"]);
  return {
    state: normalizeYtscfState(data?.[STORAGE_KEY]),
    runtime: data?.ytscfRuntime || null
  };
}

/**
 * @param {import("../src/state.js").YtscfState} state
 */
async function writeState(state) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      superChatEnabled: Boolean(state.superChatEnabled),
      chatEnabled: Boolean(state.chatEnabled),
      hideTextMessages: Boolean(state.hideTextMessages),
      ledgerEnabled: Boolean(state.ledgerEnabled),
      readingApiEnabled: Boolean(state.readingApiEnabled)
    }
  });
}

/**
 * アクティブな YouTube タブの videoId を推定。
 */
async function resolveActiveVideoId(runtime) {
  const fromRuntime = String(runtime?.videoId || "").trim();
  if (fromRuntime) return fromRuntime;
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    const tab = tabs?.[0];
    if (tab?.url) {
      const id = extractVideoIdFromHref(tab.url);
      if (id) return id;
    }
  } catch {
    /* tabs 権限が無い場合は runtime / ledger 側に任せる */
  }
  return "";
}

function readPopupSearchQuery() {
  const minRaw = /** @type {HTMLInputElement | null} */ (els.ledgerAmountMin)?.value;
  const maxRaw = /** @type {HTMLInputElement | null} */ (els.ledgerAmountMax)?.value;
  const amountMin = minRaw?.trim() ? Number(minRaw) : null;
  const amountMax = maxRaw?.trim() ? Number(maxRaw) : null;
  return {
    query: /** @type {HTMLInputElement | null} */ (els.ledgerSearch)?.value || "",
    field: /** @type {HTMLSelectElement | null} */ (els.ledgerSearchField)?.value || "all",
    amountMin: Number.isFinite(amountMin) ? amountMin : null,
    amountMax: Number.isFinite(amountMax) ? amountMax : null
  };
}

/**
 * @param {import("../src/sc-ledger.js").ScLedgerEntry[]} items
 */
function renderLedgerList(items) {
  if (!els.ledgerList) return;
  currentItems = items;
  if (els.ledgerCount) {
    const total = allLedgerItems.length;
    els.ledgerCount.textContent =
      total && items.length !== total ? `${items.length}/${total} 件` : `${items.length} 件`;
  }
  els.ledgerList.innerHTML = items
    .slice()
    .reverse()
    .map((item) => {
      const tc = item.videoTimecode
        ? `<button type="button" class="ledger-seek" data-seek="${escapeHtml(
            String(item.videoTimecodeSec ?? "")
          )}" title="この時刻へシーク">${escapeHtml(item.videoTimecode)}</button>`
        : `<span>${escapeHtml(formatObserved(item.observedAt))}</span>`;
      const readClass = item.readAt ? " is-read" : "";
      const readTitle = item.readAt ? "未読に戻す" : "読んだ";
      const readPressed = item.readAt ? ' aria-pressed="true"' : ' aria-pressed="false"';
      return `<li class="ledger-item${readClass}">
        <div class="ledger-meta">
          <button type="button" class="ledger-read${readClass}" data-act="toggleRead" data-id="${escapeHtml(
            item.id
          )}" title="${readTitle}" aria-label="${readTitle}"${readPressed}>✓</button>
          ${tc}
          <span class="ledger-amount">${escapeHtml(item.amount || "—")}</span>
          <span class="ledger-author">${escapeHtml(item.author || "—")}</span>
        </div>
        <p class="ledger-msg">${escapeHtml(item.message || "（本文なし）")}</p>
      </li>`;
    })
    .join("");
}

async function refreshLedger(runtime) {
  const store = await loadLedgerStore();
  let videoId = await resolveActiveVideoId(runtime);
  if (!videoId) {
    const ids = Object.keys(store.byVideo);
    if (ids.length === 1) videoId = ids[0];
    else if (ids.length > 1) {
      ids.sort(
        (a, b) =>
          (store.byVideo[b]?.updatedAt || 0) - (store.byVideo[a]?.updatedAt || 0)
      );
      videoId = ids[0];
    }
  }
  currentVideoId = videoId;
  allLedgerItems = videoId ? store.byVideo[videoId]?.items || [] : [];
  const items = filterLedgerBySearch(allLedgerItems, readPopupSearchQuery());
  if (els.ledgerHint) {
    els.ledgerHint.textContent = videoId
      ? `動画 ${videoId} · 拡張 ON 中に流れた Super Chat のみ（開く前の分は含みません）。ブラウザ終了で消えます。`
      : "拡張 ON 中に流れた Super Chat のみ（開く前の分は含みません）。ブラウザ終了で消えます。";
  }
  renderLedgerList(items);
  if (els.exportCsv) els.exportCsv.disabled = items.length === 0;
  if (els.clearLedger) els.clearLedger.disabled = items.length === 0;
}

async function refreshUi() {
  const { state, runtime } = await readState();
  if (els.superChatEnabled) els.superChatEnabled.checked = state.superChatEnabled;
  if (els.chatEnabled) els.chatEnabled.checked = state.chatEnabled;
  if (els.hideTextMessages) els.hideTextMessages.checked = state.hideTextMessages;
  if (els.ledgerEnabled) els.ledgerEnabled.checked = state.ledgerEnabled;
  if (els.readingApiEnabled) {
    els.readingApiEnabled.checked = state.readingApiEnabled;
  }

  const hideNote = state.hideTextMessages ? " · スパチャのみ" : "";
  const ledgerNote = state.ledgerEnabled ? "" : " · 台帳オフ";
  const apiNote =
    state.readingApiEnabled || runtime?.readingApiFallback
      ? " · 読みAPI"
      : "";
  const uglyXhr =
    typeof runtime?.error === "string" &&
    /XMLHttpRequestProgressEvent/i.test(runtime.error);

  if (!isAnyTargetEnabled(state)) {
    setStatus(`オフ（ルビなし）${hideNote}${ledgerNote}${apiNote}`);
  } else if (runtime?.readingApiFallback || runtime?.engine === "reading-api") {
    const n = Number(runtime.processedCount) || 0;
    setStatus(
      `読みAPIで動作中${hideNote}${ledgerNote} · 処理 ${n} 件`,
      n > 0 ? "ok" : ""
    );
  } else if (runtime?.error && !uglyXhr) {
    setStatus(String(runtime.error), "error");
  } else if (uglyXhr || runtime?.tokenizerFailed) {
    setStatus(
      `端末内辞書が使えないため読みAPIに切替中…${hideNote}${ledgerNote}`,
      ""
    );
  } else if (!runtime?.ready) {
    setStatus(`辞書を準備中…（初回のみ）${hideNote}${ledgerNote}${apiNote}`);
  } else {
    const n = Number(runtime.processedCount) || 0;
    const parts = [];
    if (state.superChatEnabled) parts.push("SC");
    if (state.chatEnabled) parts.push("チャット");
    setStatus(
      `準備完了 · ${parts.join("+")}${hideNote}${ledgerNote}${apiNote} · 処理 ${n} 件`,
      "ok"
    );
  }

  setDiag(runtime);

  await refreshLedger(runtime);
}

async function onToggleChange() {
  await writeState({
    superChatEnabled: Boolean(els.superChatEnabled?.checked),
    chatEnabled: Boolean(els.chatEnabled?.checked),
    hideTextMessages: Boolean(els.hideTextMessages?.checked),
    ledgerEnabled: Boolean(els.ledgerEnabled?.checked),
    readingApiEnabled: Boolean(els.readingApiEnabled?.checked)
  });
  await refreshUi();
}

async function seekActiveTab(seconds) {
  const sec = Number(seconds);
  if (!Number.isFinite(sec) || sec < 0) return;
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    const tab = tabs?.[0];
    if (!tab?.id) {
      setStatus("シーク先のタブが見つかりません", "error");
      return;
    }
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: "YTSCF_SEEK",
      seconds: sec
    });
    if (!res?.ok) {
      setStatus(res?.error || "シークに失敗（視聴ページで開いてください）", "error");
      return;
    }
    setStatus(`シーク ${Math.floor(sec)} 秒`, "ok");
  } catch {
    setStatus("シークに失敗（視聴ページを再読み込みしてください）", "error");
  }
}

els.superChatEnabled?.addEventListener("change", () => {
  void onToggleChange();
});
els.chatEnabled?.addEventListener("change", () => {
  void onToggleChange();
});
els.hideTextMessages?.addEventListener("change", () => {
  void onToggleChange();
});
els.ledgerEnabled?.addEventListener("change", () => {
  void onToggleChange();
});
els.closeLedger?.addEventListener("click", () => {
  if (els.ledgerEnabled) els.ledgerEnabled.checked = false;
  void onToggleChange();
});
els.readingApiEnabled?.addEventListener("change", () => {
  void onToggleChange();
});

els.ledgerSearch?.addEventListener("input", () => {
  renderLedgerList(filterLedgerBySearch(allLedgerItems, readPopupSearchQuery()));
  if (els.exportCsv) els.exportCsv.disabled = currentItems.length === 0;
});
els.ledgerSearchField?.addEventListener("change", () => {
  renderLedgerList(filterLedgerBySearch(allLedgerItems, readPopupSearchQuery()));
  if (els.exportCsv) els.exportCsv.disabled = currentItems.length === 0;
});
els.ledgerAmountMin?.addEventListener("input", () => {
  renderLedgerList(filterLedgerBySearch(allLedgerItems, readPopupSearchQuery()));
  if (els.exportCsv) els.exportCsv.disabled = currentItems.length === 0;
});
els.ledgerAmountMax?.addEventListener("input", () => {
  renderLedgerList(filterLedgerBySearch(allLedgerItems, readPopupSearchQuery()));
  if (els.exportCsv) els.exportCsv.disabled = currentItems.length === 0;
});

els.exportCsv?.addEventListener("click", () => {
  if (!currentItems.length) return;
  const csv = ledgerItemsToCsv(currentItems);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `yt-sc-ledger-${currentVideoId || "unknown"}-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

els.clearLedger?.addEventListener("click", () => {
  void (async () => {
    if (!currentVideoId) return;
    await clearLedgerForVideo(currentVideoId);
    await refreshUi();
  })();
});

els.ledgerList?.addEventListener("click", (ev) => {
  const t = /** @type {HTMLElement} */ (ev.target);
  const readBtn = t.closest?.("[data-act=toggleRead]");
  if (readBtn) {
    const id = readBtn.getAttribute("data-id");
    if (!id || !currentVideoId) return;
    void (async () => {
      const store = await loadLedgerStore();
      const { store: next, changed } = toggleLedgerEntryRead(
        store,
        currentVideoId,
        id
      );
      if (!changed) return;
      await saveLedgerStore(next);
      allLedgerItems = next.byVideo[currentVideoId]?.items || [];
      renderLedgerList(filterLedgerBySearch(allLedgerItems, readPopupSearchQuery()));
    })();
    return;
  }
  const btn = t.closest?.(".ledger-seek");
  if (!btn) return;
  const sec = btn.getAttribute("data-seek");
  void seekActiveTab(sec);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.ytscfRuntime || changes[STORAGE_KEY])) {
    void refreshUi();
  }
  if (
    (area === "session" || area === "local") &&
    changes[SC_LEDGER_STORAGE_KEY]
  ) {
    void refreshUi();
  }
});

void refreshUi();
