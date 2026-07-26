/**
 * 書き出し用の字幕取得（手動日本語字幕のみ・連打ガード）のテスト。
 * ネットワークには一切出ない。fetch は必ずモックを渡す。
 */
import {
  EXPORT_MIN_INTERVAL_MS,
  describeTrack,
  fetchJapaneseCaptionCuesForExport,
  getVideoTitle,
  hasOnlyAsrJapanese,
  pickManualJapaneseTrack,
  resetExportFetchGuards
} from "../src/caption-export.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

async function expectReject(promise, pattern, label) {
  try {
    await promise;
  } catch (error) {
    assert(
      pattern.test(error.message),
      `${label}: message did not match ${pattern}\n  actual: ${error.message}`
    );
    return error;
  }
  throw new Error(`${label}: expected a rejection`);
}

// --- トラック選択 ---
const manualTrack = {
  languageCode: "ja",
  baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=ja",
  name: { simpleText: "日本語" }
};
const asrTrack = {
  languageCode: "ja",
  kind: "asr",
  baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=ja&kind=asr",
  name: { simpleText: "日本語（自動生成）" }
};
const englishTrack = { languageCode: "en", baseUrl: "https://example.test/en" };

assertEqual(pickManualJapaneseTrack([asrTrack, manualTrack]), manualTrack, "manual wins over asr");
assertEqual(pickManualJapaneseTrack([asrTrack]), null, "asr only yields null");
assertEqual(pickManualJapaneseTrack([englishTrack]), null, "english only yields null");
assertEqual(pickManualJapaneseTrack([]), null, "empty yields null");
assertEqual(pickManualJapaneseTrack(null), null, "null input is safe");

assert(hasOnlyAsrJapanese([asrTrack, englishTrack]), "asr-only detected");
assert(!hasOnlyAsrJapanese([manualTrack, asrTrack]), "manual present is not asr-only");
assert(!hasOnlyAsrJapanese([englishTrack]), "no japanese is not asr-only");

assertEqual(describeTrack(manualTrack), "日本語", "describeTrack simpleText");
assertEqual(
  describeTrack({ languageCode: "ja", name: { runs: [{ text: "日本" }, { text: "語" }] } }),
  "日本語",
  "describeTrack runs"
);
assertEqual(describeTrack({ languageCode: "ja" }), "ja", "describeTrack fallback");
assertEqual(getVideoTitle({ videoDetails: { title: "テスト動画" } }), "テスト動画", "video title");
assertEqual(getVideoTitle(null), "", "video title fallback");

// --- モック fetch ---
const JSON3_BODY = JSON.stringify({
  events: [
    { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "移ろう街と逆に" }] },
    { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: "青のまま募る心" }] }
  ]
});

function makeFetch({ tracks, title = "テスト動画", timedTextStatus = 200 }) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/youtubei/v1/player")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            videoDetails: { title },
            captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } }
          };
        }
      };
    }
    if (String(url).includes("/api/timedtext")) {
      return {
        ok: timedTextStatus === 200,
        status: timedTextStatus,
        async text() {
          return timedTextStatus === 200 ? JSON3_BODY : "";
        }
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return { fetchImpl, calls };
}

// --- 正常系 ---
resetExportFetchGuards();
{
  const { fetchImpl, calls } = makeFetch({ tracks: [asrTrack, manualTrack] });
  const result = await fetchJapaneseCaptionCuesForExport("dQw4w9WgXcQ", { fetchImpl });

  assertEqual(result.videoId, "dQw4w9WgXcQ", "video id echoed");
  assertEqual(result.title, "テスト動画", "title returned");
  assertEqual(result.trackName, "日本語", "manual track name");
  assertEqual(result.cues.length, 2, "cue count");
  assertEqual(result.cues[0].text, "移ろう街と逆に", "first cue text");
  assertEqual(result.cues[0].startMs, 1000, "first cue start");

  // ASR トラックの URL は絶対に叩かない
  assert(
    !calls.some((url) => url.includes("kind=asr")),
    "asr track must never be fetched"
  );
  // 1 本の取得で player 1 回 + timedtext 1 回に収める
  assertEqual(calls.length, 2, `one video should cost 2 requests, got ${calls.length}`);
}

// --- 連打ガード ---
{
  const { fetchImpl, calls } = makeFetch({ tracks: [manualTrack] });
  await expectReject(
    fetchJapaneseCaptionCuesForExport("dQw4w9WgXcQ", { fetchImpl }),
    /お待ちください/,
    "second immediate fetch is blocked"
  );
  assertEqual(calls.length, 0, "blocked fetch must not touch the network");
}

// 間隔が空けば通る
{
  const { fetchImpl } = makeFetch({ tracks: [manualTrack] });
  const later = () => Date.now() + EXPORT_MIN_INTERVAL_MS + 1000;
  const result = await fetchJapaneseCaptionCuesForExport("dQw4w9WgXcQ", {
    fetchImpl,
    now: later
  });
  assertEqual(result.cues.length, 2, "fetch allowed after the interval");
}

// --- 自動生成のみ ---
resetExportFetchGuards();
{
  const { fetchImpl } = makeFetch({ tracks: [asrTrack] });
  await expectReject(
    fetchJapaneseCaptionCuesForExport("dQw4w9WgXcQ", { fetchImpl }),
    /自動生成/,
    "asr-only video is rejected with a clear reason"
  );
}

// --- 字幕なし ---
resetExportFetchGuards();
{
  const { fetchImpl } = makeFetch({ tracks: [englishTrack] });
  await expectReject(
    fetchJapaneseCaptionCuesForExport("dQw4w9WgXcQ", { fetchImpl }),
    /手動字幕を取得できませんでした/,
    "no japanese track is rejected"
  );
}

// --- 動画 ID の検証（不正なら通信しない） ---
resetExportFetchGuards();
{
  let touched = false;
  const fetchImpl = async () => {
    touched = true;
    throw new Error("should not be called");
  };
  await expectReject(
    fetchJapaneseCaptionCuesForExport("../../etc/passwd", { fetchImpl }),
    /動画 ID/,
    "invalid video id"
  );
  await expectReject(
    fetchJapaneseCaptionCuesForExport("", { fetchImpl }),
    /動画 ID/,
    "empty video id"
  );
  assert(!touched, "invalid ids must not reach the network");
}

// --- 429 は即停止し、以降の取得も止まる（この検査は状態を汚すので最後） ---
resetExportFetchGuards();
{
  const { fetchImpl } = makeFetch({ tracks: [manualTrack], timedTextStatus: 429 });
  await expectReject(
    fetchJapaneseCaptionCuesForExport("dQw4w9WgXcQ", { fetchImpl }),
    /429|制限/,
    "429 surfaces as a rate limit error"
  );

  resetExportFetchGuards();
  const fresh = makeFetch({ tracks: [manualTrack] });
  await expectReject(
    fetchJapaneseCaptionCuesForExport("dQw4w9WgXcQ", { fetchImpl: fresh.fetchImpl }),
    /制限されています/,
    "cooldown blocks the next fetch"
  );
  assertEqual(fresh.calls.length, 0, "cooldown must not touch the network");
}

console.log("test-caption-export: ok");
