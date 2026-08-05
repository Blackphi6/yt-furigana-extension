/**
 * overlay 用パーサの回帰テスト（ネットワーク無し）
 */
import {
  findActiveCue,
  parseOverlayCaptions
} from "../extensions/yt-caption-overlay/src/parse-cues.js";
import {
  applyConfirmedBreaks,
  findPlainBreakStarts,
  insertBreaksInHtml
} from "../extensions/yt-caption-overlay/src/native-breaks.js";

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

// 時間が重なる cue は連結せず 1 つだけ返す
const overlap = [
  { startMs: 1000, endMs: 5000, text: "それで", html: "それで" },
  {
    startMs: 1500,
    endMs: 5000,
    text: "それで ハリー・ポッターを1から見直してました",
    html: "それで ハリー・ポッターを1から見直してました"
  }
];
const overlapActive = findActiveCue(overlap, 2000);
assert(overlapActive, "overlap active cue");
assert(!overlapActive.html.includes("<br"), "overlap must not join with <br>");
assertEqual(
  overlapActive.text,
  "それで ハリー・ポッターを1から見直してました",
  "overlap picks later-starting cue"
);

// 半角スペースは「ネイティブが2行に割っている」と確認できたときだけ改行
const spacedHtml = "それで ハリー・ポッター";
const noNative = applyConfirmedBreaks(spacedHtml, []);
assertEqual(noNative.mode, "passthrough", "no native → passthrough");
assertEqual(noNative.html, spacedHtml, "no native keeps space");

const single = applyConfirmedBreaks(spacedHtml, ["それで ハリー・ポッター"]);
assertEqual(single.mode, "passthrough", "single line → passthrough");
assertEqual(single.html, spacedHtml, "single line keeps space");

const confirmed = applyConfirmedBreaks(spacedHtml, ["それで", "ハリー・ポッター"]);
assertEqual(confirmed.mode, "native", "native two lines → confirmed");
assertEqual(confirmed.html, "それで<br />ハリー・ポッター", "space becomes br only when confirmed");

const rubyHtml = "<ruby>見<rt>み</rt></ruby>直して いました";
const rubyConfirmed = applyConfirmedBreaks(rubyHtml, ["見直して", "いました"]);
assertEqual(rubyConfirmed.mode, "native", "ruby + native");
assertEqual(
  rubyConfirmed.html,
  "<ruby>見<rt>み</rt></ruby>直して<br />いました",
  "ruby kept, space→br at native boundary"
);

const mismatch = applyConfirmedBreaks("別の文", ["それで", "ハリー"]);
assertEqual(mismatch.mode, "passthrough", "mismatch must not guess");

assertEqual(
  findPlainBreakStarts("a b c", ["a", "b", "c"])?.join(","),
  "2,4",
  "break starts"
);
assertEqual(insertBreaksInHtml("a b", [2]), "a<br />b", "insertBreaksInHtml");

// パース時はスペースを改行にしない
const spaced = parseOverlayCaptions(`WEBVTT

00:00:01.000 --> 00:00:03.000
それで ハリー・ポッターを1から見直していました
`);
assert(
  spaced.cues[0].html.includes("それで ハリー"),
  "parsed vtt keeps half-width space until native confirms"
);

console.log("test-caption-overlay: ok");
