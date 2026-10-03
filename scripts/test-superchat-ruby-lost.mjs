// スパチャ本文が再描画でルビだけ消えたら付け直し対象になる（読み無し文では無限再処理しない）
import assert from "node:assert/strict";
import {
  RUBY_ATTR,
  applyFuriganaToMessage,
  isAlreadyProcessed,
  lostRuby,
  restoreMessage
} from "../extensions/yt-superchat-furigana/src/process.js";

/** innerHTML 代入と rt 検索だけを持つ最小の要素 */
function fakeEl(text) {
  const attrs = new Map();
  return {
    innerHTML: text,
    textContent: text,
    classList: { add() {}, remove() {} },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    hasAttribute: (k) => attrs.has(k),
    removeAttribute: (k) => attrs.delete(k),
    querySelector(sel) {
      return sel === "rt" && /<rt[\s>]/.test(this.innerHTML) ? {} : null;
    }
  };
}

const el = fakeEl("今日も一日");
applyFuriganaToMessage(el, "<ruby>今日<rt>きょう</rt></ruby>も一日", "今日も一日");
assert.ok(isAlreadyProcessed(el));
assert.equal(el.getAttribute(RUBY_ATTR), "1");
assert.equal(lostRuby(el), false, "ルビがあるうちは付け直さない");

// YouTube が本文だけ書き戻した（属性は残る）
el.innerHTML = "今日も一日";
assert.equal(lostRuby(el), true, "ルビ消失を検出");

// ルビの付かない文は印を付けないので、再処理ループにならない
const plain = fakeEl("ｗｗｗ");
applyFuriganaToMessage(plain, "ｗｗｗ", "ｗｗｗ");
assert.equal(lostRuby(plain), false);

restoreMessage(el);
assert.equal(el.hasAttribute(RUBY_ATTR), false);

console.log("test-superchat-ruby-lost: ok");
