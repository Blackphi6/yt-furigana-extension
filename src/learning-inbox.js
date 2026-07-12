import {
  LEARNING_INBOX_KEY,
  LEARNING_INBOX_LIMIT,
  ambiguousSurfacesFromRules,
  appendLearningEvent,
  buildAmbiguousSamples,
  extractReadingsFromRubyHtml
} from "./reading-learning.js";
import { CONTEXT_READING_RULES } from "./reading-context.js";

const AMBIGUOUS = ambiguousSurfacesFromRules(CONTEXT_READING_RULES);

/**
 * 変換結果のうち曖昧語を chrome.storage.local に溜める。
 * @param {string} text
 * @param {string} html
 * @param {{ videoUrl?: string }} [meta]
 */
export async function recordLearningSample(text, html, meta = {}) {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;

  const readingMap = extractReadingsFromRubyHtml(html);
  // フレーズ強制は surface が ruby 分割とずれることがあるので、全文一致も見る
  for (const surface of AMBIGUOUS) {
    if (!text.includes(surface)) continue;
    if (readingMap.has(surface)) continue;
    // 部分 ruby（忙→せわ）は extract 済み。無い場合はスキップ
  }

  const samples = buildAmbiguousSamples(text, readingMap, AMBIGUOUS, meta);
  if (samples.length === 0) {
    // 忙しい→忙+しい のケース: 「忙」だけ取れるので surface を親に寄せる
    for (const surface of AMBIGUOUS) {
      if (!text.includes(surface)) continue;
      for (const [gotSurface, reading] of readingMap) {
        if (!surface.startsWith(gotSurface)) continue;
        samples.push({
          ts: new Date().toISOString(),
          kind: "ambiguous",
          text,
          surface,
          reading,
          source: "runtime",
          videoUrl: meta.videoUrl || ""
        });
        break;
      }
    }
  }

  if (samples.length === 0) return;

  const stored = await chrome.storage.local.get({ [LEARNING_INBOX_KEY]: [] });
  let inbox = Array.isArray(stored[LEARNING_INBOX_KEY])
    ? stored[LEARNING_INBOX_KEY]
    : [];

  for (const sample of samples) {
    inbox = appendLearningEvent(inbox, sample, LEARNING_INBOX_LIMIT);
  }

  await chrome.storage.local.set({ [LEARNING_INBOX_KEY]: inbox });
}

export async function readLearningInbox() {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return [];
  const stored = await chrome.storage.local.get({ [LEARNING_INBOX_KEY]: [] });
  return Array.isArray(stored[LEARNING_INBOX_KEY]) ? stored[LEARNING_INBOX_KEY] : [];
}

export async function clearLearningInbox() {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  await chrome.storage.local.set({ [LEARNING_INBOX_KEY]: [] });
}

export function learningInboxToJsonl(inbox) {
  return (inbox || []).map((row) => JSON.stringify(row)).join("\n") + (inbox?.length ? "\n" : "");
}
