const DEFAULT_API =
  (window.YT_FURIGANA_SITE && window.YT_FURIGANA_SITE.readingApiUrl) ||
  "http://127.0.0.1:8765";

const $ = (sel) => document.querySelector(sel);

const statusEl = $("#engine-status");
const inputEl = $("#input-text");
const apiEl = $("#api-url");
const errorEl = $("#error");
const resultBlock = $("#result-block");
const rubyOut = $("#ruby-out");
const fullReading = $("#full-reading");
const resultBody = $("#result-body");
const dictRows = $("#user-dict-rows");

apiEl.value = DEFAULT_API;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addDictRow(surface = "", reading = "") {
  const row = document.createElement("div");
  row.className = "dict-row";
  row.innerHTML = `
    <input class="dict-surface" placeholder="表層（例: 東海林）" value="${escapeHtml(surface)}" />
    <input class="dict-reading" placeholder="読み（例: しょうじ）" value="${escapeHtml(reading)}" />
    <button type="button" class="btn ghost small dict-remove" aria-label="削除">削除</button>
  `;
  row.querySelector(".dict-remove").addEventListener("click", () => row.remove());
  dictRows.appendChild(row);
}

function collectUserDict() {
  return [...dictRows.querySelectorAll(".dict-row")]
    .map((row) => ({
      surface: row.querySelector(".dict-surface").value.trim(),
      reading: row.querySelector(".dict-reading").value.trim(),
    }))
    .filter((e) => e.surface && e.reading);
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
  const base = apiEl.value.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/health`, { method: "GET" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    statusEl.dataset.state = "ok";
    statusEl.textContent = `エンジン稼働中（${base}）${data.readingsAuth ? " · APIキー要" : ""}`;
    return true;
  } catch {
    statusEl.dataset.state = "down";
    statusEl.textContent =
      "エンジン未接続 — npm run reading-engine のあと、このページを開いてください";
    return false;
  }
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
    const res = await fetch(`${base}/v1/readings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        user_dict: collectUserDict(),
        return_candidates: true,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`${res.status}: ${detail}`);
    }
    const data = await res.json();
    renderResult(text, data);
    statusEl.dataset.state = "ok";
  } catch (err) {
    showError(
      `リクエスト失敗: ${err.message}\nローカルで npm run reading-engine を起動し、CORS が許可されているか確認してください。`
    );
    resultBlock.hidden = true;
    await checkHealth();
  } finally {
    btn.disabled = false;
    btn.textContent = "読みを判定する";
  }
}

$("#add-dict-row").addEventListener("click", () => addDictRow());
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

addDictRow();

const params = new URLSearchParams(location.search);
const qText = params.get("text");
if (qText) {
  inputEl.value = qText;
}

checkHealth().then((ok) => {
  if (ok) runAnalyze();
});
