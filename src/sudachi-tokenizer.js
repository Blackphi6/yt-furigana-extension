import { SudachiStateless, TokenizeMode } from "sudachi-wasm333";

let sudachi = null;
let initPromise = null;
/** @type {{ phase: string, loadedBytes: number, totalBytes: number, percent: number, message: string } | null} */
let lastProgress = null;

function toKuromojiCompatible(morpheme) {
  return {
    surface_form: morpheme.surface,
    reading: morpheme.reading_form || "",
    pronunciation: morpheme.reading_form || "",
    basic_form: morpheme.dictionary_form || morpheme.normalized_form || morpheme.surface,
    pos: Array.isArray(morpheme.poses) ? morpheme.poses[0] : "未知語"
  };
}

function emitProgress(onProgress, update) {
  lastProgress = {
    phase: update.phase,
    loadedBytes: update.loadedBytes ?? 0,
    totalBytes: update.totalBytes ?? 0,
    percent: update.percent ?? 0,
    message: update.message ?? ""
  };
  onProgress?.(lastProgress);
}

async function fetchDictionaryBytes(url, onProgress) {
  emitProgress(onProgress, {
    phase: "fetch",
    percent: 0,
    message: "辞書を取得中…"
  });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Sudachi dictionary fetch failed: ${response.status}`);
  }

  const totalBytes = Number(response.headers.get("content-length")) || 0;
  if (!response.body || typeof response.body.getReader !== "function") {
    const buffer = await response.arrayBuffer();
    emitProgress(onProgress, {
      phase: "fetch",
      loadedBytes: buffer.byteLength,
      totalBytes: buffer.byteLength,
      percent: 100,
      message: "辞書の取得が完了"
    });
    return new Uint8Array(buffer);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    const percent =
      totalBytes > 0 ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100)) : 0;
    emitProgress(onProgress, {
      phase: "fetch",
      loadedBytes,
      totalBytes,
      percent,
      message:
        totalBytes > 0
          ? `辞書を読み込み中… ${formatMb(loadedBytes)} / ${formatMb(totalBytes)} (${percent}%)`
          : `辞書を読み込み中… ${formatMb(loadedBytes)}`
    });
  }

  const bytes = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  emitProgress(onProgress, {
    phase: "fetch",
    loadedBytes,
    totalBytes: totalBytes || loadedBytes,
    percent: 100,
    message: "辞書の取得が完了"
  });

  return bytes;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * SudachiDict (small) を読み込み、Kuromoji 互換の tokenize を返す。
 * Mode C = 長いまとまり（1人→ひとり など複合に強い）
 */
export async function initSudachiTokenizer({ dictUrl, onProgress } = {}) {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const url = dictUrl ?? chrome.runtime.getURL("dict/sudachi/system.dic");
    const bytes = await fetchDictionaryBytes(url, onProgress);

    emitProgress(onProgress, {
      phase: "init",
      loadedBytes: bytes.byteLength,
      totalBytes: bytes.byteLength,
      percent: 100,
      message: "Sudachi を初期化中…"
    });

    const instance = new SudachiStateless();
    // Let the progress toast paint before the heavy sync init.
    await new Promise((resolve) => setTimeout(resolve, 32));
    instance.initialize_from_bytes(bytes);

    if (!instance.is_initialized()) {
      throw new Error("Sudachi failed to initialize");
    }

    sudachi = instance;

    emitProgress(onProgress, {
      phase: "ready",
      loadedBytes: bytes.byteLength,
      totalBytes: bytes.byteLength,
      percent: 100,
      message: "Sudachi 準備完了"
    });

    return createSudachiTokenize(instance);
  })().catch((error) => {
    initPromise = null;
    emitProgress(onProgress, {
      phase: "error",
      percent: 0,
      message: error.message || "Sudachi の初期化に失敗しました"
    });
    throw error;
  });

  return initPromise;
}

export function createSudachiTokenize(instance, mode = TokenizeMode.C) {
  return (text) => {
    const morphemes = instance.tokenize_raw(text, mode);
    return morphemes.map(toKuromojiCompatible);
  };
}

export function isSudachiReady() {
  return sudachi?.is_initialized?.() === true;
}

export function getSudachiLoadProgress() {
  return lastProgress;
}

export { TokenizeMode };
