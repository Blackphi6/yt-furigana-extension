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
  listAccessibleChatDocuments,
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
  shouldRunLiveChatEngine,
  TOGGLE_HIDE_TEXT_COMMAND,
  withToggledHideTextMessages
} from "../extensions/yt-superchat-furigana/src/state.js";
import {
  buildLedgerEntryId,
  TICKER_PAID_RENDERER_SELECTOR,
  collectPaidMessageRenderers,
  queryYtDeepAll,
  extractVideoIdFromHref,
  filterLedgerBySearch,
  filterLedgerByTimecodeRange,
  formatFetchAllSuperChatsStatus,
  ledgerItemsToCsv,
  parseLedgerAmountNumber,
  ledgerEntryFromPageDto,
  mergeLedgerItems,
  parsePaidMessageRenderer,
  parseTimecodeToSeconds,
  PAGE_PAID_REQUEST_TYPE,
  PAGE_PAID_RESULT_TYPE,
  requestPagePaidDtos,
  resolveVideoId,
  sanitizeLedgerAmount,
  superChatColorsFromAmount,
  cssColorToHex,
  toggleLedgerEntryRead,
  upsertLedgerEntries
} from "../extensions/yt-superchat-furigana/src/sc-ledger.js";
import {
  detectIsChatReplayPage,
  detectIsLiveNow,
  extractPaidEntriesFromActions,
  extractReplayBeginningContinuation,
  findLiveChatContinuation,
  maxReplayOffsetMs,
  paidRendererJsonToEntry,
  readChatBootstrapFromHtml,
  runsToPlainText,
  shouldStopLiveReplayFetch,
  youtubeColorIntToHex
} from "../extensions/yt-superchat-furigana/src/chat-replay-sc.js";
import {
  buildScCardFilename,
  buildScPreviewCardHtml,
  CARD_W,
  escapeScHtml,
  layoutRubyRuns,
  parseFuriganaRuns,
  wrapPlainTextLines,
  resolveCardColors,
  resolveYtScColors,
  sanitizeFilenamePart,
  shadeHex
} from "../extensions/yt-superchat-furigana/src/sc-card-export.js";
import {
  clampPanelPosition,
  isTopYoutubeWatchFrame,
  parseStoredPanelPos,
  shouldCloseScPreview,
  buildScPreviewLoadingHtml
} from "../extensions/yt-superchat-furigana/src/sc-ledger-panel.js";
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

{
  const overlay = { id: "overlay" };
  const closeBtn = {
    closest(sel) {
      return sel === "[data-act=previewClose]" ? closeBtn : null;
    }
  };
  const textInsideBtn = { parentElement: closeBtn };
  const cardBody = {
    closest() {
      return null;
    }
  };
  assert.equal(shouldCloseScPreview(overlay, overlay), true);
  assert.equal(shouldCloseScPreview(closeBtn, overlay), true);
  // 「閉じる」の文字ノードをクリックしても閉じる
  assert.equal(shouldCloseScPreview(textInsideBtn, overlay), true);
  assert.equal(shouldCloseScPreview(cardBody, overlay), false);

  const loadingHtml = buildScPreviewLoadingHtml();
  assert.match(loadingHtml, /ytscf-sc-preview__spinner/);
  assert.match(loadingHtml, /data-act="previewClose"/);
  assert.match(loadingHtml, /プレビューを準備しています/);
}

// 累積パネル対象ページ（Shorts はスパチャ無しなので除外）
assert.equal(isTopYoutubeWatchFrame("https://www.youtube.com/shorts"), false);
assert.equal(isTopYoutubeWatchFrame("https://www.youtube.com/shorts/"), false);
assert.equal(
  isTopYoutubeWatchFrame("https://www.youtube.com/shorts/bPCOQswlldg"),
  false
);
assert.equal(
  isTopYoutubeWatchFrame("https://www.youtube.com/watch?v=bPCOQswlldg"),
  true
);
assert.equal(
  isTopYoutubeWatchFrame("https://www.youtube.com/live/ocNUY2lhY58"),
  true
);

