/**
 * Super Chat ふりがな実験拡張の純関数テスト（ネットワーク無し）
 */
import assert from "node:assert/strict";
import { buildFuriganaHtml, hasKanji } from "../src/furigana.js";
import {
  applyFuriganaToMessage,
  collectSuperChatMessageElements,
  extractPlainMessage,
  isAlreadyProcessed,
  needsFurigana,
  PAID_MESSAGE_SELECTOR,
  restoreMessage,
  TARGET_SELECTOR,
  TICKER_MESSAGE_SELECTOR
} from "../extensions/yt-superchat-furigana/src/process.js";

assert.equal(needsFurigana("こんにちは"), false);
assert.equal(needsFurigana("配信ありがとう"), true);
assert.equal(hasKanji("漢字"), true);

assert.ok(PAID_MESSAGE_SELECTOR.includes("yt-live-chat-paid-message-renderer"));
assert.ok(TICKER_MESSAGE_SELECTOR.includes("ticker-paid-message"));
assert.ok(TARGET_SELECTOR.includes("yt-live-chat-paid-message-renderer"));

function el(text = "") {
  return {
    attributes: {},
    classList: {
      _set: new Set(),
      add(c) {
        this._set.add(c);
      },
      remove(c) {
        this._set.delete(c);
      }
    },
    textContent: text,
    innerHTML: text,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name);
    },
    cloneNode() {
      const n = el(this.textContent);
      n.attributes = { ...this.attributes };
      n.innerHTML = this.innerHTML;
      return n;
    },
    querySelectorAll() {
      return [];
    }
  };
}

const message = el("配信ありがとう");
assert.equal(isAlreadyProcessed(message), false);
assert.equal(extractPlainMessage(message), "配信ありがとう");

const fakeTokenize = (text) => [
  {
    surface_form: text,
    reading: "ハイシン",
    pronunciation: "ハイシン",
    pos: "名詞",
    pos_detail_1: "一般",
    basic_form: text,
    conjugated_type: "*",
    conjugated_form: "*",
    word_id: 0,
    word_type: "KNOWN",
    word_position: 0
  }
];

const html = buildFuriganaHtml("配信", fakeTokenize);
assert.ok(/ruby|配信/.test(html), `unexpected html: ${html}`);

// 辞書に無い漢字（髙）でもクリック登録用に wrap する
const unknownHtml = buildFuriganaHtml("髙橋", () => [
  {
    surface_form: "髙",
    reading: "",
    pronunciation: "",
    pos: "名詞",
    pos_detail_1: "一般",
    basic_form: "*",
    conjugated_type: "*",
    conjugated_form: "*",
    word_id: 0,
    word_type: "UNKNOWN",
    word_position: 0
  },
  {
    surface_form: "橋",
    reading: "キョウ",
    pronunciation: "キョー",
    pos: "名詞",
    pos_detail_1: "一般",
    basic_form: "橋",
    conjugated_type: "*",
    conjugated_form: "*",
    word_id: 1,
    word_type: "KNOWN",
    word_position: 1
  }
]);
assert.ok(
  unknownHtml.includes("yt-furigana-word--unset") &&
    unknownHtml.includes("クリックで読みを登録"),
  `unset unknown kanji should be registerable: ${unknownHtml}`
);

assert.equal(
  applyFuriganaToMessage(message, "<ruby>配<rt>はい</rt></ruby>信", "配信ありがとう"),
  true
);
assert.equal(isAlreadyProcessed(message), true);
assert.equal(message.getAttribute("data-ytscf-original"), "配信ありがとう");

restoreMessage(message);
assert.equal(isAlreadyProcessed(message), false);
assert.equal(message.textContent, "配信ありがとう");

const root = {
  querySelectorAll(sel) {
    if (String(sel).includes("paid-message")) return [message];
    return [];
  }
};
assert.equal(collectSuperChatMessageElements(root).length, 1);

console.log("test-superchat-furigana: ok");
