import { normalizeReading, normalizeUserReading } from "./reading-normalize.js";
import learnedOverrides from "../data/generated/learned-overrides.json" with {
  type: "json"
};
import { mergeLearnedOverrides } from "./reading-learning.js";

export { normalizeReading };

/**
 * 文脈だけでは決まらない読み（Parakeet 記事の例外）は、
 * 現代日本語で優勢な多数派を既定にする。
 * 少数派は明示キューがあるときだけ採用。
 * @see https://zenn.dev/parakeet_tech/articles/936532be817118
 */
export const MAJORITY_DEFAULT_READINGS = {
  私: "わたし",
  尊い: "とうとい",
  貴い: "とうとい",
  尊ぶ: "とうとぶ",
  貴ぶ: "とうとぶ"
};

/** 上記の少数派（改まった読み・文語寄り） */
export const MINORITY_READINGS = {
  私: ["わたくし"],
  尊い: ["たっとい"],
  貴い: ["たっとい"],
  尊ぶ: ["たっとぶ"],
  貴ぶ: ["たっとぶ"]
};

/**
 * Sudachi / Kuromoji の読みを、文脈キューで上書きする。
 * 形態素分割はそのまま、読みだけ差し替える合わせ技用。
 */
export const CONTEXT_READING_RULES = [
  {
    surface: "忙しい",
    reading: "せわしい",
    weight: 3,
    cues: [
      "暇もない",
      "暇が",
      "世界",
      "恋",
      "心",
      "胸",
      "街",
      "夜",
      "夢",
      "涙",
      "君",
      "僕",
      "私",
      "せわしない",
      "あわただ"
    ]
  },
  {
    surface: "忙しい",
    reading: "いそがしい",
    weight: 3,
    cues: ["仕事", "予定", "会議", "残業", "スケジュール", "忙しい人", "お忙しい"]
  },
  {
    surface: "表",
    reading: "おもて",
    weight: 3,
    cues: ["裏", "畳", "顔", "出る", "出て", "表に出", "立つ", "通り", "玄関", "表紙"]
  },
  {
    surface: "表",
    reading: "ひょう",
    weight: 3,
    cues: ["グラフ", "データ", "一覧", "表にまとめ", "表を見", "表計算", "成績"]
  },
  {
    surface: "今日",
    reading: "こんにち",
    weight: 3,
    cues: ["今日この頃", "今日日", "今日では", "今日において", "今日的"]
  },
  {
    surface: "今日",
    reading: "きょう",
    weight: 1,
    cues: ["明日", "昨日", "朝", "夜", "今日は", "今日も", "今日の"]
  },
  {
    surface: "方",
    reading: "ほう",
    weight: 3,
    // 「方が」「の方」単体は伝え方／その方（人）を誤爆するので使わない
    cues: [
      "方がいい",
      "方が良い",
      "方がよ",
      "の方が",
      "方へ行",
      "方へ向か",
      "方向",
      "一方",
      "両方",
      "あっちの方",
      "こっちの方",
      "そっちの方",
      "どっちの方",
      "どちらの方",
      "北の方へ",
      "南の方へ",
      "東の方へ",
      "西の方へ"
    ]
  },
  {
    surface: "方",
    reading: "かた",
    weight: 4,
    cues: [
      "やり方",
      "読み方",
      "考え方",
      "仕方",
      "見方",
      "聞き方",
      "伝え方",
      "話し方",
      "書き方",
      "行き方",
      "作り方",
      "使い方",
      "選び方",
      "直し方",
      "戦い方",
      "生き方",
      "方を変え",
      "方を教え",
      "方に悩",
      "その方は",
      "この方は",
      "あの方は",
      "方です",
      "方ですね"
    ]
  },
  {
    surface: "その方",
    reading: "ほう",
    weight: 4,
    cues: ["その方が", "その方に行", "その方へ", "その方の話より"]
  },
  {
    surface: "その方",
    reading: "かた",
    weight: 4,
    cues: ["その方は", "その方が来", "その方です", "その方を知", "その方の名前"]
  },
  {
    surface: "この方",
    reading: "かた",
    weight: 4,
    cues: ["この方は", "この方です", "この方を紹介"]
  },
  {
    surface: "この方",
    reading: "ほう",
    weight: 3,
    cues: ["この方が", "この方へ", "この方に進"]
  },
  {
    surface: "北の方",
    reading: "きたのほう",
    weight: 5,
    cues: ["北の方へ", "北の方に", "北の方から", "北の方を目指"]
  },
  {
    surface: "南の方",
    reading: "みなみのほう",
    weight: 5,
    cues: ["南の方へ", "南の方に", "南の方から"]
  },
  {
    surface: "開いた",
    reading: "あいた",
    weight: 4,
    cues: ["ドアが開", "窓が開", "蓋が開", "口が開", "目が開", "開いたまま"]
  },
  {
    surface: "開いた",
    reading: "ひらいた",
    weight: 3,
    cues: ["幕が開", "会が開", "店が開", "道が開"]
  },
  {
    surface: "空",
    reading: "くう",
    weight: 3,
    cues: ["空を切", "空中", "空間", "空港", "空気", "真空", "空席", "空腹"]
  },
  {
    surface: "空",
    reading: "そら",
    weight: 2,
    cues: ["青空", "夜空", "空が青", "空に星", "雲", "星", "晴れた空"]
  },
  {
    surface: "空",
    reading: "から",
    weight: 2,
    cues: ["空手", "空振り", "空っぽ", "空の箱", "空にする", "空回り"]
  },
  {
    surface: "中",
    reading: "じゅう",
    weight: 2,
    cues: ["一日中", "年中", "世界中", "日本中", "家中", "体中"]
  },
  {
    surface: "中",
    reading: "ちゅう",
    weight: 2,
    cues: ["中学生", "中国", "中心", "途中", "中間", "中止"]
  },
  {
    surface: "辛い",
    reading: "からい",
    weight: 3,
    cues: ["ラーメン", "カレー", "味", "食べ", "料理", "唐辛子", "辛口"]
  },
  {
    surface: "辛い",
    reading: "つらい",
    weight: 3,
    cues: ["経験", "出来事", "思い", "過去", "気持ち", "毎日が", "人生"]
  },
  {
    surface: "何",
    reading: "なに",
    weight: 2,
    cues: ["何を", "何が", "何も", "何の", "何だ", "何でもの", "何より", "何事"]
  },
  {
    surface: "何",
    reading: "なん",
    weight: 3,
    cues: [
      "何度",
      "何回",
      "何人",
      "何年",
      "何枚",
      "何冊",
      "何階",
      "何倍",
      "何で",
      "何の",
      "何て",
      "何だよ",
      "何だか",
      "何しろ"
    ]
  },
  {
    surface: "何度",
    reading: "なんど",
    weight: 5,
    cues: ["何度", "何度も", "何度か", "何度でも", "何度目"]
  },
  {
    surface: "大事",
    reading: "おおごと",
    weight: 5,
    cues: ["大事になる", "大事にした", "大事になるぞ", "大事になるな"]
  },
  {
    surface: "大事",
    reading: "だいじ",
    weight: 2,
    cues: ["大事な", "大事です", "大事だ", "大事に思", "大事にして"]
  },
  {
    surface: "町中",
    reading: "まちなか",
    weight: 5,
    cues: ["町中の", "町中のカフェ", "町中に入"]
  },
  {
    surface: "町中",
    reading: "まちじゅう",
    weight: 5,
    cues: ["町中に広", "噂が町中", "町中に知れ", "町中で噂"]
  },
  {
    surface: "風",
    reading: "かぜ",
    weight: 3,
    cues: ["吹", "強風", "風が", "風で", "風強"]
  },
  {
    surface: "風",
    reading: "ふう",
    weight: 3,
    cues: ["こんな風", "どういう風", "風に書", "風にやっ", "ああいう風"]
  },
  {
    surface: "博士",
    reading: "はかせ",
    weight: 3,
    cues: ["物知り", "博士だ", "物知り博士"]
  },
  {
    surface: "博士",
    reading: "はくし",
    weight: 3,
    cues: ["博士号", "学位", "論文"]
  },
  // 文脈非決定の異読み: 多数派を広く、少数派は改まった合図だけ
  {
    surface: "私",
    reading: "わたし",
    weight: 5,
    cues: ["私は", "私が", "私の", "私を", "私たち", "私に", "私と"]
  },
  {
    surface: "私",
    reading: "わたくし",
    weight: 4,
    cues: ["私ども", "わたくし", "わたくしは", "わたくしが"]
  },
  {
    surface: "尊い",
    reading: "とうとい",
    weight: 5,
    cues: ["尊い命", "尊いもの", "尊い精神", "尊い行い", "とても尊い"]
  },
  {
    surface: "尊い",
    reading: "たっとい",
    weight: 3,
    cues: ["たっとい", "たっとく"]
  },
  {
    surface: "貴い",
    reading: "とうとい",
    weight: 5,
    cues: ["貴い命", "貴いもの", "貴い犠牲", "貴い行い", "とても貴い"]
  },
  {
    surface: "貴い",
    reading: "たっとい",
    weight: 3,
    cues: ["たっとい", "たっとく"]
  }
];

