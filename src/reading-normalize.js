function toHiragana(text) {
  return (text ?? "").replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function toKatakana(text) {
  return (text ?? "").replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );
}

/**
 * 形態素／辞書向け: 読みをひらがなに揃える。
 */
export function normalizeReading(reading) {
  return toHiragana(reading).normalize("NFKC").trim();
}

/**
 * ユーザー入力向け: カタカナが含まれるならカタカナのまま、それ以外はひらがな。
 * 例: オンリー / ウィークエンド を意図した登録を保持する。
 */
export function normalizeUserReading(reading) {
  const raw = String(reading ?? "").normalize("NFKC").trim();
  if (!raw) return "";
  if (/[\u30a1-\u30f6]/.test(raw)) {
    return toKatakana(raw);
  }
  return toHiragana(raw);
}

/** ひらがな・カタカナ・長音・中黒のみ */
export function isValidUserReading(value) {
  const raw = String(value ?? "").normalize("NFKC").trim();
  return Boolean(raw) && /^[\u3040-\u309f\u30a0-\u30ffー・･]+$/.test(raw);
}

export { toHiragana, toKatakana };
