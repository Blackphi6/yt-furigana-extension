/**
 * 字幕エクスポート画面。
 *
 * 字幕の取得は「拡張に 1 本ずつ頼む」か「手元のファイルを貼る」の 2 系統のみ。
 * このページから YouTube を直接叩くことはしない（timedtext の連打で
 * 視聴者側の IP ごと字幕が止まる事故を防ぐため）。
 */

import { buildRuby } from "./build-ruby.js?v=20260725a";
import {
  EXPORT_FORMATS,
  formatTimestamp,
  parseCaptions,
  serializeCaptions
} from "./caption-formats.js?v=20260725a";
import {
  chunkCueIndices,
  hasKanjiText,
  joinChunk,
  splitTokensByCue,
  textToRubySegments
} from "./caption-ruby.js?v=20260725a";

const SITE = window.YT_FURIGANA_SITE || {};
const READING_API = String(SITE.readingApiUrl || "").replace(/\/+$/, "");
const EXTENSION_ID_KEY = "ytFuriganaExtensionId";

/** 読みAPI（Render free）のレート制限に収める間隔 */
const REQUEST_INTERVAL_MS = 3200;
/** スリープからの復帰を待つため、初回だけ長め */
const FIRST_REQUEST_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 45_000;

const $ = (selector) => document.querySelector(selector);

const els = {
  tabs: document.querySelectorAll(".source-tab"),
  panels: {
    url: $("#panel-url"),
    file: $("#panel-file")
  },
  videoUrl: $("#video-url"),
  fetchCaptions: $("#fetch-captions"),
  bridgeHint: $("#bridge-hint"),
  bridgeSetup: $("#bridge-setup"),
  extensionId: $("#extension-id"),
  saveExtensionId: $("#save-extension-id"),
  captionText: $("#caption-text"),
  captionFile: $("#caption-file"),
  loadText: $("#load-text"),
  sourceStatus: $("#source-status"),
  applyFurigana: $("#apply-furigana"),
  cancelFurigana: $("#cancel-furigana"),
  progress: $("#progress"),
  progressFill: $("#progress-fill"),
  progressLabel: $("#progress-label"),
  convertStatus: $("#convert-status"),
  previewBlock: $("#preview-block"),
  cuePreview: $("#cue-preview"),
  formatList: $("#format-list"),
  rubyBelow: $("#ruby-below"),
  download: $("#download"),
  copy: $("#copy"),
  exportStatus: $("#export-status"),
  output: $("#output")
};

/** @type {{ cues: import("./caption-formats.js").Cue[], rubyCues: any[] | null, videoId: string, title: string }} */
const state = {
  cues: [],
  rubyCues: null,
  videoId: "",
  title: ""
};

let converting = false;
let cancelRequested = false;

// --- 汎用 --------------------------------------------------------------

function setStatus(el, message, kind = "ok") {
  if (!el) return;
  el.textContent = message || "";
  if (message) el.dataset.state = kind;
  else delete el.dataset.state;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * URL / 生の ID から動画 ID を取り出す。
 * @param {string} input
 * @returns {string}
 */
export function extractVideoId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^[\w-]{11}$/.test(raw)) return raw;

  let url;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return "";
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    return url.pathname.split("/").filter(Boolean)[0] || "";
  }
  if (host.endsWith("youtube.com")) {
    if (url.pathname === "/watch") return url.searchParams.get("v") || "";
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/);
    if (match) return match[1];
  }
  return "";
}

// --- タブ --------------------------------------------------------------

for (const tab of els.tabs) {
  tab.addEventListener("click", () => {
    for (const other of els.tabs) {
      const active = other === tab;
      other.classList.toggle("is-active", active);
      other.setAttribute("aria-selected", active ? "true" : "false");
    }
    for (const [name, panel] of Object.entries(els.panels)) {
      panel.classList.toggle("is-hidden", name !== tab.dataset.panel);
    }
  });
}

// --- 拡張ブリッジ ------------------------------------------------------

