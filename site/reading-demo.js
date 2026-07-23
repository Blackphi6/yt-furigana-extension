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

/** @type {{ text: string, tokens: any[] } | null} */
let lastResult = null;
const PICKER_ID = "demo-reading-picker";

apiEl.value = DEFAULT_API;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isKanaReading(value) {
  const raw = String(value ?? "").normalize("NFKC").trim();
  return Boolean(raw) && /^[\u3040-\u309f\u30a0-\u30ffー・･]+$/.test(raw);
}

function closeDemoPicker() {
  document.getElementById(PICKER_ID)?.remove();
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

/**
 * Upsert one pin line (same surface replaced; others kept).
 * @param {string} surface
 * @param {string} reading
 */
function upsertPin(surface, reading) {
  if (!pinsEl) return;
  const surf = String(surface || "").trim();
  const read = String(reading || "").trim();
  if (!surf || !read) return;
  const lines = String(pinsEl.value || "")
    .split(/\n/)
    .map((l) => l.trimEnd());
  const next = [];
  let replaced = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (line === "") next.push(line);
      continue;
    }
    if (trimmed.startsWith("#")) {
      next.push(line);
      continue;
    }
    let lineSurface = "";
    if (trimmed.includes("=")) {
      lineSurface = trimmed.slice(0, trimmed.indexOf("=")).trim();
    } else {
      const parts = trimmed.split(/[\s　]+/).filter(Boolean);
      if (parts.length >= 2) {
        parts.pop();
        lineSurface = parts.join("");
      }
    }
    if (lineSurface === surf) {
      if (!replaced) {
        next.push(`${surf}　${read}`);
        replaced = true;
      }
      continue;
    }
    next.push(line);
  }
  if (!replaced) next.push(`${surf}　${read}`);
  pinsEl.value = next.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
  const details = pinsEl.closest("details");
  if (details) details.open = true;
  syncProposeButton();
}

function sourceLabel(source) {
  const map = {
    trust_pattern: "信頼句",
    reranker: "再ランク",
    cue: "文脈キュー",
    user_dict: "固定",
    base_engine: "形態素",
    creative_ruby: "創作",
  };
  return map[source] || source || "—";
}

