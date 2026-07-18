import assert from "node:assert/strict";
import {
  buildTimedTextJson3Url,
  extractJsonAssignment,
  fetchJapaneseCaptionLines,
  findActiveTimedCaptionCues,
  getCaptionTracksFromPlayerResponse,
  getYouTubeVideoId,
  isStyledPaintOnCaptionData,
  parseTimedTextJson3,
  parseTimedTextJson3Cues,
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

assert.equal(
  isStyledPaintOnCaptionData({ pens: [{}], events: [{ segs: [{ utf8: "a" }] }] }),
  false
);
assert.equal(
  isStyledPaintOnCaptionData({
    pens: Array.from({ length: 20 }, () => ({})),
    events: [{ pPenId: 1, segs: [{ utf8: "a" }] }]
  }),
  false
);
assert.equal(
  isStyledPaintOnCaptionData({
    pens: Array.from({ length: 20 }, () => ({})),
    events: Array.from({ length: 10 }, (_, i) => ({
      pPenId: i + 1,
      segs: [{ utf8: "a" }]
    }))
  }),
  true
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

const sampleEvents = {
  events: [
    {
      tStartMs: 0,
      dDurationMs: 1000,
      segs: [{ utf8: "暇もない" }, { utf8: "忙しい世界" }]
    },
    { tStartMs: 1000 },
    {
      tStartMs: 2000,
      dDurationMs: 1000,
      segs: [{ utf8: "暇もない忙しい世界" }]
    },
    { tStartMs: 3000, segs: [{ utf8: "  仕事が忙しい  " }] }
  ]
};

const lines = parseTimedTextJson3(sampleEvents);
assert.deepEqual(lines, [
  "暇もない忙しい世界",
  "暇もない忙しい世界",
  "仕事が忙しい"
]);

const cues = parseTimedTextJson3Cues(sampleEvents);
assert.equal(cues.length, 3);
assert.deepEqual(cues[0], {
  startMs: 0,
  endMs: 1000,
  text: "暇もない忙しい世界"
});
assert.deepEqual(cues[2], {
  startMs: 3000,
  endMs: 8000,
  text: "仕事が忙しい"
});
assert.deepEqual(
  findActiveTimedCaptionCues(cues, 500).map((c) => c.text),
  ["暇もない忙しい世界"]
);
assert.deepEqual(findActiveTimedCaptionCues(cues, 1500), []);
assert.deepEqual(
  findActiveTimedCaptionCues(cues, 3500).map((c) => c.text),
  ["仕事が忙しい"]
);

const unique = uniqueCaptionTexts(lines, (text) =>
  text.replace(/\s+/g, " ").trim()
);
assert.deepEqual(unique, ["暇もない忙しい世界", "仕事が忙しい"]);

async function tryLive(label, fn) {
  try {
    return await fn();
  } catch (error) {
    const msg = String(error?.message || error);
    if (/\b429\b|rate|quota|timedtext fetch failed/i.test(msg)) {
      console.warn(`[skip live] ${label}: ${msg}`);
      return null;
    }
    throw error;
  }
}

// ANDROID path against the failing video from the screenshot
const live = await tryLive("A7cp6OVa0Qc", () =>
  fetchJapaneseCaptionLines("A7cp6OVa0Qc")
);
if (live) {
  assert.ok(live.lines.length > 5, "expected multiple caption lines");
  assert.ok(
    live.lines.some((line) => line.includes("1人の夜") || line.includes("一人の夜")),
    `expected lyric line, got: ${live.lines.slice(0, 3).join(" | ")}`
  );
  assert.equal(live.source, "android");
  assert.ok(Array.isArray(live.cues) && live.cues.length > 0, "expected timed cues");
}

// 車中泊動画: 通常字幕 → styled=false、10:28 キューあり
const camping = await tryLive("plHkXz9ghkA", () =>
  fetchJapaneseCaptionLines("plHkXz9ghkA")
);
if (camping) {
  assert.ok(camping.cues?.length > 10, "expected camping cues");
  assert.equal(camping.styled, false, "camping video should use native captions");
  const gapCue = findActiveTimedCaptionCues(camping.cues, 630_000);
  assert.ok(
    gapCue.some((c) => c.text.includes("過酷な環境")),
    `expected 10:28 cue at 630s, got: ${gapCue.map((c) => c.text).join(" | ") || "(none)"}`
  );
}

// 音楽動画: 着色ペン多数 → styled=true
const mv = await tryLive("PWbRleMGagU", () =>
  fetchJapaneseCaptionLines("PWbRleMGagU")
);
if (mv) {
  assert.ok(mv.lines.length > 5, "expected music video lyric lines");
  assert.ok(
    mv.lines.some((line) => line.includes("カプチーノ") || line.includes("灰色")),
    `expected cappuccino lyric, got: ${mv.lines.slice(0, 5).join(" | ")}`
  );
  assert.equal(mv.styled, true, "styled karaoke MV should use overlay mode");
  assert.ok(
    mv.source === "ios" || mv.source === "android" || mv.source === "watch",
    `unexpected source ${mv.source}`
  );
}

console.log("youtube-captions tests passed.");