// 視聴ページ本体ではエンジンを起動しない（チャット iframe / StreamYard / 台帳のみ）
assert.equal(
  shouldRunLiveChatEngine({ href: "https://www.youtube.com/watch?v=abc" }),
  false
);
assert.equal(shouldRunLiveChatEngine({ href: "https://www.youtube.com/" }), false);
assert.equal(
  shouldRunLiveChatEngine({ href: "https://www.youtube.com/live_chat?v=abc" }),
  true
);
assert.equal(
  shouldRunLiveChatEngine({
    href: "https://www.youtube.com/live_chat_replay?v=abc"
  }),
  true
);
assert.equal(
  shouldRunLiveChatEngine({
    href: "https://www.youtube.com/watch?v=abc",
    hasChatApp: true
  }),
  true
);
assert.equal(
  shouldRunLiveChatEngine({
    href: "https://www.youtube.com/watch?v=abc",
    ledgerEnabled: true,
    isTopWatchFrame: true
  }),
  true
);
assert.equal(
  shouldRunLiveChatEngine({ href: "https://www.streamyard.com/studio" }),
  true
);

// 掴み代だけ残せばよい（全体クランプだと展開パネルがほぼ動かない）
assert.deepEqual(clampPanelPosition(0, 0, 360, 200, 1000, 800), {
  left: 0,
  top: 8
});
assert.deepEqual(clampPanelPosition(900, 700, 360, 200, 1000, 800), {
  left: 900,
  top: 700
});
assert.deepEqual(clampPanelPosition(120, 80, 360, 200, 1000, 800), {
  left: 120,
  top: 80
});
assert.deepEqual(clampPanelPosition(-40, -20, 2000, 2000, 400, 300), {
  left: -40,
  top: 8
});
// 画面下へ大きく動かしてもタイトルバーは残る
assert.deepEqual(clampPanelPosition(10, 900, 360, 640, 1000, 800), {
  left: 10,
  top: 752
});
assert.equal(parseStoredPanelPos(null), null);
assert.equal(parseStoredPanelPos({ left: "x", top: 1 }), null);
assert.deepEqual(parseStoredPanelPos({ left: 12, top: 34 }), {
  left: 12,
  top: 34
});

// state 移行
assert.deepEqual(normalizeYtscfState(undefined), {
  superChatEnabled: true,
  chatEnabled: true,
  hideTextMessages: false,
  ledgerEnabled: false,
  readingApiEnabled: false
});
assert.deepEqual(normalizeYtscfState({ enabled: true }), {
  superChatEnabled: true,
  chatEnabled: true,
  hideTextMessages: false,
  ledgerEnabled: false,
  readingApiEnabled: false
});
assert.deepEqual(normalizeYtscfState({ enabled: false }), {
  superChatEnabled: false,
  chatEnabled: false,
  hideTextMessages: false,
  ledgerEnabled: false,
  readingApiEnabled: false
});
assert.deepEqual(
  normalizeYtscfState({ superChatEnabled: true, chatEnabled: false }),
  {
    superChatEnabled: true,
    chatEnabled: false,
    hideTextMessages: false,
    ledgerEnabled: false,
    readingApiEnabled: false
  }
);
assert.deepEqual(
  normalizeYtscfState({ superChatEnabled: false, chatEnabled: true }),
  {
    superChatEnabled: false,
    chatEnabled: true,
    hideTextMessages: false,
    ledgerEnabled: false,
    readingApiEnabled: false
  }
);
assert.deepEqual(
  normalizeYtscfState({
    superChatEnabled: true,
    chatEnabled: true,
    hideTextMessages: true
  }),
  {
    superChatEnabled: true,
    chatEnabled: true,
    hideTextMessages: true,
    ledgerEnabled: false,
    readingApiEnabled: false
  }
);
assert.deepEqual(
  normalizeYtscfState({ hideTextMessages: "yes", ledgerEnabled: false }),
  {
    superChatEnabled: true,
    chatEnabled: true,
    hideTextMessages: false,
    ledgerEnabled: false,
    readingApiEnabled: false
  }
);
assert.deepEqual(
  normalizeYtscfState({ ledgerEnabled: true }),
  {
    superChatEnabled: true,
    chatEnabled: true,
    hideTextMessages: false,
    ledgerEnabled: true,
    readingApiEnabled: false
  }
);
assert.deepEqual(
  normalizeYtscfState({ readingApiEnabled: true }),
  {
    superChatEnabled: true,
    chatEnabled: true,
    hideTextMessages: false,
    ledgerEnabled: false,
    readingApiEnabled: true
  }
);
// 新キーがあるときは旧 enabled を無視
assert.deepEqual(
  normalizeYtscfState({
    enabled: false,
    superChatEnabled: true,
    chatEnabled: true
  }),
  {
    superChatEnabled: true,
    chatEnabled: true,
    hideTextMessages: false,
    ledgerEnabled: false,
    readingApiEnabled: false
  }
);
assert.equal(
  isAnyTargetEnabled({
    superChatEnabled: false,
    chatEnabled: false,
    hideTextMessages: true,
    ledgerEnabled: false,
    readingApiEnabled: false
  }),
  false
);
assert.equal(
  isAnyTargetEnabled({
    superChatEnabled: true,
    chatEnabled: false,
    hideTextMessages: false,
    ledgerEnabled: false,
    readingApiEnabled: false
  }),
  true
);