function buildRubyHtml(text, tokens) {
  if (!tokens?.length) return escapeHtml(text);
  const hits = [...tokens].sort((a, b) => a.span[0] - b.span[0]);
  let html = "";
  let cursor = 0;
  for (let i = 0; i < hits.length; i += 1) {
    const t = hits[i];
    const [start, end] = t.span;
    if (start < cursor) continue;
    html += escapeHtml(text.slice(cursor, start));
    const surface = text.slice(start, end);
    const reading = t.reading || "";
    const editable = /[\u3400-\u9fff\uF900-\uFAFF]/.test(surface) && Boolean(reading);
    if (editable) {
      html += `<span class="demo-ruby-word" data-hit data-token-index="${i}" data-surface="${escapeHtml(surface)}" data-reading="${escapeHtml(reading)}" data-source="${escapeHtml(t.source || "")}" role="button" tabindex="0" title="クリックして読みを変更"><ruby>${escapeHtml(surface)}<rt>${escapeHtml(reading)}</rt></ruby></span>`;
    } else {
      html += `<span data-hit data-source="${escapeHtml(t.source || "")}"><ruby>${escapeHtml(surface)}<rt>${escapeHtml(reading)}</rt></ruby></span>`;
    }
    cursor = end;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

function uniqueCandidates(token, currentReading) {
  const list = [];
  const push = (v) => {
    const s = String(v || "").trim();
    if (!s || list.includes(s)) return;
    list.push(s);
  };
  push(currentReading);
  for (const c of token?.candidates || []) push(c);
  return list;
}

/**
 * Apply a reading without opening the picker (table buttons).
 * @param {string} surface
 * @param {string} reading
 */
async function applyReadingDirect(surface, reading) {
  const read = String(reading || "").normalize("NFKC").trim();
  if (!isKanaReading(read)) {
    showError("ひらがなまたはカタカナの読みを選んでください。");
    return;
  }
  upsertPin(surface, read);
  closeDemoPicker();
  await runAnalyze({ fromPicker: true });
}

/**
 * Open picker anchored to an arbitrary element (table 「直す」).
 * @param {HTMLElement} anchor
 * @param {string} surface
 * @param {string} current
 * @param {number} tokenIndex
 */
function openDemoPickerAt(anchor, surface, current, tokenIndex) {
  const fake = document.createElement("span");
  fake.className = "demo-ruby-word";
  fake.setAttribute("data-surface", surface);
  fake.setAttribute("data-reading", current);
  fake.setAttribute("data-token-index", String(tokenIndex));
  openDemoPicker(fake, anchor);
}

/**
 * @param {HTMLElement} wordEl
 * @param {HTMLElement} [anchorEl]
 */
function openDemoPicker(wordEl, anchorEl) {
  closeDemoPicker();
  const surface = wordEl.getAttribute("data-surface") || "";
  const current = wordEl.getAttribute("data-reading") || "";
  if (!surface) return;

  const idx = Number.parseInt(wordEl.getAttribute("data-token-index") || "", 10);
  const token =
    lastResult?.tokens && Number.isFinite(idx)
      ? [...lastResult.tokens].sort((a, b) => a.span[0] - b.span[0])[idx]
      : null;
  const candidates = uniqueCandidates(token, current);

  const popup = document.createElement("div");
  popup.id = PICKER_ID;
  popup.className = "demo-reading-picker";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", `${surface}の読みを変更`);

  const candHtml = candidates
    .map(
      (c) =>
        `<button type="button" class="demo-pick-cand${c === current ? " is-current" : ""}" data-reading="${escapeHtml(c)}">${escapeHtml(c)}</button>`
    )
    .join("");

  popup.innerHTML = `
    <div class="demo-pick-head">
      <strong>${escapeHtml(surface)}</strong>
      <span>の読みを直す</span>
      <button type="button" class="demo-pick-close" aria-label="閉じる">×</button>
    </div>
    <div class="demo-pick-cands">${candHtml || "<span class='hint'>候補なし — 下に入力</span>"}</div>
    <label class="demo-pick-custom">
      <span>候補にない読み（ひらがな／カタカナ）</span>
      <input type="text" inputmode="kana" autocomplete="off" spellcheck="false" placeholder="例: まちなか" value="" />
    </label>
    <div class="demo-pick-actions">
      <button type="button" class="btn small" data-apply-custom>この読みにする</button>
    </div>
    <p class="hint demo-pick-msg" hidden></p>
  `;

  document.body.appendChild(popup);

  const anchor = anchorEl instanceof HTMLElement ? anchorEl : wordEl;
  const rect = anchor.getBoundingClientRect();
  const pad = 8;
  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 6;
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  const box = popup.getBoundingClientRect();
  if (box.right > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - box.width - pad) + window.scrollX;
    popup.style.left = `${left}px`;
  }
  if (box.bottom > window.innerHeight - pad) {
    top = Math.max(pad, rect.top + window.scrollY - box.height - 6);
    popup.style.top = `${top}px`;
  }

  const input = popup.querySelector("input");
  const msg = popup.querySelector(".demo-pick-msg");

  const applyReading = async (reading) => {
    const read = String(reading || "").normalize("NFKC").trim();
    if (!isKanaReading(read)) {
      if (msg) {
        msg.hidden = false;
        msg.textContent = "ひらがなまたはカタカナで入力してください。";
      }
      return;
    }
    upsertPin(surface, read);
    closeDemoPicker();
    await runAnalyze({ fromPicker: true });
  };

  popup.querySelector(".demo-pick-close")?.addEventListener("click", () => closeDemoPicker());
  popup.querySelectorAll(".demo-pick-cand").forEach((btn) => {
    btn.addEventListener("click", () => {
      void applyReading(btn.getAttribute("data-reading") || "");
    });
  });
  popup.querySelector("[data-apply-custom]")?.addEventListener("click", () => {
    void applyReading(input?.value || "");
  });
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void applyReading(input.value || "");
    }
  });

  // 開いた直後の同じ pointerdown で閉じないよう次フレームから監視
  requestAnimationFrame(() => {
    const onDoc = (e) => {
      if (popup.contains(e.target)) return;
      closeDemoPicker();
      document.removeEventListener("pointerdown", onDoc, true);
    };
    document.addEventListener("pointerdown", onDoc, true);
  });
  const onKey = (e) => {
    if (e.key === "Escape") {
      closeDemoPicker();
      document.removeEventListener("keydown", onKey, true);
    }
  };
  document.addEventListener("keydown", onKey, true);
  input?.focus();
}

