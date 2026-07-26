/**
 * 字幕フォーマットの入出力と、cue へのルビ割り当てのテスト。
 */
import {
  EXPORT_FORMATS,
  formatTimestamp,
  parseCaptions,
  parseJson3,
  parseSrtOrVtt,
  parseTimedTextXml,
  parseTimestamp,
  rubyHtmlToSegments,
  segmentsToParenText,
  segmentsToPlainText,
  serializeCaptions,
  toSrv3,
  toTtml,
  toWebVtt
} from "../site/caption-formats.js";
import {
  chunkCueIndices,
  hasKanjiText,
  joinChunk,
  splitTokensByCue,
  textToRubySegments
} from "../site/caption-ruby.js";
import { buildRuby } from "../site/build-ruby.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

// --- タイムスタンプ ---
assertEqual(formatTimestamp(0), "00:00:00.000", "formatTimestamp zero");
assertEqual(formatTimestamp(3_661_234), "01:01:01.234", "formatTimestamp hour");
assertEqual(parseTimestamp("01:01:01.234"), 3_661_234, "parseTimestamp full");
assertEqual(parseTimestamp("00:00:03,500"), 3500, "parseTimestamp srt comma");
assertEqual(parseTimestamp("02:05.250"), 125_250, "parseTimestamp mm:ss");
assertEqual(parseTimestamp("nope"), null, "parseTimestamp invalid");

// --- SRT / VTT パース ---
const srt = `1
00:00:01,000 --> 00:00:03,500
移ろう街と逆に

2
00:00:03,500 --> 00:00:06,000
青のまま募る心
`;
const srtCues = parseSrtOrVtt(srt);
assertEqual(srtCues.length, 2, "srt cue count");
assertEqual(srtCues[0].startMs, 1000, "srt start");
assertEqual(srtCues[0].endMs, 3500, "srt end");
assertEqual(srtCues[0].text, "移ろう街と逆に", "srt text");

