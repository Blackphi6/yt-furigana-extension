/**
 * 英単語トークンへ CMUdict 由来のカタカナ読みを載せる。
 * 辞書: dict/english-katakana.json.gz（CMUdict BSD → カタカナ事前計算）
 */

function isLatinWord(text) {
  return /^[A-Za-z][A-Za-z0-9'’.\-]*$/.test(String(text || ""));
}

function isUsefulLatinReading(reading) {
  return /[\u3040-\u309f\u30a0-\u30ff]/.test(String(reading || ""));
}

/** @type {Record<string, string>} */
let katakanaDict = {};
let loadPromise = null;

export function getEnglishKatakanaDictCount() {
  return Object.keys(katakanaDict).length;
}

/**
 * @param {Record<string, string>} dict
 */
export function installEnglishKatakanaDictForTests(dict) {
  katakanaDict = dict || {};
  loadPromise = Promise.resolve(katakanaDict);
  return katakanaDict;
}

/**
 * @param {string} [url]
 */
export async function loadEnglishKatakanaDict(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const dictUrl =
      url ||
      (typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("dict/english-katakana.json.gz")
        : "");
    if (!dictUrl) {
      throw new Error("english-katakana URL missing");
    }

    const response = await fetch(dictUrl);
    if (!response.ok) {
      throw new Error(`english-katakana fetch failed: ${response.status}`);
    }
    if (typeof DecompressionStream !== "function") {
      throw new Error("DecompressionStream is not available");
    }

    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    const jsonText = await new Response(stream).text();
    const parsed = JSON.parse(jsonText);
    katakanaDict = parsed && typeof parsed === "object" ? parsed : {};
    return katakanaDict;
  })();

  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    katakanaDict = {};
    throw error;
  }
}

/**
 * @param {string} surface
 * @returns {string}
 */
export function lookupEnglishKatakana(surface) {
  const key = String(surface || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/’/g, "'");
  if (!key) return "";
  return katakanaDict[key] || "";
}

/**
 * Latin 語で、まだかな読みがないトークンにカタカナを付与。
 * applyManualPhraseReadings より前に置き、ユーザー登録で上書き可能にする。
 * @param {Array<object>} tokens
 * @returns {Array<object>}
 */
export function applyEnglishKatakanaReadings(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return tokens || [];
  if (Object.keys(katakanaDict).length === 0) return tokens;

  return tokens.map((token) => {
    const surface = token?.surface_form || "";
    if (!isLatinWord(surface)) return token;
    if (token._numberUnit) return token;
    const existing = token.reading || token.pronunciation || "";
    if (isUsefulLatinReading(existing) || token.preserveKatakana) {
      return token;
    }
    const reading = lookupEnglishKatakana(surface);
    if (!reading) return token;
    return {
      ...token,
      reading,
      pronunciation: reading,
      preserveKatakana: true,
      _englishKatakana: true
    };
  });
}