function renderResult(text, data) {
  const tokens = data.tokens || [];
  lastResult = { text, tokens };
  closeDemoPicker();
  rubyOut.innerHTML = buildRubyHtml(text, tokens);
  fullReading.textContent = data.reading ? `かな通し: ${data.reading}` : "";

  const sorted = [...tokens].sort((a, b) => a.span[0] - b.span[0]);
  resultBody.innerHTML = sorted
    .map((t, i) => {
      const surface = t.surface || text.slice(t.span[0], t.span[1]);
      const reading = t.reading || "";
      const editable = /[\u3400-\u9fff\uF900-\uFAFF]/.test(surface) && Boolean(reading);
      const cands = uniqueCandidates(t, reading)
        .map((c) => {
          const current = c === reading;
          if (!editable) {
            return current ? `<b>${escapeHtml(c)}</b>` : escapeHtml(c);
          }
          return `<button type="button" class="demo-table-cand${current ? " is-current" : ""}" data-surface="${escapeHtml(surface)}" data-reading="${escapeHtml(c)}" title="この読みに直す">${escapeHtml(c)}</button>`;
        })
        .join(" ");
      const conf =
        typeof t.confidence === "number" ? t.confidence.toFixed(3) : "—";
      const fixBtn = editable
        ? `<button type="button" class="btn ghost small demo-table-fix" data-token-index="${i}" data-surface="${escapeHtml(surface)}" data-reading="${escapeHtml(reading)}">直す</button>`
        : "—";
      return `<tr data-token-index="${i}">
        <td>${escapeHtml(surface)}</td>
        <td>${escapeHtml(reading)}</td>
        <td>${conf}</td>
        <td>${escapeHtml(sourceLabel(t.source))}</td>
        <td><span class="cand-list">${cands || "—"}</span></td>
        <td>${fixBtn}</td>
      </tr>`;
    })
    .join("");
  resultBlock.hidden = false;

  // 直し方が分かるよう、固定リストを開いておく
  const pinsDetails = pinsEl?.closest?.("details");
  if (pinsDetails) pinsDetails.open = true;
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

async function submitProposals(entries) {
  const base = apiEl.value.replace(/\/$/, "");
  const res = await fetchWithColdStart(
    `${base}/v1/proposals`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries,
        source: "demo",
        note: "",
      }),
    },
    { attempts: 2, label: "提案" }
  );
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const detail = data.detail || text || res.status;
    throw new Error(
      res.status === 429
        ? "少し間隔を空けてから再度お試しください（提案のクールダウン）。"
        : friendlyHttpError(res.status, String(detail))
    );
  }
  return data;
}

function showProposeStatus(msg, { ok = true } = {}) {
  const el = $("#pin-propose-status");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
  el.dataset.state = ok ? "ok" : "err";
}

function syncProposeButton() {
  const btn = $("#pin-propose");
  if (!btn) return;
  btn.disabled = collectUserDict().length === 0;
}

