/**
 * Unit tests for site/demo-quiz.js (low-confidence 3-choice helpers).
 */
import assert from "node:assert/strict";
import {
  QUIZ_CONFIDENCE_MAX,
  QUIZ_MAX_CHOICES,
  collectQuizItems,
  isQuizToken,
  pickQuizChoices,
  uniqueCandidates,
} from "../site/demo-quiz.js";

function ok(cond, msg) {
  assert.ok(cond, msg);
}

{
  const u = uniqueCandidates(
    { reading: "まちなか", candidates: ["まちなか", "まちじゅう", "まちなか"] },
    "まちなか"
  );
  ok(u.length === 2 && u[0] === "まちなか" && u[1] === "まちじゅう", "uniqueCandidates dedupes");
}

{
  const choices = pickQuizChoices(
    ["いちにち", "ついたち", "ひとひ", "いっぴ"],
    "いちにち",
    QUIZ_MAX_CHOICES
  );
  ok(choices.length === 3, "pickQuizChoices caps at 3");
  ok(choices[0] === "いちにち", "current reading stays first");
}

{
  ok(
    !isQuizToken({
      surface: "一日",
      reading: "いちにち",
      confidence: 0.99,
      source: "trust_pattern",
      candidates: ["いちにち", "ついたち"],
    }),
    "trust_pattern skipped"
  );
  ok(
    !isQuizToken({
      surface: "葛飾",
      reading: "かつしか",
      confidence: 1,
      source: "user_dict",
      candidates: ["かつしか"],
    }),
    "user_dict skipped"
  );
  ok(
    isQuizToken({
      surface: "町中",
      reading: "まちなか",
      confidence: 0.5,
      source: "base_engine",
      candidates: ["まちなか", "まちじゅう"],
    }),
    "low confidence + 2 cands is quiz"
  );
  ok(
    isQuizToken({
      surface: "方",
      reading: "ほう",
      confidence: QUIZ_CONFIDENCE_MAX,
      source: "cue",
      candidates: ["ほう", "かた"],
    }),
    "confidence at max boundary is quiz"
  );
  ok(
    !isQuizToken({
      surface: "方",
      reading: "ほう",
      confidence: QUIZ_CONFIDENCE_MAX + 0.01,
      source: "base_engine",
      candidates: ["ほう", "かた"],
    }),
    "above confidence max is skipped even for base_engine"
  );
  ok(
    !isQuizToken({
      surface: "東京",
      reading: "とうきょう",
      confidence: 0.9,
      source: "cue",
      candidates: ["とうきょう"],
    }),
    "single candidate skipped"
  );
}

{
  const text = "町中のカフェ。一日中。";
  const items = collectQuizItems(text, [
    {
      surface: "町中",
      span: [0, 2],
      reading: "まちなか",
      confidence: 0.48,
      source: "base_engine",
      candidates: ["まちなか", "まちじゅう", "ちょうちゅう"],
    },
    {
      surface: "一日",
      span: [8, 10],
      reading: "いちにち",
      confidence: 0.97,
      source: "trust_pattern",
      candidates: ["いちにち", "ついたち"],
    },
  ]);
  ok(items.length === 1, "collectQuizItems keeps only ambiguous");
  ok(items[0].surface === "町中", "first item is 町中");
  ok(items[0].choices.length === 3, "quiz offers 3 choices");
  ok(items[0].choices[0] === "まちなか", "current first among choices");
}

{
  const tokens = [
    {
      surface: "早",
      span: [0, 1],
      reading: "はや",
      confidence: 0.7,
      source: "cue",
      candidates: ["はや", "そう"],
    },
    {
      surface: "中",
      span: [2, 3],
      reading: "なか",
      confidence: 0.3,
      source: "base_engine",
      candidates: ["なか", "ちゅう"],
    },
    {
      surface: "行",
      span: [4, 5],
      reading: "い",
      confidence: 0.5,
      source: "base_engine",
      candidates: ["い", "ゆ", "こう"],
    },
  ];
  const items = collectQuizItems("x", tokens, { maxItems: 2 });
  ok(items.length === 2, "maxItems caps quiz panel");
  ok(items[0].surface === "中" && items[1].surface === "行", "lowest confidence first");
}

console.log("test-demo-quiz: ok");
