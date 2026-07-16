import { normalizeReading, normalizeUserReading } from "./reading-normalize.js";

export const USER_READING_DICT_KEY = "userReadingDict";

/**
 * @typedef {{
 *   version: 2,
 *   phrases: Record<string, string>,
 *   contextRules: Array<{ surface: string, reading: string, weight?: number, cues: string[] }>
 * }} UserReadingStore
 */

/**
 * 学習用の文脈キューを作る。
 * 「永遠→とわ」だけだと別文の「えいえん」まで壊すので、
 * 「永遠に」「だ永遠に」など surface より長い手がかりを優先する。
 *
 * @param {string} surface
 * @param {string} contextText
 * @returns {string[]}
 */
export function buildLearningCues(surface, contextText = "") {
  const text = String(contextText || "").replace(/\s+/g, "");
  const target = String(surface || "");
  if (!target) return [];

  const cues = new Set();
  let from = 0;
  while (from < text.length) {
    const idx = text.indexOf(target, from);
    if (idx < 0) break;

    const after1 = text.slice(idx + target.length, idx + target.length + 1);
    const after2 = text.slice(idx + target.length, idx + target.length + 2);
    const before1 = text.slice(Math.max(0, idx - 1), idx);
    const before2 = text.slice(Math.max(0, idx - 2), idx);

    if (after1) cues.add(`${target}${after1}`);
    if (after2.length === 2) cues.add(`${target}${after2}`);
    if (before1) cues.add(`${before1}${target}`);
    if (before2.length === 2) cues.add(`${before2}${target}`);
    if (before1 && after1) cues.add(`${before1}${target}${after1}`);

    const windowStart = Math.max(0, idx - 2);
    const windowEnd = Math.min(text.length, idx + target.length + 2);
    const window = text.slice(windowStart, windowEnd);
    if (window.length > target.length) cues.add(window);

    from = idx + target.length;
  }

  return [...cues].filter((cue) => cue && cue !== target && cue.includes(target));
}

/**
 * 旧形式 `{ 永遠: "とわ" }` と新形式を両対応。
 * @param {unknown} raw
 * @returns {UserReadingStore}
 */
export function normalizeUserReadingStore(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { version: 2, phrases: {}, contextRules: [] };
  }

  const obj = /** @type {Record<string, unknown>} */ (raw);
  const looksLegacy =
    !("version" in obj) && !("phrases" in obj) && !("contextRules" in obj);

  if (looksLegacy) {
    const phrases = {};
    for (const [surface, reading] of Object.entries(obj)) {
      if (typeof reading !== "string" || !surface) continue;
      phrases[surface] = normalizeUserReading(reading);
    }
    return { version: 2, phrases, contextRules: [] };
  }

  const phrases = {};
  const rawPhrases =
    obj.phrases && typeof obj.phrases === "object" && !Array.isArray(obj.phrases)
      ? obj.phrases
      : {};
  for (const [surface, reading] of Object.entries(rawPhrases)) {
    if (typeof reading !== "string" || !surface) continue;
    phrases[surface] = normalizeUserReading(reading);
  }

  const contextRules = [];
  const rawRules = Array.isArray(obj.contextRules) ? obj.contextRules : [];
  for (const rule of rawRules) {
    if (!rule || typeof rule !== "object") continue;
    const surface = String(rule.surface || "");
    const reading = normalizeUserReading(rule.reading || "");
    const cues = Array.isArray(rule.cues)
      ? rule.cues.map((c) => String(c || "")).filter(Boolean)
      : [];
    if (!surface || !reading || cues.length === 0) continue;
    contextRules.push({
      surface,
      reading,
      weight: Number.isFinite(rule.weight) ? Number(rule.weight) : 5,
      cues
    });
  }

  return { version: 2, phrases, contextRules };
}

/**
 * @returns {Promise<UserReadingStore>}
 */
export async function loadUserReadingStore() {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) {
    return { version: 2, phrases: {}, contextRules: [] };
  }
  const stored = await chrome.storage.local.get({ [USER_READING_DICT_KEY]: {} });
  return normalizeUserReadingStore(stored[USER_READING_DICT_KEY]);
}

/**
 * 同期・API 向け: フレーズ辞書のみ（旧レスポンス形式）。
 * @returns {Promise<Record<string, string>>}
 */
export async function loadUserReadingDict() {
  const store = await loadUserReadingStore();
  return { ...store.phrases };
}

/**
 * @param {UserReadingStore} store
 */
async function persistUserReadingStore(store) {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return store;
  await chrome.storage.local.set({ [USER_READING_DICT_KEY]: store });
  return store;
}

/**
 * グローバル上書き（文脈なし）。後方互換。
 * @param {string} surface
 * @param {string} reading
 */
