/**
 * reading-api 永続キャッシュ / 楽観差し替えの単体テスト。
 */
import assert from "node:assert/strict";
import {
  normalizeReadingApiDiskCache,
  putReadingApiDiskCache,
  readingApiDiskEntryKey,
  serializeReadingApiDiskCache,
  shouldReplaceProvisionalFurigana,
  READING_API_DISK_CACHE_LIMIT
} from "../src/reading-api-cache.js";

assert.equal(
  readingApiDiskEntryKey("https://example.com/", "今日"),
  readingApiDiskEntryKey("https://example.com", "今日")
);

{
  const now = 1_700_000_000_000;
  const map = normalizeReadingApiDiskCache(
    {
      entries: [
        { key: "a", html: "<ruby>a</ruby>", ts: now },
        { key: "old", html: "x", ts: now - 30 * 24 * 60 * 60 * 1000 },
        { key: "", html: "no" },
        { key: "b", html: "", ts: now }
      ]
    },
    { now }
  );
  assert.equal(map.size, 1);
  assert.equal(map.get("a")?.html, "<ruby>a</ruby>");
}

{
  const map = new Map();
  for (let i = 0; i < READING_API_DISK_CACHE_LIMIT + 5; i += 1) {
    putReadingApiDiskCache(map, `k${i}`, `h${i}`, { now: i });
  }
  assert.ok(map.size <= READING_API_DISK_CACHE_LIMIT);
  assert.equal(map.has("k0"), false);
  assert.ok(map.has(`k${READING_API_DISK_CACHE_LIMIT + 4}`));
}

{
  const map = putReadingApiDiskCache(new Map(), "k", "<b>1</b>", { now: 10 });
  const raw = serializeReadingApiDiskCache(map);
  const again = normalizeReadingApiDiskCache(raw, { now: 10 });
  assert.equal(again.get("k")?.html, "<b>1</b>");
}

assert.equal(shouldReplaceProvisionalFurigana(null, "<a>"), true);
assert.equal(shouldReplaceProvisionalFurigana("<a>", "<a>"), false);
assert.equal(shouldReplaceProvisionalFurigana("<a>", "<b>"), true);
assert.equal(shouldReplaceProvisionalFurigana("<a>", ""), false);

console.log("test-reading-api-cache: ok");
