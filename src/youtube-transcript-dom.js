const SEGMENT_SELECTORS = [
  "ytd-transcript-segment-renderer .segment-text",
  "ytd-transcript-segment-renderer yt-formatted-string",
  "#segments-container .segment-text"
];

const SHOW_TRANSCRIPT_SELECTORS = [
  'button[aria-label="文字起こしを表示"]',
  'button[aria-label="Show transcript"]',
  'button[aria-label*="文字起こし"]',
  'button[aria-label*="transcript" i]',
  'ytd-video-description-transcript-section-renderer button',
  '#primary-button button',
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'
];

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeLine(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function readTranscriptSegmentsFromDom(root = document) {
  const nodes = SEGMENT_SELECTORS.flatMap((selector) =>
    Array.from(root.querySelectorAll(selector))
  );
  const lines = [];
  const seen = new Set();

  for (const node of nodes) {
    const text = normalizeLine(node.textContent);
    if (!text || seen.has(text)) continue;
    // Prefer the dedicated .segment-text node; skip duplicates from nested formatted strings
    if (
      node.matches("yt-formatted-string") &&
      node.closest("ytd-transcript-segment-renderer")?.querySelector(".segment-text")
    ) {
      continue;
    }
    seen.add(text);
    lines.push(text);
  }

  return lines;
}

function findShowTranscriptButton(root = document) {
  for (const selector of SHOW_TRANSCRIPT_SELECTORS) {
    const candidates = Array.from(root.querySelectorAll(selector));
    for (const el of candidates) {
      const label = `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`;
      if (/文字起こし|transcript/i.test(label) || selector.includes("transcript")) {
        if (el instanceof HTMLElement) return el;
      }
    }
  }

  const byText = Array.from(
    root.querySelectorAll("button, tp-yt-paper-button, yt-button-shape button")
  ).find((el) => /文字起こしを表示|Show transcript/i.test(el.textContent || ""));
  return byText instanceof HTMLElement ? byText : null;
}

function findDescriptionExpandButton(root = document) {
  const candidates = Array.from(
    root.querySelectorAll(
      "#expand, #description-inline-expander tp-yt-paper-button, tp-yt-paper-button#expand"
    )
  );
  return (
    candidates.find((el) => /もっと見る|Show more|…more|\.\.\.more/i.test(el.textContent || "")) ||
    candidates[0] ||
    null
  );
}

async function ensureTranscriptPanelOpen(timeoutMs = 10000) {
  if (readTranscriptSegmentsFromDom().length > 0) {
    return true;
  }

  const expand = findDescriptionExpandButton();
  if (expand instanceof HTMLElement) {
    expand.click();
    await sleep(400);
  }

  const button = findShowTranscriptButton();
  if (button) {
    button.click();
  } else {
    // Fallback: open via the overflow / description transcript section
    const section = document.querySelector(
      "ytd-video-description-transcript-section-renderer"
    );
    const fallbackButton = section?.querySelector("button");
    if (fallbackButton instanceof HTMLElement) {
      fallbackButton.click();
    }
  }

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const lines = readTranscriptSegmentsFromDom();
    if (lines.length > 0) return true;
    const panel = document.querySelector(
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'
    );
    if (panel && panel.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED") {
      // panel open but segments still loading
    }
    await sleep(250);
  }

  return readTranscriptSegmentsFromDom().length > 0;
}

async function scrollTranscriptToLoadAll(maxRounds = 80) {
  const container =
    document.querySelector("#segments-container") ||
    document.querySelector("ytd-transcript-segment-list-renderer #segments-container") ||
    document.querySelector("ytd-transcript-renderer #segments-container");

  if (!(container instanceof HTMLElement)) {
    return readTranscriptSegmentsFromDom();
  }

  let previous = -1;
  for (let i = 0; i < maxRounds; i += 1) {
    const lines = readTranscriptSegmentsFromDom();
    if (lines.length === previous) break;
    previous = lines.length;
    container.scrollTop = container.scrollHeight;
    await sleep(200);
  }

  return readTranscriptSegmentsFromDom();
}

/**
 * Open YouTube's "Show transcript" panel if needed and collect all segment texts.
 */
export async function loadTranscriptLinesFromDom(options = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const opened = await ensureTranscriptPanelOpen(timeoutMs);
  if (!opened) {
    throw new Error("文字起こしパネルを開けませんでした");
  }

  const lines = await scrollTranscriptToLoadAll();
  if (lines.length === 0) {
    throw new Error("文字起こしセグメントが空です");
  }

  return {
    lines,
    source: "transcript-dom"
  };
}
