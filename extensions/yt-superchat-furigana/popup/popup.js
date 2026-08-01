const STORAGE_KEY = "ytscfState";

const els = {
  enabled: document.querySelector("#enabled"),
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
    enabled: data?.[STORAGE_KEY]?.enabled !== false,
    runtime: data?.ytscfRuntime || null
  };
}

async function writeEnabled(enabled) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: { enabled: Boolean(enabled) }
  });
}

async function refreshUi() {
  const { enabled, runtime } = await readState();
  els.enabled.checked = enabled;
  if (!enabled) {
    setStatus("オフ（Super Chat のルビを外します）");
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
  setStatus(`準備完了 · 処理 ${n} 件`, "ok");
}

els.enabled?.addEventListener("change", async () => {
  await writeEnabled(els.enabled.checked);
  await refreshUi();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.ytscfRuntime || changes[STORAGE_KEY]) void refreshUi();
});

void refreshUi();
