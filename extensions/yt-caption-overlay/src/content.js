/**
 * YouTube ページ上で自作字幕を疑似表示する。
 * ネットワークには出ない（ストレージの cue だけ読む）。
 */

import { findActiveCue } from "./parse-cues.js";
import { ensureOverlayRoot, renderOverlay, removeOverlay } from "./overlay.js";

const STORAGE_KEY = "ytcoState";

/** @type {{ enabled: boolean, cues: any[], fileName: string, fontSize: number }} */
let state = {
  enabled: true,
  cues: [],
  fileName: "",
  fontSize: 28
};

let raf = 0;
let boundVideo = null;

function getPlayer() {
  return (
    document.querySelector("#movie_player") ||
    document.querySelector(".html5-video-player")
  );
}

function getVideo() {
  const player = getPlayer();
  return player?.querySelector?.("video") || document.querySelector("video.html5-main-video");
}

function tick() {
  raf = 0;
  const player = getPlayer();
  const video = getVideo();
  if (!player || !video) {
    schedule();
    return;
  }

  if (boundVideo !== video) {
    boundVideo = video;
    video.addEventListener("timeupdate", schedule, { passive: true });
    video.addEventListener("seeked", schedule, { passive: true });
  }

  const root = ensureOverlayRoot(player);
  if (!state.enabled || !state.cues.length) {
    renderOverlay(root, { enabled: false });
    schedule();
    return;
  }

  const cue = findActiveCue(state.cues, video.currentTime * 1000);
  renderOverlay(root, {
    enabled: true,
    html: cue?.html || "",
    fontSize: state.fontSize
  });
  schedule();
}

function schedule() {
  if (raf) return;
  raf = requestAnimationFrame(tick);
}

async function loadState() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const saved = data?.[STORAGE_KEY];
    if (saved && typeof saved === "object") {
      state = {
        enabled: saved.enabled !== false,
        cues: Array.isArray(saved.cues) ? saved.cues : [],
        fileName: String(saved.fileName || ""),
        fontSize: Number(saved.fontSize) || 28
      };
    }
  } catch {
    /* ignore */
  }
  schedule();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;
  const saved = changes[STORAGE_KEY].newValue;
  if (!saved) {
    state = { enabled: true, cues: [], fileName: "", fontSize: 28 };
    const player = getPlayer();
    if (player) removeOverlay(player);
    return;
  }
  state = {
    enabled: saved.enabled !== false,
    cues: Array.isArray(saved.cues) ? saved.cues : [],
    fileName: String(saved.fileName || ""),
    fontSize: Number(saved.fontSize) || 28
  };
  schedule();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "YTCO_PING") {
    sendResponse({
      ok: true,
      cueCount: state.cues.length,
      enabled: state.enabled,
      href: location.href
    });
    return false;
  }
  return false;
});

loadState();
schedule();

// SPA でプレイヤーが差し替わったら付け直す（高頻度すぎないよう間引き）
let moTimer = 0;
const mo = new MutationObserver(() => {
  if (moTimer) return;
  moTimer = setTimeout(() => {
    moTimer = 0;
    schedule();
  }, 500);
});
mo.observe(document.documentElement, { childList: true, subtree: true });
