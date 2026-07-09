function toHiragana(text) {
  return text.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function isKanji(char) {
  return /[\u3400-\u9fff\uF900-\uFAFF]/.test(char);
}

function isKana(char) {
  return /[\u3040-\u309f\u30a0-\u30ff]/.test(char);
}

function hasKanji(text) {
  return /[\u3400-\u9fff\uF900-\uFAFF]/.test(text);
}

function parseSegments(surface) {
  const segments = [];
  let current = "";
  let type = null;

  for (const char of surface) {
    const charType = isKanji(char) ? "kanji" : "kana";
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

export function buildRuby(surface, reading) {
  const hiraganaReading = toHiragana(reading || "");

  if (!hasKanji(surface)) return surface;
  if (!hiraganaReading || hiraganaReading === toHiragana(surface)) return surface;

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
  const middleReading = hiraganaReading.slice(readingStart, readingEnd);

  if (middleSegments.length === 0) {
    return result + trailing.join("");
  }

  if (middleSegments.length === 1 && middleSegments[0].type === "kanji") {
    result += `<ruby>${middleSegments[0].text}<rt>${middleReading}</rt></ruby>`;
  } else {
    result += alignMiddleSegments(middleSegments, middleReading);
  }

  return result + trailing.join("");
}

export function buildFuriganaHtml(text, tokenize) {
  const tokens = tokenize(text);

  return tokens
    .map((token) => {
      const surface = token.surface_form;
      const reading = token.reading || token.pronunciation || "";
      return buildRuby(surface, reading);
    })
    .join("");
}
