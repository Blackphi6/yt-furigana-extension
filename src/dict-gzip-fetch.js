/**
 * 拡張内 gz 辞書 fetch。kuromoji と同時多発すると Failed to fetch になりやすいので
 * 1 本ずつキュー + 短いリトライ。
 */

/** @type {Promise<unknown>} */
let fetchChain = Promise.resolve();

/**
 * @param {unknown} error
 */
export function isRetryableDictFetchError(error) {
  const msg = String(/** @type {Error} */ (error)?.message || error);
  return /Failed to fetch|NetworkError|network|invalidated|chrome-extension:\/\/invalid/i.test(
    msg
  );
}

/**
 * @param {string} relativePath
 */
export function resolveExtensionDictUrl(relativePath) {
  const rel = String(relativePath || "").replace(/^\//, "");
  const dictPath = rel.startsWith("dict/") ? rel : `dict/${rel}`;
  if (typeof chrome === "undefined" || !chrome?.runtime?.getURL) return "";
  if (chrome.runtime && !chrome.runtime.id) {
    throw new Error("extension context invalidated");
  }
  const url = chrome.runtime.getURL(dictPath);
  if (/chrome-extension:\/\/invalid\//i.test(url)) {
    throw new Error("extension context invalidated");
  }
  return url;
}

/**
 * @template T
 * @param {() => Promise<T>} task
 */
function enqueueDictFetch(task) {
  const run = fetchChain.then(task, task);
  fetchChain = run.catch(() => {});
  return run;
}

/**
 * @param {string} relativePath
 * @param {{ url?: string, label?: string, attempts?: number }} [opts]
 */
export async function fetchGzipJsonDict(relativePath, opts = {}) {
  const label = opts.label || relativePath;
  const attempts = opts.attempts ?? 3;
  const explicitUrl = opts.url ? String(opts.url) : "";

  return enqueueDictFetch(async () => {
    const dictUrl = explicitUrl || resolveExtensionDictUrl(relativePath);
    if (!dictUrl) {
      throw new Error(`${label} URL missing`);
    }

    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        if (typeof chrome !== "undefined" && chrome?.runtime && !chrome.runtime.id) {
          throw new Error("extension context invalidated");
        }
        const response = await fetch(dictUrl);
        if (!response.ok) {
          throw new Error(`${label} fetch failed: ${response.status}`);
        }

        let jsonText = "";
        if (dictUrl.endsWith(".gz")) {
          if (typeof DecompressionStream !== "function") {
            throw new Error("DecompressionStream is not available");
          }
          const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
          jsonText = await new Response(stream).text();
        } else {
          jsonText = await response.text();
        }
        const parsed = JSON.parse(jsonText);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1 && isRetryableDictFetchError(error)) {
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  });
}
