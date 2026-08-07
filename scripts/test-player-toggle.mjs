import {
  classifyControlLabel,
  isEditableTarget,
  shouldHandleFuriganaToggleKey
} from "../src/player-toggle.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(
  shouldHandleFuriganaToggleKey({ key: "C", shiftKey: true, target: null }),
  "Shift+C should toggle"
);

assert(
  shouldHandleFuriganaToggleKey({ code: "KeyC", shiftKey: true, target: { tagName: "BODY" } }),
  "Shift+KeyC via code should toggle"
);

assert(
  !shouldHandleFuriganaToggleKey({ key: "C", shiftKey: false }),
  "C without Shift should not toggle"
);

assert(
  !shouldHandleFuriganaToggleKey({ key: "C", shiftKey: true, ctrlKey: true }),
  "Ctrl+Shift+C should not toggle"
);

assert(
  !shouldHandleFuriganaToggleKey({ key: "X", shiftKey: true }),
  "Shift+X should not toggle"
);

assert(
  !shouldHandleFuriganaToggleKey({
    key: "c",
    shiftKey: true,
    target: { tagName: "INPUT" }
  }),
  "Shift+C in input should be ignored"
);

assert(
  !shouldHandleFuriganaToggleKey({
    key: "C",
    shiftKey: true,
    target: { tagName: "TEXTAREA" }
  }),
  "Shift+C in textarea should be ignored"
);

assert(
  !shouldHandleFuriganaToggleKey({
    key: "C",
    shiftKey: true,
    target: { tagName: "DIV", isContentEditable: true }
  }),
  "Shift+C in contenteditable should be ignored"
);

assert(
  shouldHandleFuriganaToggleKey({
    key: "C",
    shiftKey: true,
    target: { tagName: "INPUT", disabled: true }
  }),
  "disabled input should not block shortcut"
);

assert(isEditableTarget({ tagName: "INPUT" }), "input is editable");
assert(!isEditableTarget({ tagName: "BUTTON" }), "button is not editable");
assert(
  isEditableTarget({
    tagName: "SPAN",
    closest: (sel) => (sel.includes("input") ? { tagName: "INPUT" } : null)
  }),
  "nested under input via closest"
);

assert(classifyControlLabel({ textContent: "cc" }) === "cc", "cc label");
assert(classifyControlLabel({ textContent: "画質" }) === "quality", "quality label");
assert(classifyControlLabel({ textContent: "x1.0" }) === "speed", "speed label");
assert(
  classifyControlLabel({ className: "vjs-fullscreen-control" }) === "fullscreen",
  "fullscreen class"
);
assert(classifyControlLabel({ textContent: "再生" }) === "other", "other label");

console.log("test-player-toggle: ok");
