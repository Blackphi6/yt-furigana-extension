import { wrapFuriganaWord, hasKanji } from "./furigana.js";
import { normalizeReading } from "./reading-normalize.js";

export { hasKanji };

export function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function segmentsToHtml(segments) {
  return segments
    .map((segment) => {
      const text = escapeHtml(segment.t);
      if (!hasKanji(segment.t)) return text;
      const reading = segment.r ? normalizeReading(segment.r) : "";
      const ruby = reading
        ? `<ruby>${text}<rt>${escapeHtml(reading)}</rt></ruby>`
        : text;
      return wrapFuriganaWord(segment.t, reading, ruby);
    })
    .join("");
}

export function normalizeForCompare(text) {
  return String(text ?? "").normalize("NFKC");
}

export function collapseWhitespace(text) {
  return normalizeForCompare(text).replace(/\s+/g, "");
}

export function segmentsToPlainText(segments) {
  return segments.map((segment) => segment.t).join("");
}

function segmentsStructureValid(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return false;

  return segments.every((segment) => {
    if (!segment || typeof segment.t !== "string" || segment.t.length === 0) {
      return false;
    }
    if (segment.r != null && typeof segment.r !== "string") {
      return false;
    }
    if (segment.r && !hasKanji(segment.t)) {
      return false;
    }
    return true;
  });
}

export function validateSegments(original, segments, options = {}) {
  if (!segmentsStructureValid(segments)) return false;

  const joined = segmentsToPlainText(segments);
  const exact =
    normalizeForCompare(joined) === normalizeForCompare(original);
  if (exact) return true;

  const allowWhitespaceDrift = options.allowWhitespaceDrift !== false;
  if (!allowWhitespaceDrift) return false;

  return collapseWhitespace(joined) === collapseWhitespace(original);
}

/**
 * Accept LLM segments when content matches (exact or whitespace-only drift).
 * Returns null when the surface text was rewritten.
 */
export function repairSegmentsToOriginal(original, segments) {
  if (validateSegments(original, segments, { allowWhitespaceDrift: false })) {
    return segments;
  }
  if (validateSegments(original, segments, { allowWhitespaceDrift: true })) {
    return segments;
  }
  return null;
}

export function describeSegmentMismatch(original, segments) {
  const joined = Array.isArray(segments) ? segmentsToPlainText(segments) : "";
  return {
    original,
    joined,
    originalCollapsed: collapseWhitespace(original),
    joinedCollapsed: collapseWhitespace(joined)
  };
}

export function parseLlmSegments(raw) {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } else {
      const arrayStart = cleaned.indexOf("[");
      const arrayEnd = cleaned.lastIndexOf("]");
      if (arrayStart >= 0 && arrayEnd > arrayStart) {
        parsed = JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
      } else {
        throw new Error("Invalid LLM response format");
      }
    }
  }

  const segments = parsed.segments ?? parsed;
  if (!Array.isArray(segments)) {
    throw new Error("Invalid LLM response format");
  }

  return segments.map((segment) => ({
    t: String(segment.t ?? segment.text ?? ""),
    r: segment.r || segment.reading || undefined
  })).filter((segment) => segment.t.length > 0);
}
