function toHiragana(text) {
  return (text ?? "").replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

export function normalizeReading(reading) {
  return toHiragana(reading).normalize("NFKC");
}
