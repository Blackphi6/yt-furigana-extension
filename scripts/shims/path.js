function join(...parts) {
  const filtered = parts.filter((part) => part != null && part !== "");
  if (filtered.length === 0) return ".";

  const joined = filtered
    .map((part, index) => {
      if (index === 0) {
        return String(part).replace(/\/+$/, "");
      }
      return String(part).replace(/^\/+/, "");
    })
    .join("/");

  // chrome-extension:// / safari-web-extension:// などハイフン入りスキームも対象。
  // WebKit は非特殊スキームの "scheme:/host" を補正しないため // を潰すと辞書 XHR が失敗する
  const protocolMatch = joined.match(/^([a-z][a-z0-9+.-]*:\/\/)(.*)$/i);
  if (protocolMatch) {
    return `${protocolMatch[1]}${protocolMatch[2].replace(/\/{2,}/g, "/")}`;
  }

  return joined.replace(/\/{2,}/g, "/");
}

module.exports = { join };
