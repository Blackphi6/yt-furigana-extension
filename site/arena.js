/**
 * TTS Furigana Arena UI。キーは localStorage のみ。自前サーバーへは送らない。
 */
import {
  LLM_FURIGANA_PROMPT,
  NAIVE_PHRASES,
  RESEARCH_AS_OF,
  RESEARCH_ROWS,
  SAMPLE_TEXTS,
  apiDataToHits,
  extractChatText,
  extractGeminiText,
  geminiEndpoint,
  hitsToKana,
  longestMatchHits,
  majorityKana,
  parseLlmTokens,
  renderRubyLine,
} from "./arena-lib.js";

const API =
  (typeof globalThis !== "undefined" &&
    globalThis.YT_FURIGANA_SITE &&
    globalThis.YT_FURIGANA_SITE.readingApiUrl) ||
  "https://yt-furigana-readings.onrender.com";

const KEYS_STORAGE = "ytf-arena-keys";
const ENGINE_STORAGE = "ytf-arena-on";

const $ = (sel) => document.querySelector(sel);

const DEFAULT_ON = {
  yt: true,
  naive: true,
  gemini: false,
  groq: false,
  openrouter: false,
  custom: false,
};

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* プライベートモード等 */
  }
}

function enabledMap() {
  return loadJson(ENGINE_STORAGE, DEFAULT_ON);
}

function keysMap() {
  return loadJson(KEYS_STORAGE, {
    gemini: "",
    groq: "",
    openrouter: "",
    customUrl: "",
  });
}

function setStatus(text, state = "") {
  const el = $("#arena-status");
  if (!el) return;
  el.textContent = text;
  el.dataset.state = state;
}

async function fetchRetry(url, options, { attempts = 2, timeoutMs = 90000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr =
        err?.name === "AbortError"
          ? new Error("タイムアウト（無料枠の起動待ちのことがあります）")
          : err;
    }
  }
  throw lastErr || new Error("接続失敗");
}

async function runYt(text) {
  const res = await fetchRetry(`${API}/v1/readings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, user_dict: [], return_candidates: false }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const hits = apiDataToHits(data);
  return {
    hits,
    kana: hitsToKana(hits) || String(data.reading || ""),
    detail: API.replace(/^https?:\/\//, ""),
  };
}

function runNaive(text) {
  const hits = longestMatchHits(text, NAIVE_PHRASES);
  return {
    hits,
    kana: hitsToKana(hits),
    detail: "第一候補・最長一致",
  };
}

async function runGemini(text, key, model) {
  const res = await fetch(geminiEndpoint(model, key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: LLM_FURIGANA_PROMPT + text }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${body.slice(0, 180)}`);
  }
  const data = await res.json();
  const raw = extractGeminiText(data);
  const hits = parseLlmTokens(raw);
  return { hits, kana: hitsToKana(hits), detail: model, raw };
}

async function runChat(url, key, model, text, extraHeaders = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: LLM_FURIGANA_PROMPT + text,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${body.slice(0, 180)}`);
  }
  const data = await res.json();
  const raw = extractChatText(data);
  const hits = parseLlmTokens(raw);
  return { hits, kana: hitsToKana(hits), detail: model, raw };
}

async function runCustom(text, url) {
  const endpoint = String(url || "").replace(/\/+$/, "");
  if (!endpoint) throw new Error("URL が空です");
  const res = await fetchRetry(`${endpoint}/v1/readings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, return_candidates: false }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const hits = apiDataToHits(data);
  return { hits, kana: hitsToKana(hits) || String(data.reading || ""), detail: endpoint };
}

