/**
 * Render /admin/dev-ingest 用（同一オリジン API）
 * 抽出はブラウザ→Groq 直呼びを優先（Render 経由 403 回避）
 */
const TOKEN_KEY = "ytf_admin_token";
const GROQ_KEY = "ytf_groq_key";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-20b",
];

const $ = (sel) => document.querySelector(sel);

const tokenEl = $("#admin-token");
const groqEl = $("#groq-key");
const pasteEl = $("#paste-text");
const focusEl = $("#focus-surfaces");
const noteEl = $("#paste-note");
const statusEl = $("#status");
const errorEl = $("#error");
const summaryEl = $("#summary");
const itemsHint = $("#items-hint");
const itemsBody = $("#items-body");
const extractBtn = $("#extract-btn");
const commitBtn = $("#commit-btn");
const charCount = $("#char-count");
const checkAll = $("#check-all");

/** @type {object[]} */
let lastItems = [];

function apiBase() {
  // このページが Render 上なら同一オリジン。ローカル複製なら公開 API。
  if (location.pathname.includes("/admin/dev-ingest")) return "";
  return "https://yt-furigana-readings.onrender.com";
}

function token() {
  return String(tokenEl?.value || "").trim();
}

function groqKey() {
  let key = String(groqEl?.value || "").trim().replace(/^["']|["']$/g, "");
  if (/^bearer\s+/i.test(key)) key = key.replace(/^bearer\s+/i, "").trim();
  return key;
}

function showError(msg) {
  if (!errorEl) return;
  if (!msg) {
    errorEl.hidden = true;
    errorEl.textContent = "";
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = msg;
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function loadSecrets() {
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved && tokenEl && !tokenEl.value) tokenEl.value = saved;
    const g = localStorage.getItem(GROQ_KEY);
    if (g && groqEl && !groqEl.value) groqEl.value = g;
  } catch {
    /* ignore */
  }
}

function saveToken() {
  const t = token();
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  setStatus(t ? "Admin を保存しました（この端末のみ）" : "Admin をクリアしました");
}

function saveGroq() {
  const k = groqKey();
  try {
    if (k) localStorage.setItem(GROQ_KEY, k);
    else localStorage.removeItem(GROQ_KEY);
  } catch {
    /* ignore */
  }
  if (!k) {
    setStatus("Groq キーをクリアしました");
    return;
  }
  if (!k.startsWith("gsk_") || k.includes("...")) {
    showError("Groq キーは gsk_ で始まる全文（マスク gsk_… は不可）");
    setStatus("Groq キー形式が不正");
    return;
  }
  showError("");
  setStatus("Groq キーを保存しました（この端末のブラウザのみ・Render 不要）");
}

function updateCharCount() {
  const n = String(pasteEl?.value || "").length;
  if (charCount) charCount.textContent = `${n} 文字`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderItems(items) {
  lastItems = Array.isArray(items) ? items : [];
  if (!itemsBody) return;
  if (!lastItems.length) {
    itemsBody.innerHTML = "";
    if (itemsHint) itemsHint.textContent = "候補なし";
    if (commitBtn) commitBtn.disabled = true;
    return;
  }
  if (itemsHint) itemsHint.textContent = `${lastItems.length} 件（チェックした行だけ）`;
  itemsBody.innerHTML = lastItems
    .map(
      (it, i) => `<tr data-i="${i}">
      <td><input type="checkbox" class="item-check" data-i="${i}" checked /></td>
      <td>${escapeHtml(it.surface)}</td>
      <td>${escapeHtml(it.gold || it.reading)}</td>
      <td>${escapeHtml(it.text)}</td>
      <td>${escapeHtml(it.note || "")}</td>
    </tr>`
    )
    .join("");
  if (commitBtn) commitBtn.disabled = false;
  if (checkAll) checkAll.checked = true;
}

function selectedItems() {
  return [...document.querySelectorAll(".item-check:checked")]
    .map((el) => lastItems[Number(el.getAttribute("data-i"))])
    .filter(Boolean);
}

async function postJson(path, body) {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { detail: text.slice(0, 300) };
  }
  if (!res.ok) {
    const detail = data?.detail || res.statusText;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

async function refreshSummary() {
  const t = token();
  if (!t) {
    setStatus("トークン未設定");
    return;
  }
  setStatus("件数を取得中…");
  try {
    const data = await postJson("/v1/admin/proposals/summary", { adminToken: t });
    if (summaryEl) {
      summaryEl.hidden = false;
      summaryEl.textContent = JSON.stringify(
        {
          proposalsTotal: data.total,
          demoRelated: data.demoRelated,
          byStatus: data.byStatus,
          bySource: data.bySource,
          contributions: data.contributions,
          devIngest: data.devIngest,
        },
        null,
        2
      );
    }
    setStatus(
      `proposals ${data.total ?? "—"} 件（デモ系 ${data.demoRelated ?? "—"}） / 票ペア ${data.contributions?.totalPairs ?? "—"}`
    );
  } catch (err) {
    const msg = String(err.message || err);
    showError(msg);
    if (/forbidden|unauthorized|401|403/i.test(msg)) {
      setStatus(
        "認証失敗: Render の YT_FURIGANA_ADMIN_TOKEN と一致するか確認（未設定なら Environment で追加→Save→デプロイ）"
      );
    } else {
      setStatus("件数取得に失敗（スリープ起き直後なら再試行）");
    }
  }
}

function buildExtractPrompt(text, focus, note) {
  const focusLine = focus.length
    ? `Prefer these surfaces when present: ${focus.slice(0, 20).join(", ")}`
    : "Prefer heteronyms / ambiguous kanji useful for caption furigana.";
  const noteLine = note ? `Operator note: ${note}\n` : "";
  return (
    "You extract Japanese furigana training examples from pasted text.\n" +
    'Return ONLY JSON: {"items":[{"text":"short sentence",' +
    '"surface":"kanji word","gold":"hiragana reading",' +
    '"note":"why this reading"}]}\n' +
    "Rules:\n" +
    "- gold must be hiragana or katakana only (one reading per item)\n" +
    "- surface must appear in text\n" +
    "- text should be a short excerpt (≤80 chars) containing the surface\n" +
    "- skip pure kana, punctuation-only, and jokes\n" +
    "- max 60 items; dedupe by surface+gold+text\n" +
    "If the paste has 【問題】 and 【解答】 (or 問題/解答) sections:\n" +
    "- Match numbered lines (e.g. 55.) between question and answer\n" +
    "- Answers like きんせい・きんぼし mean multiple readings for the SAME surface " +
    "in that sentence — emit ONE item per reading, with a short excerpt that " +
    "fits that sense (split the sentence at 、 if needed)\n" +
    "- Prefer the kanji compound that differs in reading (金星, 町中, etc.)\n" +
    `${focusLine}\n` +
    noteLine +
    `PASTE:\n${text.slice(0, 20000)}`
  );
}

function normalizeClientItems(rawItems, text) {
  const kanaRe = /^[\u3040-\u309F\u30A0-\u30FFー]+$/;
  const kanjiRe = /[\u4E00-\u9FFF]/
  const out = [];
  const seen = new Set();
  for (const item of rawItems || []) {
    if (!item || typeof item !== "object") continue;
    const surface = String(item.surface || "").trim();
    const gold = String(item.gold || item.reading || "").trim();
    let excerpt = String(item.text || "").trim().slice(0, 120);
    const itemNote = String(item.note || "").trim().slice(0, 120);
    if (!surface || !gold || !kanjiRe.test(surface) || !kanaRe.test(gold)) continue;
    if (excerpt && !excerpt.includes(surface)) {
      if (!text.includes(surface)) continue;
    }
    if (!excerpt) {
      const idx = text.indexOf(surface);
      if (idx < 0) continue;
      const a = Math.max(0, idx - 12);
      const b = Math.min(text.length, idx + surface.length + 12);
      excerpt = text.slice(a, b);
    }
    const key = `${surface}\t${gold}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text: excerpt,
      surface,
      gold,
      reading: gold,
      note: itemNote,
    });
    if (out.length >= 80) break;
  }
  return out;
}

async function extractViaBrowserGroq(text, focus, note) {
  const key = groqKey();
  if (!key.startsWith("gsk_") || key.includes("...")) {
    throw new Error("Groq キーは gsk_ で始まる全文を入力（マスク表示は不可）");
  }
  const prompt = buildExtractPrompt(text, focus, note);
  let lastErr = "";
  for (const model of GROQ_MODELS) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2200,
        messages: [
          { role: "system", content: "Return compact JSON only. No markdown." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      lastErr = `HTTP ${res.status}: ${raw.slice(0, 240)}`;
      if (res.status === 401 || res.status === 400) throw new Error(`groq_failed:${lastErr}`);
      continue;
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error("groq_bad_json");
    }
    const content = payload?.choices?.[0]?.message?.content;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("groq_bad_json");
    }
    const items = normalizeClientItems(parsed?.items, text);
    return { ok: true, count: items.length, items, via: "browser", model };
  }
  throw new Error(`groq_failed:${lastErr || "unknown"}`);
}

async function onExtract() {
  showError("");
  const text = String(pasteEl?.value || "").trim();
  if (!text) {
    showError("本文を貼り付けてください");
    return;
  }
  const focus = String(focusEl?.value || "")
    .split(/[,、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const note = noteEl?.value || "";
  extractBtn.disabled = true;
  extractBtn.textContent = "抽出中…";

  // ブラウザ直呼びを優先（Render→Groq の 403 を回避）
  if (groqKey()) {
    setStatus("ブラウザ→Groq で抽出中…");
    try {
      const data = await extractViaBrowserGroq(text, focus, note);
      renderItems(data.items || []);
      setStatus(`抽出 ${data.count ?? 0} 件（ブラウザ直・${data.model}）`);
      return;
    } catch (err) {
      showError(String(err.message || err));
      setStatus("ブラウザ抽出失敗");
      return;
    } finally {
      extractBtn.disabled = false;
      extractBtn.textContent = "LLM で抽出";
    }
  }

  const t = token();
  if (!t) {
    showError("Groq API key（推奨）か Admin token を入力してください");
    extractBtn.disabled = false;
    extractBtn.textContent = "LLM で抽出";
    return;
  }
  setStatus("サーバー経由で LLM 抽出中…");
  try {
    const data = await postJson("/v1/admin/learning-ingest/extract", {
      adminToken: t,
      text,
      note,
      focusSurfaces: focus,
    });
    renderItems(data.items || []);
    setStatus(`抽出 ${data.count ?? 0} 件（サーバー）`);
  } catch (err) {
    const msg = String(err.message || err);
    showError(
      msg.includes("403") || msg.includes("groq_failed")
        ? `${msg}\n→ Groq キー欄に gsk_ 全文を入れて「保存」後、再抽出（ブラウザ直呼び）`
        : msg
    );
    setStatus("抽出失敗");
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = "LLM で抽出";
  }
}

async function onCommit() {
  showError("");
  const t = token();
  if (!t) {
    showError("Admin token を入力してください（キュー送信に必要）");
    return;
  }
  const items = selectedItems();
  if (!items.length) {
    showError("送る行にチェックを入れてください");
    return;
  }
  commitBtn.disabled = true;
  commitBtn.textContent = "送信中…";
  try {
    const data = await postJson("/v1/admin/learning-ingest/commit", {
      adminToken: t,
      note: noteEl?.value || "",
      items,
    });
    setStatus(`保存 ${data.saved ?? 0} 件 → キューへ`);
    await refreshSummary();
  } catch (err) {
    showError(String(err.message || err));
    setStatus("保存失敗");
  } finally {
    commitBtn.disabled = false;
    commitBtn.textContent = "選択分を送る";
  }
}

$("#save-token")?.addEventListener("click", async () => {
  const btn = $("#save-token");
  saveToken();
  const savedMsg = token() ? "Admin を保存しました（この端末のみ）" : "Admin をクリアしました";
  if (btn) {
    btn.textContent = "OK";
    setTimeout(() => {
      if (btn) btn.textContent = "保存";
    }, 1500);
  }
  if (token()) {
    await refreshSummary();
    const after = statusEl?.textContent || "";
    setStatus(`${savedMsg} · ${after}`);
  } else {
    setStatus(savedMsg);
  }
});
$("#save-groq")?.addEventListener("click", () => {
  const btn = $("#save-groq");
  saveGroq();
  if (btn && groqKey().startsWith("gsk_") && !groqKey().includes("...")) {
    btn.textContent = "OK";
    setTimeout(() => {
      if (btn) btn.textContent = "保存";
    }, 1500);
  }
});
$("#refresh-summary")?.addEventListener("click", () => void refreshSummary());
extractBtn?.addEventListener("click", () => void onExtract());
commitBtn?.addEventListener("click", () => void onCommit());
pasteEl?.addEventListener("input", updateCharCount);
checkAll?.addEventListener("change", () => {
  document.querySelectorAll(".item-check").forEach((el) => {
    el.checked = Boolean(checkAll.checked);
  });
});

loadSecrets();
updateCharCount();
if (token()) void refreshSummary();
