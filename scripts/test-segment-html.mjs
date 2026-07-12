import assert from "node:assert/strict";
import {
  collapseWhitespace,
  parseLlmSegments,
  repairSegmentsToOriginal,
  validateSegments
} from "../src/segment-html.js";

assert.equal(
  validateSegments("食べる", [
    { t: "食", r: "た" },
    { t: "べる" }
  ]),
  true
);

// Whitespace drift should be accepted by default
assert.equal(
  validateSegments("として  胸の", [
    { t: "として" },
    { t: " " },
    { t: "胸", r: "むね" },
    { t: "の" }
  ]),
  true
);

assert.equal(
  validateSegments(
    "として  胸の",
    [
      { t: "として" },
      { t: " " },
      { t: "胸", r: "むね" },
      { t: "の" }
    ],
    { allowWhitespaceDrift: false }
  ),
  false
);

assert.ok(
  repairSegmentsToOriginal("A  B", [{ t: "A" }, { t: " " }, { t: "B" }])
);

// Surface rewrite must fail
assert.equal(validateSegments("なんと", [{ t: "何と", r: "なんと" }]), false);
assert.equal(repairSegmentsToOriginal("なんと", [{ t: "何と", r: "なんと" }]), null);

const parsed = parseLlmSegments(
  '```json\n{"segments":[{"t":"一","r":"ひと"},{"t":"人","r":"り"}]}\n```'
);
assert.deepEqual(parsed, [
  { t: "一", r: "ひと" },
  { t: "人", r: "り" }
]);

assert.equal(collapseWhitespace("1  人"), collapseWhitespace("1 人"));

console.log("segment-html tests passed.");
