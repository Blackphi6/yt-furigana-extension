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

export {
  isAlphabetLetterSpelling,
  stripLeadingAlphabetReading,
  stripTrailingAlphabetReading,
  stripMixedSurfaceAlphabetReading
} from "./latin-letter-reading.js";

import {
  isAlphabetLetterSpelling,
  stripLeadingAlphabetReading,
  stripTrailingAlphabetReading,
  stripMixedSurfaceAlphabetReading
} from "./latin-letter-reading.js";

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

/** ひらがな・カタカナのみ（さん / ちゃん など）。単独登録はしないが範囲選択の端点にする */
export function isKanaOnlySurface(text) {
  const s = String(text || "").normalize("NFKC").trim();
  if (!s) return false;
  return /^[\u3040-\u309f\u30a0-\u30ffーゝゞヽヾ]+$/.test(s);
}

/** クリック登録 or ドラッグ範囲の端点として包む語か */
export function isSelectableSurface(text) {
  return isRegisterableSurface(text) || isKanaOnlySurface(text);
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

/** HTML 本文・属性用。字幕由来の表層を innerHTML に載せる前に必須。 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
      result += escapeHtml(segment.text);
      readingIndex += toHiragana(segment.text).length;
      continue;
    }

    // 欧文・記号はルビ対象外（読みを消費しない）。CTP社 のズレ防止
    if (segment.type === "other") {
      result += escapeHtml(segment.text);
      continue;
    }

    const nextSegment = segments[index + 1];
    if (nextSegment?.type === "kana") {
      const nextKana = toHiragana(nextSegment.text);
      // 送り仮名が読み先頭と同じ字でも、漢字側に最低1モーラ残す
      // 例: 示し合わせ / しめしあわせ → 示(しめ)し…（indexOf(し,0) だと空振りする）
      const nextIndex = reading.indexOf(nextKana, readingIndex + 1);
      const kanjiReading =
        nextIndex === -1 ? reading.slice(readingIndex) : reading.slice(readingIndex, nextIndex);

      result += `<ruby>${escapeHtml(segment.text)}<rt>${escapeHtml(kanjiReading)}</rt></ruby>`;
      readingIndex += kanjiReading.length;
      continue;
    }

    const kanjiReading = reading.slice(readingIndex);
    result += `<ruby>${escapeHtml(segment.text)}<rt>${escapeHtml(kanjiReading)}</rt></ruby>`;
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
  const safeSurface = escapeHtml(surface);

  if (isLatinWord(surface)) {
    // yeah / happiness など、形態素が英字読みを返すだけのときはルビ不要
    // かな読みがある欧文は和製英語と同様にカタカナ表示（You→ユー）
    // CTP→シーティーピー のようなアルファベット逐語は略語ルビとして出さない
    if (!isUsefulLatinReading(reading || shown)) return safeSurface;
    if (isAlphabetLetterSpelling(surface, reading || shown)) return safeSurface;
    const katakana = toKatakana(reading || shown);
    return `<ruby>${safeSurface}<rt>${escapeHtml(katakana)}</rt></ruby>`;
  }

  // 100W / 50% / 360 など漢字なし数字系はルビにせず本文のみ
  // （長い読みの横幅対策。ツールチップは wrapFuriganaWord 側）
  if (hasDigit(surface) && hiraganaReading && !hasKanji(surface)) {
    if (!/[\u3040-\u309f\u30a0-\u30ff]/.test(shown || hiraganaReading)) {
      return safeSurface;
    }
    if (isNumberReadingTipSurface(surface)) return safeSurface;
    return `<ruby>${safeSurface}<rt>${escapeHtml(shown)}</rt></ruby>`;
  }

  if (!hasKanji(surface)) return safeSurface;
  if (!hiraganaReading || hiraganaReading === toHiragana(surface)) return safeSurface;

  // 1人→ひとり など、数字混じりは語全体にルビを振る
  if (hasDigit(surface)) {
    return `<ruby>${safeSurface}<rt>${escapeHtml(shown)}</rt></ruby>`;
  }

  const segments = parseSegments(surface);
  let result = "";
  let index = 0;
  let readingStart = 0;

  while (index < segments.length && segments[index].type === "kana") {
    const kana = toHiragana(segments[index].text);
    if (hiraganaReading.slice(readingStart, readingStart + kana.length) !== kana) {
      // 読みに無い先頭かな（カツアゲ+放題 など）は本文のまま残し、読みは後ろの漢字へ
      result += escapeHtml(segments[index].text);
      index += 1;
      continue;
    }
    result += escapeHtml(segments[index].text);
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
    trailing.unshift(escapeHtml(segments[endIndex].text));
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

  // 先頭・末尾の other（CTP / ※ / 括弧など）はルビの外へ出す。
  // 結合すると rt が全体中央になり「CTP社」で「しゃ」が P の上に来る。
  // あわせて CTP→シーティーピー のような逐語読みを漢字の rt から剥がす。
  const core = [...middleSegments];
  const leadingOtherRaw = [];
  while (core.length && core[0].type === "other") {
    leadingOtherRaw.push(core.shift().text);
  }
  const trailingOtherRaw = [];
  while (core.length && core[core.length - 1].type === "other") {
    trailingOtherRaw.unshift(core.pop().text);
  }

  let coreReadingHira = middleReadingHira;
  let coreReadingShown = middleReadingShown || middleReadingHira;
  if (leadingOtherRaw.length) {
    const joined = leadingOtherRaw.join("");
    const nextHira = stripLeadingAlphabetReading(joined, coreReadingHira);
    if (nextHira !== coreReadingHira) {
      const consumed = coreReadingHira.length - nextHira.length;
      coreReadingShown = coreReadingShown.slice(consumed);
      coreReadingHira = nextHira;
    }
  }
  if (trailingOtherRaw.length) {
    const joined = trailingOtherRaw.join("");
    const nextHira = stripTrailingAlphabetReading(joined, coreReadingHira);
    if (nextHira !== coreReadingHira) {
      coreReadingShown = coreReadingShown.slice(0, nextHira.length);
      coreReadingHira = nextHira;
    }
  }

  result += leadingOtherRaw.map((text) => escapeHtml(text)).join("");

  if (core.length === 0) {
    // other のみ
  } else if (!coreReadingHira) {
    // 逐語を剥がした結果読みが空 → 漢字も本文のみ
    result += core.map((segment) => escapeHtml(segment.text)).join("");
  } else if (core.length === 1 && core[0].type === "kanji") {
    result += `<ruby>${escapeHtml(core[0].text)}<rt>${escapeHtml(coreReadingShown || coreReadingHira)}</rt></ruby>`;
  } else if (core.every((segment) => segment.type === "kanji")) {
    const joined = core.map((segment) => segment.text).join("");
    result += `<ruby>${escapeHtml(joined)}<rt>${escapeHtml(coreReadingShown || coreReadingHira)}</rt></ruby>`;
  } else {
    // 送り仮名合わせはひらがな長でアライン。表示もひらがな（混在は稀）
    result += alignMiddleSegments(core, coreReadingHira);
  }

  result += trailingOtherRaw.map((text) => escapeHtml(text)).join("");
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
import { getCombinedPhraseTrie } from "./personal-name-phrases.js";
import { applyEnglishKatakanaReadings } from "./english-katakana-reading.js";
import { applyKanjiReadings } from "./kanji-readings.js";
import {
  extractInlineParenReadings,
  applyInlineParenReadings
} from "./inline-paren-reading.js";
import { stripAnnotationMarkers } from "./annotation-markers.js";
import {
  normalizeKanjiForLookup,
  remapTokenSurfacesToOriginal,
  stripVariationSelectors
} from "./kanji-normalize.js";

import {
  assignTokenSpans,
  applyOccurrenceOverrides,
  fillUncoveredTokenGaps,
  getOccurrenceOverridesForText,
} from "./occurrence-overrides.js";

function escapeAttr(value) {
  return escapeHtml(value);
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
  const kanaOnly = options.kanaOnly === true || isKanaOnlySurface(surface);
  const normalized = reading
    ? preserveKatakana
      ? displayReading(reading)
      : normalizeReading(reading)
    : "";
  const unset = !normalized && !kanaOnly;
  const tip = !unset && !kanaOnly && isNumberReadingTipSurface(surface);
  const tipReading = tip
    ? preserveKatakana
      ? displayReading(normalized) || toKatakana(normalized)
      : normalized
    : "";
  const title = kanaOnly
    ? "ドラッグで前後の語とまとめて読みを指定"
    : unset
      ? "クリックで読みを登録。ドラッグで複数語をまとめて指定"
      : tip
        ? tipReading
        : "クリックで読み候補。ドラッグで複数語をまとめて指定";
  const className = [
    "yt-furigana-word",
    kanaOnly ? "yt-furigana-word--kana" : "",
    unset ? "yt-furigana-word--unset" : "",
    tip ? "yt-furigana-word--tip" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const tipAttr = tip ? ` data-tip="${escapeAttr(tipReading)}"` : "";
  const spanStart = Number.isFinite(options.spanStart)
    ? ` data-span-start="${options.spanStart}"`
    : "";
  const spanEnd = Number.isFinite(options.spanEnd)
    ? ` data-span-end="${options.spanEnd}"`
    : "";
  const tokenIndex = Number.isFinite(options.tokenIndex)
    ? ` data-token-index="${options.tokenIndex}"`
    : "";
  // かな単独はルビ不要（表層そのものが読み）
  const inner =
    kanaOnly && (!normalized || normalizeReading(normalized) === toHiragana(surface))
      ? escapeHtml(surface)
      : rubyHtml || escapeHtml(surface);
  return `<span class="${className}" data-surface="${escapeAttr(surface)}" data-reading="${escapeAttr(kanaOnly ? "" : normalized)}"${spanStart}${spanEnd}${tokenIndex}${tipAttr} tabindex="0" role="button" title="${escapeAttr(title)}">${inner}</span>`;
}

/**
 * RubiPon と同じ順: トークン化 → 結合 → 文脈読み → フレーズ上書き。
 * 文脈を結合前に掛けると「何度も何も…」で「何」が全部「なに」になり「なにど」になる。
 * 原文を「何」などで先に切り出すと「何故か」が分断されるのでやらない。
 * 「音（ね）」はカッコを外して読みとして採用（字幕側の明示読みを最優先）。
 *
 * 旧字・人名異体字（髙・𠮷 等）は照合キーだけ常用形へ寄せて解析し、
 * 表示表層は原文のまま戻す（NFKC では 髙→高 にならないため）。
 */
export function buildFuriganaHtml(text, tokenize) {
  // 不可視セレクタを先に落とし、インライン読みの位置と照合長を一致させる
  const withoutNotes = stripVariationSelectors(stripAnnotationMarkers(text));
  const { text: prepared, spans: inlineSpans } = extractInlineParenReadings(
    withoutNotes
  );
  const lookupText = normalizeKanjiForLookup(prepared);
  const useLookup = lookupText !== prepared;

  const analyzed = applyKanjiReadings(
    applyEnglishKatakanaReadings(
      mergeTokensForRuby(tokenize(useLookup ? lookupText : prepared), {
        extraSurfaces: MANUAL_PHRASE_READINGS.keys(),
        phraseTrie: getCombinedPhraseTrie()
      })
    )
  );
  const contextual = applyContextualReadings(
    analyzed,
    useLookup ? lookupText : prepared
  );
  // 常用形キーでユーザー辞書（高橋）を当てたあと、表層を原文（髙橋）へ戻す
  const withManualOnLookup = applyManualPhraseReadings(contextual);
  const remapped = useLookup
    ? remapTokenSurfacesToOriginal(withManualOnLookup, prepared, lookupText)
    : withManualOnLookup;
  // 原文キーのユーザー辞書（髙橋）も拾う
  let tokens = applyInlineParenReadings(
    useLookup ? applyManualPhraseReadings(remapped) : remapped,
    inlineSpans
  );
  const spanBase = useLookup ? prepared : prepared;
  tokens = assignTokenSpans(tokens, spanBase);
  const occurrenceRules = getOccurrenceOverridesForText(spanBase);
  if (occurrenceRules.length) {
    tokens = applyOccurrenceOverrides(spanBase, tokens, occurrenceRules);
  }
  // 上書きで隣の漢字が消えた／解析漏れでも、クリック登録できる unset を残す
  tokens = fillUncoveredTokenGaps(spanBase, tokens);
  // 切れ端の単漢字に Unihan 既定を載せる（読み無し放置が最悪）
  tokens = applyKanjiReadings(tokens);

  let wrapIndex = 0;
  return tokens
    .map((token) => {
      const surface = token.surface_form || token.surface || "";
      let preserveKatakana = token.preserveKatakana === true;
      const raw = token.reading || token.pronunciation || "";
      // 形態素のカタカナ読みはひらがな化。ユーザー登録カタカナは保持。
      let reading = preserveKatakana
        ? displayReading(raw)
        : normalizeReading(raw);
      if (token.source === "occurrence" && raw) {
        reading = /[\u30a1-\u30f6]/.test(raw)
          ? displayReading(raw)
          : normalizeReading(raw);
        if (/[\u30a1-\u30f6]/.test(raw)) preserveKatakana = true;
      }
      if (isLatinWord(surface)) {
        // 欧文: 英字読み・アルファベット逐語は捨てる。かな語読みはカタカナ表示
        if (
          !isUsefulLatinReading(reading) ||
          isAlphabetLetterSpelling(surface, reading)
        ) {
          reading = "";
        } else {
          reading = toKatakana(reading);
          preserveKatakana = true;
        }
      } else if (hasKanji(surface) && /[A-Za-z]/.test(surface)) {
        reading = stripMixedSurfaceAlphabetReading(surface, reading);
      }
      const ruby = buildRuby(surface, reading, { preserveKatakana });
      if (!isSelectableSurface(surface)) return ruby;
      const [spanStart, spanEnd] = Array.isArray(token.span)
        ? token.span
        : [NaN, NaN];
      // クリック／ドラッグ可能な語だけの連番（範囲選択の index と一致）
      const tokenIndex = wrapIndex;
      wrapIndex += 1;
      return wrapFuriganaWord(surface, reading, ruby, {
        preserveKatakana,
        spanStart,
        spanEnd,
        tokenIndex,
        kanaOnly: isKanaOnlySurface(surface) && !isRegisterableSurface(surface)
      });
    })
    .join("");
}
