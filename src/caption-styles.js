const styleSnapshots = new WeakMap();
const styleGuards = new WeakMap();

function parseFontSizePx(value) {
  return Number.parseFloat(value) || 0;
}

function captureNodeStyle(node) {
  const computed = getComputedStyle(node);
  return {
    fontSize: computed.fontSize,
    transform: computed.transform,
    lineHeight: computed.lineHeight
  };
}

function getMaxFontSizeInTree(root) {
  let bestPx = 0;
  let bestValue = null;

  const visit = (node) => {
    if (!(node instanceof HTMLElement)) return;

    const fontSize = getComputedStyle(node).fontSize;
    const px = parseFontSizePx(fontSize);
    if (px > bestPx) {
      bestPx = px;
      bestValue = fontSize;
    }

    for (const child of node.children) {
      visit(child);
    }
  };

  visit(root);
  return bestValue || getComputedStyle(root).fontSize;
}

export function captureCaptionStyles(element) {
  if (styleSnapshots.has(element)) {
    return styleSnapshots.get(element);
  }

  const captionWindow = element.closest(".caption-window");
  const snapshot = {
    segmentInlineStyle: element.getAttribute("style") || "",
    segmentFontSize: getMaxFontSizeInTree(element),
    segment: captureNodeStyle(element),
    window: captionWindow ? captureNodeStyle(captionWindow) : null,
    windowNode: captionWindow
  };

  styleSnapshots.set(element, snapshot);
  return snapshot;
}

function applyStyleRecord(node, record, fontSizeOverride) {
  const fontSize = fontSizeOverride || record.fontSize;
  if (fontSize && parseFontSizePx(fontSize) > 0) {
    node.style.setProperty("font-size", fontSize, "important");
  }
  if (record.transform && record.transform !== "none") {
    node.style.setProperty("transform", record.transform, "important");
  }
  if (record.lineHeight) {
    node.style.setProperty("line-height", record.lineHeight, "important");
  }
}

export function applyCaptionStyles(element) {
  const snapshot = styleSnapshots.get(element);
  if (!snapshot) return;

  if (snapshot.segmentInlineStyle) {
    element.setAttribute("style", snapshot.segmentInlineStyle);
  }

  applyStyleRecord(element, snapshot.segment, snapshot.segmentFontSize);

  if (snapshot.windowNode && snapshot.window) {
    applyStyleRecord(snapshot.windowNode, snapshot.window);
  }

  element.setAttribute("data-yt-furigana-styled", "1");
}

export function startCaptionStyleGuard(element) {
  if (styleGuards.has(element)) return;

  const snapshot = styleSnapshots.get(element);
  if (!snapshot) return;

  const nodes = [element];
  if (snapshot.windowNode) nodes.push(snapshot.windowNode);

  const guard = new MutationObserver(() => {
    if (!element.isConnected) {
      guard.disconnect();
      styleGuards.delete(element);
      return;
    }
    applyCaptionStyles(element);
  });

  nodes.forEach((node) => {
    guard.observe(node, { attributes: true, attributeFilter: ["style", "class"] });
  });

  styleGuards.set(element, guard);
}

export function releaseCaptionStyles(element) {
  const guard = styleGuards.get(element);
  guard?.disconnect();
  styleGuards.delete(element);

  const snapshot = styleSnapshots.get(element);
  styleSnapshots.delete(element);

  element.removeAttribute("data-yt-furigana-styled");

  if (!snapshot) return;

  if (snapshot.segmentInlineStyle) {
    element.setAttribute("style", snapshot.segmentInlineStyle);
  } else {
    element.removeAttribute("style");
  }

  element.style.removeProperty("font-size");
  element.style.removeProperty("transform");
  element.style.removeProperty("line-height");

  if (snapshot.windowNode) {
    snapshot.windowNode.style.removeProperty("font-size");
    snapshot.windowNode.style.removeProperty("transform");
    snapshot.windowNode.style.removeProperty("line-height");
  }
}
