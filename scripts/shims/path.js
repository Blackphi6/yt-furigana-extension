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

  if (/^[a-z]+:\/\//i.test(filtered[0])) {
    const protocolMatch = joined.match(/^([a-z]+:)(\/\/.*)$/i);
    if (protocolMatch) {
      return `${protocolMatch[1]}${protocolMatch[2].replace(/\/{2,}/g, "/")}`;
    }
  }

  return joined.replace(/\/{2,}/g, "/");
}

module.exports = { join };
