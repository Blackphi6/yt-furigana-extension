import { buildRuby, isNumberReadingTipSurface } from "./furigana.js";
import { collectReadingCandidates } from "./reading-candidates.js";
import {
  saveUserReadingChoice,
  loadUserReadingStore,
  buildLearningCues
} from "./user-reading-dict.js";
import {
  MANUAL_PHRASE_READINGS,
  CONTEXT_READING_RULES,
  rebuildManualPhraseIndex
} from "./reading-context.js";
import { normalizeReading, normalizeUserReading, isValidUserReading } from "./reading-normalize.js";
import {
  LEARNING_INBOX_KEY,
  LEARNING_INBOX_LIMIT,
  appendLearningEvent
} from "./reading-learning.js";
import { fitRubyReadings } from "./ruby-layout.js";

const POPUP_ID = "yt-furigana-reading-picker";

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function closeReadingPicker() {
  document.getElementById(POPUP_ID)?.remove();
}

function isKanaOnlyReading(value) {
  return isValidUserReading(value);
}

/**
 * @param {HTMLElement} wordEl
 * @param {{ contextText?: string }} [options]
 */
export async function openReadingPicker(wordEl, options = {}) {
  closeReadingPicker();

  const surface = wordEl.getAttribute("data-surface") || "";
  const currentReading = wordEl.getAttribute("data-reading") || "";
  if (!surface) return;

  const contextText =
    options.contextText ||
    wordEl.closest("[data-yt-furigana-original]")?.getAttribute("data-yt-furigana-original") ||
    wordEl.closest(
      ".ytp-caption-segment, .caption-visual-line, .segment-text, .vjs-text-track-cue-line"
    )?.textContent ||
    "";

  // 表示単位（結合後の data-surface）だけで候補を出す。
  // 「何」クリックで「なぜか」が出るような表層の勝手な拡張はしない。
  const userStore = await loadUserReadingStore();
  const candidates = collectReadingCandidates(
    surface,
    currentReading,
    contextText,
    userStore
  );

  const customLabel = currentReading
    ? "候補にない読み"
    : "読みを入力（未登録）";
  const customHint = currentReading
    ? "例: とわ / ウィークエンド。ひらがな・カタカナ可。"
    : "ひらがなまたはカタカナで入力（例: おんりー / オンリー）。";

  const popup = document.createElement("div");
  popup.id = POPUP_ID;
  popup.className = "yt-furigana-picker";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", `${surface}の読みを選ぶ`);
  popup.innerHTML = `
    <div class="yt-furigana-picker__head">${escapeAttr(surface)}</div>
    <ul class="yt-furigana-picker__list" role="listbox">
      ${candidates
        .map(
          (c, index) => `
        <li>
          <button type="button" class="yt-furigana-picker__item${
            c.reading === normalizeUserReading(currentReading) ||
            normalizeReading(c.reading) === normalizeReading(currentReading)
              ? " is-current"
              : ""
          }" data-reading="${escapeAttr(c.reading)}" data-index="${index}" role="option">
            <span class="yt-furigana-picker__reading">${escapeAttr(c.reading)}</span>
            <span class="yt-furigana-picker__label">${escapeAttr(c.label)}</span>
          </button>
        </li>`
        )
        .join("")}
    </ul>
    <form class="yt-furigana-picker__custom" autocomplete="off">
      <label class="yt-furigana-picker__custom-label" for="${POPUP_ID}-input">${customLabel}</label>
      <div class="yt-furigana-picker__custom-row">
        <input
          id="${POPUP_ID}-input"
          class="yt-furigana-picker__input"
          type="text"
          inputmode="kana"
          placeholder="ひらがな・カタカナ"
          value=""
          maxlength="40"
        />
        <button type="submit" class="yt-furigana-picker__submit">保存</button>
      </div>
      <p class="yt-furigana-picker__hint">${customHint}</p>
    </form>
  `;

  document.documentElement.append(popup);

  const rect = wordEl.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - popupRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popupRect.width - 8));
  let top = rect.top - popupRect.height - 8;
  if (top < 8) top = rect.bottom + 8;
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  const input = popup.querySelector(".yt-furigana-picker__input");
  const form = popup.querySelector(".yt-furigana-picker__custom");

  popup.addEventListener("click", async (event) => {
    const button = event.target.closest(".yt-furigana-picker__item");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();

    const reading = button.getAttribute("data-reading") || "";
    await applyReadingChoice(wordEl, surface, reading, contextText);
    closeReadingPicker();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const raw = input?.value?.trim() || "";
    if (!isKanaOnlyReading(raw)) {
      if (input) {
        input.setCustomValidity("ひらがなまたはカタカナ（ー・可）で入力してください");
        input.reportValidity();
      }
      return;
    }
    if (input) input.setCustomValidity("");
    await applyReadingChoice(
      wordEl,
      surface,
      normalizeUserReading(raw),
      contextText
    );
    closeReadingPicker();
  });

  // クリックが外側扱いにならないよう入力欄の伝播を止める
  input?.addEventListener("click", (event) => event.stopPropagation());
  input?.addEventListener("keydown", (event) => event.stopPropagation());
  input?.focus();
}