async function runProposeOnly() {
  showError("");
  showProposeStatus("");
  const entries = collectUserDict();
  if (!entries.length) {
    showProposeStatus("固定リストに「漢字 かな」を1行以上書いてください。", {
      ok: false,
    });
    return;
  }
  const btn = $("#pin-propose");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "送信中…";
  }
  try {
    const data = await submitProposals(entries);
    const sum = data.summary || {};
    showProposeStatus(
      `受け取りました（公開なし）。審査待ち ${sum.pending || 0} / 承認 ${sum.accepted || 0} / 却下 ${sum.rejected || 0}`,
      { ok: true }
    );
  } catch (err) {
    showProposeStatus(String(err.message || err), { ok: false });
  } finally {
    if (btn) {
      btn.textContent = "候補だけ送る";
      syncProposeButton();
    }
  }
}

async function runAnalyze(options = {}) {
  showError("");
  if (!options.fromPicker) showProposeStatus("");
  const text = inputEl.value.trim();
  if (!text) {
    showError("文を入力してください。");
    return;
  }
  const base = apiEl.value.replace(/\/$/, "");
  const btn = $("#run-btn");
  btn.disabled = true;
  btn.textContent = "付けています…";
  const pins = collectUserDict();
  // ピッカーからの再実行では勝手に共有送信しない
  const share =
    !options.fromPicker && Boolean($("#pin-share-proposal")?.checked);
  try {
    const res = await fetchWithColdStart(
      `${base}/v1/readings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          user_dict: pins,
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

    if (share && pins.length) {
      try {
        const prop = await submitProposals(pins);
        const sum = prop.summary || {};
        showProposeStatus(
          `共有候補を受け取りました（即公開しません）。待ち ${sum.pending || 0} / 承認 ${sum.accepted || 0} / 却下 ${sum.rejected || 0}`,
          { ok: true }
        );
      } catch (err) {
        showProposeStatus(
          `ルビは表示できましたが、候補送信に失敗: ${err.message || err}`,
          { ok: false }
        );
      }
    } else if (options.fromPicker) {
      showProposeStatus(
        "読みを固定リストに反映しました。共有に送る場合はチェックを入れて「候補だけ送る」を押してください。",
        { ok: true }
      );
    }
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

rubyOut?.addEventListener("click", (e) => {
  const word = e.target?.closest?.(".demo-ruby-word");
  if (!word || !rubyOut.contains(word)) return;
  e.preventDefault();
  openDemoPicker(word);
});
rubyOut?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const word = e.target?.closest?.(".demo-ruby-word");
  if (!word || !rubyOut.contains(word)) return;
  e.preventDefault();
  openDemoPicker(word);
});

resultBody?.addEventListener("click", (e) => {
  const cand = e.target?.closest?.(".demo-table-cand");
  if (cand && resultBody.contains(cand)) {
    e.preventDefault();
    void applyReadingDirect(
      cand.getAttribute("data-surface") || "",
      cand.getAttribute("data-reading") || ""
    );
    return;
  }
  const fix = e.target?.closest?.(".demo-table-fix");
  if (fix && resultBody.contains(fix)) {
    e.preventDefault();
    const idx = Number.parseInt(fix.getAttribute("data-token-index") || "", 10);
    openDemoPickerAt(
      fix,
      fix.getAttribute("data-surface") || "",
      fix.getAttribute("data-reading") || "",
      idx
    );
  }
});

$("#pin-clear")?.addEventListener("click", () => {
  pinsEl.value = "";
  syncProposeButton();
  showProposeStatus("");
});
$("#pin-propose")?.addEventListener("click", () => {
  void runProposeOnly();
});
pinsEl?.addEventListener("input", syncProposeButton);
$("#run-btn").addEventListener("click", () => {
  void runAnalyze();
});
apiEl.addEventListener("change", checkHealth);

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", "true");
    inputEl.value = chip.dataset.sample || "";
    void runAnalyze();
  });
});

inputEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    void runAnalyze();
  }
});

const params = new URLSearchParams(location.search);
const qText = params.get("text");
if (qText) {
  inputEl.value = qText;
}

checkHealth().then((ok) => {
  syncProposeButton();
  if (ok) void runAnalyze();
});
