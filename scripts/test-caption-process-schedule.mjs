import assert from "node:assert/strict";
import {
  createCaptionProcessScheduler,
  shouldScheduleAfterCachePass
} from "../src/caption-process-schedule.js";

assert.equal(shouldScheduleAfterCachePass({ handled: true, pending: false }), false);
assert.equal(shouldScheduleAfterCachePass({ handled: true, pending: true }), true);
assert.equal(shouldScheduleAfterCachePass({ handled: false, pending: true }), true);
assert.equal(shouldScheduleAfterCachePass({ handled: false, pending: false }), true);

{
  const calls = [];
  const timers = new Map();
  let nextId = 1;
  let now = 0;

  const setTimeoutFn = (fn, ms) => {
    const id = nextId++;
    timers.set(id, { fn, fireAt: now + ms });
    return id;
  };
  const clearTimeoutFn = (id) => {
    timers.delete(id);
  };
  const flush = (ms) => {
    now += ms;
    for (const [id, timer] of [...timers.entries()]) {
      if (timer.fireAt <= now) {
        timers.delete(id);
        timer.fn();
      }
    }
  };

  const broadRoot = { id: "document" };
  const scheduler = createCaptionProcessScheduler(
    (root) => {
      calls.push(root);
    },
    { delayMs: 80, broadRoot, setTimeoutFn, clearTimeoutFn }
  );

  // 1行目 → すぐ後に 2行目。旧実装は狭い root のまま 2行目を捨てていた。
  scheduler.scheduleProcess({ id: "line1" });
  assert.equal(scheduler.isPending(), true);
  flush(40);
  scheduler.scheduleProcess({ id: "line2" }); // trailing: タイマー延長
  flush(40);
  assert.deepEqual(calls, []); // まだ発火しない
  flush(40);
  assert.deepEqual(calls, [broadRoot]); // 常に broadRoot（document）
  assert.equal(scheduler.isPending(), false);
}

console.log("caption-process-schedule tests passed.");
