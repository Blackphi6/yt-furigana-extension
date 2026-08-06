/**
 * デモ用: 同一文の同表層を出現位置ごとに別読みへ。
 * 純関数のみ（DOM なし）。
 */

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
 * いちにち／ついたち を1文字トークンから直したとき「一日」へ拡げる。
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
 * @param {object[]} tokens
 * @param {object[]} overrides
 */
export function applyOccurrenceOverrides(text, tokens, overrides) {
  const t = String(text || "");
  const base = Array.isArray(tokens) ? [...tokens] : [];
  const rules = Array.isArray(overrides) ? overrides : [];
  if (!rules.length) return base;

  const kept = base.filter((tok) => {
    const [a, b] = Array.isArray(tok?.span) ? tok.span : [0, 0];
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
    const prev = base.find(
      (tok) =>
        Array.isArray(tok?.span) &&
        tok.span[0] === start &&
        tok.span[1] === end
    );
    const prevCands = Array.isArray(prev?.candidates) ? prev.candidates : [];
    const candidates = [reading, ...prevCands.filter((c) => c !== reading)];
    kept.push({
      surface,
      span: [start, end],
      reading,
      confidence: 1,
      source: "occurrence",
      candidates,
    });
  }
  return kept.sort((a, b) => (a.span?.[0] ?? 0) - (b.span?.[0] ?? 0));
}

/**
 * 同一文に同表層が複数あるときはグローバル固定を使わない。
 * @param {string} text
 * @param {string} surface
 */
export function shouldPinGlobally(text, surface) {
  return countSurfaceOccurrences(text, surface) <= 1;
}
