import { buildFuriganaPrompt } from "./llm-prompt.js";
import {
  DEFAULT_SETTINGS,
  listInstalledModelNames,
  pickPreferredOllamaModel
} from "./default-settings.js";
import { getOllamaTimeoutMs } from "./ollama-config.js";
import {
  buildReadingApiRequest,
  buildReadingApiHeaders,
  normalizeReadingApiUrl,
  parseReadingApiResponse
} from "./reading-api.js";
import {
  USER_READING_DICT_KEY,
  loadUserReadingDict,
  loadUserReadingStore,
  normalizeUserReadingStore,
  applyUserReadingLearning
} from "./user-reading-dict.js";
import {
  MANUAL_PHRASE_READINGS,
  CONTEXT_READING_RULES,
  rebuildManualPhraseIndex
} from "./reading-context.js";
import {
  loadNeologdPhrases,
  getNeologdPhraseCount
} from "./neologd-phrases.js";
import { buildCombinedUserDict } from "./phrase-hits.js";
import {
  verifyLicense,
  pullAndMergeDict,
  pushDict,
  fetchSharedDict
} from "./dict-sync.js";
import { PLAN_FREE, resolveEntitlement } from "./premium.js";
import { getMergedSettings } from "./settings-storage.js";
import {
  describeSegmentMismatch,
  parseLlmSegments,
  repairSegmentsToOriginal,
  segmentsToHtml
} from "./segment-html.js";

const LLM_CACHE_LIMIT = 500;
const llmCache = new Map();
const READING_API_TIMEOUT_MS = 30_000;

export function normalizeOllamaUrl(url) {
  return (url || DEFAULT_SETTINGS.ollamaUrl).replace(/\/+$/, "");
}

async function getSettings() {
  return getMergedSettings();
}

async function loadUserDict() {
  return loadUserReadingDict();
}

let neologdReadyPromise = null;

async function ensureDictionarySideReady() {
  if (!neologdReadyPromise) {
    neologdReadyPromise = loadNeologdPhrases()
      .then(() => {
        console.log(
          `[YT Furigana] SW NEologd phrases ready (${getNeologdPhraseCount()})`
        );
      })
      .catch((error) => {
        neologdReadyPromise = null;
        console.warn(
          "[YT Furigana] SW NEologd skipped:",
          error?.message || error
        );
      });
  }
  await neologdReadyPromise;

  const store = await loadUserReadingStore();
  applyUserReadingLearning(
    MANUAL_PHRASE_READINGS,
    CONTEXT_READING_RULES,
    rebuildManualPhraseIndex,
    store
  );
  return store;
}

async function resolveOllamaModel(settings) {
  const baseUrl = normalizeOllamaUrl(settings.ollamaUrl);
  const tagsResponse = await fetch(`${baseUrl}/api/tags`);
  if (!tagsResponse.ok) {
    throw new Error(`Ollama is not reachable (${tagsResponse.status})`);
  }

  const tagsData = await tagsResponse.json();
  const installedModels = listInstalledModelNames(tagsData);
  const model = pickPreferredOllamaModel(installedModels, settings.ollamaModel);

  if (!model) {
    throw new Error(
      "Ollama にモデルがありません。ターミナルで ollama pull qwen2.5:14b などを実行してください。"
    );
  }

  return { model, installedModels, tagsData };
}

function getCacheKey(text, settings) {
  return `ollama:${settings.ollamaUrl}:${settings.ollamaModel}:${text}`;
}

function getReadingApiCacheKey(text, settings) {
  return `reading-api:${normalizeReadingApiUrl(settings.readingApiUrl)}:${text}`;
}

function setCache(key, html) {
  if (llmCache.size >= LLM_CACHE_LIMIT) {
    const oldestKey = llmCache.keys().next().value;
    llmCache.delete(oldestKey);
  }
  llmCache.set(key, html);
}

