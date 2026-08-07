import { buildFuriganaPrompt } from "./llm-prompt.js";
import {
  DEFAULT_SETTINGS,
  listInstalledModelNames,
  pickPreferredOllamaModel,
  resolveReadingApiBaseUrl
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
import {
  fetchSharedReadingsPack,
  mergeSharedPackPreferLocal,
  postContribution
} from "./contributions.js";
import { PLAN_FREE, resolveEntitlement } from "./premium.js";
import { getMergedSettings } from "./settings-storage.js";
import {
  describeSegmentMismatch,
  parseLlmSegments,
  repairSegmentsToOriginal,
  segmentsToHtml
} from "./segment-html.js";
import {
  READING_API_DISK_CACHE_KEY,
  normalizeReadingApiDiskCache,
  putReadingApiDiskCache,
  readingApiDiskEntryKey,
  serializeReadingApiDiskCache
} from "./reading-api-cache.js";
import { fetchJapaneseCaptionCuesForExport } from "./caption-export.js";

const LLM_CACHE_LIMIT = 500;
const llmCache = new Map();
const READING_API_TIMEOUT_MS = 30_000;

/** @type {Map<string, { html: string, ts: number }> | null} */
let readingApiDiskCache = null;
let readingApiDiskCacheSaveTimer = 0;
let readingApiWarmPromise = null;

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
  const base = resolveReadingApiBaseUrl(settings);
  return `reading-api:${normalizeReadingApiUrl(base)}:${text}`;
}

function setCache(key, html) {
  if (llmCache.size >= LLM_CACHE_LIMIT) {
    const oldestKey = llmCache.keys().next().value;
    llmCache.delete(oldestKey);
  }
  llmCache.set(key, html);
}

async function loadReadingApiDiskCache() {
  if (readingApiDiskCache) return readingApiDiskCache;
  try {
    const stored = await chrome.storage.local.get({
      [READING_API_DISK_CACHE_KEY]: null
    });
    readingApiDiskCache = normalizeReadingApiDiskCache(
      stored[READING_API_DISK_CACHE_KEY]
    );
  } catch {
    readingApiDiskCache = new Map();
  }
  return readingApiDiskCache;
}

function schedulePersistReadingApiDiskCache() {
  if (readingApiDiskCacheSaveTimer) return;
  readingApiDiskCacheSaveTimer = setTimeout(() => {
    readingApiDiskCacheSaveTimer = 0;
    if (!readingApiDiskCache) return;
    void chrome.storage.local
      .set({
        [READING_API_DISK_CACHE_KEY]: serializeReadingApiDiskCache(
          readingApiDiskCache
        )
      })
      .catch(() => {});
  }, 800);
}

/**
 * Render 等のコールドスタートを先に起こす（timedtext は使わない）。
 * @param {typeof DEFAULT_SETTINGS} settings
 */
