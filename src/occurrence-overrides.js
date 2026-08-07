/**
 * 出現位置ごとの読み上書き（デモと同じ純関数 + 拡張用ストレージ）。
 * 形態素が「大＋人気」のように割れていても、span で「大人気」を固定できる。
 */

export const OCCURRENCE_STORAGE_KEY = "occurrenceReadingOverrides";
const MAX_TEXTS = 400;

/**
 * @param {string} text
 * @param {string} surface
 */
export function countSurfaceOccurrences(text, surface) {
  const t = String(text || "");
  const s = String(surface || "");
  if (!t || !s) return 0;
  let n = 0;
  let from = 0;
  while (from <= t.length - s.length) {
    const i = t.indexOf(s, from);
    if (i < 0) break;
    n += 1;
    from = i + Math.max(1, s.length);
  }
  return n;
}

/**
 * @param {string} text
 * @param {string} surface
 */
export function shouldPinGlobally(text, surface) {
  return countSurfaceOccurrences(text, surface) <= 1;
}

/**
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @param {string} surface
 * @param {string} reading
 */
export function expandOverrideSpan(text, start, end, surface, reading) {
  const t = String(text || "");
  const read = String(reading || "").normalize("NFKC").trim();
  let s0 = Math.max(0, Number(start) || 0);
  let s1 = Math.max(s0, Number(end) || 0);
  let surf = String(surface || "").normalize("NFKC").trim() || t.slice(s0, s1);

  if (/^(いちにち|ついたち)$/.test(read) && surf !== "一日") {
    const windowStart = Math.max(0, s0 - 1);
    const windowEnd = Math.min(t.length, s1 + 1);
    const idx = t.indexOf("一日", windowStart);
    if (idx >= 0 && idx < windowEnd && idx + 2 > s0 && idx <= s0) {
      s0 = idx;
      s1 = idx + 2;
      surf = "一日";
    }
  }
  return { start: s0, end: s1, surface: surf, reading: read };
}

/**
 * @param {object[]} overrides
 * @param {{ start: number, end: number, surface: string, reading: string }} entry
 */
export function upsertOccurrenceOverride(overrides, entry) {
  const list = Array.isArray(overrides) ? [...overrides] : [];
  const start = Number(entry?.start);
  const end = Number(entry?.end);
  const surface = String(entry?.surface || "").trim();
  const reading = String(entry?.reading || "").trim();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !surface || !reading) {
    return list;
  }
  const next = list.filter(
    (o) => !(Number(o.start) === start && Number(o.end) === end)
  );
  next.push({ start, end, surface, reading });
  next.sort((a, b) => a.start - b.start);
  return next;
}

/**
 * @param {string} text
 * @param {object[]} tokens  demo形 { surface, span, reading } または形態素形
 * @param {object[]} overrides
 */
