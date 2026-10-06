// ローディング表示の残り時間
import assert from "node:assert/strict";
import { formatRemaining } from "../extensions/yt-superchat-furigana/src/eta.js";

const t0 = 1_000_000;
assert.equal(formatRemaining(t0, 0, 12, t0 + 500), "残り時間を計測中");
// 3/12 に 6 秒 → 残り 9 本 × 2 秒 = 18 秒
assert.equal(formatRemaining(t0, 3, 12, t0 + 6000), "残り約18秒");
// 1/10 に 30 秒 → 残り 270 秒 = 5 分
assert.equal(formatRemaining(t0, 1, 10, t0 + 30000), "残り約5分");
assert.equal(formatRemaining(t0, 999, 1000, t0 + 1), "残り約1秒");
assert.equal(formatRemaining(t0, 12, 12, t0 + 9000), "残りわずか");
assert.equal(formatRemaining(0, 3, 12, t0), "");
assert.equal(formatRemaining(t0, 3, 0, t0), "");

console.log("test-eta: ok");
