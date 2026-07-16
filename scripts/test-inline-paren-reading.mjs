import assert from "node:assert/strict";
import {
  extractInlineParenReadings,
  applyInlineParenReadings
} from "../src/inline-paren-reading.js";
import { buildFuriganaHtml } from "../src/furigana.js";

{
  const { text, spans } = extractInlineParenReadings("音（ね）が聞こえる");
  assert.equal(text, "音が聞こえる");
  assert.equal(spans.length, 1);
  assert.equal(spans[0].surface, "音");
  assert.equal(spans[0].reading, "ね");
}

{
  const { text, spans } = extractInlineParenReadings("今日（きょう）は凄（すご）い");
  assert.equal(text, "今日は凄い");
  assert.equal(spans.length, 2);
  assert.equal(spans[0].surface, "今日");
  assert.equal(spans[0].reading, "きょう");
  assert.equal(spans[1].surface, "凄");
  assert.equal(spans[1].reading, "すご");
}

{
  const { text, spans } = extractInlineParenReadings("音(ね)です");
  assert.equal(text, "音です");
  assert.equal(spans[0].reading, "ね");
}

{
  const { text, spans } = extractInlineParenReadings("普通の文");
  assert.equal(text, "普通の文");
  assert.equal(spans.length, 0);
}

{
  const { spans } = extractInlineParenReadings("音（ね）がする");
  const tokens = applyInlineParenReadings(
    [
      { surface_form: "音", reading: "オト" },
      { surface_form: "が", reading: "ガ" },
      { surface_form: "する", reading: "スル" }
    ],
    spans
  );
  assert.equal(tokens[0].reading, "ね");
  assert.equal(tokens[0]._inlineParen, true);
  assert.equal(tokens[1].reading, "ガ");
}

{
  const { spans } = extractInlineParenReadings("今日（きょう）は");
  const tokens = applyInlineParenReadings(
    [
      { surface_form: "今", reading: "コン" },
      { surface_form: "日", reading: "ニチ" },
      { surface_form: "は", reading: "ハ" }
    ],
    spans
  );
  assert.equal(tokens[0].surface_form, "今日");
  assert.equal(tokens[0].reading, "きょう");
  assert.equal(tokens[1].surface_form, "は");
}

const html = buildFuriganaHtml("音（ね）がする", () => [
  { surface_form: "音", reading: "オト" },
  { surface_form: "が", reading: "ガ" },
  { surface_form: "する", reading: "スル" }
]);
assert.ok(html.includes("<rt>ね</rt>"));
assert.equal(html.includes("（ね）"), false);
assert.ok(html.includes("data-surface=\"音\""));

console.log("Inline paren reading tests passed.");
