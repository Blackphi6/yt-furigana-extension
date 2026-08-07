/**
 * Render /admin/dev-ingest 用（同一オリジン API）
 */
const TOKEN_KEY = "ytf_admin_token";

const $ = (sel) => document.querySelector(sel);

const tokenEl = $("#admin-token");
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

function loadToken() {
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved && tokenEl && !tokenEl.value) tokenEl.value = saved;
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
  setStatus(t ? "トークンを保存しました" : "トークンをクリアしました");
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

async function onExtract() {
  showError("");
  const t = token();
  if (!t) {
    showError("Admin token を入力してください");
    return;
  }
  const text = String(pasteEl?.value || "").trim();
  if (!text) {
    showError("本文を貼り付けてください");
    return;
  }
  const focus = String(focusEl?.value || "")
    .split(/[,、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  extractBtn.disabled = true;
  extractBtn.textContent = "抽出中…";
  setStatus("LLM 抽出中…");
  try {
    const data = await postJson("/v1/admin/learning-ingest/extract", {
      adminToken: t,
      text,
      note: noteEl?.value || "",
      focusSurfaces: focus,
    });
    renderItems(data.items || []);
    setStatus(`抽出 ${data.count ?? 0} 件`);
  } catch (err) {
    showError(String(err.message || err));
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
    showError("Admin token を入力してください");
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
  const savedMsg = token() ? "トークンを保存しました（この端末のブラウザのみ）" : "トークンをクリアしました";
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
$("#refresh-summary")?.addEventListener("click", () => void refreshSummary());
extractBtn?.addEventListener("click", () => void onExtract());
commitBtn?.addEventListener("click", () => void onCommit());
pasteEl?.addEventListener("input", updateCharCount);
checkAll?.addEventListener("change", () => {
  document.querySelectorAll(".item-check").forEach((el) => {
    el.checked = Boolean(checkAll.checked);
  });
});

loadToken();
updateCharCount();
if (token()) void refreshSummary();
