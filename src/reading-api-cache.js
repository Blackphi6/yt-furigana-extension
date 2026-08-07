/**
 * 読み API 結果の永続キャッシュ（表層テキスト→HTML）。
 * Service Worker 再起動でもヒットさせ、同じ字幕の再表示を即時にする。
 */

export const READING_API_DISK_CACHE_KEY = "readingApiHtmlDiskCache";
export const READING_API_DISK_CACHE_LIMIT = 400;
export const READING_API_DISK_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * @param {string} endpoint
 * @param {string} text
 */
export function readingApiDiskEntryKey(endpoint, text) {
  return `${String(endpoint || "").replace(/\/+$/, "")}\0${String(text || "")}`;
}

/**
 * @param {unknown} raw
 * @param {{ now?: number, limit?: number, ttlMs?: number }} [opts]
 * @returns {Map<string, { html: string, ts: number }>}
 */
export function normalizeReadingApiDiskCache(raw, opts = {}) {
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? READING_API_DISK_CACHE_LIMIT;
  const ttlMs = opts.ttlMs ?? READING_API_DISK_CACHE_TTL_MS;
  /** @type {Map<string, { html: string, ts: number }>} */
  const map = new Map();
  if (!raw || typeof raw !== "object") return map;
  const entries = Array.isArray(raw)
    ? raw
    : Array.isArray(/** @type {{ entries?: unknown }} */ (raw).entries)
      ? /** @type {{ entries: unknown[] }} */ (raw).entries
      : Object.entries(raw).map(([key, value]) =>
          value && typeof value === "object"
            ? { key, ...(/** @type {object} */ (value)) }
            : { key, html: value }
        );

  for (const row of entries) {
    if (!row || typeof row !== "object") continue;
    const key = String(/** @type {{ key?: string }} */ (row).key || "").trim();
    const html = String(/** @type {{ html?: string }} */ (row).html || "");
    const ts = Number(/** @type {{ ts?: number }} */ (row).ts) || 0;
    if (!key || !html) continue;
    if (ts && now - ts > ttlMs) continue;
    map.set(key, { html, ts: ts || now });
  }

  if (map.size <= limit) return map;
  const sorted = [...map.entries()].sort((a, b) => a[1].ts - b[1].ts);
  const keep = sorted.slice(-limit);
  return new Map(keep);
}

/**
 * @param {Map<string, { html: string, ts: number }>} map
 * @param {string} key
 * @param {string} html
 * @param {{ now?: number, limit?: number }} [opts]
 */
export function putReadingApiDiskCache(map, key, html, opts = {}) {
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? READING_API_DISK_CACHE_LIMIT;
  if (!key || !html) return map;
  // 更新時は末尾へ移し、LRU 風に古いものから落とす
  if (map.has(key)) map.delete(key);
  map.set(key, { html, ts: now });
  while (map.size > limit) {
    const first = map.keys().next().value;
    if (first == null) break;
    map.delete(first);
  }
  return map;
}

/**
 * @param {Map<string, { html: string, ts: number }>} map
 */
export function serializeReadingApiDiskCache(map) {
  return {
    version: 1,
    entries: [...map.entries()].map(([key, value]) => ({
      key,
      html: value.html,
      ts: value.ts
    }))
  };
}

/**
 * 楽観ローカル表示のあと、API 結果で差し替えるべきか。
 * @param {string | null | undefined} provisionalHtml
 * @param {string | null | undefined} remoteHtml
 */
export function shouldReplaceProvisionalFurigana(provisionalHtml, remoteHtml) {
  const remote = String(remoteHtml || "");
  if (!remote) return false;
  const local = String(provisionalHtml || "");
  if (!local) return true;
  return local !== remote;
}
