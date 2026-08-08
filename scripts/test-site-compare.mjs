/**
 * site/compare.js の固定例・ルビ描画の単体テスト
 */
import assert from "node:assert/strict";
import { COMPARE_CASES, renderRubyLine } from "../site/compare.js";

assert.ok(COMPARE_CASES.length >= 5, "enough fixed cases");

for (const c of COMPARE_CASES) {
  assert.ok(c.id && c.text && c.title, `case ${c.id} has fields`);
  assert.ok(Array.isArray(c.naiveHits) && c.naiveHits.length > 0);
  assert.ok(Array.isArray(c.oursHits) && c.oursHits.length > 0);
  assert.equal(
    c.naiveHits.length,
    c.oursHits.length,
    `${c.id}: hit counts align`
  );
  for (let i = 0; i < c.oursHits.length; i += 1) {
    assert.equal(
      c.naiveHits[i].surface,
      c.oursHits[i].surface,
      `${c.id}: surface align at ${i}`
    );
  }
  // 少なくとも1箇所は左右で読みが違う（差別化デモなので）
  const differs = c.oursHits.some(
    (h, i) => h.reading !== c.naiveHits[i].reading
  );
  assert.ok(differs, `${c.id}: must differ somewhere`);
}

{
  const c = COMPARE_CASES.find((x) => x.id === "machinaka");
  assert.ok(c);
  const naive = renderRubyLine(c.text, c.naiveHits, c.oursHits);
  const ours = renderRubyLine(c.text, c.oursHits, c.naiveHits);
  assert.match(naive, /まちなか/);
  assert.match(ours, /まちじゅう/);
  assert.match(naive, /<mark class="diff">/);
  assert.match(ours, /<mark class="diff">/);
  assert.ok(naive.includes("<ruby>") || naive.includes("<ruby "));
}

console.log("test-site-compare: ok");
