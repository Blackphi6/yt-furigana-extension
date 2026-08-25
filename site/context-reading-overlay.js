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
  },
    {
      surface: "背負っ",
      reading: "せおっ",
      weight: 4,
      cues: ["リュック", "ランドセル", "子供を背負", "赤ん坊", "袋を背負", "荷物を背負"]
    },
    {
      surface: "背負っ",
      reading: "しょっ",
      weight: 4,
      cues: ["将来を", "運命を", "期待を背負", "組織を背負"]
    },
    {
      surface: "背負う",
      reading: "せおう",
      weight: 4,
      cues: ["リュック", "ランドセル", "子供を背負", "赤ん坊", "袋を背負", "荷物を背負"]
    },
    {
      surface: "背負う",
      reading: "しょう",
      weight: 4,
      cues: ["将来を", "運命を", "期待を背負", "組織を背負"]
    },
    {
      surface: "背負い",
      reading: "せおい",
      weight: 3,
      cues: ["リュック", "ランドセル", "子供を背負", "袋を背負"]
    },
    {
      surface: "背負い",
      reading: "しょい",
      weight: 4,
      cues: ["苦労を", "しょい込む", "背負い込む"]
    },
    {
      surface: "中",
      reading: "なか",
      weight: 5,
      cues: ["の中", "の中で", "の中に", "の中を", "の中へ", "の中から", "の中まで"]
    },
    {
      surface: "中",
      reading: "うち",
      weight: 3,
      cues: ["している中", "ている中", "てる中", "ぬ中に", "ない中に", "暮れぬ中"]
    },
    {
      surface: "中",
      reading: "じゅう",
      weight: 5,
      cues: ["一日中", "年中", "世界中", "日本中", "家中", "体中"]
    },
    {
      surface: "中",
      reading: "ちゅう",
      weight: 5,
      cues: ["中学生", "中国", "中心", "途中", "中間", "中止"]
    },
    {
      surface: "街",
      reading: "まち",
      weight: 5,
      cues: [
        "この街",
        "その街",
        "あの街",
        "街と",
        "街を",
        "街に",
        "街へ",
        "街は",
        "街が",
        "街も",
        "移ろう街",
        "変わる街",
        "歩く街"
      ]
    },
    {
      surface: "街",
      reading: "がい",
      weight: 5,
      cues: [
        "住宅街",
        "商店街",
        "繁華街",
        "地下街",
        "オフィス街",
        "歓楽街",
        "工場街",
        "問屋街",
        "官庁街"
      ]
    },
    {
      surface: "上手",
      reading: "じょうず",
      weight: 5,
      cues: ["が上手", "歌が上手", "絵が上手", "上手だ", "上手な"]
    },
    {
      surface: "上手",
      reading: "うわて",
      weight: 5,
      cues: ["一枚上手", "上手に回", "上手に出", "交渉では上手", "相撲の上手"]
    },
    {
      surface: "上手",
      reading: "かみて",
      weight: 5,
      cues: ["舞台の上手", "の上手で", "上手から出", "上手に立ち", "上手と下手"]
    },
    {
      surface: "人気",
      reading: "ひとけ",
      weight: 5,
      cues: [
        "人気が無",
        "人気がなく",
        "人気のない",
        "人気がない",
        "人気の無",
        "路地は人気",
        "人気のない夜",
        "人気のない道"
      ]
    },
    {
      surface: "人気",
      reading: "にんき",
      weight: 5,
      cues: ["人気の絶え", "人気が高", "人気者", "人気曲", "大人気", "人気店"]
    },
    {
      surface: "金",
      reading: "きん",
      weight: 5,
      cues: ["金の時計", "金色", "金メダル", "金銀", "金箔"]
    },
    {
      surface: "金",
      reading: "かね",
      weight: 5,
      cues: ["金を貯", "金を稼", "金が必要", "金を払", "金がかかる", "金を巻"]
    },
    {
      surface: "角",
      reading: "つの",
      weight: 5,
      cues: ["立派な角", "角に止ま", "牛の角", "角が生え", "カブトムシ"]
    },
    {
      surface: "弾く",
      reading: "はじく",
      weight: 5,
      cues: ["指で軽く弾", "軽く弾く", "弾き飛ば", "水を弾"]
    },
    {
      surface: "弾く",
      reading: "ひく",
      weight: 5,
      cues: ["ギターを弾", "ピアノを弾", "バイオリンを弾", "弾き語り"]
    },
    {
      surface: "何人",
      reading: "なにじん",
      weight: 5,
      cues: ["何人だ", "何人ですか", "彼は何人", "何人だろう"]
    },
    {
      surface: "紅葉",
      reading: "もみじ",
      weight: 5,
      cues: ["紅葉の", "美しい紅葉", "紅葉の木", "紅葉の絶景", "庭に植えた紅葉"]
    },
    {
      surface: "皆",
      reading: "みな",
      weight: 4,
      cues: ["皆で", "皆まで", "皆が", "皆の"]
    }
];

/** 単独漢字の多数派（前後が漢字でないとき）。住宅街の「がい」は前が漢字なので使わない */
const DEMO_MAJORITY = {
  街: "まち",
  上手: "じょうず",
  人気: "にんき",
  金: "きん",
  紅葉: "もみじ"
};

const KANJI_RE = /[\u3400-\u9fff]/;

function isStandaloneKanji(surface, text, start, end) {
  if (String(surface || "").length !== 1 || !KANJI_RE.test(surface)) return false;
  const prev = start > 0 ? text[start - 1] : "";
  const nxt = end < text.length ? text[end] : "";
  if (prev && KANJI_RE.test(prev)) return false;
  if (nxt && KANJI_RE.test(nxt)) return false;
  return true;
}

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
  字は: "じは",
  終い: "しまい",
  仕舞い: "しまい",
  御利益: "ごりやく",
  何人たりとも: "なんぴとたりとも",
  一枚上手: "いちまいうわて"
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
    // キューが当たっていなくても、同じ表層の読みは候補袋に残す（直す用）
    const cands = Array.isArray(token.candidates) ? [...token.candidates] : [];
    for (const rule of matched) {
      const extra = String(rule.reading || "");
      if (extra && !cands.includes(extra)) cands.push(extra);
    }
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
    if (!best) {
      const majority = DEMO_MAJORITY[surface];
      if (
        majority &&
        isStandaloneKanji(surface, src, span[0], span[1]) &&
        token.reading !== majority
      ) {
        if (!cands.includes(majority)) cands.unshift(majority);
        return {
          ...token,
          reading: majority,
          confidence: Math.max(Number(token.confidence) || 0, 0.86),
          source: "demo_morph_base",
          candidates: cands
        };
      }
      return { ...token, candidates: cands };
    }
    const reading = best.reading;
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
