/**
 * デモサイト用 buildRuby（GitHub Pages は site/ のみ配信のため独立ファイル）。
 * ロジックは src/furigana.js と同期すること。scripts/test-furigana.mjs で突き合わせる。
 */
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
  const s = String(text || "").normalize("NFKC").trim();
  if (!s) return false;
  // 数字のみ・小数・カンマ区切り（デモでクリック編集できるようにする）
  if (/^[0-9]+([,，][0-9]+)*(\.[0-9]+)?$/.test(s)) return true;
  // 数字＋助数詞／％
  if (
    /^[0-9]+([,，][0-9]+)*(\.[0-9]+)?[%％階回人目名歳才年月日時分秒円枚冊本個点倍]$/.test(
      s
    )
  ) {
    return true;
  }
  // 3.2.1 カウントダウン
  if (/^[0-9]+(\s*\.\s*[0-9]+){2,}$/.test(s)) return true;
  return false;
}

/**
 * 数字系（360 / 93% / 3.2.1 / 12.8V など、漢字なし）は
 * ルビだと横幅を食いすぎるのでツールチップ表示にする。
 * 1人・0時など漢字混じりは従来どおりルビ。
 */
export function isNumberReadingTipSurface(text) {
  const s = String(text || "").normalize("NFKC").trim();
  if (!s || hasKanji(s)) return false;
  return hasDigit(s);
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
    if (!isUsefulLatinReading(reading || shown)) return safeSurface;
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

  if (middleSegments.length === 1 && middleSegments[0].type === "kanji") {
    result += `<ruby>${escapeHtml(middleSegments[0].text)}<rt>${escapeHtml(middleReadingShown || middleReadingHira)}</rt></ruby>`;
  } else if (
    middleSegments.length > 0 &&
    middleSegments.every((segment) => segment.type === "kanji" || segment.type === "other") &&
    middleSegments.some((segment) => segment.type === "kanji") &&
    !middleSegments.some((segment) => segment.type === "kana")
  ) {
    const joined = middleSegments.map((segment) => segment.text).join("");
    result += `<ruby>${escapeHtml(joined)}<rt>${escapeHtml(middleReadingShown || middleReadingHira)}</rt></ruby>`;
  } else {
    // 送り仮名合わせはひらがな長でアライン。表示もひらがな（混在は稀）
    result += alignMiddleSegments(middleSegments, middleReadingHira);
  }

  return result + trailing.join("");
}