export async function saveUserReading(surface, reading) {
  if (!surface || !reading) return null;
  const store = await loadUserReadingStore();
  store.phrases[surface] = normalizeUserReading(reading);
  // 同表層の文脈ルールは残す（別文脈用）
  return persistUserReadingStore(store);
}

/**
 * 字幕コンテキスト付き学習。
 * 使えるキューがあれば contextRules に入れ、グローバル phrases には載せない
 * （載せると「永遠→とわ」が全出現に効いてしまう）。
 *
 * @param {{ surface: string, reading: string, contextText?: string }} input
 */
export async function saveUserReadingChoice(input) {
  const surface = String(input?.surface || "");
  const reading = normalizeUserReading(input?.reading || "");
  const contextText = String(input?.contextText || "");
  if (!surface || !reading) return null;

  const store = await loadUserReadingStore();
  const cues = buildLearningCues(surface, contextText);

  if (cues.length > 0) {
    delete store.phrases[surface];
    const existing = store.contextRules.findIndex(
      (rule) =>
        rule.surface === surface &&
        rule.reading === reading &&
        cues.every((cue) => rule.cues.includes(cue))
    );
    if (existing >= 0) {
      const mergedCues = new Set([
        ...store.contextRules[existing].cues,
        ...cues
      ]);
      store.contextRules[existing] = {
        surface,
        reading,
        weight: 5,
        cues: [...mergedCues]
      };
    } else {
      // 同じ surface+reading のルールがあればキューだけマージ
      const same = store.contextRules.find(
        (rule) => rule.surface === surface && rule.reading === reading
      );
      if (same) {
        same.cues = [...new Set([...same.cues, ...cues])];
        same.weight = Math.max(same.weight || 5, 5);
      } else {
        store.contextRules.push({ surface, reading, weight: 5, cues });
      }
    }
    return persistUserReadingStore(store);
  }

  store.phrases[surface] = reading;
  return persistUserReadingStore(store);
}

/**
 * @param {Map<string, string>} manualMap
 * @param {() => void} rebuildIndex
 * @param {Record<string, string> | UserReadingStore} dictOrStore
 */
export function applyUserReadingDictToManual(manualMap, rebuildIndex, dictOrStore) {
  const store = normalizeUserReadingStore(
    dictOrStore && typeof dictOrStore === "object" && "phrases" in dictOrStore
      ? dictOrStore
      : { version: 2, phrases: dictOrStore || {}, contextRules: [] }
  );

  let count = 0;
  for (const [surface, reading] of Object.entries(store.phrases)) {
    if (!surface || !reading) continue;
    manualMap.set(surface, normalizeUserReading(reading));
    count += 1;
  }
  if (count > 0) rebuildIndex();
  return count;
}

/**
 * フレーズ＋文脈ルールをランタイムに載せる。
 * @param {Map<string, string>} manualMap
 * @param {Array<object>} contextRules
 * @param {() => void} rebuildIndex
 * @param {UserReadingStore | Record<string, string>} dictOrStore
 */
export function applyUserReadingLearning(
  manualMap,
  contextRules,
  rebuildIndex,
  dictOrStore
) {
  const store = normalizeUserReadingStore(
    dictOrStore && typeof dictOrStore === "object" && !Array.isArray(dictOrStore)
      ? "phrases" in dictOrStore || "contextRules" in dictOrStore || "version" in dictOrStore
        ? dictOrStore
        : { version: 2, phrases: dictOrStore, contextRules: [] }
      : { version: 2, phrases: {}, contextRules: [] }
  );

  const phraseCount = applyUserReadingDictToManual(
    manualMap,
    rebuildIndex,
    store.phrases
  );

  let ruleCount = 0;
  for (const rule of store.contextRules) {
    contextRules.push({
      surface: rule.surface,
      reading: normalizeUserReading(rule.reading),
      weight: rule.weight ?? 5,
      cues: [...rule.cues]
    });
    ruleCount += 1;
  }

  return { phraseCount, ruleCount };
}

/**
 * 候補 UI 用: 今の文に効く学習読み。
 * @param {string} surface
 * @param {string} contextText
 * @param {UserReadingStore} store
 * @returns {string[]}
 */
export function matchUserContextualReadings(surface, contextText, store) {
  const normalized = normalizeUserReadingStore(store);
  const context = String(contextText || "");
  const hits = [];
  for (const rule of normalized.contextRules) {
    if (rule.surface !== surface) continue;
    if (!rule.cues.some((cue) => context.includes(cue))) continue;
    hits.push(rule.reading);
  }
  if (normalized.phrases[surface]) {
    hits.push(normalized.phrases[surface]);
  }
  return [...new Set(hits.map((r) => normalizeUserReading(r)).filter(Boolean))];
}
