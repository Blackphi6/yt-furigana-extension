/**
 * TTS Furigana Arena の純関数。
 * ブラウザと Node テストの両方から import する（DOM に触らない）。
 */
import { buildRuby, escapeHtml, hasKanji } from "./build-ruby.js";

export const RESEARCH_AS_OF = "2026-08-14";

/** 調査時点の「無料で読める／呼べる」読み予測の見取り図。音声採点と text-side を混ぜない。 */
export const RESEARCH_ROWS = [
  {
    id: "sarashina",
    name: "Sarashina2.2-TTS",
    maker: "SB Intuitions",
    free: "重み公開・非商用",
    call: "GPU ローカル（公開推論なし）",
    score:
      "JKYB Kana-CER_kanji 7.83（Stage 2）。常用漢字の読み分けで公開 LLM-TTS 中 SOTA",
    note: "361k 時間＋常用漢字全読みの合成データ。PronSteering は非公開。",
    url: "https://github.com/sbintuitions/sarashina2.2-tts",
  },
  {
    id: "gemini-tts",
    name: "Gemini 3.1 Flash TTS",
    maker: "Google",
    free: "AI Studio 無料枠（変動）",
    call: "TTS API（音声）。text-side は Gemini Flash/Pro 生成",
    score: "ja-tts-g2p-bench 80.1%（151問・音声採点）",
    note: "同じ Gemini でも 2.5 Flash TTS は 55.6%。モデル差が大きい。",
    url: "https://github.com/filmapp/ja-tts-g2p-bench",
  },
  {
    id: "llm-g2p",
    name: "Claude Opus 4.6 / Gemini 3.1 Pro（G2P）",
    maker: "Anthropic / Google",
    free: "Gemini 無料枠。Claude は有料寄り",
    call: "テキスト API（parse / direct）",
    score: "JVS 3,000 文 kana CER 0.52% / 0.53%。OpenJTalk 1.03% を上回る",
    note: "CyberAgent 2026。大きいモデルほど強い。parse が大半で有利。",
    url: "https://arxiv.org/abs/2606.22009",
  },
  {
    id: "haqumei",
    name: "Haqumei",
    maker: "o24s",
    free: "Apache-2.0",
    call: "ローカル Rust / Python",
    score: "専用 G2P として pyopenjtalk-plus 系の精度＋高速バッチ",
    note: "OpenJTalk 系の現行トップ実装。ブラウザからは自前 HTTP が必要。",
    url: "https://github.com/o24s/haqumei",
  },
  {
    id: "voicevox",
    name: "VOICEVOX / OpenJTalk",
    maker: "VOICEVOX / Nagoya Institute of Technology",
    free: "ローカル無料",
    call: "VOICEVOX ENGINE",
    score: "ja-tts-g2p-bench 69.5%（辞書 TTS）",
    note: "クラウドニューラル TTS より読みは安定しやすいが、異読みは第一候補に寄る。",
    url: "https://github.com/VOICEVOX/voicevox",
  },
  {
    id: "parayomi",
    name: "Parayomi",
    maker: "Parakeet Inc.",
    free: "HF Space デモ",
    call: "Space は公開 predict API なし（/ping のみ）",
    score: "JKYB-Parakeet 専用 G2P として 99.8% 言及あり（別採点系）",
    note: "ふりがな特化。アリーナからはカスタム URL でのみ接続。",
    url: "https://huggingface.co/spaces/Parakeet-Inc/Parayomi",
  },
  {
    id: "yt",
    name: "YT Furigana",
    maker: "このサイト",
    free: "公開読み API（Render 無料枠）",
    call: "POST /v1/readings",
    score: "ja-tts-g2p-bench text-side 72.2%。JKYB 97%",
    note: "Sudachi＋フレーズ＋文脈。字幕ルビ用途。音声 TTS ではない。",
    url: "https://blackphi6.github.io/yt-furigana-extension/",
  },
];

/** 辞書第一候補の典型（文脈なし）。長い表層を優先して当てる。 */
export const NAIVE_PHRASES = {
  株式市場: "かぶしきしじょう",
  一人一人: "ひとりひとり",
  行方不明: "ゆくえふめい",
  大人気: "だいにんき",
  町中: "まちなか",
  一日: "いちにち",
  市場: "いちば",
  人気: "にんき",
  上手: "じょうず",
  下手: "へた",
  金星: "きんせい",
  行方: "ゆくえ",
  大人: "おとな",
  一人: "ひとり",
  日本: "にほん",
  今日: "きょう",
  明日: "あした",
  昨日: "きのう",
  先生: "せんせい",
  生い: "おい",
  行う: "おこなう",
  行く: "いく",
  開く: "ひらく",
  風: "かぜ",
  表: "おもて",
};

export const SAMPLE_TEXTS = [
  "深夜の路地は人気が無くて怖い。",
  "人気の絶えない観光地だが、一本裏道に入ると急に人気がなくなる。",
  "大事になる前に話し合うべき",
  "歌が上手な彼女は、交渉事でも常に一枚上手であり、舞台の上手で堂々と振る舞った。",
  "金の時計を買うために、一生懸命に金を貯めた。",
  "天気いいし、皆で表に出て遊ぼ？",
  "カブトムシの立派な角に止まった小さな虫を、指で軽く弾く。",
  "ギターを弾く銀髪の彼は何人だ？",
  "この美しい紅葉の絶景を独り占めすることなど、何人たりとも許されない。",
  "庭に植えた紅葉の木が立派に育ってきた。",
  "この先生きのこるには、文脈が要る。",
  "町中のカフェに入ると、その噂が町中に広まった。",
];