async function applyReadingChoice(wordEl, surface, reading, contextText) {
  // ユーザー入力はカタカナ保持済みの想定。既存候補はひらがなのまま可。
  const normalized = /[\u30a1-\u30f6]/.test(reading)
    ? normalizeUserReading(reading)
    : normalizeReading(reading) || normalizeUserReading(reading);
  wordEl.setAttribute("data-surface", surface);
  wordEl.setAttribute("data-reading", normalized);
  wordEl.classList.remove("yt-furigana-word--unset");
  const preserveKatakana = /[\u30a1-\u30f6]/.test(normalized);
  wordEl.innerHTML = buildRuby(surface, normalized, { preserveKatakana });

  // 数字系はルビではなくツールチップ
  if (isNumberReadingTipSurface(surface) && normalized) {
    wordEl.classList.add("yt-furigana-word--tip");
    wordEl.setAttribute("data-tip", normalized);
    wordEl.title = normalized;
  } else {
    wordEl.classList.remove("yt-furigana-word--tip");
    wordEl.removeAttribute("data-tip");
    wordEl.title = "クリックで読み候補";
  }
  requestAnimationFrame(() => fitRubyReadings(wordEl));

  const cues = buildLearningCues(surface, contextText);
  if (cues.length > 0) {
    // 文脈付き: グローバル上書きにしない（別文の「えいえん」を守る）
    MANUAL_PHRASE_READINGS.delete(surface);
    CONTEXT_READING_RULES.push({
      surface,
      reading: normalized,
      weight: 5,
      cues
    });
    rebuildManualPhraseIndex();
  } else {
    MANUAL_PHRASE_READINGS.set(surface, normalized);
    rebuildManualPhraseIndex();
  }

  await saveUserReadingChoice({
    surface,
    reading: normalized,
    contextText
  });

  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    const stored = await chrome.storage.local.get({ [LEARNING_INBOX_KEY]: [] });
    let inbox = Array.isArray(stored[LEARNING_INBOX_KEY])
      ? stored[LEARNING_INBOX_KEY]
      : [];
    inbox = appendLearningEvent(
      inbox,
      {
        ts: new Date().toISOString(),
        kind: "user",
        text: contextText.slice(0, 80),
        surface,
        want: normalized,
        reading: normalized,
        cues,
        source: "user",
        videoUrl: typeof location !== "undefined" ? location.href : ""
      },
      LEARNING_INBOX_LIMIT
    );
    await chrome.storage.local.set({ [LEARNING_INBOX_KEY]: inbox });
  }
}

/**
 * TVer など、字幕の上に操作レイヤーが被るプレイヤー向け。
 * DOM の event.target が語にならない場合でも、座標で語を探す。
 * @param {number} clientX
 * @param {number} clientY
 * @param {ParentNode} [root]
 * @returns {HTMLElement | null}
 */
export function findFuriganaWordAtPoint(clientX, clientY, root = document) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

  const scope =
    root && typeof root.querySelectorAll === "function" ? root : document;
  const words = scope.querySelectorAll(".yt-furigana-word");
  let best = null;
  let bestArea = Infinity;
  const NodeCtor = typeof Node !== "undefined" ? Node : null;
  const HTMLElementCtor = typeof HTMLElement !== "undefined" ? HTMLElement : null;

  for (const word of words) {
    if (HTMLElementCtor && !(word instanceof HTMLElementCtor)) continue;
    if (word.isConnected === false) continue;
    if (
      NodeCtor &&
      root instanceof NodeCtor &&
      root !== document &&
      typeof root.contains === "function" &&
      !root.contains(word)
    ) {
      continue;
    }

    const rect = word.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      continue;
    }

    const area = rect.width * rect.height;
    if (area < bestArea) {
      best = word;
      bestArea = area;
    }
  }

  return best;
}

