/**
 * 結合フレーズ Trie 向けの安全弁。
 * 地名・人名の短い表層が日常語（助詞連結・時刻など）を壊すのを抑える。
 */

/** 姓辞書に載るが一般語と衝突しやすい表層 */
export const PERSONAL_NAME_SURFACE_BLOCKLIST = new Set([
  "三時", // さんじ vs みとき（姓）
  "一列" // いちれつ vs かずなみ（姓）
]);

/** 地名の「一〜二文字＋の」は 警戒中の / 魚の骨 などを誤結合しやすい */
export function isUnsafePlaceParticlePhrase(surface) {
  return /^[\u4e00-\u9fff々〆ヵヶ]{1,2}の$/.test(String(surface || ""));
}

/**
 * 後段レイヤで必ず上書きする読み（place-name の誤読・送り仮名付き熟語など）。
 * rebuildCombined の最後に spread する。
 */
export const PHRASE_TRIE_OVERRIDES = {
  靖国神社: "やすくにじんじゃ",
  二日酔い: "ふつかよい",
  二日酔: "ふつかよい"
};

/**
 * 製品向け定読み（拡張・フルフレーズ経路）。
 * eval の sudachi-only には載せない（公開チャートで差を見せるため）。
 */
export const PRODUCT_READING_OVERRIDES = {
  旗色: "はたいろ",
  類人猿: "るいじんえん",
  御利益: "ごりやく",
  柳腰: "やなぎごし",
  枝葉: "しよう",
  坊ちゃん: "ぼっちゃん",
  Ａ判: "えーばん",
  A判: "えーばん",
  好く: "すく"
};

/**
 * @param {Record<string, string>} map
 * @param {{ skipPlaceParticle?: boolean, skipPersonalBlocklist?: boolean }} [opts]
 */
export function filterPhraseMap(map, opts = {}) {
  const out = {};
  for (const [surface, reading] of Object.entries(map || {})) {
    if (opts.skipPersonalBlocklist && PERSONAL_NAME_SURFACE_BLOCKLIST.has(surface)) {
      continue;
    }
    if (opts.skipPlaceParticle && isUnsafePlaceParticlePhrase(surface)) {
      continue;
    }
    out[surface] = reading;
  }
  return out;
}
