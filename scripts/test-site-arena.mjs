/**
 * site/arena-lib.js の読み正規化・最長一致・LLM JSON 拾いの単体テスト
 */
import assert from "node:assert/strict";
import {
  LLM_FURIGANA_PROMPT,
  NAIVE_PHRASES,
  RESEARCH_AS_OF,
  RESEARCH_ROWS,
  SAMPLE_TEXTS,
  apiDataToHits,
  extractChatText,
  extractGeminiText,
  geminiEndpoint,
  hitsToKana,
  longestMatchHits,
  majorityKana,
  normalizeKana,
  parseLlmTokens,
  renderRubyLine,
} from "../site/arena-lib.js";

assert.equal(RESEARCH_AS_OF, "2026-08-14");
assert.ok(RESEARCH_ROWS.some((r) => r.id === "sarashina"));
assert.ok(RESEARCH_ROWS.some((r) => r.id === "gemini-tts"));
assert.ok(SAMPLE_TEXTS.length >= 5);
assert.match(LLM_FURIGANA_PROMPT, /JSON/);

{
  const hits = longestMatchHits(
    "この先生きのこるには、文脈が要る。",
    NAIVE_PHRASES
  );
  const sensei = hits.find((h) => h.surface === "先生");
  assert.ok(sensei, "naive should take 先生 as a word");
  assert.equal(sensei.reading, "せんせい");
}

{
  const hits = longestMatchHits(
    "町中のカフェに入ると、その噂が町中に広まった。",
    NAIVE_PHRASES
  );
  assert.equal(hits.filter((h) => h.surface === "町中").length, 2);
  assert.ok(hits.every((h) => h.surface !== "町中" || h.reading === "まちなか"));
}

{
  const hits = longestMatchHits("五月一日に株式市場が再開した。", NAIVE_PHRASES);
  assert.equal(hits.find((h) => h.surface === "一日")?.reading, "いちにち");
  assert.equal(
    hits.find((h) => h.surface === "株式市場")?.reading,
    "かぶしきしじょう"
  );
}

{
  const fenced = parseLlmTokens(
    '前置き\n```json\n[{"surface":"町中","reading":"まちじゅう"}]\n```\n'
  );
  assert.equal(fenced[0].reading, "まちじゅう");
  const mixed = parseLlmTokens(
    'カタカナ混じり [{"surface":"市場","reading":"シジョウ"}]'
  );
  assert.equal(mixed[0].reading, "しじょう");
  const wrapped = parseLlmTokens(
    '{"tokens":[{"surface":"表","yomi":"ひょう"}]}'
  );
  assert.equal(wrapped[0].reading, "ひょう");
  assert.throws(() => parseLlmTokens("ルビはまちじゅうです"));
}

{
  const hits = apiDataToHits({
    tokens: [
      { surface: "その", reading: "その" },
      { surface: "町中", reading: "まちじゅう" },
    ],
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].reading, "まちじゅう");
}

{
  assert.equal(normalizeKana("マチジュー！"), "まちじゅー");
  assert.equal(hitsToKana([{ reading: "まち" }, { reading: "なか" }]), "まちなか");
  const maj = majorityKana([
    { ok: true, kana: "まちなか" },
    { ok: true, kana: "まちじゅう" },
    { ok: true, kana: "まちじゅう" },
    { ok: false, kana: "まちなか" },
  ]);
  assert.equal(maj.kana, "まちじゅう");
  assert.equal(maj.count, 2);
}

{
  const html = renderRubyLine("噂が町中に広まった。", [
    { surface: "町中", reading: "まちじゅう" },
  ]);
  assert.match(html, /まちじゅう/);
  assert.match(html, /<ruby>/);
}

{
  const url = geminiEndpoint("gemini-2.5-flash", "abc+def");
  assert.match(url, /models\/gemini-2.5-flash:generateContent/);
  assert.match(url, /key=abc%2Bdef/);
  assert.equal(
    extractGeminiText({
      candidates: [{ content: { parts: [{ text: "hi" }, { text: "yo" }] } }],
    }),
    "hiyo"
  );
  assert.equal(
    extractChatText({ choices: [{ message: { content: "ok" } }] }),
    "ok"
  );
}

console.log("test-site-arena: ok");
