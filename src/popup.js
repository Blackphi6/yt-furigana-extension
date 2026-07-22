import {
  DEFAULT_SETTINGS,
  normalizeStoredEngine,
  pickPreferredOllamaModel
} from "./default-settings.js";
import { readingApiOriginPattern } from "./reading-api.js";
import {
  DEFAULT_PRICING_URL,
  DEFAULT_PRIVACY_URL,
  DEFAULT_SPONSORS_URL,
  DEFAULT_TERMS_URL,
  isPremiumPlan,
  normalizePlan,
  resolveEntitlement
} from "./premium.js";
import { getMergedSettings, saveMergedSettings } from "./settings-storage.js";

const enabledInput = document.getElementById("enabled");
const readingApiUrlInput = document.getElementById("readingApiUrl");
const readingApiKeyInput = document.getElementById("readingApiKey");
const licenseKeyInput = document.getElementById("licenseKey");
const planBadge = document.getElementById("planBadge");
const planHint = document.getElementById("planHint");
const premiumStatus = document.getElementById("premiumStatus");
const sponsorsLink = document.getElementById("sponsorsLink");
const buyPremiumLink = document.getElementById("buyPremiumLink");
const privacyLink = document.getElementById("privacyLink");
const termsLink = document.getElementById("termsLink");
const verifyLicenseButton = document.getElementById("verifyLicense");
const syncDictButton = document.getElementById("syncDict");
const fetchSharedDictButton = document.getElementById("fetchSharedDict");
const testReadingApiButton = document.getElementById("testReadingApi");
const readingApiStatus = document.getElementById("readingApiStatus");
const readingApiSettings = document.getElementById("reading-api-settings");
const ollamaUrlInput = document.getElementById("ollamaUrl");
const ollamaModelSelect = document.getElementById("ollamaModel");
const ollamaModelCustom = document.getElementById("ollamaModelCustom");
const testOllamaButton = document.getElementById("testOllama");
const ollamaStatus = document.getElementById("ollamaStatus");
const engineInputs = document.querySelectorAll('input[name="engine"]');
const ollamaSettings = document.getElementById("advanced-engine-settings");
const ollamaSettingsFields = document.getElementById("ollama-settings-fields");

const CUSTOM_MODEL_VALUE = "__custom__";

function selectedEngine() {
  return document.querySelector('input[name="engine"]:checked')?.value ?? "kuromoji";
}

function updateEnginePanels() {
  const engine = selectedEngine();
  const advanced = document.getElementById("advanced-engine-settings");
  if (advanced && engine !== "kuromoji") {
    advanced.open = true;
  }
}

function setStatus(el, message, ok) {
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
  el.className = ok ? "status ok" : "status error";
}

function updatePlanUi(settings) {
  const entitlement = resolveEntitlement(settings);
  const premium = isPremiumPlan(entitlement.plan);
  if (planBadge) {
    planBadge.textContent = premium ? "有料" : "無料";
    planBadge.classList.toggle("is-premium", premium);
  }
  if (planHint) {
    planHint.innerHTML = premium
      ? "有料が有効です。読み辞書の移動や、サーバー共有辞書が使えます。"
      : "無料：ふりがなと、読みの覚え直しは制限なし。みんなの読みパック受信はオフにできます。<br />有料：直した読みを別のパソコンにも移す／指定サーバーの共有辞書を取り込む、などができます。";
  }
  if (sponsorsLink) {
    sponsorsLink.href = settings.sponsorsUrl || DEFAULT_SPONSORS_URL;
  }
  if (buyPremiumLink) {
    buyPremiumLink.href = settings.pricingUrl || DEFAULT_PRICING_URL;
  }
  if (privacyLink) {
    privacyLink.href = settings.privacyUrl || DEFAULT_PRIVACY_URL;
  }
  if (termsLink) {
    termsLink.href = settings.termsUrl || DEFAULT_TERMS_URL;
  }
}

function getSelectedModelName() {
  if (!ollamaModelSelect) return "";
  if (ollamaModelSelect.value === CUSTOM_MODEL_VALUE) {
    return ollamaModelCustom?.value.trim() || "";
  }
  return ollamaModelSelect.value.trim();
}