export async function warmReadingApi(settings) {
  const base = resolveReadingApiBaseUrl(settings);
  if (!base) return { ok: false, skipped: true };
  if (readingApiWarmPromise) return readingApiWarmPromise;

  readingApiWarmPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
      // スリープ解除
      await fetch(`${base.replace(/\/+$/, "")}/health`, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" }
      }).catch(() => null);
      // エンジン本体の初回ロードも先に済ませる（短いダミー文）
      await callReadingApi("暖機", settings, {});
      return { ok: true, endpoint: base };
    } finally {
      clearTimeout(timeoutId);
      // 連続ナビゲーションで再暖機できるように短時間で解放
      setTimeout(() => {
        readingApiWarmPromise = null;
      }, 60_000);
    }
  })();

  return readingApiWarmPromise;
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
  const endpoint = normalizeReadingApiUrl(resolveReadingApiBaseUrl(settings));
  if (!endpoint) {
    throw new Error(
      "読みAPIのURLが未設定です。ポップアップで「公開読み API」を選ぶか、エンドポイントを入力してください。"
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
  const endpoint = normalizeReadingApiUrl(resolveReadingApiBaseUrl(settings));
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

  const endpoint = normalizeReadingApiUrl(resolveReadingApiBaseUrl(settings));
  const diskKey = readingApiDiskEntryKey(endpoint, text);
  const disk = await loadReadingApiDiskCache();
  const hit = disk.get(diskKey);
  if (hit?.html) {
    setCache(cacheKey, hit.html);
    return hit.html;
  }

  // 未暖機なら並行で起こす（timedtext は使わない）
  void warmReadingApi(settings).catch(() => {});

  const store = await ensureDictionarySideReady();
  const userPhrases = { ...(store.phrases || {}) };
  // NEologd/固定句ヒット + 学習 phrases → 読み API の user_dict（固有名詞は辞書、文脈依存は API）
  const userDict = buildCombinedUserDict(text, userPhrases);
  const html = await callReadingApi(text, settings, userDict, userPhrases);
  setCache(cacheKey, html);
  putReadingApiDiskCache(disk, diskKey, html);
  schedulePersistReadingApiDiskCache();
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

  if (message?.type === "WARM_READING_API") {
    getSettings()
      .then((settings) => warmReadingApi(settings))
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "CLEAR_LLM_CACHE") {
    llmCache.clear();
    readingApiDiskCache = new Map();
    void chrome.storage.local.remove(READING_API_DISK_CACHE_KEY).catch(() => {});
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
        await chrome.storage.local.set({ premiumSharedReadingDict: entries });
        return { count: Object.keys(entries).length, entries };
      })
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SUBMIT_CONTRIBUTION") {
    getSettings()
      .then(async (settings) => {
        if (!settings.contributionEnabled) {
          return { skipped: true };
        }
        return postContribution(settings, {
          surface: message.surface,
          reading: message.reading,
          contextLeft: message.contextLeft || "",
          contextRight: message.contextRight || ""
        });
      })
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "FETCH_SHARED_READINGS_PACK") {
    refreshSharedReadingsPack({ force: true })
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

/** 字幕書き出しページ（サイト）から呼べる origin */
const EXPORT_PAGE_ORIGINS = new Set([
  "https://blackphi6.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
]);

/**
 * サイトの字幕書き出しページからの取得依頼。
 * ユーザーが URL を貼ってボタンを押したときだけ届く経路で、
 * 通常再生では一切呼ばれない（timedtext 連打の防止は caption-export 側のガード）。
 */
if (chrome.runtime.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message?.type !== "YTF_EXPORT_FETCH_CAPTIONS") return false;

    let origin = "";
    try {
      origin = new URL(sender?.url || "").origin;
    } catch {
      origin = "";
    }
    if (!EXPORT_PAGE_ORIGINS.has(origin)) {
      sendResponse({ ok: false, error: "この送信元は許可されていません。" });
      return false;
    }

    fetchJapaneseCaptionCuesForExport(message.videoId)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });
}

/** 共有パックの最短再取得間隔（SW 再起動による連打防止） */
const SHARED_PACK_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Free 共有読みパックを取得して local にマージ（既存キーは上書きしない）。
 * @param {{ force?: boolean }} [options]
 */
async function refreshSharedReadingsPack(options = {}) {
  const settings = await getSettings();
  if (settings.sharedPackEnabled === false) {
    return { skipped: true, count: 0 };
  }
  if (!options.force) {
    const meta = await chrome.storage.local.get({ sharedReadingsFetchedAt: 0 });
    const last = Number(meta.sharedReadingsFetchedAt || 0);
    if (last > 0 && Date.now() - last < SHARED_PACK_MIN_INTERVAL_MS) {
      return { skipped: true, reason: "throttled", count: 0 };
    }
  }
  const pack = await fetchSharedReadingsPack(settings);
  const stored = await chrome.storage.local.get({ freeSharedReadingPack: {} });
  const local =
    stored.freeSharedReadingPack && typeof stored.freeSharedReadingPack === "object"
      ? stored.freeSharedReadingPack
      : {};
  const merged = mergeSharedPackPreferLocal(local, pack.entries);
  await chrome.storage.local.set({
    freeSharedReadingPack: merged,
    sharedReadingsRevisedAt: pack.revisedAt || "",
    sharedReadingsFetchedAt: Date.now()
  });
  return {
    count: Object.keys(pack.entries).length,
    mergedCount: Object.keys(merged).length,
    revisedAt: pack.revisedAt || ""
  };
}

function scheduleSharedPackRefresh(force = false) {
  void refreshSharedReadingsPack({ force }).catch((error) => {
    console.warn(
      "[YT Furigana] shared readings pack skipped:",
      error?.message || error
    );
  });
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleSharedPackRefresh();
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    scheduleSharedPackRefresh();
  });
}

// SW 起動時にも一度試す（短命 SW 対策）
scheduleSharedPackRefresh();

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
  if (area === "sync" && changes.sharedPackEnabled) {
    const enabled = changes.sharedPackEnabled.newValue !== false;
    if (enabled) scheduleSharedPackRefresh(true);
    else {
      void chrome.storage.local.set({
        freeSharedReadingPack: {},
        sharedReadingsFetchedAt: 0
      });
    }
  }
});
