/**
 * ライブチャットふりがな拡張の純関数テスト（ネットワーク無し）
 */
import assert from "node:assert/strict";
import { buildFuriganaHtml, hasKanji } from "../src/furigana.js";
import {
  applyFuriganaToMessage,
  CHAT_MESSAGE_SELECTOR,
  CHAT_TARGET_SELECTOR,
  collectChatMessageElements,
  collectStreamYardCommentElements,
  collectSuperChatMessageElements,
  extractPlainMessage,
  isAlreadyProcessed,
  needsFurigana,
  PAID_MESSAGE_SELECTOR,
  restoreChatMessages,
  restoreMessage,
  restoreSuperChatMessages,
  STREAMYARD_COMMENT_SELECTOR,
  SUPERCHAT_TARGET_SELECTOR,
  TARGET_SELECTOR,
  TICKER_MESSAGE_SELECTOR
} from "../extensions/yt-superchat-furigana/src/process.js";
import {
  isAnyTargetEnabled,
  normalizeYtscfState,
  TOGGLE_HIDE_TEXT_COMMAND,
  withToggledHideTextMessages
} from "../extensions/yt-superchat-furigana/src/state.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(needsFurigana("こんにちは"), false);
assert.equal(needsFurigana("配信ありがとう"), true);
assert.equal(hasKanji("漢字"), true);

assert.ok(PAID_MESSAGE_SELECTOR.includes("yt-live-chat-paid-message-renderer"));
assert.ok(TICKER_MESSAGE_SELECTOR.includes("ticker-paid-message"));
assert.ok(CHAT_MESSAGE_SELECTOR.includes("yt-live-chat-text-message-renderer"));
assert.ok(STREAMYARD_COMMENT_SELECTOR.includes("BubblesComment__ContentSpan"));
assert.ok(CHAT_TARGET_SELECTOR.includes("BubblesComment__ContentSpan"));
assert.ok(SUPERCHAT_TARGET_SELECTOR.includes("yt-live-chat-paid-message-renderer"));
assert.equal(TARGET_SELECTOR, SUPERCHAT_TARGET_SELECTOR);
assert.ok(!TARGET_SELECTOR.includes("text-message-renderer"));

// state 移行
assert.deepEqual(normalizeYtscfState(undefined), {
  superChatEnabled: true,
  chatEnabled: true,
  hideTextMessages: false
});
assert.deepEqual(normalizeYtscfState({ enabled: true }), {
  superChatEnabled: true,
  chatEnabled: true,
  hideTextMessages: false
});
assert.deepEqual(normalizeYtscfState({ enabled: false }), {
  superChatEnabled: false,
  chatEnabled: false,
  hideTextMessages: false
});
assert.deepEqual(
  normalizeYtscfState({ superChatEnabled: true, chatEnabled: false }),
  { superChatEnabled: true, chatEnabled: false, hideTextMessages: false }
);
assert.deepEqual(
  normalizeYtscfState({ superChatEnabled: false, chatEnabled: true }),
  { superChatEnabled: false, chatEnabled: true, hideTextMessages: false }
);
assert.deepEqual(
  normalizeYtscfState({
    superChatEnabled: true,
    chatEnabled: true,
    hideTextMessages: true
  }),
  { superChatEnabled: true, chatEnabled: true, hideTextMessages: true }
);
assert.deepEqual(
  normalizeYtscfState({ hideTextMessages: "yes" }),
  { superChatEnabled: true, chatEnabled: true, hideTextMessages: false }
);
// 新キーがあるときは旧 enabled を無視
assert.deepEqual(
  normalizeYtscfState({
    enabled: false,
    superChatEnabled: true,
    chatEnabled: true
  }),
  { superChatEnabled: true, chatEnabled: true, hideTextMessages: false }
);
assert.equal(
  isAnyTargetEnabled({
    superChatEnabled: false,
    chatEnabled: false,
    hideTextMessages: true
  }),
  false
);
assert.equal(
  isAnyTargetEnabled({
    superChatEnabled: true,
    chatEnabled: false,
    hideTextMessages: false
  }),
  true
);

assert.deepEqual(
  withToggledHideTextMessages({
    superChatEnabled: true,
    chatEnabled: true,
    hideTextMessages: false
  }),
  { superChatEnabled: true, chatEnabled: true, hideTextMessages: true }
);
assert.deepEqual(
  withToggledHideTextMessages({ hideTextMessages: true }),
  { superChatEnabled: true, chatEnabled: true, hideTextMessages: false }
);

{
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const manifest = JSON.parse(
    readFileSync(
      path.join(
        __dirname,
        "../extensions/yt-superchat-furigana/manifest.json"
      ),
      "utf8"
    )
  );
  const cmd = manifest.commands?.[TOGGLE_HIDE_TEXT_COMMAND];
  assert.ok(cmd, "manifest has toggle command");
  assert.equal(cmd.suggested_key?.default, "Ctrl+Shift+L");
  assert.equal(cmd.suggested_key?.mac, "MacCtrl+Shift+L");
}

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

assert.equal(
  applyFuriganaToMessage(message, "<ruby>配<rt>はい</rt></ruby>信", "配信ありがとう"),
  true
);
assert.equal(isAlreadyProcessed(message), true);
assert.equal(message.getAttribute("data-ytscf-original"), "配信ありがとう");

restoreMessage(message);
assert.equal(isAlreadyProcessed(message), false);
assert.equal(message.textContent, "配信ありがとう");

const chatMsg = el("応援してます");
applyFuriganaToMessage(chatMsg, "<ruby>応<rt>おう</rt></ruby>援", "応援してます");

const root = {
  querySelectorAll(sel) {
    const s = String(sel);
    if (s.includes("paid-message") || s.includes("ticker-paid")) return [message];
    if (s.includes("text-message")) return [chatMsg];
    return [];
  }
};
assert.equal(collectSuperChatMessageElements(root).length, 1);
assert.equal(collectChatMessageElements(root).length, 1);

const syMsg = el("五月一日に株式市場");
const syRoot = {
  querySelectorAll(sel) {
    return String(sel).includes("BubblesComment") ? [syMsg] : [];
  }
};
assert.equal(collectStreamYardCommentElements(syRoot).length, 1);
assert.equal(collectChatMessageElements(syRoot).length, 1);
applyFuriganaToMessage(syMsg, "<ruby>五<rt>ご</rt></ruby>月", "五月一日に株式市場");
restoreChatMessages(syRoot);
assert.equal(isAlreadyProcessed(syMsg), false);

// 種別 restore: SC だけ戻しても通常チャットは残る
applyFuriganaToMessage(message, "<b>sc</b>", "配信ありがとう");
assert.equal(isAlreadyProcessed(message), true);
assert.equal(isAlreadyProcessed(chatMsg), true);
restoreSuperChatMessages(root);
assert.equal(isAlreadyProcessed(message), false);
assert.equal(isAlreadyProcessed(chatMsg), true);
restoreChatMessages(root);
assert.equal(isAlreadyProcessed(chatMsg), false);

console.log("test-superchat-furigana: ok");