function setModelField(modelName, models = []) {
  if (!ollamaModelSelect) return;
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
    if (ollamaModelCustom) {
      ollamaModelCustom.hidden = true;
      ollamaModelCustom.value = "";
    }
    return;
  }

  if (trimmed) {
    ollamaModelSelect.value = CUSTOM_MODEL_VALUE;
    if (ollamaModelCustom) {
      ollamaModelCustom.hidden = false;
      ollamaModelCustom.value = trimmed;
    }
    return;
  }

  const preferred = pickPreferredOllamaModel(installed, "");
  if (preferred) {
    ollamaModelSelect.value = preferred;
    if (ollamaModelCustom) {
      ollamaModelCustom.hidden = true;
      ollamaModelCustom.value = "";
    }
    return;
  }

  ollamaModelSelect.value = CUSTOM_MODEL_VALUE;
  if (ollamaModelCustom) ollamaModelCustom.hidden = false;
}

function sendMessage(type, extra = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...extra }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response ?? { ok: false, error: "応答がありません" });
    });
  });
}

async function ensureReadingApiPermission(url) {
  const origin = readingApiOriginPattern(url);
  if (!origin || !chrome.permissions?.request) return true;
  try {
    const already = await chrome.permissions.contains({ origins: [origin] });
    if (already) return true;
    return chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

async function ensureOllamaPermission(url) {
  const raw = String(url || "").trim() || "http://127.0.0.1:11434";
  let origin = "";
  try {
    const parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
    origin = `${parsed.protocol}//${parsed.host}/*`;
  } catch {
    origin = "http://127.0.0.1:11434/*";
  }
  if (!chrome.permissions?.request) return true;
  try {
    const already = await chrome.permissions.contains({ origins: [origin] });
    if (already) return true;
    return chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

async function refreshInstalledModels({ autoFix = false } = {}) {
  await saveSettings();
  const response = await sendMessage("LIST_OLLAMA_MODELS");

  if (!response.ok) {
    setStatus(ollamaStatus, response.error ?? "モデル一覧の取得に失敗しました", false);
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
      setStatus(ollamaStatus, `インストール済みモデルを自動選択: ${preferred}`, true);
    }
  }

  setModelField(current || response.effectiveModel || "", models);
  return response;
}

const learningInboxEnabledInput = document.getElementById("learningInboxEnabled");
const contributionEnabledInput = document.getElementById("contributionEnabled");
const sharedPackEnabledInput = document.getElementById("sharedPackEnabled");

async function loadSettings() {
  const result = await getMergedSettings();
  enabledInput.checked = result.enabled;
  readingApiUrlInput.value = result.readingApiUrl || "";
  if (readingApiKeyInput) readingApiKeyInput.value = result.readingApiKey || "";
  if (licenseKeyInput) licenseKeyInput.value = result.licenseKey || "";
  if (learningInboxEnabledInput) {
    learningInboxEnabledInput.checked = result.learningInboxEnabled !== false;
  }
  if (contributionEnabledInput) {
    contributionEnabledInput.checked = result.contributionEnabled === true;
  }
  if (sharedPackEnabledInput) {
    sharedPackEnabledInput.checked = result.sharedPackEnabled !== false;
  }
  if (ollamaUrlInput) ollamaUrlInput.value = result.ollamaUrl;
  setModelField(result.ollamaModel, []);
  updatePlanUi(result);

  const engine = normalizeStoredEngine(result.engine);
  engineInputs.forEach((input) => {
    input.checked = input.value === engine;
  });

  updateEnginePanels();
}

async function saveSettings() {
  const engine = selectedEngine();
  const readingApiUrl = readingApiUrlInput.value.trim();

  if (readingApiUrl) {
    await ensureReadingApiPermission(readingApiUrl);
  }

  const current = await getMergedSettings();
  await saveMergedSettings({
    ...current,
    enabled: enabledInput.checked,
    engine,
    readingApiUrl,
    readingApiKey: readingApiKeyInput?.value.trim() || "",
    licenseKey: licenseKeyInput?.value.trim() || "",
    plan: normalizePlan(current.plan),
    premiumExpiresAt: current.premiumExpiresAt || "",
    dictRevisedAt: current.dictRevisedAt || "",
    sharedDictEnabled:
      current.sharedDictEnabled ?? DEFAULT_SETTINGS.sharedDictEnabled,
    contributionEnabled: contributionEnabledInput
      ? contributionEnabledInput.checked
      : DEFAULT_SETTINGS.contributionEnabled,
    sharedPackEnabled: sharedPackEnabledInput
      ? sharedPackEnabledInput.checked
      : DEFAULT_SETTINGS.sharedPackEnabled,
    learningInboxEnabled: learningInboxEnabledInput
      ? learningInboxEnabledInput.checked
      : DEFAULT_SETTINGS.learningInboxEnabled,
    ollamaUrl: ollamaUrlInput?.value.trim() || current.ollamaUrl || DEFAULT_SETTINGS.ollamaUrl,
    ollamaModel: getSelectedModelName() || current.ollamaModel || DEFAULT_SETTINGS.ollamaModel
  });
}

enabledInput.addEventListener("change", saveSettings);
learningInboxEnabledInput?.addEventListener("change", saveSettings);
contributionEnabledInput?.addEventListener("change", async () => {
  await saveSettings();
});
sharedPackEnabledInput?.addEventListener("change", async () => {
  await saveSettings();
  if (sharedPackEnabledInput.checked) {
    try {
      await chrome.runtime.sendMessage({ type: "FETCH_SHARED_READINGS_PACK" });
    } catch {
      /* ignore */
    }
  } else {
    // オフ時は受信キャッシュも捨て、次回ページ読込で共有語を使わない
    try {
      await chrome.storage.local.set({
        freeSharedReadingPack: {},
        sharedReadingsFetchedAt: 0
      });
    } catch {
      /* ignore */
    }
  }
});
readingApiUrlInput.addEventListener("change", saveSettings);
readingApiUrlInput.addEventListener("blur", saveSettings);
readingApiKeyInput?.addEventListener("change", saveSettings);
readingApiKeyInput?.addEventListener("blur", saveSettings);
licenseKeyInput?.addEventListener("change", saveSettings);
licenseKeyInput?.addEventListener("blur", saveSettings);

ollamaUrlInput?.addEventListener("change", async () => {
  if (ollamaUrlInput?.value.trim()) {
    await ensureOllamaPermission(ollamaUrlInput.value.trim());
  }
  await saveSettings();
});
ollamaUrlInput?.addEventListener("blur", async () => {
  if (ollamaUrlInput?.value.trim()) {
    await ensureOllamaPermission(ollamaUrlInput.value.trim());
  }
  await saveSettings();
});

ollamaModelSelect?.addEventListener("change", async () => {
  const isCustom = ollamaModelSelect.value === CUSTOM_MODEL_VALUE;
  if (ollamaModelCustom) {
    ollamaModelCustom.hidden = !isCustom;
    if (!isCustom) ollamaModelCustom.value = "";
  }
  await saveSettings();
});

ollamaModelCustom?.addEventListener("change", saveSettings);
ollamaModelCustom?.addEventListener("blur", saveSettings);

engineInputs.forEach((input) => {
  input.addEventListener("change", async () => {
    updateEnginePanels();
    await saveSettings();
  });
});

testReadingApiButton?.addEventListener("click", async () => {
  if (!readingApiUrlInput.value.trim()) {
    readingApiUrlInput.value = "http://127.0.0.1:8765";
  }
  await saveSettings();
  setStatus(readingApiStatus, "接続確認中...", true);
  const granted = await ensureReadingApiPermission(readingApiUrlInput.value.trim());
  if (!granted) {
    setStatus(readingApiStatus, "アクセス許可が拒否されました", false);
    return;
  }
  const response = await sendMessage("CHECK_READING_API");
  if (!response.ok) {
    setStatus(readingApiStatus, response.error ?? "接続に失敗しました", false);
    return;
  }
  setStatus(readingApiStatus, `接続OK（${response.endpoint}）`, true);
});

testOllamaButton?.addEventListener("click", async () => {
  await saveSettings();
  setStatus(ollamaStatus, "接続確認中...", true);
  const granted = await ensureOllamaPermission(ollamaUrlInput?.value.trim() || "");
  if (!granted) {
    setStatus(ollamaStatus, "アクセス許可が拒否されました", false);
    return;
  }

  const response = await sendMessage("CHECK_OLLAMA");
  if (!response.ok) {
    setStatus(ollamaStatus, response.error ?? "接続に失敗しました", false);
    return;
  }

  const models = response.models ?? [];
  const current = getSelectedModelName();
  setModelField(current || response.effectiveModel || "", models);

  if (!response.modelAvailable && response.suggestedModel) {
    setModelField(response.suggestedModel, models);
    await chrome.storage.sync.set({ ollamaModel: response.suggestedModel });
    setStatus(
      ollamaStatus,
      `接続OK。${current || "未設定"} は未インストールのため ${response.suggestedModel} に切り替えました`,
      true
    );
    return;
  }

  setStatus(ollamaStatus, `接続OK（${response.effectiveModel} で変換可能）`, true);
});

verifyLicenseButton?.addEventListener("click", async () => {
  await saveSettings();
  const url = readingApiUrlInput.value.trim() || "http://127.0.0.1:8765";
  if (!readingApiUrlInput.value.trim()) {
    readingApiUrlInput.value = url;
    await saveSettings();
  }
  const granted = await ensureReadingApiPermission(url);
  if (!granted) {
    setStatus(premiumStatus, "サーバーへのアクセス許可が必要です", false);
    return;
  }
  setStatus(premiumStatus, "キーを確認しています…", true);
  const response = await sendMessage("VERIFY_LICENSE", {
    licenseKey: licenseKeyInput?.value.trim() || ""
  });
  if (!response.ok) {
    setStatus(premiumStatus, response.error ?? "キーの確認に失敗しました", false);
    return;
  }
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  updatePlanUi(settings);
  setStatus(premiumStatus, `有料が有効になりました`, true);
});

syncDictButton?.addEventListener("click", async () => {
  await saveSettings();
  setStatus(premiumStatus, "読み辞書を移しています…", true);
  const response = await sendMessage("SYNC_USER_DICT");
  if (!response.ok) {
    setStatus(premiumStatus, response.error ?? "移動に失敗しました", false);
    return;
  }
  setStatus(
    premiumStatus,
    `移動できました（${response.count} 語）`,
    true
  );
});

fetchSharedDictButton?.addEventListener("click", async () => {
  await saveSettings();
  setStatus(premiumStatus, "サーバー共有辞書を取り込んでいます…", true);
  const response = await sendMessage("FETCH_SHARED_DICT");
  if (!response.ok) {
    setStatus(premiumStatus, response.error ?? "取り込みに失敗しました", false);
    return;
  }
  setStatus(
    premiumStatus,
    `サーバー共有辞書 ${response.count} 語を取り込みました（ページを再読み込みすると反映）`,
    true
  );
});

const exportLearningButton = document.getElementById("exportLearning");
const clearLearningButton = document.getElementById("clearLearning");
const learningStatus = document.getElementById("learningStatus");

function setLearningStatus(message, ok) {
  if (!learningStatus) return;
  learningStatus.hidden = false;
  learningStatus.textContent = message;
  learningStatus.className = ok ? "status ok" : "status error";
}

exportLearningButton?.addEventListener("click", async () => {
  const response = await sendMessage("GET_LEARNING_INBOX");
  if (!response.ok) {
    setLearningStatus(response.error ?? "取得に失敗しました", false);
    return;
  }

  const inbox = response.inbox ?? [];
  const body =
    inbox.map((row) => JSON.stringify(row)).join("\n") + (inbox.length ? "\n" : "");
  const blob = new Blob([body], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  anchor.href = url;
  anchor.download = `yt-furigana-inbox-${stamp}.jsonl`;
  anchor.click();
  URL.revokeObjectURL(url);
  setLearningStatus(`${inbox.length} 件のメモをファイルに出しました`, true);
});

clearLearningButton?.addEventListener("click", async () => {
  const response = await sendMessage("CLEAR_LEARNING_INBOX");
  if (!response.ok) {
    setLearningStatus(response.error ?? "消去に失敗しました", false);
    return;
  }
  setLearningStatus("メモを消しました", true);
});

document.getElementById("openLicenses")?.addEventListener("click", (event) => {
  event.preventDefault();
  const url = chrome.runtime.getURL("licenses/licenses.html");
  if (chrome.tabs?.create) {
    void chrome.tabs.create({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
});

void loadSettings();
