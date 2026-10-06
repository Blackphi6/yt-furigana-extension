"use strict";
/**
 * kuromoji の BrowserDictionaryLoader 置き換え（ビルド時に差し替え）。
 * iPad の Orion では content script から拡張 URL への XHR が失敗するので、
 * fetch → XHR → background 経由の順に試し、どの経路で何が起きたかを記録する。
 * kuromoji は loadArrayBuffer を this 無しで呼ぶので this に依存しない。
 */

var DictionaryLoader = require("kuromoji/src/loader/DictionaryLoader.js");
var zlib = require("zlibjs/bin/gunzip.min.js");

/** kuromoji が読む辞書ファイル数（base/check/tid×3/cc/unk×6） */
var DICT_FILE_TOTAL = 12;

/** @type {{ via: string, errors: string[], loaded: number, startedAt: number }} */
var dictLoadLog = { via: "", errors: [], loaded: 0, startedAt: 0 };

function getDictLoadLog() {
  return {
    via: dictLoadLog.via,
    errors: dictLoadLog.errors.slice(),
    loaded: dictLoadLog.loaded,
    total: DICT_FILE_TOTAL,
    startedAt: dictLoadLog.startedAt
  };
}

/** 診断用。並列ロードで同じ失敗が何度も出るので種類ごとに1回だけ残す */
function recordError(msg) {
  if (dictLoadLog.errors.indexOf(msg) < 0 && dictLoadLog.errors.length < 8) {
    dictLoadLog.errors.push(msg);
  }
}

function describeError(err) {
  if (!err) return "unknown";
  if (typeof err === "string") return err;
  if (err.message) return String(err.message);
  if (err.type) return "event " + err.type;
  return String(err);
}

/**
 * gzip ならネイティブ展開（無ければ zlibjs）。端末側で既に展開済みならそのまま。
 * @param {ArrayBuffer} buf
 * @returns {Promise<ArrayBuffer>}
 */
function gunzipIfNeeded(buf) {
  var head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (!(head[0] === 0x1f && head[1] === 0x8b)) return Promise.resolve(buf);
  var viaZlib = function () {
    return new zlib.Zlib.Gunzip(new Uint8Array(buf)).decompress().buffer;
  };
  if (typeof DecompressionStream !== "function") return Promise.resolve(viaZlib());
  // Orion の隔離世界では DecompressionStream が "Invalid type should be ArrayBuffer" で落ちる
  return Promise.resolve()
    .then(function () {
      var stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
      return new Response(stream).arrayBuffer();
    })
    .catch(viaZlib);
}

function viaFetch(url) {
  return fetch(url).then(function (res) {
    if (!res.ok) throw new Error("fetch " + res.status);
    return res.arrayBuffer();
  });
}

function viaXhr(url) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.onload = function () {
      if (xhr.status > 0 && xhr.status !== 200) {
        reject(new Error("xhr " + xhr.status));
        return;
      }
      resolve(xhr.response);
    };
    xhr.onerror = function () {
      reject(new Error("xhr network error"));
    };
    xhr.send();
  });
}

function base64ToArrayBuffer(b64) {
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** background は拡張自身のリソースを確実に読めるので、最後の手段として中継させる */
function viaBackground(url) {
  var idx = url.indexOf("/dict/");
  if (idx < 0) return Promise.reject(new Error("bg: not a dict url"));
  var path = url.slice(idx + 1);
  return new Promise(function (resolve, reject) {
    try {
      chrome.runtime.sendMessage({ type: "YTSCF_DICT_FILE", path: path }, function (res) {
        var lastErr = chrome.runtime.lastError;
        if (lastErr) {
          reject(new Error("bg: " + (lastErr.message || "no response")));
          return;
        }
        if (!res || !res.ok || typeof res.b64 !== "string") {
          reject(new Error("bg: " + ((res && res.error) || "empty")));
          return;
        }
        resolve(base64ToArrayBuffer(res.b64));
      });
    } catch (err) {
      reject(err);
    }
  });
}

var STRATEGIES = [
  { name: "fetch", run: viaFetch },
  { name: "xhr", run: viaXhr },
  { name: "bg", run: viaBackground }
];

/** 一度成功した経路を先頭で使う（12 ファイル毎に失敗経路を踏まない） */
var preferred = 0;

function loadWithFallback(url) {
  var order = [preferred].concat(
    STRATEGIES.map(function (_s, i) {
      return i;
    }).filter(function (i) {
      return i !== preferred;
    })
  );
  var attempt = function (k) {
    if (k >= order.length) {
      return Promise.reject(new Error("dict load failed: " + dictLoadLog.errors.slice(-3).join(" / ")));
    }
    var s = STRATEGIES[order[k]];
    return s
      .run(url)
      .then(gunzipIfNeeded)
      .then(function (buf) {
        preferred = order[k];
        dictLoadLog.via = s.name;
        return buf;
      })
      .catch(function (err) {
        recordError(s.name + ": " + describeError(err));
        return attempt(k + 1);
      });
  };
  return attempt(0);
}

function MultiPathDictionaryLoader(dic_path) {
  DictionaryLoader.apply(this, [dic_path]);
}

MultiPathDictionaryLoader.prototype = Object.create(DictionaryLoader.prototype);

MultiPathDictionaryLoader.prototype.loadArrayBuffer = function (url, callback) {
  if (!dictLoadLog.startedAt) dictLoadLog.startedAt = Date.now();
  loadWithFallback(url).then(
    function (buf) {
      dictLoadLog.loaded += 1;
      callback(null, buf);
    },
    function (err) {
      callback(err, null);
    }
  );
};

module.exports = MultiPathDictionaryLoader;
module.exports.getDictLoadLog = getDictLoadLog;
