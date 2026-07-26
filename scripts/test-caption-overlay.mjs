/**
 * overlay 用パーサの回帰テスト（ネットワーク無し）
 */
import {
  findActiveCue,
  parseOverlayCaptions
} from "../extensions/yt-caption-overlay/src/parse-cues.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertEqual(a, b, label) {
  if (a !== b) throw new Error(`${label}: expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
}

const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
<ruby>永<rt>とわ</rt></ruby>遠の愛

00:00:03.000 --> 00:00:05.000
次の行
`;

const { format, cues } = parseOverlayCaptions(vtt);
assertEqual(format, "vtt", "format");
assertEqual(cues.length, 2, "cue count");
assert(cues[0].html.includes("<ruby>"), "ruby preserved");
assertEqual(cues[0].text.includes("永"), true, "plain has base");

const active = findActiveCue(cues, 2000);
assert(active, "active cue");
assert(active.html.includes("ruby"), "active has ruby");

assertEqual(findActiveCue(cues, 0), null, "before first");

const srt = `1
00:00:01,000 --> 00:00:02,000
こんにちは
`;
assertEqual(parseOverlayCaptions(srt).cues[0].text, "こんにちは", "srt text");

console.log("test-caption-overlay: ok");
