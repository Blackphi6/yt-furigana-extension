import { parseOverlayCaptions } from "../src/parse-cues.js";

const STORAGE_KEY = "ytcoState";

const els = {
  enabled: document.querySelector("#enabled"),
  file: document.querySelector("#file"),
  fontSize: document.querySelector("#font-size"),
  fontSizeLabel: document.querySelector("#font-size-label"),
  status: document.querySelector("#status"),
  clear: document.querySelector("#clear")
};

function setStatus(message, kind = "") {
  els.status.textContent = message || "";
  if (kind) els.status.dataset.state = kind;
  else delete els.status.dataset.state;
}

async function readState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data?.[STORAGE_KEY] || null;
}

async function writeState(next) {
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

async function refreshUi() {
  const saved = await readState();
  const cueCount = Array.isArray(saved?.cues) ? saved.cues.length : 0;
  els.enabled.checked = saved?.enabled !== false;
  els.fontSize.value = String(saved?.fontSize || 28);
  els.fontSizeLabel.textContent = els.fontSize.value;
  els.clear.disabled = cueCount === 0;

  if (cueCount > 0) {
    setStatus(
      `${saved.fileName || "字幕"} · ${cueCount} 行を読み込み済み`,
      "ok"
    );
  } else {
    setStatus("字幕ファイルを選ぶと、開いている YouTube に表示します。");
  }
}

els.enabled?.addEventListener("change", async () => {
  const saved = (await readState()) || {
    cues: [],
    fileName: "",
    fontSize: 28
  };
  await writeState({
    ...saved,
    enabled: els.enabled.checked
  });
  setStatus(
    els.enabled.checked ? "表示オン" : "表示オフ",
    els.enabled.checked ? "ok" : ""
  );
});

els.fontSize?.addEventListener("input", () => {
  els.fontSizeLabel.textContent = els.fontSize.value;
});

els.fontSize?.addEventListener("change", async () => {
  const saved = (await readState()) || {
    cues: [],
    fileName: "",
    enabled: true
  };
  await writeState({
    ...saved,
    fontSize: Number(els.fontSize.value) || 28
  });
});

els.file?.addEventListener("change", async () => {
  const file = els.file.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const { format, cues } = parseOverlayCaptions(text);
    if (!cues.length) {
      setStatus("字幕として読めませんでした（SRT / VTT / SRV3 / json3）。", "error");
      return;
    }
    await writeState({
      enabled: els.enabled.checked,
      fontSize: Number(els.fontSize.value) || 28,
      fileName: file.name,
      format,
      cues,
      loadedAt: Date.now()
    });
    setStatus(`${file.name} · ${cues.length} 行（${format}）を載せました`, "ok");
    els.clear.disabled = false;
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  } finally {
    els.file.value = "";
  }
});

els.clear?.addEventListener("click", async () => {
  await chrome.storage.local.remove(STORAGE_KEY);
  setStatus("クリアしました。");
  els.clear.disabled = true;
});

refreshUi();
