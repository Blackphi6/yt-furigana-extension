import { normalizeReading, normalizeUserReading } from "./reading-normalize.js";
import learnedOverrides from "../data/generated/learned-overrides.json" with {
  type: "json"
};
import { mergeLearnedOverrides } from "./reading-learning.js";

export { normalizeReading };

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
    weight: 1,
    cues: ["仕事", "予定", "会議", "残業", "スケジュール", "忙しい人", "お忙しい"]
  },
  {
    surface: "表",
    reading: "おもて",
    weight: 2,
    cues: ["裏", "畳", "顔", "出る", "立つ", "通り", "玄関", "表紙"]
  },
  {
    surface: "表",
    reading: "ひょう",
    weight: 2,
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
    weight: 2,
    cues: ["の方", "方が", "方へ", "方向", "一方", "両方"]
  },
  {
    surface: "方",
    reading: "かた",
    weight: 2,
    cues: ["やり方", "読み方", "考え方", "仕方", "見方", "聞き方"]
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
  }
];

/** フレーズ単位の強制読み（最長一致） */
export const MANUAL_PHRASE_READINGS = new Map([
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
  ["逆に", "ぎゃくに"]
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
  if (rulesForSurface.length === 0) return null;

  const candidates = [...new Set(rulesForSurface.map((rule) => rule.reading))];
  const preferred = normalizeReading(preferredReading || "");
  const context = contextText ?? "";

  let best = null;
  for (const candidate of candidates) {
    const { score, matched } = scoreReading(candidate, context, rulesForSurface);
    let total = score;
    if (preferred && candidate === preferred) total += 0.5;

    if (!best || total > best.score) {
      best = { reading: candidate, score: total, matched };
    }
  }

  if (!best || best.matched.length === 0) return null;
  if (preferred && best.reading === preferred) return best;
  return best;
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

/** トークン列の読みを文脈で補正 */
export function applyContextualReadings(tokens, contextText) {
  return tokens.map((token) => {
    const surface = token.surface_form;
    const preferred = token.reading || token.pronunciation || "";
    const resolved = resolveContextualReading(surface, preferred, contextText);
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
