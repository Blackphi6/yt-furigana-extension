const DEFAULT_API =
  (window.YT_FURIGANA_SITE && window.YT_FURIGANA_SITE.readingApiUrl) ||
  "http://127.0.0.1:8765";
const LOCAL_FALLBACK = "http://127.0.0.1:8765";

const $ = (sel) => document.querySelector(sel);

const statusEl = $("#engine-status");
const inputEl = $("#input-text");
const apiEl = $("#api-url");
const errorEl = $("#error");
const resultBlock = $("#result-block");
const rubyOut = $("#ruby-out");
const fullReading = $("#full-reading");
const resultBody = $("#result-body");
const pinsEl = $("#reading-pins");

apiEl.value = DEFAULT_API;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Parse "surface reading" / "surface=reading" / "surface　reading" lines. */
function collectUserDict() {
  const raw = pinsEl?.value || "";
  const out = [];
  for (const line of raw.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    let surface = "";
    let reading = "";
    if (trimmed.includes("=")) {
      const i = trimmed.indexOf("=");
      surface = trimmed.slice(0, i).trim();
      reading = trimmed.slice(i + 1).trim();
    } else {
      const parts = trimmed.split(/[\s　]+/).filter(Boolean);
      if (parts.length < 2) continue;
      reading = parts.pop();
      surface = parts.join("");
    }
    if (surface && reading) out.push({ surface, reading });
  }
  return out;
}

function sourceLabel(source) {
  const map = {
    trust_pattern: "trust",
    reranker: "reranker",
    cue: "cue",
    user_dict: "user_dict",
    base_engine: "base",
    creative_ruby: "creative",
  };
  return map[source] || source || "—";
}

function buildRubyHtml(text, tokens) {
  if (!tokens?.length) return escapeHtml(text);
  const hits = [...tokens].sort((a, b) => a.span[0] - b.span[0]);
  let html = "";
  let cursor = 0;
  for (const t of hits) {
    const [start, end] = t.span;
    if (start < cursor) continue;
    html += escapeHtml(text.slice(cursor, start));
    const surface = text.slice(start, end);
    html += `<span data-hit data-source="${escapeHtml(t.source || "")}"><ruby>${escapeHtml(surface)}<rt>${escapeHtml(t.reading || "")}</rt></ruby></span>`;
    cursor = end;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

function renderResult(text, data) {
  const tokens = data.tokens || [];
  rubyOut.innerHTML = buildRubyHtml(text, tokens);
  fullReading.textContent = data.reading ? `全文読み: ${data.reading}` : "";
  resultBody.innerHTML = tokens
    .map((t) => {
      const cands = (t.candidates || [])
        .map((c) => (c === t.reading ? `<b>${escapeHtml(c)}</b>` : escapeHtml(c)))
        .join(" · ");
      const conf =
        typeof t.confidence === "number" ? t.confidence.toFixed(3) : "—";
      return `<tr>
        <td>${escapeHtml(t.surface)}</td>
        <td>${escapeHtml(t.reading)}</td>
        <td>${conf}</td>
        <td>${escapeHtml(sourceLabel(t.source))}</td>
        <td><span class="cand-list">${cands || "—"}</span></td>
      </tr>`;
    })
    .join("");
  resultBlock.hidden = false;
}

function showError(msg) {
  errorEl.hidden = !msg;
  errorEl.textContent = msg || "";
}

async function checkHealth() {
  const tryBase = async (base, timeoutMs = 8000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/health`, { method: "GET", signal: controller.signal });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const preferred = apiEl.value.replace(/\/$/, "");
  const candidates = [preferred];
  if (preferred !== LOCAL_FALLBACK) candidates.push(LOCAL_FALLBACK);

  for (const base of candidates) {
    const timeoutMs = base === LOCAL_FALLBACK ? 3000 : 90000;
    try {
      if (base !== LOCAL_FALLBACK) {
        statusEl.textContent = "エンジンを確認中…（無料枠は起動に時間がかかることがあります）";
      }
      const data = await tryBase(base, timeoutMs);
      apiEl.value = base;
      statusEl.dataset.state = "ok";
      statusEl.textContent = `エンジン稼働中（${base}）${data.readingsAuth ? " · APIキー要" : ""}`;
      return true;
    } catch {
      /* try next */
    }
  }

  statusEl.dataset.state = "down";
  statusEl.textContent =
    "エンジン未接続 — Render 未デプロイ（site/README.md）、スリープ中、または npm run reading-engine";
  return false;
}

function friendlyHttpError(status, body) {
  const text = String(body || "");
  if (status === 404 || /<html[\s>]/i.test(text) || /Sorry, we can't find the page/i.test(text)) {
    return (
      `${status}: 公開 API（Render）がまだありません。\n` +
      `Render で Blueprint（render.yaml）を適用してください。手順: site/README.md`
    );
  }
  const clipped = text.replace(/\s+/g, " ").trim().slice(0, 180);
  return clipped ? `${status}: ${clipped}` : String(status);
}

async function fetchWithColdStart(url, options = {}, { attempts = 3, label = "接続" } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) {
      statusEl.dataset.state = "down";
      statusEl.textContent = `スリープ解除中…（${label} 再試行 ${i + 1}/${attempts}）`;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      lastErr = err;
      if (err?.name === "AbortError") {
        lastErr = new Error("タイムアウト（無料枠の起動待ち）。もう一度試してください。");
      }
    }
  }
  throw lastErr || new Error("接続失敗");
}

async function runAnalyze() {
  showError("");
  const text = inputEl.value.trim();
  if (!text) {
    showError("文を入力してください。");
    return;
  }
  const base = apiEl.value.replace(/\/$/, "");
  const btn = $("#run-btn");
  btn.disabled = true;
  btn.textContent = "判定中…";
  try {
    const res = await fetchWithColdStart(
      `${base}/v1/readings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          user_dict: collectUserDict(),
          return_candidates: true,
        }),
      },
      { attempts: 3, label: "読み" }
    );
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(friendlyHttpError(res.status, detail));
    }
    const data = await res.json();
    renderResult(text, data);
    statusEl.dataset.state = "ok";
  } catch (err) {
    const msg = String(err.message || err);
    const isNetwork = /Failed to fetch|NetworkError|Load failed|AbortError/i.test(msg);
    showError(
      isNetwork
        ? `リクエスト失敗: 接続できませんでした。\nRender 未デプロイ／スリープ中、またはローカルで npm run reading-engine を起動してください。`
        : `リクエスト失敗: ${msg}`
    );
    resultBlock.hidden = true;
    await checkHealth();
  } finally {
    btn.disabled = false;
    btn.textContent = "ルビを付ける";
  }
}

$("#pin-clear")?.addEventListener("click", () => {
  pinsEl.value = "";
});
$("#run-btn").addEventListener("click", runAnalyze);
apiEl.addEventListener("change", checkHealth);

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", "true");
    inputEl.value = chip.dataset.sample || "";
    runAnalyze();
  });
});

inputEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    runAnalyze();
  }
});

const params = new URLSearchParams(location.search);
const qText = params.get("text");
if (qText) {
  inputEl.value = qText;
}

checkHealth().then((ok) => {
  if (ok) runAnalyze();
});
