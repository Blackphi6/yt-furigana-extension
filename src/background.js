import { buildFuriganaPrompt } from "./llm-prompt.js";
import {
  DEFAULT_SETTINGS,
  listInstalledModelNames,
  pickPreferredOllamaModel
} from "./default-settings.js";
import { getOllamaTimeoutMs } from "./ollama-config.js";
import {
  parseLlmSegments,
  segmentsToHtml,
  validateSegments
} from "./segment-html.js";

const LLM_CACHE_LIMIT = 500;
const llmCache = new Map();

export function normalizeOllamaUrl(url) {
  return (url || DEFAULT_SETTINGS.ollamaUrl).replace(/\/+$/, "");
}

async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
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
  return `${settings.ollamaUrl}:${settings.ollamaModel}:${text}`;
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
    if (!validateSegments(text, segments)) {
      throw new Error("Ollama response failed validation");
    }

    return segmentsToHtml(segments);
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CONVERT_FURIGANA") {
    convertWithOllama(message.text)
      .then((html) => sendResponse({ html, source: "ollama" }))
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

  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.engine || changes.ollamaUrl || changes.ollamaModel) {
    llmCache.clear();
  }
});
