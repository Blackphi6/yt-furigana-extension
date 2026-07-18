function pct(rate) {
  if (typeof rate !== "number" || Number.isNaN(rate)) return "—";
  return `${(100 * rate).toFixed(1)}%`;
}

function deltaLabel(delta) {
  if (typeof delta !== "number" || Number.isNaN(delta)) return "baseline比 —";
  if (Math.abs(delta) < 1e-9) return "baseline比 ±0";
  const sign = delta > 0 ? "+" : "";
  return `baseline比 ${sign}${(100 * delta).toFixed(1)}pt`;
}

function fillCard(id, value, meta) {
  const card = document.getElementById(id);
  if (!card) return;
  card.querySelector(".score-value").textContent = value;
  card.querySelector(".score-meta").textContent = meta;
}

function demoHref(text) {
  return `./reading-demo.html?text=${encodeURIComponent(text)}`;
}

function renderSpark(entries) {
  const spark = document.getElementById("spark");
  const hint = document.getElementById("spark-hint");
  const rates = entries
    .map((e) => e?.benches?.["hard-heteronym"]?.rate)
    .filter((r) => typeof r === "number");
  if (!rates.length) {
    spark.innerHTML = "";
    hint.textContent = "履歴がまだありません。日次ループ後に棒が増えます。";
    return;
  }
  const min = Math.min(...rates, 0.8);
  const max = Math.max(...rates, 1);
  const span = Math.max(max - min, 0.05);
  spark.innerHTML = rates
    .map((r, i) => {
      const h = 18 + ((r - min) / span) * 54;
      const latest = i === rates.length - 1 ? " is-latest" : "";
      return `<div class="spark-bar${latest}" style="height:${h.toFixed(1)}px" title="${pct(r)}"></div>`;
    })
    .join("");
  hint.textContent = `${rates.length} 回分 · 最新 hard ${pct(rates[rates.length - 1])}`;
}

function renderSamples(samples) {
  const list = document.getElementById("sample-list");
  if (!samples?.length) {
    list.innerHTML = "<li class=\"text\">今回の新規サンプルはありません。</li>";
    return;
  }
  list.innerHTML = samples
    .map((s) => {
      const label = `${s.surface || "?"} → ${s.gold || "?"}`;
      const text = s.text || "";
      return `<li>
        <div class="surface">${label}</div>
        <a class="gold" href="${demoHref(text)}">デモで検証</a>
        <div class="text">${text}</div>
      </li>`;
    })
    .join("");
}

async function main() {
  const status = document.getElementById("report-status");
  try {
    const [reportRes, historyRes] = await Promise.all([
      fetch("./data/learning-report.json", { cache: "no-store" }),
      fetch("./data/learning-history.json", { cache: "no-store" }),
    ]);
    if (!reportRes.ok) throw new Error(`report HTTP ${reportRes.status}`);
    const report = await reportRes.json();
    const history = historyRes.ok ? await historyRes.json() : { entries: [] };

    const when = report.ts ? new Date(report.ts).toLocaleString("ja-JP") : "—";
    status.dataset.state = report.gateOk ? "ok" : "fail";
    status.textContent = `${when} · mode=${report.mode || "—"} · gate ${
      report.gateOk ? "PASS" : "FAIL"
    }`;

    const seed = report.benches?.["seed-bench"];
    const hard = report.benches?.["hard-heteronym"];
    const easy = report.benches?.["easy-regression"];
    fillCard(
      "card-seed",
      pct(seed?.rate),
      `${seed?.passed ?? "—"}/${seed?.total ?? "—"} · ${deltaLabel(report.vsBaseline?.["seed-bench"]?.deltaRate)}`
    );
    fillCard(
      "card-hard",
      pct(hard?.rate),
      `${hard?.passed ?? "—"}/${hard?.total ?? "—"} · ${deltaLabel(report.vsBaseline?.["hard-heteronym"]?.deltaRate)}`
    );
    fillCard(
      "card-easy",
      pct(easy?.rate),
      `${easy?.passed ?? "—"}/${easy?.total ?? "—"} · ${deltaLabel(report.vsBaseline?.["easy-regression"]?.deltaRate)}`
    );
    const corpus = report.corpus || {};
    const delta =
      typeof corpus.delta === "number"
        ? `Δ${corpus.delta >= 0 ? "+" : ""}${corpus.delta}`
        : "Δ—";
    fillCard(
      "card-corpus",
      String(corpus.total ?? "—"),
      `${delta} · ルール ${report.overrides?.phraseCount ?? 0}p / ${report.overrides?.contextRuleCount ?? 0}c`
    );

    document.getElementById("report-note").textContent = report.note || "—";
    renderSpark(history.entries || []);
    renderSamples(report.newSamples || []);
  } catch (err) {
    status.dataset.state = "fail";
    status.textContent = `レポートを読めませんでした: ${err.message}`;
  }
}

main();
