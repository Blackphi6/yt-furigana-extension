import { normalizeReading } from "./reading-normalize.js";

const KANJI_RE = /[\u3400-\u9fff]/;

/**
 * 送りがな語幹の最後の砦。
 * 別漢字の読み（見←居の「い」など）が載ったら、許容語幹＋送りがなに直す。
 * 複合（見惚・見解）は語幹が許容で始まるときだけ通し、それ以外は触らない。
 */
const KUN_STEM_GUARD = {
  見: { allow: ["み", "けん"], fallback: "み" }
};

/**
 * 漢字1字で、前後が漢字でない（住宅街の「街」は前が漢字なので false）。
 * @param {string} surface
 * @param {string} fullText
 * @param {number} start
 * @param {number} end
 */
export function isStandaloneKanjiToken(surface, fullText, start, end) {
  const s = String(surface || "");
  if (s.length !== 1 || !KANJI_RE.test(s)) return false;
  const text = String(fullText || "");
  const a = Number(start);
  const b = Number(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return false;
  const prev = a > 0 ? text[a - 1] : "";
  const nxt = b < text.length ? text[b] : "";
  if (prev && KANJI_RE.test(prev)) return false;
  if (nxt && KANJI_RE.test(nxt)) return false;
  return true;
}

/**
 * @param {string} surface
 * @param {string} reading
 * @param {string[]} [allowedStems]
 * @returns {string} ひらがな読み（空なら空）
 */
export function repairForbiddenReadings(surface, reading, allowedStems = []) {
  const s = String(surface || "");
  const r = normalizeReading(reading);
  if (!s || !r) return r;

  const guard = KUN_STEM_GUARD[s[0]];
  const stems = [];
  let fallback = "";
  if (guard) {
    stems.push(...guard.allow);
    fallback = guard.fallback;
  }
  for (const stem of allowedStems) {
    const st = normalizeReading(stem);
    if (st && !stems.includes(st)) stems.push(st);
  }
  if (!fallback && stems.length) fallback = stems[0];
  if (!stems.length) return r;

  if (stems.some((stem) => r === stem || r.startsWith(stem))) {
    return r;
  }

  const okuri = s.slice(1);
  if (s.length === 1) return fallback;
  if (!/^[\u3040-\u309fー]+$/.test(okuri)) return r;
  return `${fallback}${normalizeReading(okuri)}`;
}

/**
 * Kuromoji は「終い／終う」を 終=おわり に割る。次が しまう の送りがななら しま へ。
 * 「終わり」（1トークン）は触らない。
 * @param {Array<{ surface_form?: string, surface?: string, reading?: string, pronunciation?: string }>} tokens
 */
export function repairShimaiTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return tokens || [];
  return tokens.map((token, i) => {
    const surface = token.surface_form || token.surface || "";
    if (surface !== "終") return token;
    const reading = normalizeReading(token.reading || token.pronunciation || "");
    if (reading !== "おわり") return token;
    const next = String(
      tokens[i + 1]?.surface_form || tokens[i + 1]?.surface || ""
    );
    if (!/^[いうえ]/.test(next)) return token;
    return {
      ...token,
      reading: "しま",
      pronunciation: "しま"
    };
  });
}

/**
 * 「中明かされた」のように空白無しだと 中明 が一塊（なかあ）になることがある。
 * ModernBERT 本体ではなく境界ガード。span 付き API トークンにも対応。
 * @param {Array<{ surface_form?: string, surface?: string, reading?: string, pronunciation?: string, span?: number[] }>} tokens
 */
export function splitFalseNakaAkaTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return tokens || [];
  /** @type {typeof tokens} */
  const out = [];
  for (const token of tokens) {
    const surface = String(token.surface_form || token.surface || "");
    const reading = normalizeReading(token.reading || token.pronunciation || "");
    if (
      surface.length >= 2 &&
      surface.startsWith("中明") &&
      (reading === "なかあ" || reading.startsWith("なかあ"))
    ) {
      const span = Array.isArray(token.span) ? token.span : null;
      const start =
        span && Number.isFinite(span[0]) ? Number(span[0]) : null;
      out.push({
        ...token,
        surface_form: "中",
        surface: "中",
        reading: "なか",
        pronunciation: "なか",
        span: start != null ? [start, start + 1] : token.span
      });
      out.push({
        ...token,
        surface_form: "明",
        surface: "明",
        reading: "あ",
        pronunciation: "あ",
        span: start != null ? [start + 1, start + 2] : token.span
      });
      const restSurf = surface.slice(2);
      if (restSurf) {
        const restRead = reading.slice("なかあ".length);
        out.push({
          ...token,
          surface_form: restSurf,
          surface: restSurf,
          reading: restRead,
          pronunciation: restRead,
          span:
            start != null && span && Number.isFinite(span[1])
              ? [start + 2, Number(span[1])]
              : token.span
        });
      }
      continue;
    }
    out.push(token);
  }
  return out;
}
