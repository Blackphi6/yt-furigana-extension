/**
 * サイトデモの文脈補正（公の場→おおやけ など）
 */
import assert from "node:assert/strict";
import {
  applyDemoContextReadings,
  DEMO_MANUAL_PHRASES
} from "../site/context-reading-overlay.js";

const text = "公の場で私的な感情を露わにするべきではない。";
const tokens = applyDemoContextReadings(text, [
  {
    surface: "公",
    span: [0, 1],
    reading: "こう",
    confidence: 0.6,
    candidates: ["こう"]
  },
  {
    surface: "場",
    span: [2, 3],
    reading: "ば",
    confidence: 0.9,
    candidates: ["ば"]
  }
]);
assert.equal(tokens[0].reading, "おおやけ");
assert.equal(tokens[0].source, "demo_context");
assert.equal(DEMO_MANUAL_PHRASES["七五三"], "しちごさん");
assert.equal(DEMO_MANUAL_PHRASES["揚子江"], "ようすこう");
assert.equal(DEMO_MANUAL_PHRASES["終い"], "しまい");

{
  const pack = applyDemoContextReadings("リュックを背負って学校に行く", [
    {
      surface: "背負っ",
      span: [5, 8],
      reading: "せおっ",
      confidence: 0.55,
      candidates: ["せおっ"]
    }
  ]);
  assert.ok(
    pack[0].candidates.includes("しょっ"),
    `expected しょっ in ${JSON.stringify(pack[0].candidates)}`
  );
  assert.equal(pack[0].reading, "せおっ");
}

{
  const future = applyDemoContextReadings("会社の将来を背負って立つ", [
    {
      surface: "背負っ",
      span: [6, 9],
      reading: "せおっ",
      confidence: 0.55,
      candidates: ["せおっ"]
    }
  ]);
  assert.equal(future[0].reading, "しょっ");
  assert.equal(future[0].source, "demo_context");
  assert.ok(future[0].candidates.includes("せおっ"));
  assert.ok(future[0].candidates.includes("しょっ"));
}

{
  const naka = applyDemoContextReadings("夏模様の中で", [
    {
      surface: "中",
      span: [4, 5],
      reading: "うち",
      confidence: 0.6,
      candidates: ["うち", "じゅう", "ちゅう"]
    }
  ]);
  assert.equal(naka[0].reading, "なか");
  assert.equal(naka[0].source, "demo_context");
  assert.ok(naka[0].candidates.includes("なか"));
}

{
  const machi = applyDemoContextReadings("移ろう街と", [
    {
      surface: "街",
      span: [3, 4],
      reading: "がい",
      confidence: 0.6,
      candidates: ["がい", "まち"]
    }
  ]);
  assert.equal(machi[0].reading, "まち");
  assert.equal(machi[0].source, "demo_context");
}

{
  const aoi = applyDemoContextReadings("青い街", [
    {
      surface: "街",
      span: [2, 3],
      reading: "がい",
      confidence: 0.6,
      candidates: ["がい", "まち"]
    }
  ]);
  assert.equal(aoi[0].reading, "まち");
  assert.equal(aoi[0].source, "demo_morph_base");
}

{
  const text =
    "歌が上手な彼女は、交渉事でも常に一枚上手であり、舞台の上手で堂々と振る舞った。";
  const spans = [];
  let from = 0;
  while (true) {
    const i = text.indexOf("上手", from);
    if (i < 0) break;
    spans.push([i, i + 2]);
    from = i + 2;
  }
  const pack = applyDemoContextReadings(
    text,
    spans.map((span) => ({
      surface: "上手",
      span,
      reading: "じょうず",
      confidence: 0.5,
      candidates: ["じょうず", "うわて", "かみて"]
    }))
  );
  assert.deepEqual(
    pack.map((t) => t.reading),
    ["じょうず", "うわて", "かみて"]
  );
}

console.log("test-site-context-overlay: ok");
