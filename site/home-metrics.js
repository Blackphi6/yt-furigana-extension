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
  // Keep HTML fallback; only refresh host if config differs.
  const text = el.textContent || "";
  if (text.includes("東海林") || text.includes("しょうじ") || !text.trim()) {
    el.textContent = `# 字幕デモ向け — 町中の読み分け
curl -s ${base}/v1/readings \\
  -H 'Content-Type: application/json' \\
  -d '{
    "text": "町中のカフェに入ると、その噂が町中に広まった。",
    "return_candidates": true
  }'`;
    return;
  }
  el.textContent = text.replace(
    /https?:\/\/[^\s/]+(?:\/[^\s]*)?\/v1\/readings/g,
    `${base}/v1/readings`
  );
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
