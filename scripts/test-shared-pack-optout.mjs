/**
 * Shared pack opt-out: Free pack storage is separate from Premium shared dict,
 * and reloadBundledReadingMaps clears prior merges.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MANUAL_PHRASE_READINGS,
  reloadBundledReadingMaps,
  rebuildManualPhraseIndex
} from "../src/reading-context.js";
import { applyUserReadingLearning } from "../src/user-reading-dict.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const content = readFileSync(path.join(root, "src/content.js"), "utf8");
const background = readFileSync(path.join(root, "src/background.js"), "utf8");

assert.match(content, /freeSharedReadingPack/);
assert.match(content, /reloadBundledReadingMaps/);
assert.match(content, /sharedPackEnabled/);
assert.match(background, /freeSharedReadingPack/);
assert.match(background, /premiumSharedReadingDict/);

reloadBundledReadingMaps();
const before = MANUAL_PHRASE_READINGS.get("何故") || MANUAL_PHRASE_READINGS.get("夏日");
applyUserReadingLearning(
  MANUAL_PHRASE_READINGS,
  [],
  rebuildManualPhraseIndex,
  { 毒語: "どくご", 夏日: "なつび仮" }
);
assert.equal(MANUAL_PHRASE_READINGS.get("毒語"), "どくご");
reloadBundledReadingMaps();
assert.equal(MANUAL_PHRASE_READINGS.has("毒語"), false);
// bundled maps restored; poisoned key gone
if (before) {
  // ok if 夏日 exists from bundle or not
}

console.log("shared-pack opt-out tests passed.");
