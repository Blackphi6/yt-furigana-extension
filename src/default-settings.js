export const DEFAULT_SETTINGS = {
  enabled: true,
  engine: "kuromoji",
  /** 読み推定 API のベース URL（空＝未設定）。例: http://127.0.0.1:8765 */
  readingApiUrl: "",
  /** ホスト読みAPI用キー（Premium）。空なら localhost は認証なし可 */
  readingApiKey: "",
  /** free | premium */
  plan: "free",
  /** ytfp_... Premium ライセンス */
  licenseKey: "",
  premiumExpiresAt: "",
  /** 辞書同期の最終更新（ISO） */
  dictRevisedAt: "",
  /** Premium: 起動時に共有辞書を取り込む */
  sharedDictEnabled: true,
  /** GitHub Sponsors URL */
  sponsorsUrl: "https://github.com/sponsors/Blackphi6",
  /** GitHub Pages サイト（料金・ポリシー） */
  siteUrl: "https://blackphi6.github.io/yt-furigana-extension",
  pricingUrl: "https://blackphi6.github.io/yt-furigana-extension/pricing.html",
  privacyUrl: "https://blackphi6.github.io/yt-furigana-extension/privacy.html",
  termsUrl: "https://blackphi6.github.io/yt-furigana-extension/terms.html",
  installUrl: "https://blackphi6.github.io/yt-furigana-extension/install.html",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: ""
};

/** ふりがな用途で推奨するモデル（軽い・速い順） */
export const PREFERRED_OLLAMA_MODELS = [
  "gemma3:4b",
  "gemma3:1b",
  "gemma2:2b",
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

  const gemma = models.find((name) => /gemma3?:/i.test(name));
  if (gemma) {
    return gemma;
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

export function isLlmEngine(engine) {
  return engine === "ollama";
}

/** 候補ラティス型の読み推定API（BYO）。メンテナー常時推論ではない。 */
export function isReadingApiEngine(engine) {
  return engine === "reading-api";
}

/** ネットワーク経由の変換（プリフェッチ・非同期適用向き） */
export function isRemoteEngine(engine) {
  return isLlmEngine(engine) || isReadingApiEngine(engine);
}