export async function callOllama(text, settings, resolvedModel) {
  const prompt = buildFuriganaPrompt(text);
  const baseUrl = normalizeOllamaUrl(settings.ollamaUrl);
  const model = resolvedModel ?? (await resolveOllamaModel(settings)).model;
  const timeoutMs = getOllamaTimeoutMs(model);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: "json",
        keep_alive: "30m",
        options: { temperature: 0 }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 403) {
        throw new Error(
          "Ollama 403: 拡張機能からの接続が拒否されました。拡張機能を再読み込みしてください。"
        );
      }
      throw new Error(`Ollama error (${response.status}): ${body}`);
    }

    const data = await response.json();
    const raw = data?.response;
    if (!raw) {
      throw new Error("Ollama returned an empty response");
    }

    const segments = parseLlmSegments(raw);
    const repaired = repairSegmentsToOriginal(text, segments);
    if (!repaired) {
      const detail = describeSegmentMismatch(text, segments);
      throw new Error(
        `Ollama response failed validation (in="${detail.original.slice(0, 40)}" out="${detail.joined.slice(0, 40)}")`
      );
    }

    return segmentsToHtml(repaired);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `Ollama timed out after ${Math.round(timeoutMs / 1000)}s (${model})`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callReadingApi(text, settings, userDict, userPhrases = {}) {
  const endpoint = normalizeReadingApiUrl(settings.readingApiUrl);
  if (!endpoint) {
    throw new Error(
      "読みAPIのURLが未設定です。ポップアップでエンドポイントを入力してください。"
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), READING_API_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: buildReadingApiHeaders(settings),
      body: JSON.stringify(buildReadingApiRequest(text, userDict))
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Reading API error (${response.status}): ${body.slice(0, 200)}`);
    }

    const payload = await response.json();
    return parseReadingApiResponse(payload, text, userPhrases);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `Reading API timed out after ${Math.round(READING_API_TIMEOUT_MS / 1000)}s`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkOllamaConnection(settings) {
  const baseUrl = normalizeOllamaUrl(settings.ollamaUrl);
  const { model, installedModels } = await resolveOllamaModel(settings);

  const probeResponse = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: "test",
      stream: false,
      options: { num_predict: 1 }
    })
  });

  if (probeResponse.status === 403) {
    throw new Error(
      "Ollama 403: 変換APIが拒否されています。拡張機能を再読み込みしてください。"
    );
  }

  if (!probeResponse.ok) {
    const body = await probeResponse.text();
    throw new Error(`Ollama generate test failed (${probeResponse.status}): ${body}`);
  }

  const configuredModel = settings.ollamaModel?.trim() ?? "";
  const modelAvailable = !configuredModel || installedModels.includes(configuredModel);
  const effectiveModel = pickPreferredOllamaModel(installedModels, settings.ollamaModel);

  return {
    models: installedModels.map((name) => ({ name })),
    configuredModel,
    effectiveModel,
    modelAvailable,
    suggestedModel: modelAvailable ? configuredModel || effectiveModel : effectiveModel
  };
}

export async function checkReadingApiConnection(settings) {
  const endpoint = normalizeReadingApiUrl(settings.readingApiUrl);
  if (!endpoint) {
    throw new Error("読みAPIのURLが未設定です");
  }

  const html = await callReadingApi("今日は良い天気です。", settings, {});
  if (!html) {
    throw new Error("Reading API returned empty HTML");
  }
  return { endpoint, ok: true };
}

async function convertWithOllama(text) {
  const settings = await getSettings();
  const { model } = await resolveOllamaModel(settings);
  const cacheKey = getCacheKey(text, { ...settings, ollamaModel: model });

  if (llmCache.has(cacheKey)) {
    return llmCache.get(cacheKey);
  }

  const html = await callOllama(text, settings, model);
  setCache(cacheKey, html);
  return html;
}

async function convertWithReadingApi(text) {
  const settings = await getSettings();
  const cacheKey = getReadingApiCacheKey(text, settings);
  if (llmCache.has(cacheKey)) {
    return llmCache.get(cacheKey);
  }

  const store = await ensureDictionarySideReady();
  const userPhrases = { ...(store.phrases || {}) };
  // NEologd/固定句ヒット + 学習 phrases → JRM user_dict（固有名詞は辞書、異読みは JRM）
  const userDict = buildCombinedUserDict(text, userPhrases);
  const html = await callReadingApi(text, settings, userDict, userPhrases);
  setCache(cacheKey, html);
  return html;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CONVERT_FURIGANA") {
    convertWithOllama(message.text)
      .then((html) => sendResponse({ html, source: "ollama" }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type === "CONVERT_READING_API") {
    convertWithReadingApi(message.text)
      .then((html) => sendResponse({ html, source: "reading-api" }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type === "CLEAR_LLM_CACHE") {
    llmCache.clear();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "LIST_OLLAMA_MODELS") {
    getSettings()
      .then((settings) => resolveOllamaModel(settings))
      .then(({ installedModels, model }) =>
        sendResponse({
          ok: true,
          models: installedModels.map((name) => ({ name })),
          effectiveModel: model
        })
      )
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "CHECK_OLLAMA") {
    getSettings()
      .then((settings) => checkOllamaConnection(settings))
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "CHECK_READING_API") {
    getSettings()
      .then((settings) => checkReadingApiConnection(settings))
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_LEARNING_INBOX") {
    chrome.storage.local
      .get({ learningInbox: [] })
      .then((stored) =>
        sendResponse({
          ok: true,
          inbox: Array.isArray(stored.learningInbox) ? stored.learningInbox : []
        })
      )
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "CLEAR_LEARNING_INBOX") {
    chrome.storage.local
      .set({ learningInbox: [] })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "VERIFY_LICENSE") {
    getSettings()
      .then(async (settings) => {
        const verified = await verifyLicense({
          ...settings,
          licenseKey: message.licenseKey || settings.licenseKey
        });
        await chrome.storage.local.set({
          licenseKey: verified.licenseKey || ""
        });
        await chrome.storage.sync.set({
          plan: verified.plan,
          licenseKey: "",
          premiumExpiresAt: verified.premiumExpiresAt || ""
        });
        return verified;
      })
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SYNC_USER_DICT") {
    getSettings()
      .then(async (settings) => {
        const entitlement = resolveEntitlement(settings);
        if (entitlement.plan === PLAN_FREE) {
          throw new Error("辞書同期は Premium 機能です。ライセンスを検証してください。");
        }
        const localDict = await loadUserDict();
        const localRevisedAt = settings.dictRevisedAt || "";
        const pulled = await pullAndMergeDict(
          { ...settings, plan: entitlement.plan },
          localDict,
          localRevisedAt
        );
        const store = await loadUserReadingStore();
        const nextStore = normalizeUserReadingStore({
          ...store,
          phrases: pulled.dict
        });
        await chrome.storage.local.set({ [USER_READING_DICT_KEY]: nextStore });
        const pushed = await pushDict(
          { ...settings, plan: entitlement.plan },
          pulled.dict,
          pulled.revisedAt
        );
        const revisedAt = pushed.revisedAt || pulled.revisedAt;
        await chrome.storage.sync.set({ dictRevisedAt: revisedAt });
        return {
          count: Object.keys(pulled.dict).length,
          revisedAt
        };
      })
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "FETCH_SHARED_DICT") {
    getSettings()
      .then(async (settings) => {
        const entitlement = resolveEntitlement(settings);
        if (entitlement.plan === PLAN_FREE) {
          throw new Error("共有辞書は Premium 機能です。");
        }
        const entries = await fetchSharedDict({
          ...settings,
          plan: entitlement.plan
        });
        await chrome.storage.local.set({ sharedReadingDict: entries });
        return { count: Object.keys(entries).length, entries };
      })
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" && area !== "local") return;
  if (
    changes.engine ||
    changes.ollamaUrl ||
    changes.ollamaModel ||
    changes.readingApiUrl ||
    changes.readingApiKey ||
    changes.plan ||
    changes.licenseKey
  ) {
    llmCache.clear();
  }
});
