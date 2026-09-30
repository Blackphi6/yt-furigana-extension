// ライブ中スパチャ取得: get_live_chat 応答の抽出と台帳の同時書き込み
import assert from "node:assert/strict";

// chrome.storage を最小限モック（書き込みを非同期にして競合を再現しやすくする）
const mem = {};
const area = {
  async get(key) {
    await new Promise((r) => setTimeout(r, 1));
    return { [key]: structuredClone(mem[key]) };
  },
  async set(obj) {
    await new Promise((r) => setTimeout(r, 3));
    Object.assign(mem, structuredClone(obj));
  }
};
globalThis.chrome = { storage: { local: area } };

const {
  extractPaidDtosFromLiveChatJson,
  isLiveChatDataUrl
} = await import("../extensions/yt-superchat-furigana/src/live-chat-paid.js");
const { ingestPagePaidDtos, loadLedgerStore } = await import(
  "../extensions/yt-superchat-furigana/src/sc-ledger.js"
);

const paid = (id, name, amount, text) => ({
  id,
  timestampUsec: "1790000000000000",
  authorName: { simpleText: name },
  authorPhoto: { thumbnails: [{ url: "https://yt3.ggpht.com/a=s32" }, { url: "https://yt3.ggpht.com/a=s64" }] },
  purchaseAmountText: { simpleText: amount },
  message: { runs: [{ text }, { emoji: { emojiId: "x" } }, { text: "！" }] },
  headerBackgroundColor: 4278239141,
  bodyBackgroundColor: 4280150454
});

const response = {
  continuationContents: {
    liveChatContinuation: {
      actions: [
        { addChatItemAction: { item: { liveChatTextMessageRenderer: { id: "t1", message: { runs: [{ text: "こんにちは" }] } } } } },
        { addChatItemAction: { item: { liveChatPaidMessageRenderer: paid("sc1", "@alice", "¥500", "応援") } } },
        {
          addLiveChatTickerItemAction: {
            item: {
              liveChatTickerPaidMessageItemRenderer: {
                id: "sc1",
                showItemEndpoint: {
                  showLiveChatItemEndpoint: {
                    renderer: { liveChatPaidMessageRenderer: paid("sc1", "@alice", "¥500", "応援") }
                  }
                }
              }
            }
          }
        },
        {
          addChatItemAction: {
            item: {
              liveChatPaidStickerRenderer: {
                id: "st1",
                authorName: { simpleText: "@bob" },
                purchaseAmountText: { simpleText: "¥200" },
                sticker: { accessibility: { accessibilityData: { label: "ハート" } } },
                accessibility: { accessibilityData: { label: "ハート" } }
              }
            }
          }
        }
      ]
    }
  }
};

const dtos = extractPaidDtosFromLiveChatJson(response);
assert.equal(dtos.length, 2, "本文とティッカーの同一 SC は1件、ステッカーも拾う");
assert.deepEqual(
  { id: dtos[0].id, author: dtos[0].author, amount: dtos[0].amount, message: dtos[0].message },
  { id: "sc1", author: "@alice", amount: "¥500", message: "応援！" }
);
assert.equal(dtos[0].authorPhotoUrl, "https://yt3.ggpht.com/a=s64");
assert.equal(dtos[0].timestampUsec, "1790000000000000");
assert.match(dtos[0].colorHex, /^#[0-9a-f]{6}$/);
assert.equal(dtos[1].message, "ハート");
assert.deepEqual(extractPaidDtosFromLiveChatJson({ continuationContents: {} }), []);
assert.deepEqual(extractPaidDtosFromLiveChatJson(null), []);

assert.ok(isLiveChatDataUrl("https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false"));
assert.ok(isLiveChatDataUrl("/youtubei/v1/live_chat/get_live_chat_replay?x=1"));
assert.ok(!isLiveChatDataUrl("https://www.youtube.com/youtubei/v1/player"));

// 同時 push でも行が消えない（load→save の直列化）
await Promise.all(
  Array.from({ length: 20 }, (_, i) =>
    ingestPagePaidDtos([{ ...dtos[0], id: `sc-${i}`, author: `@u${i}` }], "vid1")
  )
);
const store = await loadLedgerStore();
assert.equal(store.byVideo.vid1.items.length, 20, "並行書き込みで欠落しない");
assert.equal(store.byVideo.vid1.items[0].observedAt, 1790000000000, "timestampUsec を観測時刻に");

console.log("test-live-chat-paid: ok");
