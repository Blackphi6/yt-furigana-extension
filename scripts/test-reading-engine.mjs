import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const venvPython = path.join(root, ".venv-reading", "bin", "python");

function runEngine(text) {
  return new Promise((resolve, reject) => {
    const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(root, "reading-engine"))})
from reading_engine import ReadingEngine
eng = ReadingEngine()
print(json.dumps(eng.analyze(${JSON.stringify(text)}), ensure_ascii=False))
`;
    const child = spawn(venvPython, ["-c", code], { cwd: root });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      err += d;
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err || `exit ${code}`));
        return;
      }
      resolve(JSON.parse(out));
    });
  });
}

const spicy = await runEngine("辛いラーメンを食べた");
assert.equal(
  spicy.tokens.find((t) => t.surface === "辛い")?.reading,
  "からい",
  JSON.stringify(spicy.tokens)
);

const hard = await runEngine("昨日の辛い経験を思い出した");
assert.equal(hard.tokens.find((t) => t.surface === "辛い")?.reading, "つらい");

const sky = await runEngine("馬鹿みたいに空を切った手で");
assert.equal(sky.tokens.find((t) => t.surface === "空")?.reading, "くう");

const ice = await runEngine(
  "夏の木陰に座ったまま、「氷菓」を口に放り込んで風を待っていた"
);
assert.equal(
  ice.tokens.find((t) => t.surface === "氷菓")?.reading,
  "あいす",
  JSON.stringify(ice.tokens)
);

const kata = await runEngine("今週は誤った愛の伝え方が誤解されて大事になる");
assert.equal(kata.tokens.find((t) => t.surface === "方")?.reading, "かた");
assert.equal(kata.tokens.find((t) => t.surface === "大事")?.reading, "おおごと");

const shitate = await runEngine("交渉では下手に出る");
assert.equal(
  shitate.tokens.find((t) => t.surface === "下手")?.reading,
  "したて",
  JSON.stringify(shitate.tokens)
);
assert.ok(
  shitate.tokens
    .find((t) => t.surface === "下手")
    ?.candidates?.includes("したて")
);

const shijou = await runEngine("市場規模が拡大した");
assert.equal(shijou.tokens.find((t) => t.surface === "市場")?.reading, "しじょう");

const towa = await runEngine("ただ永遠に愛");
assert.equal(towa.tokens.find((t) => t.surface === "永遠")?.reading, "とわ");

const eienCasual = await runEngine("お前の話は永遠に終わらない");
assert.equal(
  eienCasual.tokens.find((t) => t.surface === "永遠")?.reading,
  "えいえん"
);

const eienTheme = await runEngine("永遠のテーマを議論した");
assert.equal(
  eienTheme.tokens.find((t) => t.surface === "永遠")?.reading,
  "えいえん"
);

function readingsFor(result, surface) {
  return result.tokens.filter((t) => t.surface === surface).map((t) => t.reading);
}

const wind = await runEngine("風が強くて帽子が飛んだ。こんな風に書いてみた。");
assert.deepEqual(readingsFor(wind, "風"), ["かぜ", "ふう"], JSON.stringify(wind.tokens));

const hyou = await runEngine("成績を表にまとめた。表に出て説明した。");
assert.deepEqual(readingsFor(hyou, "表"), ["ひょう", "おもて"], JSON.stringify(hyou.tokens));

const busy = await runEngine("よそ見する暇もない忙しい世界で、仕事の予定で忙しい。");
assert.deepEqual(
  readingsFor(busy, "忙しい"),
  ["せわしい", "いそがしい"],
  JSON.stringify(busy.tokens)
);

const hakase = await runEngine("博士号の話をしたら、物知り博士だと言われた。");
assert.deepEqual(
  readingsFor(hakase, "博士"),
  ["はくし", "はかせ"],
  JSON.stringify(hakase.tokens)
);

const machi = await runEngine("町中のカフェに入ると、その噂が町中に広まった。");
assert.deepEqual(
  readingsFor(machi, "町中"),
  ["まちなか", "まちじゅう"],
  JSON.stringify(machi.tokens)
);

// Hallucination guard: chosen reading must be in candidates
for (const sample of [
  spicy,
  hard,
  sky,
  ice,
  kata,
  shitate,
  shijou,
  towa,
  eienCasual,
  eienTheme,
  wind,
  hyou,
  busy,
  hakase,
  machi,
]) {
  for (const token of sample.tokens) {
    assert.ok(
      token.candidates.includes(token.reading),
      `${token.surface}: ${token.reading} not in ${JSON.stringify(token.candidates)}`
    );
  }
}

console.log("Reading engine tests passed.");
