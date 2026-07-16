function toHiragana(text) {
  return text.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function toKatakana(text) {
  return String(text || "").replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );
}

function isKanji(char) {
  // 々 / 〻 は漢字の踊り字。『時々』を「時」+「々」に割ると誤読になる
  return /[\u3400-\u9fff\uF900-\uFAFF々〻]/.test(char);
}

function isKana(char) {
  return /[\u3040-\u309f\u30a0-\u30ff]/.test(char);
}

export function hasKanji(text) {
  return /[\u3400-\u9fff\uF900-\uFAFF々〻]/.test(text);
}

/** Only / WEEKEND など、読み登録したい欧文語 */
export function isLatinWord(text) {
  return /^[A-Za-z][A-Za-z0-9'’.\-]*$/.test(String(text || ""));
}

/** 欧文表層に振る価値がある読みか（かなのみ。happiness→happiness のような英字再掲は不要） */
export function isUsefulLatinReading(reading) {
  return /[\u3040-\u309f\u30a0-\u30ff]/.test(String(reading || ""));
}

export function isRegisterableSurface(text) {
  if (hasKanji(text) || isLatinWord(text)) return true;
  if (parseNumberUnitSurface(text)) return true;
  // 1桁の「3」や「2.1」もクリックで読み編集できるようにする
  if (parseNumberSurface(text)) return true;
  // 3.2.1 カウントダウン
  if (parseDotSeparatedDigits(text)) return true;
  // 単位単独（Wh 等）
  return isKnownNumberUnit(String(text || "").normalize("NFKC").trim());
}

/**
 * 数字系（360 / 93% / 3.2.1 / 12.8V など、漢字なし）は
 * ルビだと横幅を食いすぎるのでツールチップ表示にする。
 * 1人・0時など漢字混じりは従来どおりルビ。
 */
export function isNumberReadingTipSurface(text) {
  const s = String(text || "").normalize("NFKC").trim();
  if (!s || hasKanji(s)) return false;
  if (parseDotSeparatedDigits(s)) return true;
  if (parseNumberUnitSurface(s) || parseNumberSurface(s)) return true;
  if (hasDigit(s)) return true;
  return isKnownNumberUnit(s);
}

function hasDigit(text) {
  return /[0-9０-９]/.test(text);
}

function displayReading(reading) {
  const raw = String(reading || "").normalize("NFKC");
  if (/[\u30a1-\u30f6]/.test(raw)) {
    return raw.replace(/[\u3041-\u3096]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) + 0x60)
    );
  }
  return toHiragana(raw);
}

function parseSegments(surface) {
  const segments = [];
  let current = "";
  let type = null;

  for (const char of surface) {
    const charType = isKanji(char) ? "kanji" : isKana(char) ? "kana" : "other";
    if (type !== charType) {
      if (current) segments.push({ type, text: current });
      current = char;
      type = charType;
    } else {
      current += char;
    }
  }

  if (current) segments.push({ type, text: current });
  return segments;
}

function alignMiddleSegments(segments, reading) {
  let readingIndex = 0;
  let result = "";

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment.type === "kana") {
      result += segment.text;
      readingIndex += toHiragana(segment.text).length;
      continue;
    }

    const nextSegment = segments[index + 1];
    if (nextSegment?.type === "kana") {
      const nextKana = toHiragana(nextSegment.text);
      const nextIndex = reading.indexOf(nextKana, readingIndex);
      const kanjiReading =
        nextIndex === -1 ? reading.slice(readingIndex) : reading.slice(readingIndex, nextIndex);

      result += `<ruby>${segment.text}<rt>${kanjiReading}</rt></ruby>`;
      readingIndex += kanjiReading.length;
      continue;
    }

    const kanjiReading = reading.slice(readingIndex);
    result += `<ruby>${segment.text}<rt>${kanjiReading}</rt></ruby>`;
    readingIndex = reading.length;
  }

  return result;
}

