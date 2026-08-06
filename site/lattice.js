/**
 * 運用向け LLM ラティス・ビューア
 * - learning-report.json … 直近ラン／累積ベンチ
 * - lattice-feed.json … 候補ラティス一覧
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function demoHref(text) {
  return `./reading-demo.html?text=${encodeURIComponent(text)}`;
}

function formatWhen(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("ja-JP");
}

function pct(rate) {
  if (typeof rate !== "number" || Number.isNaN(rate)) return "—";
  return `${(100 * rate).toFixed(1)}%`;
}

function sourceClass(source) {
  const s = String(source || "");
  if (/disagree|no_consensus/i.test(s)) return "is-disagree";
  if (/agree/i.test(s)) return "is-agree";
  return "";
}

function isFileProtocol() {
  return typeof location !== "undefined" && location.protocol === "file:";
}

/**
 * @param {object} entry
 */
function renderCandidates(entry) {
  const cands = Array.isArray(entry.candidates) ? entry.candidates : [];
  const gold = String(entry.gold || "");
  const verify = entry.verify_guess ? String(entry.verify_guess) : "";
  const arb = entry.arbitrate_guess ? String(entry.arbitrate_guess) : "";
  if (!cands.length) {
    return `<span class="lattice-cand">${escapeHtml(gold || "—")}</span>`;
  }
  return cands
    .map((c) => {
      const classes = ["lattice-cand"];
      if (c === gold) classes.push("is-gold");
      if (verify && c === verify) classes.push("is-verify");
      if (arb && c === arb) classes.push("is-arb");
      return `<span class="${classes.join(" ")}">${escapeHtml(c)}</span>`;
    })
    .join("");
}

/**
 * @param {object} entry
 */
function renderCard(entry) {
  const models = [entry.generator, entry.verifier, entry.arbitrator]
    .filter(Boolean)
    .join(" · ");
  const hasRaw = Boolean(entry.verify_raw || entry.arb_raw);
  const rawBlock = hasRaw
    ? `<details class="lattice-raw">
        <summary>verify / arb raw</summary>
        <pre>verify: ${escapeHtml(entry.verify_raw || "(empty)")}
arb: ${escapeHtml(entry.arb_raw || "(empty)")}</pre>
      </details>`
    : "";
  const note = entry.note
    ? `<p class="lattice-note">${escapeHtml(entry.note)}</p>`
    : "";
  return `<article class="lattice-card">
    <div class="lattice-card-head">
      <span class="lattice-surface">${escapeHtml(entry.surface)}</span>
      <span class="lattice-gold">gold ${escapeHtml(entry.gold || "—")}</span>
      <span class="lattice-source ${sourceClass(entry.source)}">${escapeHtml(entry.source || "—")}</span>
      <span class="lattice-meta">${escapeHtml(formatWhen(entry.ts) || "—")}</span>
    </div>
    <p class="lattice-text">${escapeHtml(entry.text)}</p>
    ${note}
    <div class="lattice-cands" aria-label="候補">${renderCandidates(entry)}</div>
    <p class="lattice-models">${escapeHtml(models || "モデル情報なし（コーパス行）")}</p>
    <div class="lattice-actions">
      <a href="${demoHref(entry.text)}">デモで検証</a>
      ${
        entry.verify_guess
          ? `<span class="hint">verify ${escapeHtml(entry.verify_guess)}</span>`
          : ""
      }
      ${
        entry.arbitrate_guess
          ? `<span class="hint">arb ${escapeHtml(entry.arbitrate_guess)}</span>`
          : ""
      }
    </div>
    ${rawBlock}
  </article>`;
}

function fillSourceOptions(bySource) {
  const sel = document.getElementById("filter-source");
  if (!sel) return;
  const current = sel.value;
  const keys = Object.keys(bySource || {}).sort();
  sel.innerHTML =
    `<option value="">すべて</option>` +
    keys
      .map(
        (k) =>
          `<option value="${escapeHtml(k)}">${escapeHtml(k)} (${bySource[k]})</option>`
      )
      .join("");
  if (keys.includes(current)) sel.value = current;
}

/**
 * @param {object[]} entries
 * @param {{ surface: string, source: string, q: string, recentOnly: boolean, recentKeys: Set<string> }} filters
 */
