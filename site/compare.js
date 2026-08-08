/**
 * 読み分け並比デモ（固定例）。
 * 左: 文脈なし形態素の典型 / 右: YT Furigana 期待読み
 */
import { buildRuby, escapeHtml, hasKanji } from "./build-ruby.js";

const API =
  (typeof globalThis !== "undefined" &&
    globalThis.YT_FURIGANA_SITE &&
    globalThis.YT_FURIGANA_SITE.readingApiUrl) ||
  "https://yt-furigana-readings.onrender.com";

const $ = (sel) => document.querySelector(sel);

/**
 * @typedef {{ surface: string, reading: string }} Hit
 * @typedef {{
 *   id: string,
 *   title: string,
 *   why: string,
 *   text: string,
 *   naiveHits: Hit[],
 *   oursHits: Hit[],
 * }} Case
 */

/** @type {Case[]} */
export const COMPARE_CASES = [
  {
    id: "machinaka",
    title: "町中 — まちなか / まちじゅう",
    why: "同じ表層が一文に二回。街なかか、町全体かで読みが分かれる。",
    text: "町中のカフェに入ると、その噂が町中に広まった。",
    naiveHits: [
      { surface: "町中", reading: "まちなか" },
      { surface: "町中", reading: "まちなか" },
    ],
    oursHits: [
      { surface: "町中", reading: "まちなか" },
      { surface: "町中", reading: "まちじゅう" },
    ],
  },
  {
    id: "kaze",
    title: "風 — かぜ / ふう",
    why: "自然現象の「かぜ」と、様子を表す「ふう」。辞書第一候補だけでは揃いやすい。",
    text: "風が強くて帽子が飛んだ。こんな風に書いてみた。",
    naiveHits: [
      { surface: "風", reading: "かぜ" },
      { surface: "風", reading: "かぜ" },
    ],
    oursHits: [
      { surface: "風", reading: "かぜ" },
      { surface: "風", reading: "ふう" },
    ],
  },
  {
    id: "hyou",
    title: "表 — ひょう / おもて",
    why: "一覧の「ひょう」と、表に出る「おもて」。",
    text: "成績を表にまとめた。表に出て説明した。",
    naiveHits: [
      { surface: "表", reading: "おもて" },
      { surface: "表", reading: "おもて" },
    ],
    oursHits: [
      { surface: "表", reading: "ひょう" },
      { surface: "表", reading: "おもて" },
    ],
  },
  {
    id: "tsuitachi",
    title: "一日 — いちにち / ついたち",
    why: "カレンダーの初日は「ついたち」。文脈なしだと「いちにち」になりやすい。",
    text: "五月一日に株式市場が再開した。",
    naiveHits: [{ surface: "一日", reading: "いちにち" }],
    oursHits: [{ surface: "一日", reading: "ついたち" }],
  },
  {
    id: "ireru",
    title: "入れる — いれる / はいれる",
    why: "他動詞と可能。読点前後で読みを分けたい典型。",
    text: "水を入れると、ここには入れる。",
    naiveHits: [
      { surface: "入れる", reading: "いれる" },
      { surface: "入れる", reading: "いれる" },
    ],
    oursHits: [
      { surface: "入れる", reading: "いれる" },
      { surface: "入れる", reading: "はいれる" },
    ],
  },
  {
    id: "kinsei",
    title: "金星 — きんせい / きんぼし",
    why: "惑星と、競技の金星。創作読みの穴埋めでも壊れやすい。",
    text: "金星がきれいだ。決勝で金星を取った。",
    naiveHits: [
      { surface: "金星", reading: "きんせい" },
      { surface: "金星", reading: "きんせい" },
    ],
    oursHits: [
      { surface: "金星", reading: "きんせい" },
      { surface: "金星", reading: "きんぼし" },
    ],
  },
];

/**
 * 文中の surface 出現順に hits を当てて ruby HTML を作る。
 * @param {string} text
 * @param {Hit[]} hits
 * @param {Hit[]} [peerHits] 左右差分ハイライト用
 */