/** フレーズ単位の強制読み（最長一致） */
export const MANUAL_PHRASE_READINGS = new Map([
  ["一段落", "いちだんらく"],
  ["一組目", "ひとくみめ"],
  ["二組目", "ふたくみめ"],
  ["三組目", "みくみめ"],
  ["夏日", "なつび"],
  ["何度", "なんど"],
  ["何回", "なんかい"],
  ["何人", "なんにん"],
  ["見惚れる", "みとれる"],
  ["見惚れていた", "みとれていた"],
  ["似合っていた", "にあっていた"],
  ["移ろう", "うつろう"],
  ["募る", "つのる"],
  ["溢れる", "あふれる"],
  ["よそ見", "よそみ"],
  ["逆に", "ぎゃくに"],
  ["伝え方", "つたえかた"],
  ["話し方", "はなしかた"],
  ["書き方", "かきかた"],
  ["作り方", "つくりかた"],
  ["使い方", "つかいかた"],
  ["選び方", "えらびかた"],
  ["直し方", "なおしかた"],
  ["戦い方", "たたかいかた"],
  ["生き方", "いきかた"]
]);

let sortedManualPhrases = [];

export function rebuildManualPhraseIndex() {
  sortedManualPhrases = [...MANUAL_PHRASE_READINGS.keys()].sort(
    (a, b) => b.length - a.length
  );
}