const ENGINE_RUNNERS = {
  yt: {
    label: "YT Furigana",
    blurb: "Sudachi＋文脈 · 公開API",
    needs: [],
    run: (text) => runYt(text),
  },
  naive: {
    label: "辞書第一候補",
    blurb: "文脈なし · 端末内",
    needs: [],
    run: (text) => Promise.resolve(runNaive(text)),
  },
  gemini: {
    label: "Gemini G2P",
    blurb: "text-side · AI Studio 無料枠",
    needs: ["gemini"],
    run: (text, keys) =>
      runGemini(text, keys.gemini, $("#gemini-model")?.value || "gemini-2.5-flash"),
  },
  groq: {
    label: "Groq LLM",
    blurb: "Llama 系 · 無料枠",
    needs: ["groq"],
    run: (text, keys) =>
      runChat(
        "https://api.groq.com/openai/v1/chat/completions",
        keys.groq,
        $("#groq-model")?.value || "llama-3.3-70b-versatile",
        text
      ),
  },
  openrouter: {
    label: "OpenRouter",
    blurb: "無料モデル可",
    needs: ["openrouter"],
    run: (text, keys) =>
      runChat(
        "https://openrouter.ai/api/v1/chat/completions",
        keys.openrouter,
        $("#or-model")?.value || "google/gemma-3-27b-it:free",
        text,
        {
          "HTTP-Referer": "https://blackphi6.github.io/yt-furigana-extension/arena.html",
          "X-Title": "YT Furigana Arena",
        }
      ),
  },
  custom: {
    label: "自前 G2P",
    blurb: "Haqumei / Sarashina ラッパ",
    needs: ["customUrl"],
    run: (text, keys) => runCustom(text, keys.customUrl),
  },
};

function selectedEngineIds() {
  const on = enabledMap();
  return Object.keys(ENGINE_RUNNERS).filter((id) => {
    const box = document.getElementById(`eng-${id}`);
    if (box) return box.checked;
    return Boolean(on[id]);
  });
}

function persistUi() {
  const on = { ...DEFAULT_ON };
  for (const id of Object.keys(ENGINE_RUNNERS)) {
    const box = document.getElementById(`eng-${id}`);
    on[id] = Boolean(box?.checked);
  }
  saveJson(ENGINE_STORAGE, on);
  saveJson(KEYS_STORAGE, {
    gemini: $("#key-gemini")?.value.trim() || "",
    groq: $("#key-groq")?.value.trim() || "",
    openrouter: $("#key-openrouter")?.value.trim() || "",
    customUrl: $("#key-custom")?.value.trim() || "",
  });
}

function restoreUi() {
  const on = enabledMap();
  const keys = keysMap();
  for (const id of Object.keys(ENGINE_RUNNERS)) {
    const box = document.getElementById(`eng-${id}`);
    if (box) box.checked = Boolean(on[id]);
  }
  if ($("#key-gemini")) $("#key-gemini").value = keys.gemini || "";
  if ($("#key-groq")) $("#key-groq").value = keys.groq || "";
  if ($("#key-openrouter")) $("#key-openrouter").value = keys.openrouter || "";
  if ($("#key-custom")) $("#key-custom").value = keys.customUrl || "";
}

function renderResearch() {
  const root = $("#research-rows");
  if (!root) return;
  root.innerHTML = RESEARCH_ROWS.map(
    (row) => `<article class="research-row" id="r-${row.id}">
      <h3><a href="${row.url}" rel="noopener noreferrer">${row.name}</a></h3>
      <p class="maker">${row.maker} · ${row.free}</p>
      <p class="score">${row.score}</p>
      <p class="note">${row.note} 呼び出し: ${row.call}</p>
    </article>`
  ).join("");
  const stamp = $("#research-asof");
  if (stamp) stamp.textContent = RESEARCH_AS_OF;
}

function renderSamples() {
  const root = $("#samples");
  if (!root) return;
  root.innerHTML = SAMPLE_TEXTS.map(
    (t) =>
      `<button type="button" class="sample" data-sample>${t}</button>`
  ).join("");
}

