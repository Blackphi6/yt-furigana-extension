function toHiragana(text) {
  return (text ?? "").replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function withSpans(tokens) {
  let offset = 0;
  return tokens.map((token) => {
    const surface = token.surface_form ?? "";
    const start = offset;
    const end = start + surface.length;
    offset = end;
    return { ...token, start, end, surface_form: surface };
  });
}

function readingOf(token) {
  return toHiragana(token.reading || token.pronunciation || "");
}

function hasUsefulReading(token) {
  const reading = readingOf(token);
  if (!reading) return false;
  if (reading === "*" || reading === "＊") return false;
  return true;
}

/**
 * Sudachi の1トークンに重なる Kuromoji トークンを集める。
 * 完全一致 or Sudachi 区間を Kuromoji が細かく切っている場合に使う。
 */
function overlappingKuromoji(sudachiToken, kuromojiTokens) {
  return kuromojiTokens.filter(
    (token) => token.start < sudachiToken.end && token.end > sudachiToken.start
  );
}

function joinedKuromojiReading(parts) {
  if (parts.length === 0) return "";
  if (!parts.every(hasUsefulReading)) return "";
  return parts.map(readingOf).join("");
}

/**
 * Sudachi（分割に強い）と Kuromoji（読みの補完）を合わせる。
 *
 * 方針:
 * - トークン境界は Sudachi 優先（1人 を 1+人 に割らない）
 * - 読みは Sudachi を基本に、空/弱いときだけ Kuromoji で補う
 * - 両方が違う読みを持つ場合は Sudachi を採用（複合語の読みが安定しやすい）
 */
export function mergeSudachiAndKuromoji(sudachiTokens, kuromojiTokens) {
  const sudachi = withSpans(sudachiTokens);
  const kuromoji = withSpans(kuromojiTokens);

  return sudachi.map((sToken) => {
    const overlap = overlappingKuromoji(sToken, kuromoji);
    const exact = overlap.find(
      (token) => token.start === sToken.start && token.end === sToken.end
    );
    const sudachiReading = hasUsefulReading(sToken) ? readingOf(sToken) : "";
    const kuromojiReading = exact
      ? readingOf(exact)
      : joinedKuromojiReading(overlap);

    let reading = sudachiReading;
    let source = "sudachi";

    if (!reading && kuromojiReading) {
      reading = kuromojiReading;
      source = "kuromoji";
    } else if (
      reading &&
      kuromojiReading &&
      reading !== kuromojiReading &&
      // Sudachi が数字混じり複合を正しく読んでいるときは維持
      !/[0-9０-９]/.test(sToken.surface_form)
    ) {
      // 読みが食い違う場合も分割は Sudachi、読みは Sudachi 優先
      reading = sudachiReading;
      source = "sudachi";
    }

    return {
      surface_form: sToken.surface_form,
      reading,
      pronunciation: reading,
      basic_form: sToken.basic_form || sToken.surface_form,
      pos: sToken.pos || "未知語",
      _merge: {
        source,
        sudachiReading,
        kuromojiReading: kuromojiReading || null
      }
    };
  });
}

/** 両方の tokenize 関数からハイブリッド tokenize を作る */
export function createHybridTokenize(sudachiTokenize, kuromojiTokenize) {
  return (text) => {
    const sudachiTokens = sudachiTokenize(text);
    const kuromojiTokens = kuromojiTokenize(text);
    return mergeSudachiAndKuromoji(sudachiTokens, kuromojiTokens);
  };
}