rebuildManualPhraseIndex();

/** 学習マージ前のベース（ベンチ用に復元する） */
const BASE_MANUAL_ENTRIES = [...MANUAL_PHRASE_READINGS.entries()];
const BASE_CONTEXT_RULES = CONTEXT_READING_RULES.map((rule) => ({
  ...rule,
  cues: [...rule.cues]
}));

export function resetReadingOverridesToBase() {
  MANUAL_PHRASE_READINGS.clear();
  for (const [key, value] of BASE_MANUAL_ENTRIES) {
    MANUAL_PHRASE_READINGS.set(key, value);
  }
  CONTEXT_READING_RULES.length = 0;
  CONTEXT_READING_RULES.push(
    ...BASE_CONTEXT_RULES.map((rule) => ({ ...rule, cues: [...rule.cues] }))
  );
  rebuildManualPhraseIndex();
}

/** ベース＋バンドル学習まで戻し、共有／ユーザー辞書の再適用前に呼ぶ */
export function reloadBundledReadingMaps() {
  resetReadingOverridesToBase();
  mergeLearnedOverrides(MANUAL_PHRASE_READINGS, CONTEXT_READING_RULES, learnedOverrides);
  rebuildManualPhraseIndex();
}

export function applyLearnedOverridesNow(learned) {
  resetReadingOverridesToBase();
  mergeLearnedOverrides(MANUAL_PHRASE_READINGS, CONTEXT_READING_RULES, learned);
  rebuildManualPhraseIndex();
}

function scoreReading(reading, context, rulesForSurface) {
  let score = 0;
  const matched = [];

  for (const rule of rulesForSurface) {
    if (rule.reading !== reading) continue;
    for (const cue of rule.cues) {
      if (!context.includes(cue)) continue;
      // 長いキュー（永遠に > 永遠）ほど優先
      score += rule.weight * (1 + Math.min(cue.length, 12) / 6);
      matched.push(cue);
    }
  }

  return { score, matched };
}

/**
 * @returns {{ reading: string, matched: string[] } | null}
 */