function engineCard(id, state) {
  const meta = ENGINE_RUNNERS[id];
  const cls = ["bout", state.status || "pending"];
  if (state.dissent) cls.push("dissent");
  let body = `<p class="wait">生成待ち</p>`;
  if (state.status === "run") body = `<p class="wait">生成中…</p>`;
  if (state.status === "err") {
    body = `<p class="err">${escapeMini(state.error || "失敗")}</p>`;
  }
  if (state.status === "ok") {
    body = `<div class="ruby-line" lang="ja">${state.html}</div>
      <p class="kana">${escapeMini(state.kana || "（かな指紋なし）")}</p>`;
  }
  return `<article class="${cls.join(" ")}" data-engine="${id}">
    <header>
      <strong>${meta.label}</strong>
      <span>${state.detail || meta.blurb}</span>
    </header>
    ${body}
  </article>`;
}

function escapeMini(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function paint(states, majority) {
  const stage = $("#stage");
  if (!stage) return;
  const ids = Object.keys(states);
  stage.innerHTML = ids
    .map((id) => {
      const s = states[id];
      const dissent =
        s.status === "ok" &&
        majority.kana &&
        s.kana &&
        s.kana !== majority.kana;
      return engineCard(id, { ...s, dissent });
    })
    .join("");
}

async function generate() {
  persistUi();
  const text = ($("#source")?.value || "").trim();
  if (!text) {
    setStatus("文を入れてください", "err");
    return;
  }
  const keys = keysMap();
  const ids = selectedEngineIds();
  if (!ids.length) {
    setStatus("エンジンを1つ以上選んでください", "err");
    return;
  }
  const btn = $("#go");
  if (btn) btn.disabled = true;
  /** @type {Record<string, any>} */
  const states = {};
  for (const id of ids) {
    const need = ENGINE_RUNNERS[id].needs[0];
    if (need && !String(keys[need] || "").trim()) {
      states[id] = {
        status: "err",
        error: "キー / URL が未入力（下の詳細を開く）",
      };
    } else {
      states[id] = { status: "run" };
    }
  }
  paint(states, { kana: "" });
  setStatus(`${ids.length} 系統を同時に投げています…`, "run");

  const jobs = ids.map(async (id) => {
    if (states[id].status === "err") return;
    try {
      const out = await ENGINE_RUNNERS[id].run(text, keys);
      states[id] = {
        status: "ok",
        hits: out.hits,
        kana: out.kana,
        html: renderRubyLine(text, out.hits),
        detail: out.detail || ENGINE_RUNNERS[id].blurb,
      };
    } catch (err) {
      const msg = String(err?.message || err);
      const cors = /Failed to fetch|NetworkError|Load failed|CORS/i.test(msg);
      states[id] = {
        status: "err",
        error: cors
          ? `${msg}（ブラウザ CORS の可能性。OpenRouter か自前プロキシを）`
          : msg,
      };
    }
    const majority = majorityKana(
      Object.values(states).map((s) => ({
        ok: s.status === "ok",
        kana: s.kana,
      }))
    );
    paint(states, majority);
  });

  await Promise.all(jobs);
  const majority = majorityKana(
    Object.values(states).map((s) => ({ ok: s.status === "ok", kana: s.kana }))
  );
  paint(states, majority);
  const ok = Object.values(states).filter((s) => s.status === "ok").length;
  const ng = Object.values(states).filter((s) => s.status === "err").length;
  const dissent = Object.values(states).filter(
    (s) => s.status === "ok" && majority.kana && s.kana !== majority.kana
  ).length;
  setStatus(
    `完了: 成功 ${ok} / 失敗 ${ng}` +
      (majority.count
        ? ` · 多数決 ${majority.count}票` + (dissent ? ` · 異読 ${dissent}` : "")
        : ""),
    ng && !ok ? "err" : "ok"
  );
  if (btn) btn.disabled = false;
}

function boot() {
  renderResearch();
  renderSamples();
  restoreUi();
  $("#samples")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-sample]");
    if (!btn) return;
    const area = $("#source");
    if (area) area.value = btn.textContent || "";
  });
  $("#go")?.addEventListener("click", () => void generate());
  $("#source")?.addEventListener("keydown", (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
      ev.preventDefault();
      void generate();
    }
  });
  document.querySelector(".keys")?.addEventListener("change", persistUi);
  document.querySelector(".engine-picks")?.addEventListener("change", persistUi);
}

if (typeof document !== "undefined") boot();