/**
 * @param {string} surface
 * @param {string} reading
 * @param {{ preserveKatakana?: boolean }} [options]
 *   preserveKatakana: ユーザー登録のカタカナ読み（オンリー等）をそのまま表示。
 *   形態素のカタカナ読みは原則ひらがな化する（未指定時は false）。
 */
export function buildRuby(surface, reading, options = {}) {
  const preserveKatakana = options.preserveKatakana === true;
  const hiraganaReading = toHiragana(reading || "");
  const shown = preserveKatakana
    ? displayReading(reading || "")
    : hiraganaReading;

  if (isLatinWord(surface)) {
    // yeah / happiness など、形態素が英字読みを返すだけのときはルビ不要
    // かな読みがある欧文は和製英語と同様にカタカナ表示（You→ユー）
    if (!isUsefulLatinReading(reading || shown)) return surface;
    const katakana = toKatakana(reading || shown);
    return `<ruby>${surface}<rt>${katakana}</rt></ruby>`;
  }

  // 100W / 50% / 360 など漢字なし数字系はルビにせず本文のみ
  // （長い読みの横幅対策。ツールチップは wrapFuriganaWord 側）
  if (hasDigit(surface) && hiraganaReading && !hasKanji(surface)) {
    if (!/[\u3040-\u309f\u30a0-\u30ff]/.test(shown || hiraganaReading)) {
      return surface;
    }
    if (isNumberReadingTipSurface(surface)) return surface;
    return `<ruby>${surface}<rt>${shown}</rt></ruby>`;
  }

  if (!hasKanji(surface)) return surface;
  if (!hiraganaReading || hiraganaReading === toHiragana(surface)) return surface;

  // 1人→ひとり など、数字混じりは語全体にルビを振る
  if (hasDigit(surface)) {
    return `<ruby>${surface}<rt>${shown}</rt></ruby>`;
  }

  const segments = parseSegments(surface);
  let result = "";
  let index = 0;
  let readingStart = 0;

  while (index < segments.length && segments[index].type === "kana") {
    const kana = toHiragana(segments[index].text);
    if (hiraganaReading.slice(readingStart, readingStart + kana.length) !== kana) {
      break;
    }
    result += segments[index].text;
    readingStart += kana.length;
    index += 1;
  }

  let endIndex = segments.length - 1;
  let readingEnd = hiraganaReading.length;
  const trailing = [];

  while (endIndex >= index && segments[endIndex].type === "kana") {
    const kana = toHiragana(segments[endIndex].text);
    if (hiraganaReading.slice(readingEnd - kana.length, readingEnd) !== kana) {
      break;
    }
    trailing.unshift(segments[endIndex].text);
    readingEnd -= kana.length;
    endIndex -= 1;
  }

  const middleSegments = segments.slice(index, endIndex + 1);
  const middleReadingHira = hiraganaReading.slice(readingStart, readingEnd);
  const middleReadingShown = preserveKatakana
    ? shown.slice(readingStart, readingStart + middleReadingHira.length)
    : middleReadingHira;

  if (middleSegments.length === 0) {
    return result + trailing.join("");
  }

  if (middleSegments.length === 1 && middleSegments[0].type === "kanji") {
    result += `<ruby>${middleSegments[0].text}<rt>${middleReadingShown || middleReadingHira}</rt></ruby>`;
  } else if (
    middleSegments.length > 0 &&
    middleSegments.every((segment) => segment.type === "kanji" || segment.type === "other") &&
    middleSegments.some((segment) => segment.type === "kanji") &&
    !middleSegments.some((segment) => segment.type === "kana")
  ) {
    const joined = middleSegments.map((segment) => segment.text).join("");
    result += `<ruby>${joined}<rt>${middleReadingShown || middleReadingHira}</rt></ruby>`;
  } else {
    // 送り仮名合わせはひらがな長でアライン。表示もひらがな（混在は稀）
    result += alignMiddleSegments(middleSegments, middleReadingHira);
  }

  return result + trailing.join("");
}

