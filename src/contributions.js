/**
 * 匿名訂正の送信と、Free 向け共有読みパックの取得。
 * Premium の /v1/dict/shared とは別経路。
 */
import { normalizeReading } from "./reading-normalize.js";
import { applySharedDictEntries } from "./premium.js";
import { PUBLIC_READING_API_URL } from "./default-settings.js";

/**
 * Free 共有パック／匿名訂正は常に公開 API。
 * Premium 同期用の readingApiUrl には引きずらない（ローカル URL 誤誘導防止）。
 * @param {{ readingApiUrl?: string }} [settings]
 */
export function resolvePublicApiBase(_settings = {}) {
  return String(PUBLIC_READING_API_URL || "").replace(/\/+$/, "");
}

/**
 * @param {string} contextText
 * @param {string} surface
 * @param {number} [radius]
 */
export function splitContributionContext(contextText, surface, radius = 16) {
  const text = String(contextText || "");
  const surf = String(surface || "");
  const idx = surf ? text.indexOf(surf) : -1;
  if (idx < 0) {
    const left = text.slice(0, radius);
    const right = text.slice(Math.max(0, text.length - radius));
    return { contextLeft: left, contextRight: right === left ? "" : right };
  }
  return {
    contextLeft: text.slice(Math.max(0, idx - radius), idx),
    contextRight: text.slice(idx + surf.length, idx + surf.length + radius)
  };
}

/**
 * @param {{ readingApiUrl?: string }} settings
 * @param {{ surface: string, reading: string, contextLeft?: string, contextRight?: string }} payload
 */
export async function postContribution(settings, payload) {
  const base = resolvePublicApiBase(settings);
  if (!base) throw new Error("contribution server unset");

  const response = await fetch(`${base}/v1/contributions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      surface: payload.surface,
      reading: payload.reading,
      contextLeft: payload.contextLeft || "",
      contextRight: payload.contextRight || ""
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`contribution failed (${response.status}): ${text.slice(0, 160)}`);
  }
  return response.json();
}

/**
 * @param {{ readingApiUrl?: string }} settings
 * @returns {Promise<{ entries: Record<string, string>, revisedAt: string }>}
 */
export async function fetchSharedReadingsPack(settings = {}) {
  const base = resolvePublicApiBase(settings);
  if (!base) throw new Error("shared pack server unset");

  const response = await fetch(`${base}/v1/shared-readings`, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`shared pack failed (${response.status}): ${text.slice(0, 160)}`);
  }

  const payload = await response.json();
  const raw = payload.entries && typeof payload.entries === "object" ? payload.entries : {};
  /** @type {Record<string, string>} */
  const entries = {};
  for (const [surface, reading] of Object.entries(raw)) {
    if (!surface || !reading) continue;
    entries[surface] = normalizeReading(String(reading));
  }
  return {
    entries,
    revisedAt: payload.revisedAt || "",
    source: payload.source || "contributions"
  };
}

/**
 * 既存の共有パックにリモート entries をマージ（既存キーは上書きしない）。
 * @param {Record<string, string>} local
 * @param {Record<string, string>} remote
 */
export function mergeSharedPackPreferLocal(local, remote) {
  const map = new Map(Object.entries(local || {}));
  applySharedDictEntries(map, remote || {});
  /** @type {Record<string, string>} */
  const out = {};
  for (const [surface, reading] of map.entries()) {
    out[surface] = reading;
  }
  return out;
}
