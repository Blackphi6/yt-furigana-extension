import assert from "node:assert/strict";
import {
  extractVisibleTextMap,
  moveBreakBeforeAtomicUnit,
  insertCaptionSoftBreaks,
  selectSoftBreakOffsets,
  estimateMaxLineChars,
  DEFAULT_MAX_LINE_CHARS,
  ZWSP
} from "../src/caption-line-break.js";
import { buildFuriganaHtml } from "../src/furigana.js";
import { loadDefaultJapaneseParser } from "budoux";

assert.equal(estimateMaxLineChars({}), DEFAULT_MAX_LINE_CHARS);
assert.equal(estimateMaxLineChars({ lineWidthPx: 400, fontSizePx: 20 }), 30);
assert.equal(estimateMaxLineChars({ lineWidthPx: 900, fontSizePx: 20 }), 40);
assert.equal(DEFAULT_MAX_LINE_CHARS, 30);

// 13文字程度の短文は改行候補を入れない
const shortCaption = "さて、それでは使ってみます";
assert.ok(shortCaption.length < 30);
assert.equal(
  insertCaptionSoftBreaks(`<span>${shortCaption}</span>`, { maxLineChars: 30 }),
  `<span>${shortCaption}</span>`
);

assert.deepEqual(selectSoftBreakOffsets(["あいう", "え", "おかき"], 4), [4]);
assert.deepEqual(selectSoftBreakOffsets(["あ", "い"], 10), []);

const shortHtml =
  `逆にクーラー<span class="yt-furigana-word" data-surface="設備" data-reading="せつび"><ruby>設備<rt>せつび</rt></ruby></span>は` +
  `<span class="yt-furigana-word" data-surface="無" data-reading="な"><ruby>無<rt>な</rt></ruby></span>いので基本的に`;

// 短文は 1 行目安以内ならブレークしない
assert.equal(insertCaptionSoftBreaks(shortHtml, { maxLineChars: 40 }), shortHtml);

// 狭い目安なら句境界でのみ折る（無いのでは分割しない）
const soft = insertCaptionSoftBreaks(shortHtml, { maxLineChars: 10 });
assert.ok(soft.includes(ZWSP), "should insert ZWSP when over budget");
const softVisible = extractVisibleTextMap(soft).visible;
assert.ok(!softVisible.includes(`無${ZWSP}い`), "must not split 無いので");
assert.ok(!/<ruby[^>]*>[^<]*\u200b/.test(soft), "no ZWSP inside ruby open");

const sample =
  "私のアトレーはFFヒーターがあるので冬は問題ないですが、逆にクーラー設備は無いので基本的に夏の車中泊は不可能に近いです";
const phrases = loadDefaultJapaneseParser().parse(sample);
const offsets = selectSoftBreakOffsets(phrases, 22);
assert.ok(offsets.length >= 1);
// 各行が極端に短くないこと（最後の行以外）
let prev = 0;
for (const off of offsets) {
  assert.ok(off - prev >= 8, `line chunk too short: ${prev}..${off}`);
  prev = off;
}

const { visible } = extractVisibleTextMap(
  `<span><ruby>無<rt>な</rt></ruby></span>いので基本`
);
assert.equal(visible, "無いので基本");

const atomic = moveBreakBeforeAtomicUnit(
  `<span class="yt-furigana-word" data-surface="無"><ruby>無<rt>な</rt></ruby></span>い`,
  `<span class="yt-furigana-word" data-surface="無"><ruby>`.length
);
assert.equal(atomic, 0);

const tokenize = (text) =>
  Array.from(text).map((ch) => ({
    surface_form: ch,
    reading: /[\u3400-\u9fff]/.test(ch) ? "あ" : "",
    pos: "名詞"
  }));

const furigana = buildFuriganaHtml(sample, tokenize);
const broken = insertCaptionSoftBreaks(furigana, { maxLineChars: 22 });
assert.ok(broken.includes(ZWSP));
assert.ok(!/<ruby[^>]*>[^<]*\u200b/.test(broken));
assert.equal(
  broken.replace(/<[^>]+>/g, "").replaceAll(ZWSP, ""),
  furigana.replace(/<[^>]+>/g, ""),
  "visible text unchanged except soft breaks"
);

assert.equal(insertCaptionSoftBreaks(soft), soft);

console.log("caption-line-break (BudouX) tests passed.");
