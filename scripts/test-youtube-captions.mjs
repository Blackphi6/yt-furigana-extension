import assert from "node:assert/strict";
import {
  buildTimedTextJson3Url,
  extractJsonAssignment,
  fetchJapaneseCaptionLines,
  getCaptionTracksFromPlayerResponse,
  getYouTubeVideoId,
  parseTimedTextJson3,
  pickJapaneseCaptionTrack,
  uniqueCaptionTexts
} from "../src/youtube-captions.js";

assert.equal(
  getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
  "dQw4w9WgXcQ"
);
assert.equal(
  getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10"),
  "dQw4w9WgXcQ"
);
assert.equal(
  getYouTubeVideoId("https://www.youtube.com/shorts/abc123XYZ00"),
  "abc123XYZ00"
);

const html = `var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=x&lang=ja","languageCode":"ja","kind":"asr"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=x&lang=ja&name=ja","languageCode":"ja"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=x&lang=en","languageCode":"en"}]}}};`;
const playerResponse = extractJsonAssignment(html, "ytInitialPlayerResponse");
assert.ok(playerResponse);
const tracks = getCaptionTracksFromPlayerResponse(playerResponse);
assert.equal(tracks.length, 3);
const picked = pickJapaneseCaptionTrack(tracks);
assert.equal(picked.kind, undefined);
assert.equal(picked.languageCode, "ja");

const json3Url = buildTimedTextJson3Url(
  "https://www.youtube.com/api/timedtext?v=x&lang=ja&fmt=srv3"
);
assert.match(json3Url, /fmt=json3/);
assert.doesNotMatch(json3Url, /fmt=srv3/);

const lines = parseTimedTextJson3({
  events: [
    { tStartMs: 0, segs: [{ utf8: "暇もない" }, { utf8: "忙しい世界" }] },
    { tStartMs: 1000 },
    { tStartMs: 2000, segs: [{ utf8: "暇もない忙しい世界" }] },
    { tStartMs: 3000, segs: [{ utf8: "  仕事が忙しい  " }] }
  ]
});
assert.deepEqual(lines, [
  "暇もない忙しい世界",
  "暇もない忙しい世界",
  "仕事が忙しい"
]);

const unique = uniqueCaptionTexts(lines, (text) => text.replace(/\s+/g, " ").trim());
assert.deepEqual(unique, ["暇もない忙しい世界", "仕事が忙しい"]);

// ANDROID path against the failing video from the screenshot
const live = await fetchJapaneseCaptionLines("A7cp6OVa0Qc");
assert.ok(live.lines.length > 5, "expected multiple caption lines");
assert.ok(
  live.lines.some((line) => line.includes("1人の夜") || line.includes("一人の夜")),
  `expected lyric line, got: ${live.lines.slice(0, 3).join(" | ")}`
);
assert.equal(live.source, "android");

console.log("youtube-captions tests passed.");
