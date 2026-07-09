export function hasKanji(text) {
  return /[\u3400-\u9fff\uF900-\uFAFF]/.test(text);
}

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
      if (segment.r && hasKanji(segment.t)) {
        return `<ruby>${text}<rt>${escapeHtml(segment.r)}</rt></ruby>`;
      }
      return text;
    })
    .join("");
}

export function normalizeForCompare(text) {
  return text.normalize("NFKC");
}

export function segmentsToPlainText(segments) {
  return segments.map((segment) => segment.t).join("");
}

export function validateSegments(original, segments) {
  if (!Array.isArray(segments) || segments.length === 0) return false;

  const structureValid = segments.every((segment) => {
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

  if (!structureValid) return false;

  return (
    normalizeForCompare(segmentsToPlainText(segments)) ===
    normalizeForCompare(original)
  );
}

export function parseLlmSegments(raw) {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const parsed = JSON.parse(cleaned);
  const segments = parsed.segments ?? parsed;
  if (!Array.isArray(segments)) {
    throw new Error("Invalid LLM response format");
  }

  return segments.map((segment) => ({
    t: segment.t,
    r: segment.r || undefined
  }));
}
