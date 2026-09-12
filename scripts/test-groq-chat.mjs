import assert from "node:assert/strict";
import {
  buildGroqChatBody,
  extractGroqMessageText,
} from "./learning/groq-chat.mjs";

assert.equal(
  extractGroqMessageText({ content: "  [\"あ\"]  " }),
  '["あ"]'
);
assert.equal(
  extractGroqMessageText({ content: "", reasoning: '["い"]' }),
  '["い"]'
);
assert.equal(extractGroqMessageText({ content: "" }), "");

const oss = buildGroqChatBody(
  "openai/gpt-oss-20b",
  [{ role: "user", content: "hi" }],
  { temperature: 0.5 }
);
assert.equal(oss.max_completion_tokens, 2048);
assert.equal(oss.reasoning_effort, "low");
assert.equal(oss.include_reasoning, false);
assert.equal(oss.max_tokens, undefined);
assert.equal(oss.temperature, 0.5);

const qwen = buildGroqChatBody("qwen/qwen3.6-27b", [], { temperature: 0.1 });
assert.equal(qwen.max_completion_tokens, 2048);
assert.equal(qwen.reasoning_effort, undefined);
assert.equal(qwen.include_reasoning, undefined);

console.log("groq-chat helpers ok");
