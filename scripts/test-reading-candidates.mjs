import assert from "node:assert/strict";
import { collectReadingCandidates } from "../src/reading-candidates.js";

const busy = collectReadingCandidates(
  "忙しい",
  "せわしい",
  "よそ見する暇もない忙しい世界を",
  {}
);
assert.ok(busy.some((c) => c.reading === "せわしい"));
assert.ok(busy.some((c) => c.reading === "いそがしい"));
assert.equal(busy[0].reading, "せわしい");

const withUser = collectReadingCandidates("忙しい", "いそがしい", "仕事が忙しい", {
  忙しい: "せわしい"
});
assert.ok(withUser.some((c) => c.source === "user" && c.reading === "せわしい"));

const karai = collectReadingCandidates("辛い", "からい", "辛いラーメン", {});
assert.ok(karai.some((c) => c.reading === "からい"));
assert.ok(karai.some((c) => c.reading === "つらい"));

const nani = collectReadingCandidates("何", "なん", "何を思っているの", {});
assert.ok(
  nani.some((c) => c.reading === "なに"),
  `expected なに in ${JSON.stringify(nani)}`
);
assert.ok(
  nani.some((c) => c.reading === "なん"),
  `expected なん in ${JSON.stringify(nani)}`
);

const soraContext = "君はそれを掴もうとして、馬鹿みたいに空を切った手で";
const kuu = collectReadingCandidates("空", "そら", soraContext, {});
assert.ok(
  kuu.some((c) => c.reading === "くう"),
  `expected くう in ${JSON.stringify(kuu)}`
);
assert.ok(kuu.some((c) => c.reading === "そら"));
assert.ok(kuu.some((c) => c.reading === "から"));
assert.equal(
  kuu.find((c) => c.reading === "くう" && c.label === "文脈")?.reading ||
    kuu.find((c) => c.source === "context" && c.reading === "くう")?.reading,
  "くう",
  "空を切 → くう should be context-boosted"
);

console.log("Reading candidates tests passed.");
