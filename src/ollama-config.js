export function getOllamaTimeoutMs(model = "") {
  const match = model.match(/:(\d+(?:\.\d+)?)b$/i);
  if (!match) return 60000;

  const size = Number.parseFloat(match[1]);
  if (size >= 7) return 120000;
  if (size >= 3) return 90000;
  return 45000;
}
