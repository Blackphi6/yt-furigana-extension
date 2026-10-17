// ルビ HTML から、指定した語の範囲の読みを厳密に取り出す（第0段階の確認用データの評価に使う）
import assert from "node:assert/strict";
import { readingOfSpan } from "./learning/bench-utils.mjs";

const html =
  '<span class="yt-furigana-word"><ruby>彼<rt>かれ</rt></ruby></span>は<ruby>行動<rt>こうどう</rt></ruby><ruby>力<rt>ちから</rt></ruby>がある';
// 複数のルビにまたがる語は読みをつなぐ
assert.equal(readingOfSpan(html, "彼は行動力がある", "行動力"), "こうどうちから");
// かなはそのまま、カタカナはひらがなにそろえる
assert.equal(readingOfSpan('<ruby>生<rt>なま</rt></ruby>ビール', "生ビール", "生ビール"), "なまびーる");
// ルビの区切りが語の途中で切れているときは判定できない（null）
assert.equal(readingOfSpan('<ruby>大人<rt>ひろひと</rt></ruby><ruby>気<rt>き</rt></ruby>', "大人気", "人気"), null);
// 同じ語が何度も出るときは at 番目（0 始まり）
assert.equal(
  readingOfSpan('<ruby>一日<rt>いちにち</rt></ruby>と<ruby>一日<rt>ついたち</rt></ruby>', "一日と一日", "一日", 1),
  "ついたち"
);
// エスケープされた本文
assert.equal(readingOfSpan('&lt;<ruby>漢字<rt>かんじ</rt></ruby>&gt;', "<漢字>", "漢字"), "かんじ");
// 見つからない語
assert.equal(readingOfSpan('<ruby>漢字<rt>かんじ</rt></ruby>', "漢字", "感じ"), null);
console.log("範囲の読み取り出しのテスト: 問題なし");