function filterEntries(entries, filters) {
  const surface = filters.surface.trim();
  const source = filters.source.trim();
  const q = filters.q.trim().toLowerCase();
  return entries.filter((e) => {
    if (filters.recentOnly) {
      const key = `${e.surface}\0${e.text}`;
      if (!filters.recentKeys.has(key)) return false;
    }
    if (surface && !String(e.surface || "").includes(surface)) return false;
    if (source && String(e.source || "") !== source) return false;
    if (q) {
      const hay = [
        e.text,
        e.surface,
        e.gold,
        e.source,
        e.note,
        e.generator,
        e.verifier,
        e.arbitrator,
        ...(e.candidates || []),
      ]
        .join("\n")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * @param {object | null} report
 */
function renderLatestRun(report) {
  const meta = document.getElementById("run-meta");
  const note = document.getElementById("run-note");
  const list = document.getElementById("run-samples");
  if (!report) {
    meta.textContent = "学習レポート未取得";
    note.textContent = "—";
    list.innerHTML = "";
    return new Set();
  }
  const when = formatWhen(report.ts);
  const delta = report.corpus?.delta;
  const deltaLabel =
    typeof delta === "number"
      ? delta > 0
        ? `素材 +${delta}`
        : delta === 0
          ? "素材増なし"
          : `素材 ${delta}`
      : "—";
  meta.textContent = `${when} · mode=${report.mode || "—"} · gate ${
    report.gateOk ? "PASS" : "FAIL"
  } · ${deltaLabel}`;
  note.textContent = report.note || "（注記なし）";

  const samples = Array.isArray(report.newSamples) ? report.newSamples : [];
  /** @type {Set<string>} */
  const keys = new Set();
  if (!samples.length) {
    list.innerHTML =
      "<li class=\"text\">このランの新規サンプル表記はありません（コーパス増分のみの場合あり）。</li>";
    return keys;
  }
  list.innerHTML = samples
    .map((s) => {
      keys.add(`${s.surface || ""}\0${s.text || ""}`);
      const label = `${s.surface || "?"} → ${s.gold || "?"}`;
      return `<li>
        <div class="surface">${escapeHtml(label)}</div>
        <a class="gold" href="${demoHref(s.text || "")}">デモで検証</a>
        <div class="text">${escapeHtml(s.text || "")}</div>
      </li>`;
    })
    .join("");
  return keys;
}

async function main() {
  const status = document.getElementById("lattice-status");
  const listEl = document.getElementById("lattice-list");
  const hint = document.getElementById("list-hint");
  /** @type {object[]} */
  let allEntries = [];
  /** @type {Set<string>} */
  let recentKeys = new Set();

  if (isFileProtocol()) {
    status.dataset.state = "fail";
    status.textContent =
      "file:// では JSON を読めません。GitHub Pages かローカルサーバで開いてください。";
    listEl.innerHTML =
      `<p class="lattice-empty">例: <code>npx serve site</code> のあと ` +
      `<code>http://127.0.0.1:3000/lattice.html</code></p>`;
    return;
  }

  function render() {
    const filters = {
      surface: document.getElementById("filter-surface")?.value || "",
      source: document.getElementById("filter-source")?.value || "",
      q: document.getElementById("filter-q")?.value || "",
      recentOnly: Boolean(document.getElementById("filter-recent")?.checked),
      recentKeys,
    };
    const filtered = filterEntries(allEntries, filters);
    document.getElementById("sum-filtered").textContent = String(filtered.length);
    if (!filtered.length) {
      listEl.innerHTML = `<p class="lattice-empty">条件に合うエントリがありません。</p>`;
      hint.textContent = "";
      return;
    }
    listEl.innerHTML = filtered.map(renderCard).join("");
    hint.textContent = `${filtered.length} 件 · gold=塗 / verify=緑下線 / arb=青下線`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
    let feedRes;
    let reportRes;
    try {
      [feedRes, reportRes] = await Promise.all([
        fetch("./data/lattice-feed.json", {
          cache: "no-store",
          signal: controller.signal,
        }),
        fetch("./data/learning-report.json", {
          cache: "no-store",
          signal: controller.signal,
        }),
      ]);
    } finally {
      window.clearTimeout(timeoutId);
    }
    if (!feedRes.ok) throw new Error(`lattice-feed HTTP ${feedRes.status}`);
    const feed = await feedRes.json();
    const report = reportRes.ok ? await reportRes.json() : null;

    allEntries = Array.isArray(feed.entries) ? feed.entries : [];
    recentKeys = renderLatestRun(report);

    const corpusTotal =
      report?.corpus?.total ?? feed.summary?.corpusCount ?? allEntries.length;
    document.getElementById("sum-corpus").textContent = String(corpusTotal);
    const delta = report?.corpus?.delta;
    document.getElementById("sum-corpus-meta").textContent =
      typeof delta === "number" ? `直近 Δ${delta >= 0 ? "+" : ""}${delta}` : "synth-open";

    document.getElementById("sum-lattice").textContent = String(
      feed.summary?.shown ?? allEntries.length
    );
    document.getElementById("sum-lattice-meta").textContent = `総 ${
      feed.summary?.total ?? allEntries.length
    } · log ${feed.summary?.logCount ?? "—"}`;

    const hard = report?.benches?.["hard-heteronym"];
    document.getElementById("sum-hard").textContent = pct(hard?.rate);
    document.getElementById("sum-hard-meta").textContent = hard
      ? `${hard.passed}/${hard.total}`
      : "—";

    const bySource = feed.summary?.bySource || {};
    document.getElementById("sum-sources").textContent = Object.entries(bySource)
      .slice(0, 4)
      .map(([k, v]) => `${k}:${v}`)
      .join(" · ");
    fillSourceOptions(bySource);

    status.dataset.state = report?.gateOk === false ? "fail" : "ok";
    status.textContent = `直近ラン ${formatWhen(report?.ts)} · feed ${formatWhen(
      feed.ts
    )} · 表示 ${feed.summary?.shown ?? allEntries.length} 件`;

    // 直近サンプルがあるときはデフォルトでそこに絞る（「今日やったこと」感）
    const recentCb = document.getElementById("filter-recent");
    if (recentCb && recentKeys.size > 0) {
      recentCb.checked = true;
    }
    render();
  } catch (err) {
    status.dataset.state = "fail";
    status.textContent = `読み込み失敗: ${err.message || err}`;
    listEl.innerHTML =
      `<p class="lattice-empty">site/data/lattice-feed.json を用意してください。` +
      `<code>npm run learn:lattice-feed</code> のあと Pages へ push。</p>`;
    return;
  }

  for (const id of ["filter-surface", "filter-source", "filter-q", "filter-recent"]) {
    document.getElementById(id)?.addEventListener("input", render);
    document.getElementById(id)?.addEventListener("change", render);
  }
}

main();
