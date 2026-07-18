function pct(rate) {
  if (typeof rate !== "number" || Number.isNaN(rate)) return "—";
  return `${(100 * rate).toFixed(1)}%`;
}

function fill(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function apiBase() {
  const cfg = window.YT_FURIGANA_SITE || {};
  return (cfg.readingApiUrl || "http://127.0.0.1:8765").replace(/\/$/, "");
}

function renderSnippet() {
  const base = apiBase();
  const el = document.getElementById("api-snippet");
  if (!el) return;
  el.textContent = `# 読み推定 — user_dict で固有名詞も指定できます
curl -s ${base}/v1/readings \\
  -H 'Content-Type: application/json' \\
  -d '{
    "text": "東海林さんが辛いラーメンを食べた。",
    "user_dict": [{"surface": "東海林", "reading": "しょうじ"}],
    "return_candidates": true
  }'`;
}

async function loadMetrics() {
  try {
    const res = await fetch("./data/learning-report.json", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const report = await res.json();
    const seed = report.benches?.["seed-bench"];
    const hard = report.benches?.["hard-heteronym"];
    const easy = report.benches?.["easy-regression"];
    fill("stat-hard", pct(hard?.rate));
    fill("stat-seed", pct(seed?.rate));
    fill("stat-corpus", String(report.corpus?.total ?? "—"));
    fill("acc-seed", pct(seed?.rate));
    fill("acc-seed-meta", `${seed?.passed ?? "—"}/${seed?.total ?? "—"}`);
    fill("acc-hard", pct(hard?.rate));
    fill("acc-hard-meta", `${hard?.passed ?? "—"}/${hard?.total ?? "—"}`);
    fill("acc-easy", pct(easy?.rate));
    fill("acc-easy-meta", `${easy?.passed ?? "—"}/${easy?.total ?? "—"}`);
  } catch {
    fill("stat-hard", "—");
    fill("stat-seed", "—");
    fill("stat-corpus", "—");
  }
}

renderSnippet();
loadMetrics();