import { normalizeReading } from "./reading-normalize.js";
import {
  parseNumberUnitSurface,
  parseNumberSurface,
  parseDotSeparatedDigits,
  isKnownNumberUnit
} from "./number-unit-reading.js";
import {
  applyContextualReadings,
  applyManualPhraseReadings,
  MANUAL_PHRASE_READINGS
} from "./reading-context.js";
import { mergeTokensForRuby } from "./token-merge.js";
import { getNeologdPhraseTrie } from "./neologd-phrases.js";
import { applyEnglishKatakanaReadings } from "./english-katakana-reading.js";
import {
  extractInlineParenReadings,
  applyInlineParenReadings
} from "./inline-paren-reading.js";

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 漢字を含む語を候補／読み登録クリック可能な span で包む。
 * 読みが未登録でも包む（字幕上でクリックして登録できるようにする）。
 * 欧文語（Only など）もカタカナ読み登録できるように包む。
 * 数字系はルビの代わりに data-tip でホバー表示する。
 */
export function wrapFuriganaWord(surface, reading, rubyHtml, options = {}) {
  if (!surface) return rubyHtml || "";
  const preserveKatakana = options.preserveKatakana === true;
  const normalized = reading
    ? preserveKatakana
      ? displayReading(reading)
      : normalizeReading(reading)
    : "";
  const unset = !normalized;
  const tip = !unset && isNumberReadingTipSurface(surface);
  const tipReading = tip
    ? preserveKatakana
      ? displayReading(normalized) || toKatakana(normalized)
      : normalized
    : "";
  const title = unset
    ? "クリックで読みを登録"
    : tip
      ? tipReading
      : "クリックで読み候補";
  const className = [
    "yt-furigana-word",
    unset ? "yt-furigana-word--unset" : "",
    tip ? "yt-furigana-word--tip" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const tipAttr = tip ? ` data-tip="${escapeAttr(tipReading)}"` : "";
  return `<span class="${className}" data-surface="${escapeAttr(surface)}" data-reading="${escapeAttr(normalized)}"${tipAttr} tabindex="0" role="button" title="${escapeAttr(title)}">${rubyHtml || surface}</span>`;
}

/**
 * RubiPon と同じ順: トークン化 → 結合 → 文脈読み → フレーズ上書き。
 * 文脈を結合前に掛けると「何度も何も…」で「何」が全部「なに」になり「なにど」になる。
 * 原文を「何」などで先に切り出すと「何故か」が分断されるのでやらない。
 * 「音（ね）」はカッコを外して読みとして採用（字幕側の明示読みを最優先）。
 */
export function buildFuriganaHtml(text, tokenize) {
  const { text: prepared, spans: inlineSpans } = extractInlineParenReadings(text);
  const tokens = applyInlineParenReadings(
    applyManualPhraseReadings(
      applyContextualReadings(
        applyEnglishKatakanaReadings(
          mergeTokensForRuby(tokenize(prepared), {
            extraSurfaces: MANUAL_PHRASE_READINGS.keys(),
            phraseTrie: getNeologdPhraseTrie()
          })
        ),
        prepared
      )
    ),
    inlineSpans
  );

  return tokens
    .map((token) => {
      const surface = token.surface_form;
      let preserveKatakana = token.preserveKatakana === true;
      const raw = token.reading || token.pronunciation || "";
      // 形態素のカタカナ読みはひらがな化。ユーザー登録カタカナは保持。
      let reading = preserveKatakana
        ? displayReading(raw)
        : normalizeReading(raw);
      if (isLatinWord(surface)) {
        // 欧文: 英字読みは捨てる。かな読みはカタカナ表示（インフォメーション等と同型）
        if (!isUsefulLatinReading(reading)) {
          reading = "";
        } else {
          reading = toKatakana(reading);
          preserveKatakana = true;
        }
      }
      const ruby = buildRuby(surface, reading, { preserveKatakana });
      if (!isRegisterableSurface(surface)) return ruby;
      return wrapFuriganaWord(surface, reading, ruby, { preserveKatakana });
    })
    .join("");
}
