/**
 * 公開デモ用: 拡張と同じ文脈補正を API 応答のあとに載せる。
 * Render 未更新でも Pages デモで検証できるようにする。
 */

/** @type {{ surface: string, reading: string, weight?: number, cues: string[] }[]} */
export const DEMO_CONTEXT_RULES = [
  {
    surface: "公",
    reading: "おおやけ",
    weight: 5,
    cues: ["公の場", "公の機関", "公にする", "公には"]
  },
  {
    surface: "香",
    reading: "か",
    weight: 5,
    cues: ["梅の香", "花の香", "の香が", "の香を", "残香"]
  },
  {
    surface: "紅",
    reading: "べに",
    weight: 5,
    cues: ["紅を引", "紅をさ", "紅を差", "紅筆", "口紅"]
  },
  {
    surface: "候",
    reading: "そうろう",
    weight: 5,
    cues: ["申し上げ候", "ござ候", "候。", "候ふ", "候へ"]
  },
  {
    surface: "呉",
    reading: "ご",
    weight: 5,
    cues: ["呉の時代", "呉の国", "中国の呉", "呉越", "三国"]
  },
  {
    surface: "込",
    reading: "こ",
    weight: 5,
    cues: ["道が込む", "が込む", "込むから"]
  },
  {
    surface: "込む",
    reading: "こむ",
    weight: 5,
    cues: ["道が込む", "が込む", "込むから"]
  },
  {
    surface: "際",
    reading: "きわ",
    weight: 5,
    cues: ["崖の際", "窓の際", "水際", "の際で", "の際に立"]
  },
  {
    surface: "札",
    reading: "ふだ",
    weight: 5,
    cues: ["示す札", "小さな札", "札を吊る", "札を受け取", "お札", "絵馬"]
  },
  {
    surface: "氏",
    reading: "うじ",
    weight: 5,
    cues: ["氏より育ち", "氏が社会", "氏族", "氏姓", "古代日本では、氏"]
  },
  {
    surface: "社",
    reading: "やしろ",
    weight: 5,
    cues: ["この社は", "小さな社", "社に集ま", "村人がみんな社", "雪化粧した小さな社"]
  },
  {
    surface: "字",
    reading: "じ",
    weight: 5,
    cues: ["彼の字", "字はとても", "字が上手", "字がきれい", "読みやすい"]
  },
  {
    surface: "痕",
    reading: "あと",
    weight: 5,
    cues: ["足痕", "傷痕", "血痕", "痕が残"]
  },
  {
    surface: "根",
    reading: "こん",
    weight: 5,
    cues: ["平方根", "立方根", "累乗根"]
  }
];

/** @type {Record<string, string>} */
export const DEMO_MANUAL_PHRASES = {
  故郷: "こきょう",
  太后: "たいこう",
  紅色: "べにいろ",
  命綱: "いのちつな",
  筋骨: "きんこつ",
  平方根: "へいほうこん",
  今帝: "きんてい",
  撮了: "さつりょう",
  揚子江: "ようすこう",
  足痕: "あしあと",
  骨董市: "こっとういち",
  滋雨: "じう",
  黄金千貫: "こがねせんがん",
  七五三: "しちごさん",
  七福神: "しちふくじん",
  七日: "なのか",
  四つ: "よっつ",
  四時: "よじ",
  氷室: "ひむろ",
  字は: "じは"
};

/**
 * @param {string} text
 * @param {number} start
 * @param {number} end
 */
function clauseAround(text, start, end) {
  const src = String(text || "");
  const s = Math.max(0, Math.min(start, src.length));
  const e = Math.max(s, Math.min(end, src.length));
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

/**
 * @param {string} text
 * @param {{ surface?: string, reading?: string, span?: number[], source?: string, candidates?: string[], confidence?: number }[]} tokens
 * @param {typeof DEMO_CONTEXT_RULES} [rules]
 */
export function applyDemoContextReadings(
  text,
  tokens,
  rules = DEMO_CONTEXT_RULES
) {
  const src = String(text || "");
  return (tokens || []).map((token) => {
    const surface = String(token.surface || "");
    const span = Array.isArray(token.span) ? token.span : null;
    if (!surface || !span) return token;
    const local = clauseAround(src, span[0], span[1]);
    const matched = rules.filter((r) => r.surface === surface);
    if (!matched.length) return token;
    let best = null;
    for (const rule of matched) {
      const hits = (rule.cues || []).filter((c) => local.includes(c));
      if (!hits.length) continue;
      const longest = Math.max(...hits.map((h) => h.length));
      const score =
        (rule.weight || 3) * (1 + Math.min(longest, 12) / 6) + hits.length;
      if (!best || score > best.score) {
        best = { reading: rule.reading, score };
      }
    }
    if (!best) return token;
    const reading = best.reading;
    const cands = Array.isArray(token.candidates) ? [...token.candidates] : [];
    if (!cands.includes(reading)) cands.unshift(reading);
    return {
      ...token,
      reading,
      confidence: Math.max(Number(token.confidence) || 0, 0.95),
      source: "demo_context",
      candidates: cands
    };
  });
}