export function applyOccurrenceOverrides(text, tokens, overrides) {
  const t = String(text || "");
  const base = Array.isArray(tokens) ? [...tokens] : [];
  const rules = Array.isArray(overrides) ? overrides : [];
  if (!rules.length) return base;

  const spanOf = (tok) =>
    Array.isArray(tok?.span) ? tok.span : [0, 0];
  const surfaceOf = (tok) =>
    String(tok?.surface || tok?.surface_form || "");

  const kept = base.filter((tok) => {
    const [a, b] = spanOf(tok);
    return !rules.some((o) => a >= o.start && b <= o.end);
  });

  for (const o of rules) {
    const start = Number(o.start);
    const end = Number(o.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (String(o.surface || "") && t.slice(start, end) !== o.surface) continue;
    const surface = String(o.surface || t.slice(start, end));
    const reading = String(o.reading || "");
    if (!surface || !reading) continue;
    const prev = base.find((tok) => {
      const [a, b] = spanOf(tok);
      return a === start && b === end;
    });
    const prevCands = Array.isArray(prev?.candidates) ? prev.candidates : [];
    const candidates = [reading, ...prevCands.filter((c) => c !== reading)];
    kept.push({
      surface,
      surface_form: surface,
      span: [start, end],
      reading,
      pronunciation: reading,
      confidence: 1,
      source: "occurrence",
      candidates,
      preserveKatakana: /[\u30a1-\u30f6]/.test(reading),
    });
  }
  return kept.sort((a, b) => (spanOf(a)[0] ?? 0) - (spanOf(b)[0] ?? 0));
}

/**
 * 形態素トークンに文字 span を付与する。
 * @param {object[]} tokens
 * @param {string} text
 */
export function assignTokenSpans(tokens, text) {
  const t = String(text || "");
  let cursor = 0;
  return (Array.isArray(tokens) ? tokens : []).map((tok) => {
    const surface = String(tok?.surface_form || tok?.surface || "");
    if (!surface) {
      return { ...tok, span: [cursor, cursor] };
    }
    let idx = t.indexOf(surface, cursor);
    if (idx < 0) idx = cursor;
    const start = idx;
    const end = start + surface.length;
    cursor = end;
    return { ...tok, span: [start, end] };
  });
}

/**
 * @param {string} text
 * @param {object[]} tokens
 * @param {number} indexA
 * @param {number} indexB
 */
export function spanFromTokenRange(text, tokens, indexA, indexB) {
  const t = String(text || "");
  const list = Array.isArray(tokens) ? tokens : [];
  if (!list.length || !t) return null;
  const a = Math.min(Number(indexA), Number(indexB));
  const b = Math.max(Number(indexA), Number(indexB));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b >= list.length) {
    return null;
  }
  const first = list[a];
  const last = list[b];
  const start = Array.isArray(first?.span) ? Number(first.span[0]) : NaN;
  const end = Array.isArray(last?.span) ? Number(last.span[1]) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const surface = t.slice(start, end);
  if (!surface) return null;
  const tokenIndexes = [];
  for (let i = a; i <= b; i += 1) tokenIndexes.push(i);
  return { start, end, surface, tokenIndexes };
}

/** @type {Record<string, { start: number, end: number, surface: string, reading: string }[]>} */
let occurrenceByText = {};

export function getOccurrenceOverridesForText(text) {
  const key = String(text || "");
  return Array.isArray(occurrenceByText[key]) ? occurrenceByText[key] : [];
}

export function getOccurrenceOverrideCache() {
  return occurrenceByText;
}

/**
 * @param {Record<string, object[]> | null | undefined} byText
 */
export function installOccurrenceOverridesForTests(byText) {
  occurrenceByText =
    byText && typeof byText === "object" ? { ...byText } : {};
}

function pruneByText(byText) {
  const keys = Object.keys(byText);
  if (keys.length <= MAX_TEXTS) return byText;
  const next = { ...byText };
  const drop = keys.length - MAX_TEXTS;
  for (let i = 0; i < drop; i += 1) delete next[keys[i]];
  return next;
}

export async function loadOccurrenceOverrideStore() {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) {
    return occurrenceByText;
  }
  try {
    const stored = await chrome.storage.local.get({
      [OCCURRENCE_STORAGE_KEY]: { version: 1, byText: {} },
    });
    const raw = stored[OCCURRENCE_STORAGE_KEY];
    occurrenceByText =
      raw && typeof raw === "object" && raw.byText && typeof raw.byText === "object"
        ? { ...raw.byText }
        : {};
  } catch {
    occurrenceByText = {};
  }
  return occurrenceByText;
}

/**
 * @param {string} text
 * @param {{ start: number, end: number, surface: string, reading: string }} entry
 */
export async function saveOccurrenceOverrideForText(text, entry) {
  const key = String(text || "");
  if (!key) return [];
  const expanded = expandOverrideSpan(
    key,
    entry.start,
    entry.end,
    entry.surface,
    entry.reading
  );
  const list = upsertOccurrenceOverride(occurrenceByText[key] || [], expanded);
  occurrenceByText = pruneByText({ ...occurrenceByText, [key]: list });
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    try {
      await chrome.storage.local.set({
        [OCCURRENCE_STORAGE_KEY]: {
          version: 1,
          byText: occurrenceByText,
        },
      });
    } catch {
      /* ignore quota */
    }
  }
  return list;
}
