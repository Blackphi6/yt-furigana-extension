/** YOMI-Bench few-shot 行から語・対象漢字・期待読みを取り出す */
const YOMI_QUESTION_RE =
  /質問:「([^」]+)」という単語の「([^」]+)」という漢字の読みをひらがなで答えて下さい。/g;

function toHiragana(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
}

export function parseYomiBenchRows(rows) {
  const items = [];
  for (const row of rows) {
    const input = String(row.input || "");
    const matches = [...input.matchAll(YOMI_QUESTION_RE)];
    if (!matches.length) continue;
    const last = matches[matches.length - 1];
    const surface = last[1];
    const target = last[2];
    const reading_expected = toHiragana(String(row.output || "").trim());
    if (!surface || !target || !reading_expected) continue;
    items.push({
      id: `yomi-${items.length + 1}`,
      surface,
      target,
      reading_expected
    });
  }
  return items;
}