function resolveActivatedWord(event, root) {
  const direct = event.target?.closest?.(".yt-furigana-word");
  if (direct instanceof HTMLElement && root.contains(direct)) return direct;
  return findFuriganaWordAtPoint(event.clientX, event.clientY, root);
}

/**
 * 字幕上のクリック／キーボードで候補を開く。
 * TVer は操作レイヤーが字幕の上に乗るため、座標ヒットも併用する。
 */
export function installReadingPicker(root = document) {
  let openedAt = 0;

  const onActivate = (event) => {
    if (event.target.closest?.(`#${POPUP_ID}`)) return;
    if (
      event.type === "pointerdown" &&
      typeof event.button === "number" &&
      event.button !== 0
    ) {
      return;
    }

    const wordEl = resolveActivatedWord(event, root);
    if (!wordEl) {
      // 同じ操作の pointerdown→click で直後に閉じない
      if (Date.now() - openedAt > 400) {
        closeReadingPicker();
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const now = Date.now();
    if (now - openedAt < 400) return;
    openedAt = now;
    void openReadingPicker(wordEl);
  };

  root.addEventListener("pointerdown", onActivate, true);
  root.addEventListener("click", onActivate, true);
  root.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closeReadingPicker();
        return;
      }
      if (event.target.closest?.(`#${POPUP_ID}`)) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      const wordEl = event.target.closest?.(".yt-furigana-word");
      if (!wordEl) return;
      event.preventDefault();
      void openReadingPicker(wordEl);
    },
    true
  );
}

const HOVER_CLASS = "yt-furigana-word--hover";
const FLOATING_TIP_ID = "yt-furigana-floating-tip";

function removeFloatingTip() {
  document.getElementById(FLOATING_TIP_ID)?.remove();
}

/**
 * 数字チップなど、親の overflow で ::after が切れうる環境向けに fixed で出す。
 * @param {HTMLElement} wordEl
 */
function showFloatingTip(wordEl) {
  const tip = wordEl.getAttribute("data-tip")?.trim();
  if (!tip || !wordEl.classList.contains("yt-furigana-word--tip")) {
    removeFloatingTip();
    return;
  }

  let el = document.getElementById(FLOATING_TIP_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = FLOATING_TIP_ID;
    el.className = "yt-furigana-floating-tip";
    document.documentElement.appendChild(el);
  }
  el.textContent = tip;

  // ふりがな (rt) と同じ: 本文フォントの 0.55em
  const basePx = Number.parseFloat(getComputedStyle(wordEl).fontSize) || 16;
  const tipPx = Math.max(11, Math.round(basePx * 0.55 * 10) / 10);
  el.style.fontSize = `${tipPx}px`;

  const rect = wordEl.getBoundingClientRect();
  // いったん反映して実寸を測る
  el.style.left = "0px";
  el.style.top = "0px";
  const tipRect = el.getBoundingClientRect();
  const width = tipRect.width || el.offsetWidth || 40;
  const height = tipRect.height || 24;
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - width / 2),
    window.innerWidth - width - 8
  );
  const top = Math.max(8, rect.top - height - 8);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

/**
 * TVer のように操作レイヤーが字幕の上に乗るサイトでも、
 * 座標ヒットで薄白ホバー／数字ツールチップを出せるようにする。
 * @param {ParentNode} [root]
 */
export function installFuriganaHoverHighlight(root = document) {
  /** @type {HTMLElement | null} */
  let hovered = null;

  const clear = () => {
    if (hovered) {
      hovered.classList.remove(HOVER_CLASS);
      hovered = null;
    }
    removeFloatingTip();
  };

  const onMove = (event) => {
    if (event.target?.closest?.(`#${POPUP_ID}`)) return;
    const word = findFuriganaWordAtPoint(event.clientX, event.clientY, root);
    if (word === hovered) {
      if (word) showFloatingTip(word);
      return;
    }
    clear();
    if (!word) return;
    word.classList.add(HOVER_CLASS);
    hovered = word;
    showFloatingTip(word);
  };

  root.addEventListener("pointermove", onMove, true);
  root.addEventListener(
    "pointerleave",
    (event) => {
      if (event.target === root || event.target === document.documentElement) {
        clear();
      }
    },
    true
  );
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") clear();
  });
}
