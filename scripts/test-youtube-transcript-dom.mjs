import assert from "node:assert/strict";
import { readTranscriptSegmentsFromDom } from "../src/youtube-transcript-dom.js";

const segment = {
  matches: (sel) => sel === ".segment-text",
  closest: () => null,
  textContent: "暇もない忙しい世界"
};
const segment2 = {
  matches: (sel) => sel === ".segment-text",
  closest: () => null,
  textContent: "仕事が忙しい"
};

globalThis.document = {
  querySelectorAll(selector) {
    if (String(selector).includes("segment-text")) {
      return [segment, segment2, segment];
    }
    return [];
  }
};

const lines = readTranscriptSegmentsFromDom(globalThis.document);
assert.deepEqual(lines, ["暇もない忙しい世界", "仕事が忙しい"]);
console.log("youtube-transcript-dom tests passed.");
