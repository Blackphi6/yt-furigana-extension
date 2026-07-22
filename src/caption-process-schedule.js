/**
 * 字幕処理の debounce スケジューラ。
 *
 * Mutation root をそのまま渡すと、debounce 中に後から来た兄弟行
 * （TVer の 2 行目 cue-line など）を取りこぼすため、常に broadRoot を走査する。
 * 後着の変異ではタイマーを伸ばす（trailing debounce）。
 *
 * @param {(root: unknown) => void | Promise<void>} processFn
 * @param {{ delayMs?: number, broadRoot?: unknown, setTimeoutFn?: typeof setTimeout, clearTimeoutFn?: typeof clearTimeout }} [options]
 */
export function createCaptionProcessScheduler(processFn, options = {}) {
  const delayMs = Math.max(0, Number(options.delayMs) || 80);
  const broadRoot = options.broadRoot;
  const setTimeoutFn = options.setTimeoutFn || setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
  let timer = null;

  function scheduleProcess(_root) {
    if (timer != null) {
      clearTimeoutFn(timer);
    }
    timer = setTimeoutFn(() => {
      timer = null;
      void processFn(broadRoot);
    }, delayMs);
  }

  function isPending() {
    return timer != null;
  }

  function cancel() {
    if (timer == null) return;
    clearTimeoutFn(timer);
    timer = null;
  }

  return { scheduleProcess, isPending, cancel };
}

/**
 * キャッシュ即時適用のあと、変換待ち行が残っていれば再スケジュールが必要。
 * @param {{ handled: boolean, pending: boolean }} state
 */
export function shouldScheduleAfterCachePass({ handled, pending }) {
  return Boolean(pending) || !handled;
}