export function renderRubyLine(text, hits, peerHits = []) {
  let html = "";
  let cursor = 0;
  let hi = 0;
  const peer = peerHits.map((h) => h.reading);
  while (hi < hits.length) {
    const hit = hits[hi];
    const idx = text.indexOf(hit.surface, cursor);
    if (idx < 0) {
      hi += 1;
      continue;
    }
    html += escapeHtml(text.slice(cursor, idx));
    const ruby = hasKanji(hit.surface)
      ? buildRuby(hit.surface, hit.reading)
      : escapeHtml(hit.surface);
    const differs = peer[hi] != null && peer[hi] !== hit.reading;
    html += differs ? `<mark class="diff">${ruby}</mark>` : ruby;
    cursor = idx + hit.surface.length;
    hi += 1;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

function renderCases() {
  const root = $("#cases");
  if (!root) return;
  root.innerHTML = COMPARE_CASES.map((c) => {
    const naiveHtml = renderRubyLine(c.text, c.naiveHits, c.oursHits);
    const oursHtml = renderRubyLine(c.text, c.oursHits, c.naiveHits);
    return `<article class="compare-card" id="case-${escapeHtml(c.id)}" data-case="${escapeHtml(c.id)}">
      <h2>${escapeHtml(c.title)}</h2>
      <p class="why">${escapeHtml(c.why)}</p>
      <div class="compare-grid">
        <div class="compare-col is-naive">
          <div class="label"><strong>文脈なし（典型）</strong><span>第一候補イメージ</span></div>
          <div class="ruby-line" lang="ja">${naiveHtml}</div>
        </div>
        <div class="compare-col is-ours">
          <div class="label"><strong>YT Furigana</strong><span>文脈あり</span></div>
          <div class="ruby-line" lang="ja" data-ours-line>${oursHtml}</div>
        </div>
      </div>
      <p class="compare-meta" data-live-meta>固定例（API未実行）</p>
    </article>`;
  }).join("");
}

/**
 * @param {string} text
 * @param {Hit[]} expected
 */
/**
 * 出現順で expected と同じ surface を API tokens から拾う。
 * @param {string} text
 * @param {Hit[]} expected
 */
async function verifyCase(text, expected) {
  const res = await fetch(`${API}/v1/readings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, user_dict: [], return_candidates: false }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const tokens = Array.isArray(data?.tokens) ? data.tokens : [];
  /** @type {Hit[]} */
  const got = [];
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (const exp of expected) {
    const nth = seen.get(exp.surface) || 0;
    seen.set(exp.surface, nth + 1);
    const ordered = tokens.filter((t) => String(t.surface) === exp.surface);
    const tok = ordered[nth];
    got.push({
      surface: exp.surface,
      reading: tok ? String(tok.reading || "") : "",
    });
  }
  const ok = got.every((g, i) => g.reading === expected[i].reading);
  return { ok, got, tokens };
}

async function runLiveVerify() {
  const status = $("#status");
  const btn = $("#live-btn");
  if (btn) btn.disabled = true;
  if (status) status.textContent = "公開APIで再検証中…（スリープ起き待ちあり）";
  let pass = 0;
  let fail = 0;
  try {
    for (const c of COMPARE_CASES) {
      const card = document.querySelector(`[data-case="${c.id}"]`);
      const meta = card?.querySelector("[data-live-meta]");
      const line = card?.querySelector("[data-ours-line]");
      try {
        const result = await verifyCase(c.text, c.oursHits);
        if (line) {
          line.innerHTML = renderRubyLine(c.text, result.got, c.naiveHits);
        }
        if (meta) {
          meta.dataset.live = result.ok ? "ok" : "ng";
          meta.textContent = result.ok
            ? "API再検証: 期待読みと一致"
            : `API再検証: 不一致（${result.got.map((g) => g.reading || "∅").join(" / ")}）`;
        }
        if (result.ok) pass += 1;
        else fail += 1;
      } catch (err) {
        fail += 1;
        if (meta) {
          meta.dataset.live = "ng";
          meta.textContent = `API失敗: ${String(err.message || err)}`;
        }
      }
    }
    if (status) {
      status.textContent = `再検証完了: 一致 ${pass} / 不一致または失敗 ${fail}`;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

if (typeof document !== "undefined") {
  renderCases();
  $("#live-btn")?.addEventListener("click", () => void runLiveVerify());
}
