const TOAST_ID = "yt-furigana-progress";

function ensureToast(title) {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.style.cssText = [
      "position:fixed",
      "left:16px",
      "bottom:16px",
      "z-index:2147483646",
      "min-width:240px",
      "max-width:min(420px, calc(100vw - 32px))",
      "padding:12px 14px",
      "border-radius:10px",
      "background:rgba(15,15,15,0.92)",
      "color:#fff",
      "font:12px/1.45 system-ui, -apple-system, sans-serif",
      "box-shadow:0 8px 24px rgba(0,0,0,0.35)",
      "pointer-events:none"
    ].join(";");

    toast.innerHTML = `
      <div data-title style="font-weight:600;margin-bottom:6px;"></div>
      <div data-msg style="opacity:0.92;margin-bottom:8px;">準備中…</div>
      <div style="height:6px;background:rgba(255,255,255,0.18);border-radius:999px;overflow:hidden;">
        <div data-bar style="height:100%;width:0%;background:#3ea6ff;transition:width 120ms linear;"></div>
      </div>
      <div data-pct style="margin-top:6px;opacity:0.75;font-variant-numeric:tabular-nums;">0%</div>
    `;
    document.documentElement.appendChild(toast);
  }

  const titleEl = toast.querySelector("[data-title]");
  if (titleEl && title) titleEl.textContent = title;
  return toast;
}

export function showProgress(progress, title = "YT Furigana") {
  if (!progress) return;

  const toast = ensureToast(title);
  const msg = toast.querySelector("[data-msg]");
  const bar = toast.querySelector("[data-bar]");
  const pct = toast.querySelector("[data-pct]");

  if (msg) msg.textContent = progress.message || progress.phase;
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, progress.percent || 0))}%`;
  if (pct) {
    pct.textContent =
      progress.phase === "ready"
        ? "完了"
        : progress.phase === "error"
          ? "失敗"
          : `${progress.percent || 0}%`;
  }

  toast.style.display = "block";
  toast.dataset.phase = progress.phase;

  if (progress.phase === "ready") {
    window.setTimeout(() => hideProgress(), 1600);
  }
  if (progress.phase === "error") {
    window.setTimeout(() => hideProgress(), 4000);
  }
}

export function hideProgress() {
  const toast = document.getElementById(TOAST_ID);
  if (toast) toast.remove();
}

/** @deprecated use showProgress */
export function showSudachiProgress(progress) {
  showProgress(progress, "YT Furigana · Sudachi");
}

/** @deprecated use hideProgress */
export function hideSudachiProgress() {
  hideProgress();
}
