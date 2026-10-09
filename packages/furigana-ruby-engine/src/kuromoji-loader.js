/**
 * kuromoji の辞書を、利用側が渡した loadFile（ファイル名 → gz バイト列）で読む。
 * kuromoji 同梱の Browser/Node ローダーは XHR / fs 決め打ちで、WebKit の拡張や
 * バンドラ環境で動かないことがあるので使わない。
 */
import DictionaryLoader from "kuromoji/src/loader/DictionaryLoader.js";
import Tokenizer from "kuromoji/src/Tokenizer.js";
import zlib from "zlibjs/bin/gunzip.min.js";

/**
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {ArrayBuffer}
 */
function gunzipToArrayBuffer(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // gzip でなければそのまま（配信側で展開済みのとき）
  if (!(u8[0] === 0x1f && u8[1] === 0x8b)) {
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  }
  return new zlib.Zlib.Gunzip(u8).decompress().buffer;
}

/**
 * @param {(fileName: string) => Promise<ArrayBuffer | Uint8Array>} loadFile
 * @returns {Promise<{ tokenize: (text: string) => any[] }>}
 */
export function buildKuromojiTokenizer(loadFile) {
  function FileDictionaryLoader() {
    DictionaryLoader.apply(this, [""]);
  }
  FileDictionaryLoader.prototype = Object.create(DictionaryLoader.prototype);
  // kuromoji は this 無しで呼ぶ。path.join("", name) なのでファイル名だけ取り出す
  FileDictionaryLoader.prototype.loadArrayBuffer = (url, callback) => {
    const fileName = String(url).split("/").pop() || "";
    Promise.resolve()
      .then(() => loadFile(fileName))
      .then((bytes) => callback(null, gunzipToArrayBuffer(bytes)))
      .catch((error) => callback(error, null));
  };

  return new Promise((resolve, reject) => {
    new FileDictionaryLoader().load((error, dic) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error?.message || error)));
        return;
      }
      resolve(new Tokenizer(dic));
    });
  });
}
