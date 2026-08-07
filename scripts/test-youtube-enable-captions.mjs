/**
 * YouTube 日本語字幕オン補助の単体テスト（ネットワーク無し）
 */
import assert from "node:assert/strict";
import {
  describeCaptionEnsureResult,
  ensureYouTubeJapaneseCaptions,
  isJapaneseCaptionTrack,
  isServableCaptionTrack,
  pickJapaneseCaptionTrack
} from "../src/youtube-enable-captions.js";

assert.equal(isJapaneseCaptionTrack({ languageCode: "ja" }), true);
assert.equal(isJapaneseCaptionTrack({ languageCode: "en" }), false);
assert.equal(isJapaneseCaptionTrack({ displayName: "日本語 (自動生成)" }), true);
assert.equal(isServableCaptionTrack({ languageCode: "ja", is_servable: false }), false);
assert.equal(isServableCaptionTrack({ languageCode: "ja" }), true);

const picked = pickJapaneseCaptionTrack([
  { languageCode: "en", kind: "" },
  { languageCode: "ja", kind: "asr", displayName: "日本語 (自動生成)" },
  { languageCode: "ja", kind: "", displayName: "日本語" }
]);
assert.equal(picked?.kind, "");
assert.equal(picked?.displayName, "日本語");

assert.equal(
  pickJapaneseCaptionTrack([
    { languageCode: "ja", kind: "asr", is_servable: false },
    { languageCode: "en", kind: "" }
  ]),
  null
);

assert.equal(
  describeCaptionEnsureResult({ ok: false, reason: "japanese-unservable" }).includes(
    "配信できていません"
  ),
  true
);

// モックプレイヤー: 手動 ja をセットできること
const calls = [];
const mockPlayer = {
  classList: { contains: () => false },
  querySelector: () => null,
  getOption(module, key) {
    if (module === "captions" && key === "tracklist") {
      return [{ languageCode: "ja", kind: "", displayName: "日本語", is_servable: true }];
    }
    if (module === "captions" && key === "track") return {};
    return null;
  },
  setOption(module, key, value) {
    calls.push([module, key, value]);
  }
};

const enabled = ensureYouTubeJapaneseCaptions(mockPlayer);
assert.equal(enabled.ok, true);
assert.equal(enabled.reason, "enabled");
assert.equal(calls[0][0], "captions");
assert.equal(calls[0][1], "track");
assert.equal(calls[0][2].languageCode, "ja");

// セグメントが既にあれば触らない
const withSegs = {
  ...mockPlayer,
  querySelectorAll: (sel) => (String(sel).includes("ytp-caption-segment") ? [{}, {}] : [])
};
// countVisibleCaptionSegments uses document by default for second check — isolate by
// passing player that reports segments via querySelectorAll on itself only.
// ensure() checks player first then document; stub document segments by making player report >0
assert.equal(ensureYouTubeJapaneseCaptions(withSegs).reason, "segments-already-visible");

console.log("test-youtube-enable-captions: ok");