assert.deepEqual(
  withToggledHideTextMessages({
    superChatEnabled: true,
    chatEnabled: true,
    hideTextMessages: false
  }),
  {
    superChatEnabled: true,
    chatEnabled: true,
    hideTextMessages: true,
    ledgerEnabled: false,
    readingApiEnabled: false
  }
);
assert.deepEqual(
  withToggledHideTextMessages({ hideTextMessages: true }),
  {
    superChatEnabled: true,
    chatEnabled: true,
    hideTextMessages: false,
    ledgerEnabled: false,
    readingApiEnabled: false
  }
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

// same-origin chatframe 文書を横断（Orion で iframe に script が刺さらないとき用）
{
  const chatDoc = {
    querySelectorAll(sel) {
      return String(sel).includes("iframe") ? [] : [];
    }
  };
  const frame = {
    contentDocument: chatDoc
  };
  const watchDoc = {
    querySelectorAll(sel) {
      const s = String(sel);
      if (s.includes("chatframe") || s.includes("live_chat")) return [frame];
      return [];
    }
  };
  const docs = listAccessibleChatDocuments(/** @type {any} */ (watchDoc));
  assert.equal(docs.length, 2);
  assert.equal(docs[0], watchDoc);
  assert.equal(docs[1], chatDoc);
}

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

assert.equal(parseTimecodeToSeconds("1:02:03"), 3723);
assert.equal(parseTimecodeToSeconds("12:34"), 754);
assert.equal(parseTimecodeToSeconds("bad"), null);
assert.equal(
  extractVideoIdFromHref("https://www.youtube.com/live_chat?v=abcDEF12_-x"),
  "abcDEF12_-x"
);
assert.equal(
  extractVideoIdFromHref("https://www.youtube.com/watch?v=abcDEF12_-x&t=9"),
  "abcDEF12_-x"
);
assert.equal(
  resolveVideoId({
    href: "https://www.youtube.com/live_chat_replay?continuation=xxx",
    allowHtmlScan: true,
    doc: {
      querySelector: () => null,
      documentElement: { innerHTML: '"videoId":"ocNUY2lhY58"' }
    }
  }),
  "ocNUY2lhY58"
);

{
  const renderer = {
    getAttribute(name) {
      return name === "id" ? "sc-1" : null;
    },
    querySelector(sel) {
      if (sel === "#author-name") return { textContent: "太郎" };
      if (sel === "#purchase-amount") return { textContent: "¥500" };
      if (sel === "#message") {
        return {
          setAttribute() {},
          getAttribute: () => null,
          cloneNode: () => ({
            querySelectorAll: () => [],
            textContent: "配信ありがとう"
          }),
          textContent: "配信ありがとう"
        };
      }
      if (sel === "#timestamp") return { textContent: "0:01:05" };
      return null;
    }
  };
  const entry = parsePaidMessageRenderer(renderer, {
    videoId: "vid1",
    now: 1000
  });
  assert.ok(entry);
  assert.equal(entry.id, "sc-1");
  assert.equal(entry.author, "太郎");
  assert.equal(entry.amount, "¥500");
  assert.equal(entry.message, "配信ありがとう");
  assert.equal(entry.videoTimecode, "0:01:05");
  assert.equal(entry.videoTimecodeSec, 65);
  assert.equal(entry.authorPhotoUrl, null);

  const tickerRoot = {
    querySelectorAll(sel) {
      if (String(sel).includes("ticker-paid-message")) {
        return [
          {
            getAttribute: (n) => (n === "id" ? "tick-1" : null),
            querySelector: (s) =>
              s === "#author-name" ? { textContent: "@yoko7936" } : null
          }
        ];
      }
      return [];
    }
  };
  const tickers = collectPaidMessageRenderers(tickerRoot);
  assert.equal(tickers.length, 1);
  const tickEntry = parsePaidMessageRenderer(tickers[0], { videoId: "vid1" });
  assert.equal(tickEntry?.author, "@yoko7936");

  const hiddenTicker = {
    getAttribute: (n) => (n === "id" ? "tick-shadow" : null),
    querySelector: () => null,
    textContent: "@KiyoM0917"
  };
  const shadowRoot = {
    querySelectorAll(sel) {
      if (String(sel).includes("ticker-paid-message")) return [hiddenTicker];
      if (sel === "*") return [];
      return [];
    }
  };
  const shadowHost = {
    querySelectorAll(sel) {
      if (sel === "*") return [{ shadowRoot }];
      return [];
    }
  };
  assert.equal(queryYtDeepAll(shadowHost, TICKER_PAID_RENDERER_SELECTOR).length, 1);
  const shadowEntry = parsePaidMessageRenderer(hiddenTicker, { videoId: "vid1" });
  assert.equal(shadowEntry?.author, "@KiyoM0917");

  const idHash = buildLedgerEntryId("", "a", "¥1", "hi", null);
  assert.match(idHash, /^h[0-9a-f]+$/);

  const merged = mergeLedgerItems([entry], [entry, { ...entry, id: "sc-2" }]);
  assert.equal(merged.added, 1);
  assert.equal(merged.items.length, 2);

  const { store, added } = upsertLedgerEntries({ byVideo: {} }, "vid1", [
    entry
  ]);
  assert.equal(added, 1);
  assert.equal(store.byVideo.vid1.items.length, 1);

  const readEntry = { ...entry, readAt: 12345 };
  const { store: readStore, changed, readAt } = toggleLedgerEntryRead(
    upsertLedgerEntries({ byVideo: {} }, "vid1", [readEntry]).store,
    "vid1",
    readEntry.id
  );
  assert.equal(changed, true);
  assert.equal(readAt, null);
  assert.equal(readStore.byVideo.vid1.items[0].readAt, null);
  const toggled = toggleLedgerEntryRead(readStore, "vid1", readEntry.id);
  assert.equal(toggled.changed, true);
  assert.ok(toggled.readAt > 0);
  assert.equal(toggled.store.byVideo.vid1.items[0].readAt, toggled.readAt);

  assert.equal(formatFetchAllSuperChatsStatus([]), "スパチャはありませんでした");
  assert.equal(
    formatFetchAllSuperChatsStatus([entry], 1),
    "完了: 1 件取得（新規 1）"
  );
  assert.equal(formatFetchAllSuperChatsStatus([entry, entry], 0), "完了: 2 件取得");

  const mergedRead = mergeLedgerItems(
    [{ ...entry, id: "sc-r", readAt: 999 }],
    [{ ...entry, id: "sc-r", authorPhotoUrl: "https://x/y.png" }]
  );
  assert.equal(mergedRead.items[0].readAt, 999);

  assert.equal(sanitizeLedgerAmount("0 0"), "");
  assert.equal(sanitizeLedgerAmount("¥20,000"), "¥20,000");

  const junkTicker = {
    getAttribute: (n) => (n === "id" ? "tick-junk" : null),
    querySelector: (s) => {
      if (s === "#author-name") return { textContent: "@力のないパパ" };
      if (s === "#purchase-amount") return { textContent: "0 0" };
      return null;
    },
    textContent: "@力のないパパ 0 0"
  };
  const junkEntry = parsePaidMessageRenderer(junkTicker, { videoId: "vid1" });
  assert.equal(junkEntry?.author, "@力のないパパ");
  assert.equal(junkEntry?.amount, "");
  assert.equal(junkEntry?.message, "");

  const polymerTicker = {
    data: {
      showItemEndpoint: {
        showLiveChatItemEndpoint: {
          renderer: {
            liveChatPaidMessageRenderer: {
              id: "paid-polymer",
              authorName: { simpleText: "力のないパパ" },
              purchaseAmountText: { simpleText: "¥20,000" },
              message: {
                runs: [{ text: "いつも配信ありがとうございます。" }]
              },
              bodyBackgroundColor: 0xffe62117,
              headerBackgroundColor: 0xffd00000
            }
          }
        }
      }
    },
    getAttribute: (n) => (n === "id" ? "tick-poly" : null),
    querySelector: (s) =>
      s === "#author-name" ? { textContent: "@力のないパパ" } : null,
    textContent: "@力のないパパ"
  };
  const polyEntry = parsePaidMessageRenderer(polymerTicker, { videoId: "vid1" });
  assert.equal(polyEntry?.amount, "¥20,000");
  assert.equal(polyEntry?.message, "いつも配信ありがとうございます。");
  assert.equal(polyEntry?.colorHex, "#e62117");
  assert.equal(polyEntry?.headerColorHex, "#d00000");

  const litTicker = {
    showItemEndpoint: polymerTicker.data.showItemEndpoint,
    getAttribute: (n) => (n === "id" ? "tick-lit" : null),
    querySelector: () => null,
    textContent: "@力のないパパ"
  };
  const litEntry = parsePaidMessageRenderer(litTicker, { videoId: "vid1" });
  assert.equal(litEntry?.amount, "¥20,000");
  assert.equal(litEntry?.message, "いつも配信ありがとうございます。");

  const upgraded = mergeLedgerItems(
    [
      {
        id: "tick-stub",
        author: "@力のないパパ",
        amount: "",
        message: "",
        observedAt: 1,
        videoTimecode: null,
        videoTimecodeSec: null,
        videoId: "vid1"
      }
    ],
    [polyEntry]
  );
  assert.equal(upgraded.added, 0);
  assert.equal(upgraded.changed, true);
  assert.equal(upgraded.items.length, 1);
  assert.equal(upgraded.items[0].id, "tick-stub");
  assert.equal(upgraded.items[0].amount, "¥20,000");
  assert.equal(upgraded.items[0].message, "いつも配信ありがとうございます。");

  const mockLiveFrame = {
    querySelector: (sel) => {
      if (String(sel).includes("ytp-live-badge")) return null;
      if (String(sel).includes("live_chat") || String(sel).includes("chatframe")) {
        return {
          src: "https://www.youtube.com/live_chat?continuation=abc",
          getAttribute: () => "https://www.youtube.com/live_chat?continuation=abc",
          contentDocument: null
        };
      }
      return null;
    }
  };
  // duration もバッジも無い → live_chat のみなら配信中寄り
  assert.equal(detectIsLiveNow(mockLiveFrame), true);
  assert.equal(detectIsChatReplayPage(mockLiveFrame), false);

  const mockEmptySrcLive = {
    querySelector: (sel) => {
      if (String(sel).includes("ytp-live-badge")) return null;
      if (String(sel).includes("live_chat") || String(sel).includes("chatframe")) {
        return {
          src: "",
          getAttribute: () => "",
          contentDocument: {
            location: { href: "https://www.youtube.com/live_chat?continuation=xyz" }
          }
        };
      }
      return null;
    }
  };
  assert.equal(detectIsLiveNow(mockEmptySrcLive), true);
  assert.equal(detectIsChatReplayPage(mockEmptySrcLive), false);

  // 終了後アーカイブ: chatframe が live_chat のままでも、有限 duration なら配信中ではない
  const mockEndedArchive = {
    querySelector: (sel) => {
      if (String(sel).includes("ytp-live-badge")) return null;
      if (sel === "video.html5-main-video" || sel === "video") {
        return { duration: 3723 };
      }
      if (String(sel).includes("live_chat") || String(sel).includes("chatframe")) {
        return {
          src: "https://www.youtube.com/live_chat?continuation=ended",
          getAttribute: () =>
            "https://www.youtube.com/live_chat?continuation=ended",
          contentDocument: null
        };
      }
      return null;
    }
  };
  assert.equal(detectIsLiveNow(mockEndedArchive), false);

  const mockLiveBadge = {
    querySelector: (sel) => {
      if (String(sel).includes("ytp-live-badge")) return { disabled: false };
      return null;
    }
  };
  assert.equal(detectIsLiveNow(mockLiveBadge), true);

  const pageDtoEntry = ledgerEntryFromPageDto(
    {
      id: "paid-clickless",
      author: "力のないパパ",
      amount: "¥20,000",
      message: "いつも配信ありがとうございます。",
      colorHex: "#e62117",
      headerColorHex: "#d00000"
    },
    "vid1",
    2000
  );
  assert.ok(pageDtoEntry);
  assert.equal(pageDtoEntry.amount, "¥20,000");
  assert.equal(pageDtoEntry.message, "いつも配信ありがとうございます。");
  assert.equal(pageDtoEntry.colorHex, "#e62117");
  assert.equal(pageDtoEntry.headerColorHex, "#d00000");
  const clicklessMerged = mergeLedgerItems([junkEntry], [pageDtoEntry]);
  assert.equal(clicklessMerged.items.length, 1);
  assert.equal(clicklessMerged.items[0].message, "いつも配信ありがとうございます。");
  assert.equal(clicklessMerged.items[0].amount, "¥20,000");

  const csv = ledgerItemsToCsv(store.byVideo.vid1.items);
  assert.match(csv, /author/);
  assert.match(csv, /太郎/);
  assert.match(csv, /0:01:05/);

  const ranged = filterLedgerByTimecodeRange(
    [
      { ...entry, id: "a", videoTimecodeSec: 10 },
      { ...entry, id: "b", videoTimecodeSec: 70 },
      { ...entry, id: "c", videoTimecodeSec: null, videoTimecode: null }
    ],
    60,
    80
  );
  assert.equal(ranged.length, 1);
  assert.equal(ranged[0].id, "b");

  assert.equal(parseLedgerAmountNumber("¥1,000"), 1000);
  assert.equal(parseLedgerAmountNumber("$12.34"), 12.34);
  assert.equal(parseLedgerAmountNumber("￥500"), 500);
  const scItems = [
    { ...entry, id: "s1", author: "太郎", message: "応援してます", amount: "¥500" },
    { ...entry, id: "s2", author: "花子", message: "こんにちは", amount: "¥2000" },
    { ...entry, id: "s3", author: "次郎", message: "500円分", amount: "$10" }
  ];
  assert.equal(filterLedgerBySearch(scItems, { query: "太郎" }).map((x) => x.id).join(), "s1");
  assert.equal(
    filterLedgerBySearch(scItems, { query: "応援", field: "message" }).map((x) => x.id).join(),
    "s1"
  );
  assert.equal(
    filterLedgerBySearch(scItems, { query: "500", field: "amount" }).map((x) => x.id).join(),
    "s1"
  );
  assert.equal(
    filterLedgerBySearch(scItems, { query: "500", field: "all" }).map((x) => x.id).sort().join(),
    "s1,s3"
  );
  assert.equal(
    filterLedgerBySearch(scItems, { amountMin: 1000, amountMax: 3000 }).map((x) => x.id).join(),
    "s2"
  );
}

assert.equal(youtubeColorIntToHex(0xff1565c0), "#1565c0");
assert.equal(cssColorToHex("rgba(230, 33, 23, 1)"), "#e62117");
assert.equal(cssColorToHex("#E62117"), "#e62117");
assert.deepEqual(superChatColorsFromAmount("¥20,000"), {
  colorHex: "#e62117",
  headerColorHex: "#d00000"
});
assert.deepEqual(superChatColorsFromAmount("¥500"), {
  colorHex: "#1de9b6",
  headerColorHex: "#00bfa5"
});
assert.deepEqual(superChatColorsFromAmount("$10"), {
  colorHex: "#ffca28",
  headerColorHex: "#ffb300"
});
assert.equal(resolveYtScColors({ amount: "¥20000" }).body, "#e62117");
assert.equal(resolveYtScColors({ amount: "¥20000" }).header, "#d00000");
assert.equal(resolveYtScColors({ colorHex: "#e62117" }).fg, "#ffffff");
assert.equal(resolveYtScColors({ colorHex: "#ffca28" }).fg, "#111111");
assert.equal(runsToPlainText([{ text: "こん" }, { text: "にちは" }]), "こんにちは");
{
  const entry = paidRendererJsonToEntry(
    {
      id: "paid-x",
      authorName: { simpleText: "花子" },
      purchaseAmountText: { simpleText: "¥1000" },
      message: { runs: [{ text: "応援" }] },
      timestampText: { simpleText: "1:02:03" },
      bodyBackgroundColor: 0xff1565c0,
      headerBackgroundColor: 0xff0d47a1,
      authorPhoto: {
        thumbnails: [
          { url: "https://yt3.ggpht.com/small.jpg", width: 32 },
          { url: "https://yt3.ggpht.com/big.jpg", width: 88 }
        ]
      }
    },
    "vidZ"
  );
  assert.ok(entry);
  assert.equal(entry.author, "花子");
  assert.equal(entry.videoTimecodeSec, 3723);
  assert.equal(entry.colorHex, "#1565c0");
  assert.equal(entry.headerColorHex, "#0d47a1");
  assert.equal(entry.authorPhotoUrl, "https://yt3.ggpht.com/big.jpg");

  const fromActions = extractPaidEntriesFromActions(
    [
      {
        replayChatItemAction: {
          actions: [
            {
              addChatItemAction: {
                item: {
                  liveChatPaidMessageRenderer: {
                    id: "paid-y",
                    authorName: { simpleText: "次郎" },
                    purchaseAmountText: { simpleText: "¥200" },
                    message: { runs: [{ text: "Hi" }] },
                    timestampText: { simpleText: "0:10" }
                  }
                }
              }
            }
          ]
        }
      }
    ],
    "vidZ"
  );
  assert.equal(fromActions.length, 1);
  assert.equal(fromActions[0].author, "次郎");
}

const pageListeners = [];
const mockPageWin = {
  postMessage(data) {
    if (data?.type !== PAGE_PAID_REQUEST_TYPE) return;
    queueMicrotask(() => {
      for (const fn of pageListeners) {
        fn({
          source: mockPageWin,
          data: {
            type: PAGE_PAID_RESULT_TYPE,
            id: data.id,
            entries: [
              {
                id: "paid-bridge",
                author: "太郎",
                amount: "¥500",
                message: "クリックなし本文"
              }
            ]
          }
        });
      }
    });
  },
  addEventListener(type, fn) {
    if (type === "message") pageListeners.push(fn);
  },
  removeEventListener(type, fn) {
    const i = pageListeners.indexOf(fn);
    if (i >= 0) pageListeners.splice(i, 1);
  }
};
const bridged = await requestPagePaidDtos(mockPageWin);
assert.equal(bridged.length, 1);
assert.equal(bridged[0].message, "クリックなし本文");

{
  const replayFirst = findLiveChatContinuation({
    liveChatReplayContinuationData: { continuation: "replay-tok" },
    reloadContinuationData: { continuation: "live-tok" }
  });
  assert.equal(replayFirst?.continuation, "replay-tok");
  assert.equal(replayFirst?.isReplay, true);

  const liveOnly = findLiveChatContinuation({
    reloadContinuationData: { continuation: "live-tok" }
  });
  assert.equal(liveOnly?.isReplay, false);

  const fromSelector = extractReplayBeginningContinuation({
    header: {
      liveChatHeaderRenderer: {
        viewSelector: {
          sortFilterSubMenuRenderer: {
            subMenuItems: [
              {
                title: "上位のチャット",
                continuation: {
                  reloadContinuationData: { continuation: "top-tok" }
                }
              },
              {
                title: "ライブチャット",
                continuation: {
                  reloadContinuationData: { continuation: "live-all-tok" }
                }
              }
            ]
          }
        }
      }
    }
  });
  assert.equal(fromSelector, "live-all-tok");

  assert.equal(
    maxReplayOffsetMs({
      replayChatItemAction: { videoOffsetTimeMsec: "123000", actions: [] }
    }),
    123000
  );
  assert.equal(
    shouldStopLiveReplayFetch({
      untilMs: 3_600_000,
      playerOffsetMs: 3_599_000,
      nextIsReplay: true,
      nextContinuation: "n",
      currentContinuation: "c"
    }),
    true
  );
  assert.equal(
    shouldStopLiveReplayFetch({
      untilMs: 3_600_000,
      playerOffsetMs: 1000,
      nextIsReplay: false,
      nextContinuation: "live-now",
      currentContinuation: "replay"
    }),
    true
  );
  assert.equal(
    shouldStopLiveReplayFetch({
      untilMs: 3_600_000,
      playerOffsetMs: 1000,
      nextIsReplay: true,
      nextContinuation: "n",
      currentContinuation: "c"
    }),
    false
  );

  const boot = readChatBootstrapFromHtml(
    `ytInitialData = ${JSON.stringify({
      liveChatReplayContinuationData: { continuation: "html-replay" }
    })};`
  );
  assert.equal(boot.continuation, "html-replay");
  assert.equal(boot.isReplay, true);
}

assert.equal(sanitizeFilenamePart('a/b:c*'), "a_b_c_");
assert.match(buildScCardFilename({
  videoTimecode: "1:02:03",
  author: "太郎",
  amount: "¥500",
  message: "",
  id: "1",
  observedAt: 0,
  videoTimecodeSec: 3723,
  videoId: "v"
}), /^sc_1_02_03_/);
assert.equal(resolveCardColors("#1565c0").fg, "#ffffff");
assert.equal(resolveCardColors("#ffca28").fg, "#111111");
assert.equal(CARD_W, 1280);
assert.equal(shadeHex("#ffffff", 0.5), "#808080");
assert.equal(
  resolveYtScColors({
    colorHex: "#1565c0",
    headerColorHex: "#0d47a1"
  }).header,
  "#0d47a1"
);
assert.equal(
  resolveYtScColors({ colorHex: "#1565c0" }).fg,
  "#ffffff"
);

assert.equal(escapeScHtml("<b>x</b>"), "&lt;b&gt;x&lt;/b&gt;");
assert.deepEqual(
  parseFuriganaRuns(
    `<span class="yt-furigana-word"><ruby>配信<rt>はいしん</rt></ruby></span>ありがとう`
  ),
  [
    { surface: "配信", reading: "はいしん" },
    { surface: "ありがとう", reading: "" }
  ]
);
assert.deepEqual(parseFuriganaRuns("ただの本文"), [
  { surface: "ただの本文", reading: "" }
]);

const previewHtml = buildScPreviewCardHtml(
  {
    id: "1",
    author: "太郎",
    amount: "¥500",
    message: "配信ありがとう",
    colorHex: "#1565c0",
    headerColorHex: "#0d47a1",
    videoTimecode: "1:02",
    observedAt: 0,
    videoId: "v"
  },
  {
    authorHtml: `<ruby>太郎<rt>たろう</rt></ruby>`,
    messageHtml: `<ruby>配信<rt>はいしん</rt></ruby>ありがとう`
  }
);
assert.match(previewHtml, /ytscf-sc-preview__ytcard/);
assert.match(previewHtml, /<ruby>太郎<rt>たろう<\/rt><\/ruby>/);
assert.match(
  previewHtml,
  /<ruby>配信<rt>はいしん<\/rt><\/ruby>\u200B?ありがとう/
);
assert.match(previewHtml, /¥500/);
assert.match(previewHtml, /1:02/);
assert.match(previewHtml, /#0d47a1/);

const mockCtx = {
  font: "24px sans",
  measureText(s) {
    return { width: [...String(s)].length * 10 };
  }
};
const rubyLines = layoutRubyRuns(
  mockCtx,
  [
    { surface: "配信", reading: "はいしん" },
    { surface: "ありがとう", reading: "" }
  ],
  1000
);
assert.equal(rubyLines.length, 1);
assert.equal(rubyLines[0][0].reading, "はいしん");
assert.equal(rubyLines[0][1].surface, "ありがとう");

assert.deepEqual(wrapPlainTextLines(mockCtx, "配信ありがとう", 100), [
  "配信ありがとう"
]);
assert.deepEqual(wrapPlainTextLines(mockCtx, "配信ありがとう", 50), [
  "配信",
  "ありがとう"
]);

const rubyWrap = layoutRubyRuns(
  mockCtx,
  [{ surface: "配信ありがとうございます", reading: "" }],
  60
);
assert.deepEqual(
  rubyWrap.map((row) => row.map((c) => c.surface).join("")),
  ["配信", "ありがとう", "ございます"]
);

const longPreview = buildScPreviewCardHtml(
  {
    id: "2",
    author: "花子",
    amount: "¥1000",
    message: "配信ありがとうございます。これからもよろしくお願いします！",
    colorHex: "#1565c0",
    observedAt: 0,
    videoId: "v"
  },
  {}
);
assert.ok(longPreview.includes("\u200B"), "preview should use BudouX ZWSP");
assert.ok(
  !longPreview.includes("ございま\u200Bす"),
  "must not split BudouX phrase ございます。"
);

console.log("test-superchat-furigana: ok");
