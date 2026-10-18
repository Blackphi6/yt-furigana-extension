/**
 * 拡張内 gz 辞書 fetch。kuromoji と同時多発すると Failed to fetch になりやすいので
 * 1 本ずつキュー + 短いリトライ。
 */

import zlib from "zlibjs/bin/gunzip.min.js";

/** @type {Promise<unknown>} */
let fetchChain = Promise.resolve();

/**
 * 拡張以外（npm ライブラリ等）向け: 辞書ファイル名 → gz バイト列を返す関数。
 * 未設定なら拡張の chrome.runtime.getURL から fetch する。
 * @type {((fileName: string) => Promise<ArrayBuffer | Uint8Array>) | null}
 */
let dictionaryFileLoader = null;

/**
 * @param {((fileName: string) => Promise<ArrayBuffer | Uint8Array>) | null} loader
 */
export function setDictionaryFileLoader(loader) {
  dictionaryFileLoader = typeof loader === "function" ? loader : null;
}

/**
 * gzip を展開して文字列に。Orion の隔離世界ではネイティブ展開が型エラーになるので zlibjs に戻す。
 * @param {ArrayBuffer | Uint8Array} bytes
 */
export async function gunzipToText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    if (typeof DecompressionStream !== "function") throw new Error("no DecompressionStream");
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  } catch {
    return new TextDecoder().decode(new zlib.Zlib.Gunzip(u8).decompress());
  }
}

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

  if (dictionaryFileLoader && !explicitUrl) {
    const loader = dictionaryFileLoader;
    const fileName = String(relativePath || "").replace(/^\/?(dict\/)?/, "");
    return enqueueDictFetch(async () => {
      const bytes = await loader(fileName);
      const jsonText = fileName.endsWith(".gz")
        ? await gunzipToText(bytes)
        : new TextDecoder().decode(bytes);
      const parsed = JSON.parse(jsonText);
      return parsed && typeof parsed === "object" ? parsed : {};
    });
  }

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
