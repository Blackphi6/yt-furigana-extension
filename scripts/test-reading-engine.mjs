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

console.log("Reading engine tests passed.");
