/**
 * Groq chat 共通。gpt-oss 系は reasoning が max_tokens を食い潰して
 * content="" + finish_reason=length になりやすいので、完了トークン予算と
 * reasoning_effort をここで固定する。
 */

/**
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {unknown} message
 */
export function extractGroqMessageText(message) {
  const content = String(/** @type {{ content?: unknown }} */ (message)?.content || "").trim();
  if (content) return content;
  // include_reasoning=false でも古い応答や他プロキシ向けの保険
  const reasoning = String(
    /** @type {{ reasoning?: unknown, reasoning_content?: unknown }} */ (message)?.reasoning ||
      /** @type {{ reasoning_content?: unknown }} */ (message)?.reasoning_content ||
      ""
  ).trim();
  return reasoning;
}

/**
 * @param {string} model
 * @param {unknown[]} messages
 * @param {{ temperature?: number, maxCompletionTokens?: number, reasoningEffort?: string }} [opts]
 */
export function buildGroqChatBody(model, messages, opts = {}) {
  const maxCompletionTokens = Number(
    opts.maxCompletionTokens || process.env.GROQ_MAX_COMPLETION_TOKENS || 2048
  );
  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_completion_tokens: maxCompletionTokens,
  };
  // gpt-oss: reasoning を抑え、回答用トークンを残す
  if (/gpt-oss/i.test(model)) {
    body.reasoning_effort = opts.reasoningEffort || process.env.GROQ_REASONING_EFFORT || "low";
    body.include_reasoning = false;
  }
  return body;
}

/** @type {number} */
let lastGroqCallAt = 0;

/**
 * @param {string} apiKey
 * @param {string} model
 * @param {unknown[]} messages
 * @param {{ temperature?: number }} [opts]
 */
export async function groqChat(apiKey, model, messages, opts = {}) {
  const minInterval = Number(process.env.GROQ_MIN_INTERVAL_MS || 2100);
  const maxAttempts = Number(process.env.GROQ_MAX_ATTEMPTS || 8);
  let lastErr = "";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const wait = minInterval - (Date.now() - lastGroqCallAt);
    if (wait > 0) await sleep(wait);
    lastGroqCallAt = Date.now();

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGroqChatBody(model, messages, opts)),
    });
    const raw = await res.text();
    if (res.status === 429) {
      const retryAfterSec = Number(res.headers.get("retry-after") || 0);
      // free 枠の短 retry-after だと同秒帯で再衝突しやすいので下限を厚めに
      const backoff = Math.max(
        retryAfterSec * 1000,
        minInterval * (attempt + 2),
        8000 + attempt * 2000
      );
      lastErr = `429 rate limit (retry in ${Math.round(backoff / 1000)}s)`;
      console.warn(`groq ${model}: ${lastErr}`);
      await sleep(backoff);
      continue;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`groq ${model}: ${res.status} ${raw.slice(0, 200)}`);
    }
    if (!res.ok) {
      const err = data?.error?.message || raw.slice(0, 300) || res.statusText;
      throw new Error(`groq ${model}: ${res.status} ${err}`);
    }
    const choice = data?.choices?.[0];
    const text = extractGroqMessageText(choice?.message);
    if (!text) {
      const finish = choice?.finish_reason || "?";
      const usage = data?.usage || {};
      const reasonTok =
        usage?.completion_tokens_details?.reasoning_tokens ?? usage?.reasoning_tokens ?? "?";
      console.warn(
        `groq ${model}: empty content (finish_reason=${finish} completion=${usage.completion_tokens ?? "?"} reasoning=${reasonTok})`
      );
    }
    return text;
  }
  throw new Error(`groq ${model}: ${lastErr || "rate limit exhausted"}`);
}