export const LLM_FURIGANA_PROMPT = `あなたは日本語のふりがな（ルビ）付け器です。
入力文から、漢字を含む語だけを出現順に JSON 配列で返してください。
形式: [{"surface":"表層","reading":"ひらがな"}]
規則:
- surface は入力に実際に現れる連続した表記。複合語はできるだけ長くまとめる
- reading は現代仮名遣いのひらがな。文脈に合う読みを選ぶ
- 助詞「は」「を」「へ」は出力しない（発音変換もしない）
- 数字＋助数詞は慣用読み（1本→いっぽん、2人→ふたり、一日→ついたち/いちにちは文脈で判断）
- JSON 配列以外は出力しない

入力:
`;

export function toHiragana(text) {
  return String(text || "").replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

/** 比較用。記号・空白を落とし、かなだけ残す。 */
export function normalizeKana(text) {
  return toHiragana(text)
    .replace(/[ー−–—]/g, "ー")
    .replace(/[^\u3041-\u3096ー]/g, "");
}

/**
 * 最長一致で第一候補を振る。
 * @param {string} text
 * @param {Record<string, string>} [dict]
 */
export function longestMatchHits(text, dict = NAIVE_PHRASES) {
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  /** @type {{ surface: string, reading: string }[]} */
  const hits = [];
  let i = 0;
  const src = String(text || "");
  while (i < src.length) {
    let matched = "";
    for (const key of keys) {
      if (key && src.startsWith(key, i)) {
        matched = key;
        break;
      }
    }
    if (matched) {
      hits.push({ surface: matched, reading: toHiragana(dict[matched]) });
      i += matched.length;
    } else {
      i += 1;
    }
  }
  return hits;
}

function sliceBalanced(src, start, open, close) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}

/**
 * LLM の自由出力から token 配列を拾う。
 * @param {string} raw
 */
export function parseLlmTokens(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("空の応答");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const arrAt = body.indexOf("[");
  const objAt = body.indexOf("{");
  let parsed;
  if (arrAt >= 0 && (objAt < 0 || arrAt <= objAt)) {
    const slice = sliceBalanced(body, arrAt, "[", "]");
    if (!slice) throw new Error("配列 JSON が閉じられていません");
    parsed = JSON.parse(slice);
  } else if (objAt >= 0) {
    const slice = sliceBalanced(body, objAt, "{", "}");
    if (!slice) throw new Error("オブジェクト JSON が閉じられていません");
    parsed = JSON.parse(slice);
  } else {
    throw new Error("JSON が見つかりません");
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed.tokens || parsed.words || parsed.items || [];
  if (!Array.isArray(list)) throw new Error("tokens 配列がありません");
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const surface = String(item.surface || item.word || item.text || "").trim();
      const reading = toHiragana(
        String(item.reading || item.kana || item.yomi || "").trim()
      );
      if (!surface) return null;
      return { surface, reading };
    })
    .filter(Boolean);
}

/**
 * 読み API / カスタムエンドポイントの JSON を hits にする。
 * @param {unknown} data
 */
export function apiDataToHits(data) {
  const tokens = Array.isArray(data?.tokens) ? data.tokens : [];
  return tokens
    .map((t) => ({
      surface: String(t?.surface || ""),
      reading: toHiragana(String(t?.reading || "")),
    }))
    .filter((h) => h.surface && h.reading && hasKanji(h.surface));
}

export function hitsToKana(hits) {
  return normalizeKana(
    (hits || []).map((h) => h.reading || "").join("")
  );
}

/**
 * 多数決の読み指紋。同数なら長い方。
 * @param {{ ok?: boolean, kana?: string }[]} results
 */
export function majorityKana(results) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const row of results || []) {
    if (!row?.ok) continue;
    const kana = normalizeKana(row.kana || "");
    if (!kana) continue;
    counts.set(kana, (counts.get(kana) || 0) + 1);
  }
  let best = "";
  let n = 0;
  for (const [kana, count] of counts) {
    if (count > n || (count === n && kana.length > best.length)) {
      best = kana;
      n = count;
    }
  }
  return { kana: best, count: n, variants: counts.size };
}

/**
 * 文中の surface 出現順に ruby HTML を作る。
 * @param {string} text
 * @param {{ surface: string, reading: string }[]} hits
 * @param {string} [peerKana]
 */
export function renderRubyLine(text, hits, peerKana = "") {
  let html = "";
  let cursor = 0;
  let hi = 0;
  const src = String(text || "");
  const list = Array.isArray(hits) ? hits : [];
  while (hi < list.length) {
    const hit = list[hi];
    const idx = src.indexOf(hit.surface, cursor);
    if (idx < 0) {
      hi += 1;
      continue;
    }
    html += escapeHtml(src.slice(cursor, idx));
    const ruby = hasKanji(hit.surface)
      ? buildRuby(hit.surface, hit.reading)
      : escapeHtml(hit.surface);
    html += ruby;
    cursor = idx + hit.surface.length;
    hi += 1;
  }
  html += escapeHtml(src.slice(cursor));
  void peerKana;
  return html;
}

export function geminiEndpoint(model, apiKey) {
  const m = String(model || "gemini-2.5-flash").trim();
  const key = encodeURIComponent(String(apiKey || ""));
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${key}`;
}

export function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => String(p?.text || "")).join("");
}

export function extractChatText(data) {
  return String(data?.choices?.[0]?.message?.content || "");
}