function getExtensionId() {
  const stored = (() => {
    try {
      return localStorage.getItem(EXTENSION_ID_KEY) || "";
    } catch {
      return "";
    }
  })();
  return stored || String(SITE.extensionId || "");
}

els.saveExtensionId?.addEventListener("click", () => {
  const value = String(els.extensionId.value || "").trim();
  try {
    if (value) localStorage.setItem(EXTENSION_ID_KEY, value);
    else localStorage.removeItem(EXTENSION_ID_KEY);
  } catch {
    // プライベートモード等。保存できなくても続行
  }
  setStatus(
    els.sourceStatus,
    value ? "拡張 ID を保存しました。もう一度「字幕を取得」を押してください。" : "拡張 ID を消しました。"
  );
});

/**
 * 拡張に字幕取得を依頼する。取得自体は拡張側で 1 本ずつ・クールダウン付き。
 * @param {string} videoId
 */
function requestCaptionsFromExtension(videoId) {
  const extensionId = getExtensionId();
  if (!extensionId) {
    return Promise.reject(
      new Error("拡張 ID が未設定です。拡張を入れるか、下の欄に ID を貼ってください。")
    );
  }
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return Promise.reject(
      new Error("この環境では拡張と通信できません。「字幕ファイルを貼る」を使ってください。")
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("拡張からの応答がありません。拡張を再読み込みしてみてください。"));
    }, 60_000);

    try {
      chrome.runtime.sendMessage(
        extensionId,
        { type: "YTF_EXPORT_FETCH_CAPTIONS", videoId },
        (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);

          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(
              new Error(
                "拡張が見つかりません。YT Furigana をインストールして有効にしてください。"
              )
            );
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error || "字幕を取得できませんでした。"));
            return;
          }
          resolve(response);
        }
      );
    } catch (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  });
}

els.fetchCaptions?.addEventListener("click", async () => {
  const videoId = extractVideoId(els.videoUrl.value);
  if (!videoId) {
    setStatus(els.sourceStatus, "YouTube の URL または動画 ID を入力してください。", "error");
    return;
  }

  els.fetchCaptions.disabled = true;
  setStatus(els.sourceStatus, "拡張に字幕を問い合わせています…", "busy");

  try {
    const result = await requestCaptionsFromExtension(videoId);
    const cues = Array.isArray(result.cues) ? result.cues : [];
    if (!cues.length) {
      throw new Error("この動画には日本語の手動字幕が見つかりませんでした。");
    }
    adoptCues(cues, { videoId, title: result.title || "" });
    setStatus(
      els.sourceStatus,
      `日本語字幕を ${cues.length} 行読み込みました。${result.trackName ? `（${result.trackName}）` : ""}`
    );
  } catch (error) {
    setStatus(els.sourceStatus, error?.message || String(error), "error");
    els.bridgeSetup.open = true;
  } finally {
    els.fetchCaptions.disabled = false;
  }
});

// --- ファイル／貼り付け ------------------------------------------------

function loadFromText(source) {
  const { format, cues } = parseCaptions(source);
  if (!cues.length) {
    setStatus(
      els.sourceStatus,
      "字幕として読み取れませんでした。SRT / WebVTT / json3 / srv3 に対応しています。",
      "error"
    );
    return;
  }
  adoptCues(cues, { videoId: "", title: "" });
  setStatus(els.sourceStatus, `${format.toUpperCase()} として ${cues.length} 行読み込みました。`);
}

els.loadText?.addEventListener("click", () => {
  loadFromText(els.captionText.value);
});

els.captionFile?.addEventListener("change", async () => {
  const file = els.captionFile.files?.[0];
  if (!file) return;
  const text = await file.text();
  els.captionText.value = text;
  state.title = file.name.replace(/\.[^.]+$/, "");
  loadFromText(text);
});

// --- 共通の取り込み処理 ------------------------------------------------

