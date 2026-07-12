import { normalizeReading } from "./reading-normalize.js";

export const USER_READING_DICT_KEY = "userReadingDict";

/**
 * @returns {Promise<Record<string, string>>}
 */
export async function loadUserReadingDict() {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return {};
  const stored = await chrome.storage.local.get({ [USER_READING_DICT_KEY]: {} });
  const dict = stored[USER_READING_DICT_KEY];
  return dict && typeof dict === "object" ? dict : {};
}

/**
 * @param {string} surface
 * @param {string} reading
 */
export async function saveUserReading(surface, reading) {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  if (!surface || !reading) return;

  const dict = await loadUserReadingDict();
  dict[surface] = normalizeReading(reading);
  await chrome.storage.local.set({ [USER_READING_DICT_KEY]: dict });
  return dict;
}

/**
 * @param {Map<string, string>} manualMap
 * @param {() => void} rebuildIndex
 * @param {Record<string, string>} dict
 */
export function applyUserReadingDictToManual(manualMap, rebuildIndex, dict) {
  let count = 0;
  for (const [surface, reading] of Object.entries(dict || {})) {
    if (!surface || !reading) continue;
    manualMap.set(surface, normalizeReading(reading));
    count += 1;
  }
  if (count > 0) rebuildIndex();
  return count;
}
