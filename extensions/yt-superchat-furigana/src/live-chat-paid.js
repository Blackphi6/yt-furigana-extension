/**
 * get_live_chat / get_live_chat_replay の JSON から Super Chat を平らな DTO にする（純関数）。
 * 仮想リストで DOM から消える前に、通信の段階で全件拾うため。
 */

/**
 * @param {unknown} value
 */
export function ytText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return "";
  const o = /** @type {Record<string, unknown>} */ (value);
  if (typeof o.simpleText === "string") return o.simpleText;
  if (Array.isArray(o.runs)) {
    return o.runs
      .map((r) => {
        if (!r || typeof r !== "object") return "";
        const t = /** @type {{ text?: unknown }} */ (r).text;
        return typeof t === "string" ? t : "";
      })
      .join("");
  }
  return "";
}

/**
 * @param {unknown} value
 */
function colorIntToHex(value) {
  const n = Number(value);
  if (value == null || value === "" || !Number.isFinite(n)) return "";
  const u = n >>> 0;
  return `#${[(u >> 16) & 0xff, (u >> 8) & 0xff, u & 0xff]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * liveChatPaidMessageRenderer / liveChatPaidStickerRenderer 1 件。
 * @param {Record<string, unknown>} rec
 */
export function flattenPaidRecord(rec) {
  const author = ytText(rec.authorName);
  const amount =
    ytText(rec.purchaseAmountText) || ytText(rec.amountText) || ytText(rec.amount);
  const message = ytText(rec.message).trim();
  const sticker =
    typeof rec.altText === "string"
      ? rec.altText
      : ytText(
          /** @type {{ accessibility?: { accessibilityData?: { label?: string } } }} */ (
            rec
          ).accessibility?.accessibilityData?.label
        );
  const text = message || String(sticker || "").trim();
  if (!author && !amount && !text) return null;
  const thumbs =
    rec.authorPhoto && typeof rec.authorPhoto === "object"
      ? /** @type {{ thumbnails?: { url?: string }[] }} */ (rec.authorPhoto).thumbnails
      : null;
  const photo =
    Array.isArray(thumbs) && thumbs.length
      ? String(thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || "")
      : "";
  return {
    id: String(rec.id || "").trim(),
    author,
    amount,
    message: text,
    timestamp: ytText(rec.timestampText).trim(),
    timestampUsec: String(rec.timestampUsec || "").trim(),
    authorPhotoUrl: /^https?:\/\//i.test(photo) ? photo : "",
    colorHex: colorIntToHex(rec.bodyBackgroundColor),
    headerColorHex: colorIntToHex(rec.headerBackgroundColor)
  };
}

/**
 * @param {{ id?: string, author?: string, amount?: string, message?: string }} dto
 */
export function paidDtoKey(dto) {
  return dto.id || `${dto.author}\u0001${dto.amount}\u0001${dto.message}`;
}

/**
 * 任意の JSON 木から Paid renderer を集める（ティッカーの showItemEndpoint 内も含む）。
 * @param {unknown} node
 * @param {ReturnType<typeof flattenPaidRecord>[]} out
 * @param {Set<string>} seen
 * @param {number} [depth]
 */
export function collectPaidDtos(node, out, seen, depth = 0) {
  if (!node || depth > 16 || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) collectPaidDtos(n, out, seen, depth + 1);
    return;
  }
  const o = /** @type {Record<string, unknown>} */ (node);
  const rec =
    (o.liveChatPaidMessageRenderer && typeof o.liveChatPaidMessageRenderer === "object"
      ? o.liveChatPaidMessageRenderer
      : null) ||
    (o.liveChatPaidStickerRenderer && typeof o.liveChatPaidStickerRenderer === "object"
      ? o.liveChatPaidStickerRenderer
      : null);
  if (rec) {
    const dto = flattenPaidRecord(/** @type {Record<string, unknown>} */ (rec));
    if (dto && !seen.has(paidDtoKey(dto))) {
      seen.add(paidDtoKey(dto));
      out.push(dto);
    }
    return;
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") collectPaidDtos(v, out, seen, depth + 1);
  }
}

/**
 * get_live_chat 応答（または ytInitialData）から Super Chat DTO。
 * @param {unknown} json
 */
export function extractPaidDtosFromLiveChatJson(json) {
  if (!json || typeof json !== "object") return [];
  const j = /** @type {Record<string, any>} */ (json);
  const actions =
    j.continuationContents?.liveChatContinuation?.actions ||
    j.contents?.liveChatRenderer?.actions ||
    j.actions;
  if (!actions) return [];
  /** @type {ReturnType<typeof flattenPaidRecord>[]} */
  const out = [];
  collectPaidDtos(actions, out, new Set());
  return out.filter(Boolean);
}

/** 通信フックの対象 URL */
export function isLiveChatDataUrl(url) {
  return /\/youtubei\/v1\/live_chat\/get_live_chat(?:_replay)?\b/.test(String(url || ""));
}
