import {
  canUseFeature,
  mergeDictPreferNewer,
  buildSyncPayload,
  parseLicenseKeyShape,
  PLAN_PREMIUM,
  normalizePlan
} from "./premium.js";
import { normalizeReadingApiUrl } from "./reading-api.js";
import { normalizeReading } from "./reading-normalize.js";

function syncBaseUrl(readingApiUrl) {
  const endpoint = normalizeReadingApiUrl(readingApiUrl);
  if (!endpoint) return "";
  return endpoint.replace(/\/v1\/readings$/i, "");
}

function authHeaders(licenseKey, apiKey) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  const key = String(licenseKey || apiKey || "").trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/**
 * @param {{ readingApiUrl?: string, licenseKey?: string, plan?: string }} settings
 */
export async function verifyLicense(settings) {
  const shape = parseLicenseKeyShape(settings.licenseKey || "");
  if (!shape.ok) {
    throw new Error("ライセンスキーの形式が不正です（ytfp_ で始まるキー）");
  }

  const base = syncBaseUrl(settings.readingApiUrl);
  if (!base) {
    throw new Error("同期サーバー（読みAPI URL）が未設定です");
  }

  const response = await fetch(`${base}/v1/license/verify`, {
    method: "POST",
    headers: authHeaders(shape.key),
    body: JSON.stringify({ licenseKey: shape.key })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ライセンス検証失敗 (${response.status}): ${body.slice(0, 160)}`);
  }

  const payload = await response.json();
  return {
    plan: normalizePlan(payload.plan || PLAN_PREMIUM),
    premiumExpiresAt: payload.expiresAt || null,
    licenseKey: shape.key
  };
}

/**
 * @param {{ readingApiUrl?: string, licenseKey?: string, plan?: string }} settings
 * @param {Record<string, string>} localDict
 * @param {string} localRevisedAt
 */
export async function pullAndMergeDict(settings, localDict, localRevisedAt) {
  if (!canUseFeature(settings.plan, "dictSync")) {
    throw new Error("辞書同期は Premium 機能です");
  }

  const base = syncBaseUrl(settings.readingApiUrl);
  if (!base) throw new Error("同期サーバーが未設定です");

  const response = await fetch(`${base}/v1/dict/sync`, {
    method: "GET",
    headers: authHeaders(settings.licenseKey, settings.readingApiKey)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`辞書取得失敗 (${response.status}): ${body.slice(0, 160)}`);
  }

  const payload = await response.json();
  const remoteDict = payload.dict && typeof payload.dict === "object" ? payload.dict : {};
  const remoteRevisedAt = payload.revisedAt || "";
  const merged = mergeDictPreferNewer(localDict, remoteDict, {
    localRevisedAt,
    remoteRevisedAt
  });

  return {
    dict: merged,
    revisedAt:
      Date.parse(remoteRevisedAt) > Date.parse(localRevisedAt || "")
        ? remoteRevisedAt
        : localRevisedAt || new Date().toISOString(),
    remoteRevisedAt
  };
}

/**
 * @param {{ readingApiUrl?: string, licenseKey?: string, plan?: string, readingApiKey?: string }} settings
 * @param {Record<string, string>} dict
 * @param {string} revisedAt
 */
export async function pushDict(settings, dict, revisedAt) {
  if (!canUseFeature(settings.plan, "dictSync")) {
    throw new Error("辞書同期は Premium 機能です");
  }

  const base = syncBaseUrl(settings.readingApiUrl);
  if (!base) throw new Error("同期サーバーが未設定です");

  const body = buildSyncPayload(dict, revisedAt);
  const response = await fetch(`${base}/v1/dict/sync`, {
    method: "PUT",
    headers: authHeaders(settings.licenseKey, settings.readingApiKey),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`辞書アップロード失敗 (${response.status}): ${text.slice(0, 160)}`);
  }

  return response.json();
}

/**
 * @param {{ readingApiUrl?: string, licenseKey?: string, plan?: string, readingApiKey?: string }} settings
 * @returns {Promise<Record<string, string>>}
 */
export async function fetchSharedDict(settings) {
  if (!canUseFeature(settings.plan, "sharedDict")) {
    throw new Error("共有辞書は Premium 機能です");
  }

  const base = syncBaseUrl(settings.readingApiUrl);
  if (!base) throw new Error("同期サーバーが未設定です");

  const response = await fetch(`${base}/v1/dict/shared`, {
    method: "GET",
    headers: authHeaders(settings.licenseKey, settings.readingApiKey)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`共有辞書取得失敗 (${response.status}): ${text.slice(0, 160)}`);
  }

  const payload = await response.json();
  const entries = payload.entries && typeof payload.entries === "object" ? payload.entries : {};
  /** @type {Record<string, string>} */
  const normalized = {};
  for (const [surface, reading] of Object.entries(entries)) {
    if (!surface || !reading) continue;
    normalized[surface] = normalizeReading(reading);
  }
  return normalized;
}
