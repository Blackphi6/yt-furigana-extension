/**
 * MutationObserver 再入防止（ON→OFF→ON フリーズ回帰）。
 */
import assert from "node:assert/strict";

/**
 * content.js と同じネスト可能な pause カウンタ。
 * @param {{ disconnect: () => void, observe: () => void }} obs
 */
function createPause(obs) {
  let depth = 0;
  return function withPaused(fn) {
    if (depth === 0) obs.disconnect();
    depth += 1;
    try {
      return fn();
    } finally {
      depth = Math.max(0, depth - 1);
      if (depth === 0) obs.observe();
    }
  };
}

{
  let connected = true;
  let disconnectCount = 0;
  let observeCount = 0;
  const obs = {
    disconnect() {
      connected = false;
      disconnectCount += 1;
    },
    observe() {
      connected = true;
      observeCount += 1;
    }
  };
  const withPaused = createPause(obs);

  withPaused(() => {
    assert.equal(connected, false);
    withPaused(() => {
      assert.equal(connected, false);
      assert.equal(disconnectCount, 1);
    });
    assert.equal(connected, false);
  });
  assert.equal(connected, true);
  assert.equal(observeCount, 1);
}

{
  // 適用中に「wipe → 再適用」相当が来ても observe はネスト解除後に一度だけ
  let events = [];
  const obs = {
    disconnect() {
      events.push("disconnect");
    },
    observe() {
      events.push("observe");
    }
  };
  const withPaused = createPause(obs);
  withPaused(() => {
    events.push("apply");
    withPaused(() => {
      events.push("reapply");
    });
  });
  assert.deepEqual(events, ["disconnect", "apply", "reapply", "observe"]);
}

console.log("test-observer-pause: ok");
