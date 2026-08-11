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

function shortLabel(label) {
  const map = {
    "yt-furigana (Sudachi+phrases+context)": "YT Furigana",
    "yt-furigana (Kuromoji+phrases+context)": "YT Furigana · Kuromoji",
    "yt-furigana Sudachi+phrases": "YT Furigana",
    "sudachi-only": "Sudachi のみ",
    "kuromoji-only": "Kuromoji のみ",
    "fugashi UniDic": "fugashi UniDic",
    "gemini-3.1-flash-tts-preview": "Gemini 3.1 Flash TTS",
    "gemini-2.5-pro-tts": "Gemini 2.5 Pro TTS",
    "voicevox (OpenJTalk dict)": "VOICEVOX",
    "openai gpt-4o-mini-tts": "OpenAI mini TTS",
    "qwen3-tts-flash": "Qwen3 TTS"
  };
  return map[label] || label;
}

/**
 * 横棒グラフを描画。accuracy 系は rate、CER 系は cer（低いほど短い棒にしない＝誤り率の大きさ）。
 * @param {HTMLElement|null} root
 * @param {Array<{label:string,value:number,kind?:string,note?:string}>} rows
 * @param {{ max?: number, format?: (n:number)=>string }} [opts]
 */
function renderBars(root, rows, opts = {}) {
  if (!root) return;
  const max = opts.max ?? 1;
  const format =
    opts.format ||
    ((n) => `${(100 * n).toFixed(1)}%`);
  root.innerHTML = rows
    .map((row, i) => {
      const value = Math.max(0, Number(row.value) || 0);
      const width = Math.min(100, (100 * value) / max);
      const kind = row.kind || "ours";
      const note = row.note ? `<span class="bar-note">${row.note}</span>` : "";
      return `<div class="bar-row bar-row--${kind}" style="--i:${i}">
        <div class="bar-label">
          <span>${shortLabel(row.label)}</span>
          ${note}
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="--w:${width.toFixed(2)}%"></div>
        </div>
        <div class="bar-value">${format(value)}</div>
      </div>`;
    })
    .join("");
  // レイアウト後に幅アニメ（CSS --w）
  requestAnimationFrame(() => {
    root.classList.add("is-ready");
  });
}

function pickG2pRows(report) {
  const ours = (report.jaTtsG2p || []).map((r) => ({
    label: r.label,
    value: r.rate,
    kind: String(r.label).includes("yt-furigana") ? "ours" : "base"
  }));
  // Kuromoji フルは Sudachi フルとほぼ同じなのでチャートは代表だけ
  const preferred = new Set([
    "yt-furigana (Sudachi+phrases+context)",
    "sudachi-only",
    "kuromoji-only"
  ]);
  const core = ours.filter((r) => preferred.has(r.label));
  const refs = (report.publishedTtsLeaderboardRef || [])
    .filter((r) =>
      [
        "gemini-3.1-flash-tts-preview",
        "voicevox (OpenJTalk dict)",
        "openai gpt-4o-mini-tts"
      ].includes(r.engine)
    )
    .map((r) => ({
      label: r.engine,
      value: r.acc,
      kind: "ref",
      note: "音声・参考"
    }));
  // 高い順ではなく「自エンジン → ベース → 参考」の説明順
  return [...core, ...refs];
}

function renderSnippet() {
  const base = apiBase();
  const el = document.getElementById("api-snippet");
  if (!el) return;
  const text = el.textContent || "";
  if (text.includes("user_dict") || text.includes("固有名詞は") || !text.trim()) {
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

async function loadPublicG2p() {
  try {
    const res = await fetch("./data/public-g2p-bench.json", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const report = await res.json();
    const head = report.headline || {};
    fill("stat-g2p", pct(head.accuracy));
    fill("stat-joyo", pct(head.joyoBest?.accuracy));

    const g2pTotal = report.jaTtsG2p?.[0]?.total || head.total || 151;
    fill(
      "g2p-meta",
      `${head.passed ?? "—"}/${g2pTotal} · text-side · ${String(report.generatedAt || "").slice(0, 10)}`
    );
    renderBars(document.getElementById("g2p-bars"), pickG2pRows(report), {
      max: 1
    });

    const joyo = report.joyoKanjiYomi || [];
    const joyoBest = head.joyoBest || joyo.at(-1);
    fill(
      "joyo-meta",
      joyoBest
        ? `${joyoBest.passed}/${joyoBest.total} · text-side`
        : "—"
    );
    renderBars(
      document.getElementById("joyo-bars"),
      joyo.map((r) => ({
        label: r.label,
        value: r.rate,
        kind: String(r.label).includes("yt-furigana") ? "ours" : "base"
      })),
      { max: 1 }
    );

    const jvs = report.jvsCer || [];
    fill("jvs-meta", jvs[0] ? `低いほど良い · n=${jvs[0].n}` : "—");
    const cerMax = Math.max(0.15, ...jvs.map((r) => r.cer || 0));
    renderBars(
      document.getElementById("jvs-bars"),
      jvs.map((r) => ({
        label: r.label,
        value: r.cer,
        kind: String(r.label).includes("yt-furigana") ? "ours" : "base"
      })),
      {
        max: cerMax,
        format: (n) => `${(100 * n).toFixed(2)}%`
      }
    );
  } catch {
    fill("stat-g2p", "—");
    fill("stat-joyo", "—");
  }
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
    fill("acc-seed", pct(seed?.rate));
    fill("acc-seed-meta", `${seed?.passed ?? "—"}/${seed?.total ?? "—"}`);
    fill("acc-hard", pct(hard?.rate));
    fill("acc-hard-meta", `${hard?.passed ?? "—"}/${hard?.total ?? "—"}`);
    fill("acc-easy", pct(easy?.rate));
    fill("acc-easy-meta", `${easy?.passed ?? "—"}/${easy?.total ?? "—"}`);
  } catch {
    fill("stat-hard", "—");
  }
}

renderSnippet();
loadPublicG2p();
loadMetrics();
