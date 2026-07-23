/**
 * Demo-only: pick low-confidence / ambiguous kanji tokens for a 3-choice quiz.
 * Pure helpers — no DOM.
 */

/** Align with engine default YT_FURIGANA_RERANKER_THRESHOLD (0.55) + cue band. */
export const QUIZ_CONFIDENCE_MAX = 0.72;

/** Hard cap for quiz buttons (product: 3-choice). */
export const QUIZ_MAX_CHOICES = 3;

/** Don't overwhelm the panel. */
export const QUIZ_MAX_ITEMS = 5;

const KANJI_RE = /[\u3400-\u9fff\uF900-\uFAFF]/;

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeReading(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim();
}

/**
 * @param {{ candidates?: unknown[], reading?: string } | null | undefined} token
 * @param {string} [currentReading]
 * @returns {string[]}
 */
export function uniqueCandidates(token, currentReading) {
  const list = [];
  const push = (v) => {
    const s = normalizeReading(v);
    if (!s || list.includes(s)) return;
    list.push(s);
  };
  push(currentReading ?? token?.reading);
  for (const c of token?.candidates || []) push(c);
  return list;
}

/**
 * Build up to `max` choices: current first, then other lattice readings.
 * @param {string[]} candidates
 * @param {string} current
 * @param {number} [max]
 * @returns {string[]}
 */
export function pickQuizChoices(candidates, current, max = QUIZ_MAX_CHOICES) {
  const cur = normalizeReading(current);
  const uniq = [];
  const push = (v) => {
    const s = normalizeReading(v);
    if (!s || uniq.includes(s)) return;
    uniq.push(s);
  };
  if (cur) push(cur);
  for (const c of candidates || []) push(c);
  return uniq.slice(0, Math.max(1, max));
}

/**
 * Whether this token should appear in the quiz.
 * Only low-confidence lattice splits (not trust/user pins).
 * @param {object} token
 * @param {object} [opts]
 * @returns {boolean}
 */
export function isQuizToken(token, opts = {}) {
  const confMax = typeof opts.confidenceMax === "number" ? opts.confidenceMax : QUIZ_CONFIDENCE_MAX;
  const surface = String(token?.surface || "");
  if (!KANJI_RE.test(surface)) return false;
  const source = String(token?.source || "");
  if (source === "user_dict" || source === "trust_pattern") return false;
  const reading = normalizeReading(token?.reading);
  if (!reading) return false;
  const cands = uniqueCandidates(token, reading);
  if (cands.length < 2) return false;
  const conf = typeof token?.confidence === "number" ? token.confidence : 0;
  return conf <= confMax;
}

/**
 * Prefer lowest confidence first, then earlier span; cap at maxItems.
 * @param {string} text
 * @param {object[]} tokens
 * @param {object} [opts]
 * @returns {{ index: number, surface: string, reading: string, confidence: number|null, source: string, choices: string[], span: number[] }[]}
 */
export function collectQuizItems(text, tokens, opts = {}) {
  const maxItems = typeof opts.maxItems === "number" ? opts.maxItems : QUIZ_MAX_ITEMS;
  const maxChoices = typeof opts.maxChoices === "number" ? opts.maxChoices : QUIZ_MAX_CHOICES;
  const sorted = [...(tokens || [])].sort(
    (a, b) => (a.span?.[0] ?? 0) - (b.span?.[0] ?? 0)
  );
  const items = [];
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (!isQuizToken(t, opts)) continue;
    const surface =
      t.surface ||
      (Array.isArray(t.span) ? String(text || "").slice(t.span[0], t.span[1]) : "");
    const reading = normalizeReading(t.reading);
    const choices = pickQuizChoices(uniqueCandidates(t, reading), reading, maxChoices);
    if (choices.length < 2) continue;
    items.push({
      index: i,
      surface,
      reading,
      confidence: typeof t.confidence === "number" ? t.confidence : null,
      source: String(t.source || ""),
      choices,
      span: Array.isArray(t.span) ? t.span : [0, 0],
    });
  }
  items.sort(
    (a, b) =>
      (a.confidence ?? 0) - (b.confidence ?? 0) ||
      (a.span[0] ?? 0) - (b.span[0] ?? 0)
  );
  return items.slice(0, maxItems);
}