export function resolveContextualReading(surface, preferredReading, contextText) {
  const rulesForSurface = CONTEXT_READING_RULES.filter((rule) => rule.surface === surface);
  const preferred = normalizeReading(preferredReading || "");
  const context = contextText ?? "";
  const majority = normalizeReading(MAJORITY_DEFAULT_READINGS[surface] || "");
  const minorities = new Set(
    (MINORITY_READINGS[surface] || []).map((r) => normalizeReading(r))
  );

  if (rulesForSurface.length > 0) {
    const candidates = [...new Set(rulesForSurface.map((rule) => rule.reading))];

    let best = null;
    for (const candidate of candidates) {
      const { score, matched } = scoreReading(candidate, context, rulesForSurface);
      let total = score;
      if (preferred && candidate === preferred) total += 0.5;
      // 同点なら多数派を優先（文脈非決定の例外）
      if (majority && candidate === majority) total += 0.25;

      if (
        !best ||
        total > best.score ||
        (total === best.score && majority && candidate === majority)
      ) {
        best = { reading: candidate, score: total, matched };
      }
    }

    if (best && best.matched.length > 0) {
      return best;
    }
  }

  // キューなし: 形態素が少数派を返してきたら多数派へ寄せる
  if (majority && minorities.has(preferred) && preferred !== majority) {
    return {
      reading: majority,
      matched: ["*majority-default*"],
      score: 0
    };
  }

  return null;
}

/**
 * @deprecated 原文の先切りは「何」→「何故か」分断の原因。buildFuriganaHtml では使わない。
 * 後方互換テスト用に残す（最長一致のみ）。
 */
export function segmentWithOverrides(text) {
  const segments = [];
  let index = 0;

  while (index < text.length) {
    let matched = null;
    for (const phrase of sortedManualPhrases) {
      if (text.startsWith(phrase, index)) {
        matched = phrase;
        break;
      }
    }

    if (matched) {
      segments.push({
        type: "override",
        text: matched,
        reading: MANUAL_PHRASE_READINGS.get(matched)
      });
      index += matched.length;
      continue;
    }

    let nextIndex = text.length;
    for (const phrase of sortedManualPhrases) {
      const found = text.indexOf(phrase, index + 1);
      if (found !== -1 && found < nextIndex) nextIndex = found;
    }

    segments.push({ type: "text", text: text.slice(index, nextIndex) });
    index = nextIndex;
  }

  return segments;
}

/**
 * Cue matching limited to the clause around a token (、。！？).
 * Prevents opposite-sense cues in the same caption from bleeding across.
 */
export function clauseContext(text, start, end) {
  const src = String(text || "");
  if (!src) return "";
  const s = Math.max(0, Math.min(Number(start) || 0, src.length));
  const e = Math.max(s, Math.min(Number(end) || s, src.length));
  const seps = "。！？\n、";
  let left = 0;
  for (let i = s - 1; i >= 0; i -= 1) {
    if (seps.includes(src[i])) {
      left = i + 1;
      break;
    }
  }
  let right = src.length;
  for (let i = e; i < src.length; i += 1) {
    if (seps.includes(src[i])) {
      right = i;
      break;
    }
  }
  return src.slice(left, right);
}

/** トークン列の読みを文脈で補正 */
export function applyContextualReadings(tokens, contextText) {
  let cursor = 0;
  return tokens.map((token) => {
    const surface = token.surface_form;
    const start = contextText.indexOf(surface, cursor);
    const end = start >= 0 ? start + surface.length : cursor;
    if (start >= 0) cursor = end;
    const local =
      start >= 0 ? clauseContext(contextText, start, end) : contextText ?? "";
    const preferred = token.reading || token.pronunciation || "";
    const resolved = resolveContextualReading(surface, preferred, local);
    if (!resolved) return token;

    const reading = normalizeUserReading(resolved.reading);
    const preserveKatakana = /[\u30a1-\u30f6]/.test(reading);
    return {
      ...token,
      reading,
      pronunciation: reading,
      preserveKatakana
    };
  });
}

/**
 * RubiPon SurfaceRule 相当: 結合後トークンの表層が一致したときだけ読みを上書き。
 * 「何」登録があっても「何故か」トークンは触らない。
 */
export function applyManualPhraseReadings(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  return tokens.map((token) => {
    const surface = token.surface_form || "";
    if (!surface || !MANUAL_PHRASE_READINGS.has(surface)) return token;
    const reading = normalizeUserReading(MANUAL_PHRASE_READINGS.get(surface));
    if (!reading) return token;
    const preserveKatakana = /[\u30a1-\u30f6]/.test(reading);
    return {
      ...token,
      reading,
      pronunciation: reading,
      preserveKatakana
    };
  });
}

mergeLearnedOverrides(
  MANUAL_PHRASE_READINGS,
  CONTEXT_READING_RULES,
  learnedOverrides
);
rebuildManualPhraseIndex();
