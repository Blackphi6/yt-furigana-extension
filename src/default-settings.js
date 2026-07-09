export const DEFAULT_SETTINGS = {
  enabled: true,
  engine: "ollama",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: ""
};

/** ふりがな用途で推奨するモデル（軽い順） */
export const PREFERRED_OLLAMA_MODELS = [
  "qwen2.5:1.5b",
  "qwen2.5:3b",
  "qwen2.5:7b",
  "qwen2.5:14b",
  "qwen2.5:0.5b"
];

export function listInstalledModelNames(tagsResponse) {
  return (tagsResponse?.models ?? []).map((model) => model.name);
}

export function pickPreferredOllamaModel(installedModels, configuredModel = "") {
  const models = installedModels ?? [];
  if (models.length === 0) {
    return null;
  }

  const trimmed = configuredModel?.trim();
  if (trimmed && models.includes(trimmed)) {
    return trimmed;
  }

  for (const candidate of PREFERRED_OLLAMA_MODELS) {
    const match = models.find(
      (name) => name === candidate || name.startsWith(`${candidate}-`)
    );
    if (match) {
      return match;
    }
  }

  const qwen = models.find((name) => /qwen2\.5/i.test(name));
  if (qwen) {
    return qwen;
  }

  return models[0];
}

export function isModelInstalled(installedModels, modelName) {
  const trimmed = modelName?.trim();
  return Boolean(trimmed && installedModels?.includes(trimmed));
}
