import assert from "node:assert/strict";
import {
  extractReadingAnchors,
  filterAnchorsWithoutNativeRuby,
  unionClientRects
} from "../src/youtube-reading-floats.js";

const html = `<span class="yt-furigana-word" data-surface="本当" data-reading="ほんとう"><ruby>本当<rt>ほんとう</rt></ruby></span>にわかんないんだよ`;
const anchors = extractReadingAnchors(html);
assert.equal(anchors.length, 1);
assert.equal(anchors[0].surface, "本当");
assert.equal(anchors[0].reading, "ほんとう");

const multi = `<span class="yt-furigana-word" data-surface="褪せ" data-reading="あせ">褪せ</span>ないような<span class="yt-furigana-word" data-surface="花" data-reading="はな">花</span>`;
assert.deepEqual(extractReadingAnchors(multi), [
  { surface: "褪せ", reading: "あせ" },
  { surface: "花", reading: "はな" }
]);

const tipHtml = `<span class="yt-furigana-word yt-furigana-word--tip" data-surface="360" data-reading="さんびゃくろくじゅう">360</span>`;
assert.equal(extractReadingAnchors(tipHtml).length, 0);

assert.equal(unionClientRects([]), null);
assert.deepEqual(
  unionClientRects([
    { left: 10, top: 20, right: 40, bottom: 50, width: 30, height: 30 },
    { left: 35, top: 18, right: 60, bottom: 48, width: 25, height: 30 }
  ]),
  { left: 10, top: 18, width: 50, height: 32 }
);

const songAnchors = extractReadingAnchors(
  `<span class="yt-furigana-word" data-surface="雨" data-reading="あめ"><ruby>雨<rt>あめ</rt></ruby></span>とカプチーノ`
);
assert.deepEqual(filterAnchorsWithoutNativeRuby(songAnchors, ["雨"]), []);
assert.equal(filterAnchorsWithoutNativeRuby(songAnchors, []).length, 1);

console.log("youtube-reading-floats tests passed.");
