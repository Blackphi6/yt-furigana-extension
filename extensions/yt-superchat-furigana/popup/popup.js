import { isAnyTargetEnabled, normalizeYtscfState } from "../src/state.js";

const STORAGE_KEY = "ytscfState";

const els = {
  superChatEnabled: document.querySelector("#superChatEnabled"),
  chatEnabled: document.querySelector("#chatEnabled"),
  status: document.querySelector("#status")
};

function setStatus(message, kind = "") {
  els.status.textContent = message || "";
  if (kind) els.status.dataset.state = kind;
  else delete els.status.dataset.state;
}

async function readState() {
  const data = await chrome.storage.local.get([STORAGE_KEY, "ytscfRuntime"]);
  return {
    state: normalizeYtscfState(data?.[STORAGE_KEY]),
    runtime: data?.ytscfRuntime || null
  };
}

/**
 * @param {{ superChatEnabled: boolean, chatEnabled: boolean }} state
 */
async function writeState(state) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      superChatEnabled: Boolean(state.superChatEnabled),
      chatEnabled: Boolean(state.chatEnabled)
    }
  });
}

async function refreshUi() {
  const { state, runtime } = await readState();
  if (els.superChatEnabled) els.superChatEnabled.checked = state.superChatEnabled;
  if (els.chatEnabled) els.chatEnabled.checked = state.chatEnabled;

  if (!isAnyTargetEnabled(state)) {
    setStatus("オフ（ルビを外します）");
    return;
  }
  if (runtime?.error) {
    setStatus(runtime.error, "error");
    return;
  }
  if (!runtime?.ready) {
    setStatus("辞書を準備中…（初回のみ）");
    return;
  }
  const n = Number(runtime.processedCount) || 0;
  const parts = [];
  if (state.superChatEnabled) parts.push("SC");
  if (state.chatEnabled) parts.push("チャット");
  setStatus(`準備完了 · ${parts.join("+")} · 処理 ${n} 件`, "ok");
}

async function onToggleChange() {
  await writeState({
    superChatEnabled: Boolean(els.superChatEnabled?.checked),
    chatEnabled: Boolean(els.chatEnabled?.checked)
  });
  await refreshUi();
}

els.superChatEnabled?.addEventListener("change", () => {
  void onToggleChange();
});
els.chatEnabled?.addEventListener("change", () => {
  void onToggleChange();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.ytscfRuntime || changes[STORAGE_KEY]) void refreshUi();
});

void refreshUi();