const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
<v Speaker>こんにちは
`;
const vttCues = parseSrtOrVtt(vtt);
assertEqual(vttCues.length, 1, "vtt cue count");
assertEqual(vttCues[0].text, "こんにちは", "vtt strips tags");

// 終了時刻が無い/逆転しているものは 1 秒に補正
const broken = parseSrtOrVtt(`1
00:00:05,000 --> 00:00:05,000
テスト
`);
assertEqual(broken[0].endMs, 6000, "degenerate duration is padded");

// --- json3 パース ---
const json3Cues = parseJson3(
  JSON.stringify({
    events: [
      { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "示し" }, { utf8: "合わせて" }] },
      { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: "\n" }] }
    ]
  })
);
assertEqual(json3Cues.length, 1, "json3 skips blank cue");
assertEqual(json3Cues[0].text, "示し合わせて", "json3 joins segs");
assertEqual(json3Cues[0].endMs, 3000, "json3 duration");

// --- srv3 / srv1 XML パース ---
const srv3Cues = parseTimedTextXml(
  `<timedtext format="3"><body><p t="500" d="2000"><s>今日は</s><s>晴れ</s></p></body></timedtext>`
);
assertEqual(srv3Cues.length, 1, "srv3 cue count");
assertEqual(srv3Cues[0].text, "今日は晴れ", "srv3 joins spans");
assertEqual(srv3Cues[0].startMs, 500, "srv3 start");

const srv1Cues = parseTimedTextXml(
  `<transcript><text start="0.5" dur="2.725">&amp;lt;test&amp;gt; 雨</text></transcript>`
);
assertEqual(srv1Cues[0].startMs, 500, "srv1 start ms");
assertEqual(srv1Cues[0].endMs, 3225, "srv1 end ms");

// --- 自動判定 ---
assertEqual(parseCaptions(srt).format, "srt", "detect srt");
assertEqual(parseCaptions(vtt).format, "vtt", "detect vtt");
assertEqual(parseCaptions('{"events":[{"tStartMs":0,"dDurationMs":1000,"segs":[{"utf8":"あ"}]}]}').format, "json3", "detect json3");
assertEqual(parseCaptions("<transcript><text start=\"0\" dur=\"1\">あ</text></transcript>").format, "xml", "detect xml");
assertEqual(parseCaptions("ただの文章").format, "unknown", "detect unknown");

// --- ルビ HTML → セグメント ---
const segments = rubyHtmlToSegments(buildRuby("示し合わせ", "しめしあわせ"));
assertEqual(JSON.stringify(segments), JSON.stringify([
  { text: "示", ruby: "しめ" },
  { text: "し" },
  { text: "合", ruby: "あ" },
  { text: "わせ" }
]), "okurigana split survives round trip");

assertEqual(segmentsToPlainText(segments), "示し合わせ", "plain text round trip");
assertEqual(segmentsToParenText(segments), "示(しめ)し合(あ)わせ", "paren text");

// エスケープされた表層が元に戻る
const escaped = rubyHtmlToSegments("<ruby>&lt;b&gt;日<rt>にち</rt></ruby>&amp;");
assertEqual(escaped[0].text, "<b>日", "unescape base");
assertEqual(escaped[1].text, "&", "unescape trailing text");

// --- token → セグメント ---
const cueText = "移ろう街と逆に";
const cueSegments = textToRubySegments(
  cueText,
  [
    { span: [0, 3], reading: "うつろう" },
    { span: [3, 4], reading: "まち" },
    { span: [5, 6], reading: "ぎゃく" }
  ],
  buildRuby
);
assertEqual(segmentsToPlainText(cueSegments), cueText, "segments reconstruct cue text");
assert(
  cueSegments.some((s) => s.text === "街" && s.ruby === "まち"),
  "street token has ruby"
);

// 重なった span は後ろを捨てる
const overlapped = textToRubySegments(
  "東京都",
  [
    { span: [0, 2], reading: "とうきょう" },
    { span: [1, 3], reading: "きょうと" }
  ],
  buildRuby
);
assertEqual(segmentsToPlainText(overlapped), "東京都", "overlapping tokens still reconstruct");

// 読みが無い token は素通し
const noReading = textToRubySegments("東京", [{ span: [0, 2], reading: "" }], buildRuby);
assertEqual(JSON.stringify(noReading), JSON.stringify([{ text: "東京" }]), "empty reading passes through");

// --- チャンク分割 ---
const manyCues = Array.from({ length: 10 }, (_, i) => ({ text: "あいうえお" + i }));
const chunks = chunkCueIndices(manyCues, 20);
assert(chunks.length > 1, "long cue list is chunked");
assertEqual(
  chunks.flat().join(","),
  manyCues.map((_, i) => i).join(","),
  "chunks cover every cue exactly once in order"
);
for (const chunk of chunks) {
  const { text } = joinChunk(manyCues, chunk);
  assert(text.length <= 20 || chunk.length === 1, `chunk within limit: ${text.length}`);
}

// --- span の割り戻し ---
const twoCues = [{ text: "東京の朝" }, { text: "大阪の夜" }];
const chunk = [0, 1];
const joined = joinChunk(twoCues, chunk);
assertEqual(joined.text, "東京の朝\n大阪の夜", "join uses newline");
assertEqual(joined.offsets.join(","), "0,5", "offsets account for separator");

const byCue = splitTokensByCue(twoCues, chunk, joined.offsets, [
  { span: [0, 2], reading: "とうきょう" },
  { span: [3, 4], reading: "あさ" },
  { span: [5, 7], reading: "おおさか" },
  { span: [8, 9], reading: "よる" },
  // cue をまたぐ token は捨てる
  { span: [3, 7], reading: "むし" }
]);
assertEqual(byCue.get(0).length, 2, "cue 0 token count");
assertEqual(byCue.get(1).length, 2, "cue 1 token count");
assertEqual(byCue.get(1)[0].span.join(","), "0,2", "cue 1 span rebased");

const rebuilt = textToRubySegments(twoCues[1].text, byCue.get(1), buildRuby);
assertEqual(segmentsToPlainText(rebuilt), "大阪の夜", "rebased segments reconstruct");
assert(
  rebuilt.some((s) => s.text === "大阪" && s.ruby === "おおさか"),
  "rebased ruby applies to the right cue"
);

// --- 書き出し ---
const exportCues = [
  {
    startMs: 1000,
    endMs: 3500,
    segments: [{ text: "漢字", ruby: "かんじ" }, { text: "です" }]
  }
];

const vttOut = toWebVtt(exportCues);
assert(vttOut.startsWith("WEBVTT\n\n"), "vtt header");
assert(vttOut.includes("00:00:01.000 --> 00:00:03.500"), "vtt timing");
assert(vttOut.includes("<ruby>漢字<rt>かんじ</rt></ruby>です"), "vtt ruby markup");

const srv3Out = toSrv3(exportCues);
assert(srv3Out.includes('<timedtext format="3">'), "srv3 root");
assert(srv3Out.includes('<pen id="1" rb="1"/>'), "srv3 base pen");
assert(srv3Out.includes('<pen id="3" rb="4"/>'), "srv3 ruby pen above");
assert(
  srv3Out.includes('<p t="1000" d="2500"><s p="1">漢字</s><s p="2">(</s><s p="3">かんじ</s><s p="2">)</s>です</p>'),
  "srv3 ruby span order"
);
assert(toSrv3(exportCues, { rubyBelow: true }).includes('rb="5"'), "srv3 ruby below");

const ttmlOut = toTtml(exportCues);
assert(ttmlOut.includes('tts:ruby="base"'), "ttml ruby base");
assert(ttmlOut.includes('tts:ruby="text"'), "ttml ruby text");
assert(ttmlOut.includes('begin="00:00:01.000"'), "ttml timing");

// XML エスケープ（字幕由来のテキストをそのまま流し込まない）
const nasty = [{ startMs: 0, endMs: 1000, segments: [{ text: "<b>&", ruby: '"x"' }] }];
assert(!toWebVtt(nasty).includes("<b>"), "vtt escapes surface");
assert(toSrv3(nasty).includes("&lt;b&gt;&amp;"), "srv3 escapes surface");
assert(toTtml(nasty).includes("&quot;x&quot;"), "ttml escapes reading");

// serializeCaptions の分岐
for (const format of EXPORT_FORMATS) {
  const out = serializeCaptions(format.id, exportCues);
  assert(typeof out === "string" && out.length > 0, `serialize ${format.id}`);
}
let threw = false;
try {
  serializeCaptions("srt", exportCues);
} catch {
  threw = true;
}
assert(threw, "srt is intentionally unsupported");

// --- 補助 ---
assert(hasKanjiText("東京"), "hasKanjiText true");
assert(!hasKanjiText("とうきょう"), "hasKanjiText false");

console.log("test-caption-formats: ok");
