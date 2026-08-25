/**
 * Parayomi Space EXAMPLES の看板文がローカルで通ること
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SudachiStateless, TokenizeMode } from "sudachi-wasm333";
import { createSudachiTokenize } from "../src/sudachi-tokenizer.js";
import { buildFuriganaHtml } from "../src/furigana.js";
import { applyLearnedOverridesNow } from "../src/reading-context.js";
import {
  PARAYOMI_EXAMPLES,
  PARAYOMI_PRIORITY_SURFACES,
} from "./learning/parayomi-examples.mjs";
import { prioritizeGaps } from "./learning/agent-debate.mjs";
import {
  proposalsFromRanked,
  harvestCuesFromSamples,
} from "./learning/promote-from-parakeet-ranked.mjs";
import { applyDemoContextReadings } from "../site/context-reading-overlay.js";

const bytes = new Uint8Array(
  readFileSync("node_modules/sudachi-wasm333/resources/system.dic")
);
const sudachi = new SudachiStateless();
sudachi.initialize_from_bytes(bytes);
const tokenize = createSudachiTokenize(sudachi, TokenizeMode.C);
applyLearnedOverridesNow(
  JSON.parse(readFileSync("data/generated/learned-overrides.json", "utf8"))
);

function readingsForSurface(html, surface) {
  return [
    ...html.matchAll(
      new RegExp(`data-surface="${surface}" data-reading="([^"]*)"`, "g")
    ),
  ].map((m) => m[1]);
}

{
  const sorted = prioritizeGaps(
    [
      { surface: "風", reading: "ふう", candidates: ["かぜ", "ふう"] },
      { surface: "人気", reading: "ひとけ", candidates: ["にんき", "ひとけ"] },
      { surface: "金", reading: "かね", candidates: ["きん", "かね"] },
    ],
    ["金", "風"]
  );
  assert.equal(sorted[0].surface, "人気"); // EXAMPLES 優先
  assert.ok(PARAYOMI_PRIORITY_SURFACES.includes("上手"));
}

{
  const cues = harvestCuesFromSamples("開", [
    { text: "服に穴が開いた。" },
    { text: "鍵が開く音がした。" },
  ]);
  assert.ok(cues.some((c) => c.includes("穴が開") || c.includes("鍵が開")));
  const props = proposalsFromRanked(
    [
      {
        surface: "益",
        errors: 3,
        lemma: "やく",
        samples: [{ text: "御利益がある。", want: "やく" }],
      },
    ],
    { top: 5, minErrors: 1 }
  );
  assert.equal(props.phrases["御利益"], "ごりやく");
}

for (const ex of PARAYOMI_EXAMPLES) {
  const html = buildFuriganaHtml(ex.text, tokenize);
  for (const exp of ex.expect) {
    const got = readingsForSurface(html, exp.surface);
    // 複合 MANUAL（何人たりとも）は surface 一致で1件
    if (exp.surface.length > 2 && got.length === 0) {
      // フレーズが data-surface に載っているか
      assert.match(
        html,
        new RegExp(`data-surface="${exp.surface}"[^>]*data-reading="${exp.reading}"`),
        `${ex.id}: missing phrase ${exp.surface}=${exp.reading}\n${html}`
      );
      continue;
    }
    assert.ok(
      got.includes(exp.reading),
      `${ex.id}: want ${exp.surface}=${exp.reading}, got [${got.join(",")}] in ${html}`
    );
  }
}

{
  // demo overlay: 人気の二出現
  const text =
    "人気の絶えない観光地だが、一本裏道に入ると急に人気がなくなる。";
  const spans = [];
  let from = 0;
  while (true) {
    const i = text.indexOf("人気", from);
    if (i < 0) break;
    spans.push([i, i + 2]);
    from = i + 2;
  }
  const pack = applyDemoContextReadings(
    text,
    spans.map((span) => ({
      surface: "人気",
      span,
      reading: "にんき",
      candidates: ["にんき", "ひとけ"]
    }))
  );
  assert.deepEqual(
    pack.map((t) => t.reading),
    ["にんき", "ひとけ"]
  );
}

console.log("test-parayomi-examples: ok");