function adoptCues(cues, meta) {
  state.cues = cues;
  state.rubyCues = null;
  state.videoId = meta.videoId || state.videoId;
  state.title = meta.title || state.title;

  els.applyFurigana.disabled = cues.length === 0;
  els.download.disabled = true;
  els.copy.disabled = true;
  els.output.textContent = "";
  setStatus(els.convertStatus, "");
  setStatus(els.exportStatus, "");
  renderPreview(
    cues.map((cue) => ({
      startMs: cue.startMs,
      endMs: cue.endMs,
      segments: [{ text: cue.text }]
    }))
  );
}

// --- 読みAPI -----------------------------------------------------------

/**
 * @param {string} text
 * @param {{ signal: AbortSignal, timeoutMs: number }} options
 */
async function requestReadings(text, options) {
  if (!READING_API) throw new Error("読み API の URL が設定されていません。");

  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, options.timeoutMs);

  try {
    const response = await fetch(`${READING_API}/v1/readings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, user_dict: [], return_candidates: false }),
      signal: controller.signal
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After")) || 60;
      const error = new Error(
        `読み API のレート制限に達しました。${retryAfter} 秒ほど待ってからやり直してください。`
      );
      error.retryAfterMs = retryAfter * 1000;
      throw error;
    }
    if (!response.ok) {
      throw new Error(`読み API エラー (${response.status})`);
    }

    const data = await response.json();
    return Array.isArray(data?.tokens) ? data.tokens : [];
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", abort);
  }
}

function setProgress(done, total) {
  const ratio = total > 0 ? Math.round((done / total) * 100) : 0;
  els.progressFill.style.width = `${ratio}%`;
  els.progressLabel.textContent = `${done} / ${total} ブロック`;
}

els.cancelFurigana?.addEventListener("click", () => {
  cancelRequested = true;
  setStatus(els.convertStatus, "中止しています…", "busy");
});

els.applyFurigana?.addEventListener("click", async () => {
  if (converting || !state.cues.length) return;

  converting = true;
  cancelRequested = false;
  const abortController = new AbortController();

  els.applyFurigana.disabled = true;
  els.cancelFurigana.hidden = false;
  els.progress.hidden = false;
  els.download.disabled = true;
  els.copy.disabled = true;

  const chunks = chunkCueIndices(state.cues);
  // 漢字が無いブロックは API に投げない（無駄な通信とレート消費を避ける）
  const targets = chunks.filter((indices) =>
    indices.some((i) => hasKanjiText(state.cues[i].text))
  );

  setProgress(0, targets.length);
  setStatus(
    els.convertStatus,
    targets.length
      ? "読み API に問い合わせています。初回は起動待ちで時間がかかります…"
      : "漢字が見つからなかったため、ルビ無しで書き出せます。",
    "busy"
  );

  /** @type {Map<number, any[]>} */
  const tokensByCue = new Map();
  let failed = null;

  for (let i = 0; i < targets.length; i += 1) {
    if (cancelRequested) break;

    const indices = targets[i];
    const { text, offsets } = joinChunk(state.cues, indices);

    try {
      const tokens = await requestReadings(text, {
        signal: abortController.signal,
        timeoutMs: i === 0 ? FIRST_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS
      });
      const split = splitTokensByCue(state.cues, indices, offsets, tokens);
      for (const [cueIndex, cueTokens] of split) tokensByCue.set(cueIndex, cueTokens);
    } catch (error) {
      // 429 は即停止。ここで粘ると相手側の制限を悪化させる
      failed = error;
      break;
    }

    setProgress(i + 1, targets.length);
    if (i < targets.length - 1) await sleep(REQUEST_INTERVAL_MS);
  }

  const rubyCues = state.cues.map((cue, index) => ({
    startMs: cue.startMs,
    endMs: cue.endMs,
    segments: textToRubySegments(cue.text, tokensByCue.get(index) || [], buildRuby)
  }));
  state.rubyCues = rubyCues;
  renderPreview(rubyCues);
  updateOutput();

  els.progress.hidden = true;
  els.cancelFurigana.hidden = true;
  els.applyFurigana.disabled = false;
  converting = false;

  if (failed) {
    setStatus(
      els.convertStatus,
      `${failed.message}（そこまでの結果は書き出せます）`,
      "error"
    );
  } else if (cancelRequested) {
    setStatus(els.convertStatus, "中止しました。そこまでの結果は書き出せます。");
  } else {
    const withRuby = rubyCues.filter((cue) => cue.segments.some((s) => s.ruby)).length;
    setStatus(els.convertStatus, `完了しました。${withRuby} 行にルビが付いています。`);
  }
});

// --- プレビュー --------------------------------------------------------

function segmentsToHtml(segments) {
  return segments
    .map((seg) =>
      seg.ruby
        ? `<ruby>${escapeHtml(seg.text)}<rt>${escapeHtml(seg.ruby)}</rt></ruby>`
        : escapeHtml(seg.text)
    )
    .join("")
    .replace(/\n/g, "<br />");
}

function renderPreview(rubyCues) {
  const limit = 200;
  const rows = rubyCues.slice(0, limit).map((cue) => {
    const time = `${formatTimestamp(cue.startMs)} → ${formatTimestamp(cue.endMs)}`;
    return `<div class="cue-row"><span class="cue-time">${escapeHtml(time)}</span><span class="cue-text">${segmentsToHtml(
      cue.segments
    )}</span></div>`;
  });

  if (rubyCues.length > limit) {
    rows.push(
      `<p class="hint">… 残り ${rubyCues.length - limit} 行は書き出しに含まれます</p>`
    );
  }

  els.cuePreview.innerHTML = rows.join("");
  els.previewBlock.hidden = rubyCues.length === 0;
}

// --- 書き出し ----------------------------------------------------------

function renderFormatOptions() {
  els.formatList.insertAdjacentHTML(
    "beforeend",
    EXPORT_FORMATS.map(
      (format, index) => `
        <label class="format-option">
          <input type="radio" name="export-format" value="${format.id}" ${
            index === 0 ? "checked" : ""
          } />
          <span>
            <strong>${escapeHtml(format.label)}</strong>
            <span class="format-note">${escapeHtml(format.note)}</span>
          </span>
        </label>`
    ).join("")
  );
}

function selectedFormat() {
  const checked = els.formatList.querySelector("input[name='export-format']:checked");
  const id = checked?.value || EXPORT_FORMATS[0].id;
  return EXPORT_FORMATS.find((format) => format.id === id) || EXPORT_FORMATS[0];
}

function buildOutput() {
  const cues = state.rubyCues;
  if (!cues?.length) return "";
  return serializeCaptions(selectedFormat().id, cues, {
    rubyBelow: els.rubyBelow.checked
  });
}

function updateOutput() {
  const text = buildOutput();
  els.output.textContent = text;
  const ready = text.length > 0;
  els.download.disabled = !ready;
  els.copy.disabled = !ready;
}

els.formatList?.addEventListener("change", updateOutput);
els.rubyBelow?.addEventListener("change", updateOutput);

function downloadName(extension) {
  const base = state.videoId || state.title || "captions";
  return `${base.replace(/[^\w.-]+/g, "_")}-furigana.${extension}`;
}

els.download?.addEventListener("click", () => {
  const format = selectedFormat();
  const text = buildOutput();
  if (!text) return;

  const blob = new Blob([text], { type: `${format.mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName(format.extension);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  setStatus(els.exportStatus, `${link.download} を保存しました。`);
});

els.copy?.addEventListener("click", async () => {
  const text = buildOutput();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus(els.exportStatus, "クリップボードにコピーしました。");
  } catch {
    setStatus(els.exportStatus, "コピーできませんでした。結果を開いて選択してください。", "error");
  }
});

// --- 初期化 ------------------------------------------------------------

renderFormatOptions();

const savedExtensionId = getExtensionId();
if (savedExtensionId) {
  els.extensionId.value = savedExtensionId;
} else {
  els.bridgeHint.textContent =
    "取得には YT Furigana 拡張が必要です。入っていない場合は「字幕ファイルを貼る」をお使いください。";
}

const initialVideoId = extractVideoId(new URLSearchParams(location.search).get("v") || "");
if (initialVideoId) {
  els.videoUrl.value = `https://www.youtube.com/watch?v=${initialVideoId}`;
}
