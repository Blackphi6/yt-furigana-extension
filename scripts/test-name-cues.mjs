// 敬称など人名の手がかりの直前の語は、人名辞書の読みを使う（読み推定 v2 第3段階）
import assert from "node:assert/strict";
import { installPersonalNamePhrasesForTests } from "furigana-ruby-engine/lib/personal-name-phrases.js";
import { applyNameCueReadings, findNameBeforeCue } from "furigana-ruby-engine/lib/name-cues.js";

installPersonalNamePhrasesForTests({ 相場: "あいば", 小鳥遊: "たかなし", 明神: "あかがみ", 中田: "なかた" });

// 手がかりの直前で、最長の人名を探す
assert.deepEqual(findNameBeforeCue("相場さんが来た", 2), { start: 0, end: 2, surface: "相場", reading: "あいば" });
assert.deepEqual(findNameBeforeCue("小鳥遊さんに会う", 3), { start: 0, end: 3, surface: "小鳥遊", reading: "たかなし" });
assert.equal(findNameBeforeCue("株の相場が上がる", 4), null, "手がかりが無ければ探さない");

const tok = (surface, reading, start) => ({ surface_form: surface, reading, span: [start, start + surface.length] });

// 1語の読みを人名に替える
const a = applyNameCueReadings(
  [tok("相場", "そうば", 0), tok("さん", "さん", 2), tok("が", "が", 4)],
  "相場さんが"
);
assert.equal(a[0].reading, "あいば");
assert.equal(a[0].source, "name_cue");

// 分かれた語（小鳥|遊）は1語にまとめる
const b = applyNameCueReadings(
  [tok("小鳥", "ことり", 0), tok("遊", "", 2), tok("さん", "さん", 3)],
  "小鳥遊さん"
);
assert.deepEqual(b.map((t) => t.surface_form), ["小鳥遊", "さん"]);
assert.equal(b[0].reading, "たかなし");

// 手がかりが無い一般語はそのまま
const c = applyNameCueReadings([tok("相場", "そうば", 2)], "株の相場が");
assert.equal(c[0].reading, "そうば");

// 「様」は神仏やお客にも付くので手がかりにしない（明神様＝みょうじんさま）
const d = applyNameCueReadings([tok("明神", "みょうじん", 0), tok("様", "さま", 2)], "明神様");
assert.equal(d[0].reading, "みょうじん");

// 長い語の一部だけに当たる人名は使わない（区切りが合わない）
const e = applyNameCueReadings([tok("田中田", "たなかだ", 0), tok("さん", "さん", 3)], "田中田さん");
assert.equal(e[0].reading, "たなかだ");

// ユーザー登録の読みは替えない
const f = applyNameCueReadings(
  [{ ...tok("相場", "そうば", 0), preserveKatakana: false, source: "occurrence" }, tok("さん", "さん", 2)],
  "相場さん"
);
assert.equal(f[0].reading, "そうば");

console.log("人名の手がかりのテスト: 問題なし");
