/**
 * Chrome 内蔵 AI（Gemini Nano / Prompt API）の薄いラッパー。
 * 新 API（Chrome 138+ の `LanguageModel` グローバル）と
 * 旧 API（`ai.languageModel`）の両方に寄せる。
 * 拡張のサービスワーカーとポップアップ（拡張ページ）の両方から使う。
 */

const NANO_TIMEOUT_MS = 90_000;

function languageOptions() {
  return {
    expectedInputs: [{ type: "text", languages: ["ja"] }],
    expectedOutputs: [{ type: "text", languages: ["ja"] }]
  };
}

/**
 * 利用可能な Prompt API 実装を返す。無ければ null。
 * 返り値は { availability(), create() } に正規化済み。
 */
export function resolvePromptApi() {
  const g = globalThis;
  if (typeof g.LanguageModel !== "undefined" && g.LanguageModel) {
    const lm = g.LanguageModel;
    return {
      kind: "language-model",
      async availability() {
        try {
          return await lm.availability(languageOptions());
        } catch {
          return await lm.availability();
        }
      },
      async create(options) {
        try {
          return await lm.create({ ...languageOptions(), ...options });
        } catch {
          return await lm.create(options);
        }
      }
    };
  }
  const legacy = g.ai?.languageModel;
  if (legacy) {
    return {
      kind: "ai-language-model",
      async availability() {
        const caps = await legacy.capabilities();
        if (caps?.available === "readily") return "available";
        if (caps?.available === "after-download") return "downloadable";
        return "unavailable";
      },
      async create(options) {
        return await legacy.create(options);
      }
    };
  }
  return null;
}

/**
 * Gemini Nano の状態を返す。
 * "available" | "downloadable" | "downloading" | "unavailable" | "unsupported"
 */
export async function geminiNanoAvailability() {
  const api = resolvePromptApi();
  if (!api) return "unsupported";
  try {
    const status = await api.availability();
    if (
      status === "available" ||
      status === "downloadable" ||
      status === "downloading" ||
      status === "unavailable"
    ) {
      return status;
    }
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * モデルのダウンロードを進める（ポップアップのユーザー操作から呼ぶ想定）。
 * 既に使える状態なら何もしない。
 * @param {{ onProgress?: (fraction: number) => void }} [options]
 * @returns {Promise<string>} 完了後の availability
 */
export async function ensureGeminiNanoModel({ onProgress } = {}) {
  const api = resolvePromptApi();
  if (!api) return "unsupported";
  const before = await geminiNanoAvailability();
  if (before === "available" || before === "unavailable" || before === "unsupported") {
    return before;
  }
  const session = await api.create({
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        const loaded = Number(event?.loaded);
        if (Number.isFinite(loaded) && onProgress) {
          onProgress(Math.max(0, Math.min(1, loaded)));
        }
      });
    }
  });
  try {
    session.destroy?.();
  } catch {
    /* ignore */
  }
  return geminiNanoAvailability();
}

/**
 * ふりがな用プロンプトを 1 回実行して生テキストを返す。
 * @param {{ system: string, user: string }} messages
 * @returns {Promise<string>}
 */
export async function promptGeminiNano({ system, user }) {
  const api = resolvePromptApi();
  if (!api) {
    throw new Error(
      "この Chrome では Gemini Nano（内蔵 AI）が使えません。Chrome を最新版にしてください。"
    );
  }
  const status = await geminiNanoAvailability();
  if (status === "downloadable" || status === "downloading") {
    throw new Error(
      "Gemini Nano のモデルがまだ用意できていません。ポップアップで「モデルを用意する」を押してください。"
    );
  }
  if (status !== "available") {
    throw new Error(
      "Gemini Nano が利用できない状態です（この端末・Chrome では内蔵 AI が無効です）。"
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NANO_TIMEOUT_MS);
  let session = null;
  try {
    session = await api.create({
      initialPrompts: [{ role: "system", content: system }]
    });
    const raw = await session.prompt(user, { signal: controller.signal });
    if (!raw) {
      throw new Error("Gemini Nano returned an empty response");
    }
    return String(raw);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Gemini Nano timed out after ${Math.round(NANO_TIMEOUT_MS / 1000)}s`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    try {
      session?.destroy?.();
    } catch {
      /* ignore */
    }
  }
}
