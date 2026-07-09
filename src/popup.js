import { DEFAULT_SETTINGS, pickPreferredOllamaModel } from "./default-settings.js";

const enabledInput = document.getElementById("enabled");
const ollamaUrlInput = document.getElementById("ollamaUrl");
const ollamaModelSelect = document.getElementById("ollamaModel");
const ollamaModelCustom = document.getElementById("ollamaModelCustom");
const testOllamaButton = document.getElementById("testOllama");
const ollamaStatus = document.getElementById("ollamaStatus");
const engineInputs = document.querySelectorAll('input[name="engine"]');
const ollamaSettings = document.getElementById("ollama-settings");

const CUSTOM_MODEL_VALUE = "__custom__";

function updateOllamaPanelVisibility() {
  const engine = document.querySelector('input[name="engine"]:checked')?.value ?? "ollama";
  ollamaSettings.hidden = engine !== "ollama";
}

function setStatus(message, ok) {
  ollamaStatus.hidden = false;
  ollamaStatus.textContent = message;
  ollamaStatus.className = ok ? "status ok" : "status error";
}

function getSelectedModelName() {
  if (ollamaModelSelect.value === CUSTOM_MODEL_VALUE) {
    return ollamaModelCustom.value.trim();
  }
  return ollamaModelSelect.value.trim();
}

function setModelField(modelName, models = []) {
  const trimmed = modelName?.trim() ?? "";
  const installed = models.map((model) => model.name ?? model);

  ollamaModelSelect.innerHTML = "";

  if (installed.length === 0) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "（モデル未検出）";
    ollamaModelSelect.append(emptyOption);
  } else {
    for (const name of installed) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      ollamaModelSelect.append(option);
    }
  }

  const customOption = document.createElement("option");
  customOption.value = CUSTOM_MODEL_VALUE;
  customOption.textContent = "その他（手入力）";
  ollamaModelSelect.append(customOption);

  if (trimmed && installed.includes(trimmed)) {
    ollamaModelSelect.value = trimmed;
    ollamaModelCustom.hidden = true;
    ollamaModelCustom.value = "";
    return;
  }

  if (trimmed) {
    ollamaModelSelect.value = CUSTOM_MODEL_VALUE;
    ollamaModelCustom.hidden = false;
    ollamaModelCustom.value = trimmed;
    return;
  }

  const preferred = pickPreferredOllamaModel(installed, "");
  if (preferred) {
    ollamaModelSelect.value = preferred;
    ollamaModelCustom.hidden = true;
    ollamaModelCustom.value = "";
    return;
  }

  ollamaModelSelect.value = CUSTOM_MODEL_VALUE;
  ollamaModelCustom.hidden = false;
}

function sendMessage(type) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response ?? { ok: false, error: "応答がありません" });
    });
  });
}

async function refreshInstalledModels({ autoFix = false } = {}) {
  await saveSettings();
  const response = await sendMessage("LIST_OLLAMA_MODELS");

  if (!response.ok) {
    setStatus(response.error ?? "モデル一覧の取得に失敗しました", false);
    return response;
  }

  const models = response.models ?? [];
  const installed = models.map((model) => model.name);
  let current = getSelectedModelName();

  if (autoFix) {
    const preferred = pickPreferredOllamaModel(installed, current);
    if (preferred && preferred !== current) {
      current = preferred;
      await chrome.storage.sync.set({ ollamaModel: preferred });
      setStatus(`インストール済みモデルを自動選択: ${preferred}`, true);
    }
  }

  setModelField(current || response.effectiveModel || "", models);
  return response;
}

async function loadSettings() {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  enabledInput.checked = result.enabled;
  ollamaUrlInput.value = result.ollamaUrl;
  setModelField(result.ollamaModel, []);

  engineInputs.forEach((input) => {
    input.checked = input.value === result.engine;
  });

  updateOllamaPanelVisibility();

  if (result.engine === "ollama") {
    await refreshInstalledModels({ autoFix: true });
  }
}

async function saveSettings() {
  const engine = document.querySelector('input[name="engine"]:checked')?.value ?? "ollama";
  await chrome.storage.sync.set({
    enabled: enabledInput.checked,
    engine,
    ollamaUrl: ollamaUrlInput.value.trim() || DEFAULT_SETTINGS.ollamaUrl,
    ollamaModel: getSelectedModelName()
  });
}

enabledInput.addEventListener("change", saveSettings);
ollamaUrlInput.addEventListener("change", async () => {
  await saveSettings();
  await refreshInstalledModels({ autoFix: true });
});
ollamaUrlInput.addEventListener("blur", async () => {
  await saveSettings();
  await refreshInstalledModels({ autoFix: true });
});

ollamaModelSelect.addEventListener("change", async () => {
  const isCustom = ollamaModelSelect.value === CUSTOM_MODEL_VALUE;
  ollamaModelCustom.hidden = !isCustom;
  if (!isCustom) {
    ollamaModelCustom.value = "";
  }
  await saveSettings();
});

ollamaModelCustom.addEventListener("change", saveSettings);
ollamaModelCustom.addEventListener("blur", saveSettings);

engineInputs.forEach((input) => {
  input.addEventListener("change", async () => {
    updateOllamaPanelVisibility();
    await saveSettings();
    if (input.value === "ollama") {
      await refreshInstalledModels({ autoFix: true });
    }
  });
});

testOllamaButton.addEventListener("click", async () => {
  await saveSettings();
  setStatus("接続確認中...", true);

  const response = await sendMessage("CHECK_OLLAMA");
  if (!response.ok) {
    setStatus(response.error ?? "接続に失敗しました", false);
    return;
  }

  const models = response.models ?? [];
  const current = getSelectedModelName();
  setModelField(current || response.effectiveModel || "", models);

  if (!response.modelAvailable && response.suggestedModel) {
    setModelField(response.suggestedModel, models);
    await chrome.storage.sync.set({ ollamaModel: response.suggestedModel });
    setStatus(
      `接続OK。${current || "未設定"} は未インストールのため ${response.suggestedModel} に切り替えました`,
      true
    );
    return;
  }

  setStatus(`接続OK（${response.effectiveModel} で変換可能）`, true);
});

void loadSettings();
