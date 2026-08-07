import { buildRuby, isNumberReadingTipSurface, isRegisterableSurface, wrapFuriganaWord } from "./furigana.js";
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
import { splitContributionContext } from "./contributions.js";
import {
  saveOccurrenceOverrideForText,
  shouldPinGlobally,
  spanFromTokenRange,
} from "./occurrence-overrides.js";

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

/**
 * 全画面中は fullscreenElement 配下にしか見えない。
 * 候補ポップアップ／チップのマウント先を返す。
 * @param {Element | null | undefined} anchor
 * @returns {Element}
 */
export function resolveOverlayMountRoot(anchor) {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc?.documentElement) {
    return anchor || null;
  }

  const ElementCtor = typeof Element !== "undefined" ? Element : null;
  const fs =
    doc.fullscreenElement ||
    /** @type {Document & { webkitFullscreenElement?: Element | null }} */ (doc)
      .webkitFullscreenElement ||
    null;

  if (fs && (!ElementCtor || fs instanceof ElementCtor)) {
    if (
      !anchor ||
      fs === anchor ||
      (typeof fs.contains === "function" && fs.contains(anchor))
    ) {
      return /** @type {Element} */ (fs);
    }
  }

  // Video.js / YouTube: Fullscreen API なしでもクラスだけ付く場合
  if (anchor && typeof anchor.closest === "function") {
    const player = anchor.closest(
      ".video-js.vjs-fullscreen, .html5-video-player.ytp-fullscreen, .vjs-fullscreen, .ytp-fullscreen"
    );
    if (player && (!ElementCtor || player instanceof ElementCtor)) {
      return /** @type {Element} */ (player);
    }
  }

  return doc.documentElement;
}

function isKanaOnlyReading(value) {
  return isValidUserReading(value);
}

/**
 * @param {HTMLElement} wordEl
 * @param {{ contextText?: string, surface?: string, currentReading?: string, span?: [number, number], merged?: boolean, selectedEls?: HTMLElement[] }} [options]
 */
export async function openReadingPicker(wordEl, options = {}) {
  closeReadingPicker();

  const surface =
    options.surface != null
      ? String(options.surface)
      : wordEl.getAttribute("data-surface") || "";
  const currentReading =
    options.currentReading != null
      ? String(options.currentReading)
      : wordEl.getAttribute("data-reading") || "";
  if (!surface) return;
  const isMerge = Boolean(options.merged);
  const spanOverride = Array.isArray(options.span) ? options.span : null;

  const contextText =
    options.contextText ||
    wordEl.closest("[data-yt-furigana-original]")?.getAttribute("data-yt-furigana-original") ||
    // Super Chat 拡張は data-ytscf-original に原文を残す
    wordEl.closest("[data-ytscf-original]")?.getAttribute("data-ytscf-original") ||
    wordEl.closest(
      ".ytp-caption-segment, .caption-visual-line, .segment-text, .vjs-text-track-cue-line, yt-live-chat-paid-message-renderer #message, yt-live-chat-ticker-paid-message-item-renderer #message"
    )?.textContent ||
    "";

  // 表示単位（結合後の data-surface）だけで候補を出す。
  // 「何」クリックで「なぜか」が出るような表層の勝手な拡張はしない。
  const userStore = await loadUserReadingStore();
  const candidates = isMerge
    ? []
    : collectReadingCandidates(
        surface,
        currentReading,
        contextText,
        userStore
      );

  const headLabel = isMerge
    ? `${surface}（まとめて指定）`
    : surface;
  const customLabel = isMerge
    ? "まとめた読みを入力"
    : currentReading
      ? "候補にない読み"
      : "読みを入力（未登録）";
  const customHint = isMerge
    ? "例: おとなげ。ひらがな・カタカナ可。"
    : currentReading
      ? "例: とわ / ウィークエンド。ひらがな・カタカナ可。"
      : "ひらがなまたはカタカナで入力（例: おんりー / オンリー）。";

  const popup = document.createElement("div");
  popup.id = POPUP_ID;
  popup.className = "yt-furigana-picker";
  popup.setAttribute("role", "dialog");
  popup.setAttribute(
    "aria-label",
    isMerge ? `${surface}をまとめて読み登録` : `${surface}の読みを選ぶ`
  );
  popup.innerHTML = `
    <div class="yt-furigana-picker__head">${escapeAttr(headLabel)}</div>
    <ul class="yt-furigana-picker__list" role="listbox">
      ${
        candidates.length
          ? candidates
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
              .join("")
          : `<li class="yt-furigana-picker__empty">${
              isMerge ? "下に読みを入力（例: おとなげ）" : "候補なし — 下に入力"
            }</li>`
      }
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

  const mountRoot = resolveOverlayMountRoot(wordEl);
  mountRoot.append(popup);

  const rect = wordEl.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const viewportW =
    mountRoot === document.documentElement
      ? window.innerWidth
      : mountRoot.getBoundingClientRect().width || window.innerWidth;
  const viewportH =
    mountRoot === document.documentElement
      ? window.innerHeight
      : mountRoot.getBoundingClientRect().height || window.innerHeight;
  const origin =
    mountRoot === document.documentElement
      ? { left: 0, top: 0 }
      : mountRoot.getBoundingClientRect();

  let left = rect.left + rect.width / 2 - popupRect.width / 2;
  left = Math.max(
    origin.left + 8,
    Math.min(left, origin.left + viewportW - popupRect.width - 8)
  );
  let top = rect.top - popupRect.height - 8;
  if (top < origin.top + 8) top = rect.bottom + 8;
  if (top + popupRect.height > origin.top + viewportH - 8) {
    top = Math.max(origin.top + 8, rect.top - popupRect.height - 8);
  }

  // fixed は通常ビューポート基準。fullscreen 要素が transform を持つ場合は
  // マウント先基準の absolute に切り替える。
  const mountStyle =
    typeof getComputedStyle === "function" ? getComputedStyle(mountRoot) : null;
  const mountTransformed =
    mountRoot !== document.documentElement &&
    mountStyle &&
    mountStyle.transform &&
    mountStyle.transform !== "none";

  if (mountTransformed) {
    popup.style.position = "absolute";
    popup.style.left = `${left - origin.left + (mountRoot.scrollLeft || 0)}px`;
    popup.style.top = `${top - origin.top + (mountRoot.scrollTop || 0)}px`;
  } else {
    popup.style.position = "fixed";
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }
  const input = popup.querySelector(".yt-furigana-picker__input");
  const form = popup.querySelector(".yt-furigana-picker__custom");

  const runApply = async (reading) => {
    await applyReadingChoice(wordEl, surface, reading, contextText, {
      span: spanOverride,
      merged: isMerge,
      selectedEls: options.selectedEls,
    });
    closeReadingPicker();
  };

  popup.addEventListener("click", async (event) => {
    const button = event.target.closest(".yt-furigana-picker__item");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();

    const reading = button.getAttribute("data-reading") || "";
    await runApply(reading);
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
    await runApply(normalizeUserReading(raw));
  });

  // クリックが外側扱いにならないよう入力欄の伝播を止める
  input?.addEventListener("click", (event) => event.stopPropagation());
  input?.addEventListener("keydown", (event) => event.stopPropagation());
  input?.focus();
}

/**
 * @param {HTMLElement} wordEl
 * @param {string} surface
 * @param {string} reading
 * @param {string} contextText
 * @param {{ span?: [number, number] | null, merged?: boolean, selectedEls?: HTMLElement[] }} [extra]
 */
async function applyReadingChoice(wordEl, surface, reading, contextText, extra = {}) {
  // ユーザー入力はカタカナ保持済みの想定。既存候補はひらがなのまま可。
  const normalized = /[\u30a1-\u30f6]/.test(reading)
    ? normalizeUserReading(reading)
    : normalizeReading(reading) || normalizeUserReading(reading);

  let span = Array.isArray(extra.span) ? extra.span : null;
  if (!span) {
    const a = Number.parseInt(wordEl.getAttribute("data-span-start") || "", 10);
    const b = Number.parseInt(wordEl.getAttribute("data-span-end") || "", 10);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) span = [a, b];
  }

  const displayText = String(contextText || "");
  if (span && displayText) {
    await saveOccurrenceOverrideForText(displayText, {
      start: span[0],
      end: span[1],
      surface,
      reading: normalized,
    });
  }

  if (extra.merged && Array.isArray(extra.selectedEls) && extra.selectedEls.length > 1) {
    const preserveKatakana = /[\u30a1-\u30f6]/.test(normalized);
    const ruby = buildRuby(surface, normalized, { preserveKatakana });
    const html = wrapFuriganaWord(surface, normalized, ruby, {
      preserveKatakana,
      spanStart: span?.[0],
      spanEnd: span?.[1],
      tokenIndex: 0,
    });
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const newEl = tmp.firstElementChild;
    if (newEl && extra.selectedEls[0]?.parentNode) {
      extra.selectedEls[0].replaceWith(newEl);
      for (let i = 1; i < extra.selectedEls.length; i += 1) {
        extra.selectedEls[i]?.remove();
      }
      requestAnimationFrame(() => fitRubyReadings(newEl));
    }
  } else {
    wordEl.setAttribute("data-surface", surface);
    wordEl.setAttribute("data-reading", normalized);
    if (span) {
      wordEl.setAttribute("data-span-start", String(span[0]));
      wordEl.setAttribute("data-span-end", String(span[1]));
    }
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
      wordEl.title = "クリックで読み候補。ドラッグで複数語をまとめて指定";
    }
    requestAnimationFrame(() => fitRubyReadings(wordEl));
  }

  // 出現が1つだけなら従来どおりグローバル／文脈学習。複数なら出現上書きのみ。
  const pinGlobally = !displayText || shouldPinGlobally(displayText, surface);
  if (pinGlobally && !extra.merged) {
    const cues = buildLearningCues(surface, contextText);
    if (cues.length > 0) {
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
  } else if (extra.merged && pinGlobally) {
    // 結合語が文中1回だけ → フレーズとしても覚える（他の文でも効く）
    MANUAL_PHRASE_READINGS.set(surface, normalized);
    rebuildManualPhraseIndex();
    await saveUserReadingChoice({
      surface,
      reading: normalized,
      contextText
    });
  }

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
        cues: extra.merged ? [] : buildLearningCues(surface, contextText),
        source: extra.merged ? "user-span" : "user",
        videoUrl: typeof location !== "undefined" ? location.href : ""
      },
      LEARNING_INBOX_LIMIT
    );
    await chrome.storage.local.set({ [LEARNING_INBOX_KEY]: inbox });
  }

  // 匿名貢献（オプトイン）。失敗しても UI は止めない。
  try {
    if (typeof chrome === "undefined" || !chrome?.storage?.sync) return;
    const flags = await chrome.storage.sync.get({
      contributionEnabled: false,
      contributionPromptSeen: false
    });
    if (flags.contributionEnabled) {
      await submitContributionVote(surface, normalized, contextText);
      return;
    }
    // 初回だけ「みんなに送る？」を聞く（既定オフのまま送らない）
    if (!flags.contributionPromptSeen) {
      askContributionConsent(surface, normalized, contextText);
    }
  } catch {
    /* ignore */
  }
}

/**
 * 票を送って短いトーストを出す。
 * @param {string} surface
 * @param {string} reading
 * @param {string} contextText
 */
async function submitContributionVote(surface, reading, contextText) {
  if (typeof chrome === "undefined" || !chrome?.runtime?.sendMessage) return;
  const { contextLeft, contextRight } = splitContributionContext(
    contextText,
    surface
  );
  const response = await new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: "SUBMIT_CONTRIBUTION",
          surface,
          reading,
          contextLeft,
          contextRight
        },
        (res) => resolve(res || { ok: false })
      );
    } catch {
      resolve({ ok: false });
    }
  });
  if (!response?.ok || response.skipped) return;
  const votes = Number(response.votes) || 0;
  const needed = Number(response.votesNeeded);
  const minVotes = Number(response.minVotes) || 0;
  let msg = "みんなの辞書づくりに送りました";
  if (response.inPack) {
    msg = `共有パックに入りました（${votes}票）`;
  } else if (Number.isFinite(needed) && needed > 0 && minVotes > 0) {
    msg = `送信済み（${votes}/${minVotes}票・あと${needed}）`;
  } else if (votes > 0) {
    msg = `送信済み（現在 ${votes}票）`;
  }
  showContributionToast(msg);
}

/**
 * 初回訂正時の同意ダイアログ（オプトイン維持）。
 * @param {string} surface
 * @param {string} reading
 * @param {string} contextText
 */
function askContributionConsent(surface, reading, contextText) {
  const existing = document.getElementById("yt-furigana-contrib-consent");
  if (existing) existing.remove();

  const dialog = document.createElement("div");
  dialog.id = "yt-furigana-contrib-consent";
  dialog.className = "yt-furigana-contrib-consent";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "yt-furigana-contrib-consent-title");
  dialog.innerHTML = `
    <div class="yt-furigana-contrib-consent__card">
      <h2 id="yt-furigana-contrib-consent-title">みんなの辞書づくりに送りますか？</h2>
      <p>
        「${escapeAttr(surface)}」→「${escapeAttr(reading)}」を匿名で送れます。
        送るのは表層・読み・短い前後だけです（動画の住所は送りません）。
        いつでもポップアップでオフにできます。
      </p>
      <div class="yt-furigana-contrib-consent__actions">
        <button type="button" class="yt-furigana-contrib-consent__yes" data-action="yes">
          送る（オンにする）
        </button>
        <button type="button" class="yt-furigana-contrib-consent__no" data-action="no">
          この端末だけ
        </button>
      </div>
    </div>
  `;

  const mountRoot = resolveOverlayMountRoot(null);
  mountRoot.append(dialog);

  const finish = async (enable) => {
    dialog.remove();
    try {
      if (chrome?.storage?.sync) {
        await chrome.storage.sync.set({
          contributionPromptSeen: true,
          ...(enable ? { contributionEnabled: true } : {})
        });
      }
    } catch {
      /* ignore */
    }
    if (enable) {
      try {
        await submitContributionVote(surface, reading, contextText);
      } catch {
        /* ignore */
      }
    }
  };

  dialog.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const action = target.closest("[data-action]")?.getAttribute("data-action");
    if (action === "yes") finish(true);
    if (action === "no") finish(false);
  });
}

/**
 * @param {string} message
 */
function showContributionToast(message) {
  const id = "yt-furigana-contrib-toast";
  document.getElementById(id)?.remove();
  const toast = document.createElement("div");
  toast.id = id;
  toast.className = "yt-furigana-contrib-toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  resolveOverlayMountRoot(null).append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

const FLOAT_RT_CLASS = "yt-furigana-float-rt";

function isReadingFloatWord(word) {
  if (!word) return false;
  if (typeof word.classList?.contains === "function") {
    return word.classList.contains(FLOAT_RT_CLASS);
  }
  return /\byt-furigana-float-rt\b/.test(String(word.className || ""));
}

/**
 * 語＋読み (rt) を含むヒット矩形。rt を上に絶対配置してもクリックできるようにする。
 * float 経路では読みだけの要素なので、漢字（data-base-*）領域まで下に広げる。
 * @param {Element} word
 * @returns {{ left: number, top: number, right: number, bottom: number, width: number, height: number } | null}
 */
export function getFuriganaWordHitRect(word) {
  if (!word || typeof word.getBoundingClientRect !== "function") return null;

  const pad = 3;

  // 縁取り字幕用 float: 見た目は読みのみ、クリック対象は下の漢字も含む
  if (isReadingFloatWord(word)) {
    const fr = word.getBoundingClientRect();
    if (!(fr.width > 0 || fr.height > 0)) return null;
    const bw =
      Number.parseFloat(
        typeof word.getAttribute === "function"
          ? word.getAttribute("data-base-width") || ""
          : ""
      ) || fr.width;
    const bh =
      Number.parseFloat(
        typeof word.getAttribute === "function"
          ? word.getAttribute("data-base-height") || ""
          : ""
      ) || Math.max(fr.height * 1.8, 20);
    const cx = (fr.left + fr.right) / 2;
    const left = cx - bw / 2 - pad;
    const right = cx + bw / 2 + pad;
    const top = fr.top - pad;
    // 読みは transform で漢字直上。下端から漢字高さ分をヒットに含める
    const bottom = fr.bottom + bh + pad;
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  /** @type {DOMRect[]} */
  const rects = [word.getBoundingClientRect()];
  if (typeof word.querySelectorAll === "function") {
    for (const rt of word.querySelectorAll("rt")) {
      if (typeof rt.getBoundingClientRect === "function") {
        rects.push(rt.getBoundingClientRect());
      }
    }
  }

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    if (!(rect.width > 0 || rect.height > 0)) continue;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  if (!Number.isFinite(left)) return null;

  return {
    left: left - pad,
    top: top - pad,
    right: right + pad,
    bottom: bottom + pad,
    width: right - left + pad * 2,
    height: bottom - top + pad * 2
  };
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

    const rect = getFuriganaWordHitRect(word);
    if (!rect || !(rect.width > 0 || rect.height > 0)) continue;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      continue;
    }

    const area = Math.max(1, rect.width * rect.height);
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

  const fromRt = event.target?.closest?.("rt")?.closest?.(".yt-furigana-word");
  if (fromRt instanceof HTMLElement && root.contains(fromRt)) return fromRt;

  const atPoint = findFuriganaWordAtPoint(event.clientX, event.clientY, root);
  if (atPoint) return atPoint;

  // 操作レイヤーが最前面でも、下の字幕語を掘り出す
  if (typeof document !== "undefined" && typeof document.elementsFromPoint === "function") {
    try {
      for (const el of document.elementsFromPoint(event.clientX, event.clientY)) {
        const word = el?.closest?.(".yt-furigana-word");
        if (word instanceof HTMLElement && root.contains(word)) return word;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

const SPAN_DRAG_THRESHOLD_PX = 6;

function clearSpanSelecting(root) {
  root
    ?.querySelectorAll?.(".yt-furigana-word.is-span-selecting")
    ?.forEach((el) => el.classList.remove("is-span-selecting"));
  root
    ?.querySelectorAll?.(".yt-furigana-word")
    ?.forEach((el) => {
      const host = el.closest?.(
        ".ytp-caption-segment, .caption-visual-line, .segment-text, .vjs-text-track-cue-line, yt-live-chat-paid-message-renderer #message, yt-live-chat-ticker-paid-message-item-renderer #message, [data-yt-furigana-original], [data-ytscf-original]"
      );
      host?.classList.remove("yt-furigana-span-dragging");
    });
}

/**
 * @param {ParentNode} root
 * @param {number} i0
 * @param {number} i1
 * @param {Element} host
 */
function highlightSpanRange(root, i0, i1, host) {
  clearSpanSelecting(root);
  host?.classList.add("yt-furigana-span-dragging");
  const lo = Math.min(i0, i1);
  const hi = Math.max(i0, i1);
  const scope = host || root;
  scope.querySelectorAll?.(".yt-furigana-word")?.forEach((el) => {
    const idx = Number.parseInt(el.getAttribute("data-token-index") || "", 10);
    if (idx >= lo && idx <= hi) el.classList.add("is-span-selecting");
  });
}

function resolveContextTextFromWord(wordEl) {
  return (
    wordEl.closest("[data-yt-furigana-original]")?.getAttribute("data-yt-furigana-original") ||
    wordEl.closest("[data-ytscf-original]")?.getAttribute("data-ytscf-original") ||
    wordEl.closest(
      ".ytp-caption-segment, .caption-visual-line, .segment-text, .vjs-text-track-cue-line, yt-live-chat-paid-message-renderer #message, yt-live-chat-ticker-paid-message-item-renderer #message"
    )?.textContent ||
    ""
  );
}

/**
 * 字幕上のクリック／ドラッグ／キーボードで候補を開く。
 * TVer は操作レイヤーが字幕の上に乗るため、座標ヒットも併用する。
 */
export function installReadingPicker(root = document) {
  let openedAt = 0;
  /** @type {{ pointerId: number, startX: number, startY: number, startIndex: number, endIndex: number, moved: boolean, startEl: HTMLElement, host: Element | null } | null} */
  let dragState = null;

  const onPointerDown = (event) => {
    if (event.target.closest?.(`#${POPUP_ID}`)) return;
    if (typeof event.button === "number" && event.button !== 0) return;

    const wordEl = resolveActivatedWord(event, root);
    if (!wordEl) {
      if (Date.now() - openedAt > 400) closeReadingPicker();
      return;
    }
    const idx = Number.parseInt(wordEl.getAttribute("data-token-index") || "", 10);
    if (!Number.isFinite(idx)) {
      // span 無し（旧HTML）は従来どおり即ピッカー
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const now = Date.now();
      if (now - openedAt < 400) return;
      openedAt = now;
      void openReadingPicker(wordEl);
      return;
    }

    const host =
      wordEl.closest(
        "[data-yt-furigana-original], [data-ytscf-original], .ytp-caption-segment, .caption-visual-line, .segment-text, .vjs-text-track-cue-line, yt-live-chat-paid-message-renderer #message, yt-live-chat-ticker-paid-message-item-renderer #message"
      ) || wordEl.parentElement;

    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startIndex: idx,
      endIndex: idx,
      moved: false,
      startEl: wordEl,
      host,
    };
    try {
      wordEl.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  const onPointerMove = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (Math.hypot(dx, dy) >= SPAN_DRAG_THRESHOLD_PX) dragState.moved = true;
    const under = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest?.(".yt-furigana-word");
    const scope = dragState.host || root;
    if (under && scope.contains(under)) {
      const idx = Number.parseInt(under.getAttribute("data-token-index") || "", 10);
      if (Number.isFinite(idx) && idx !== dragState.endIndex) {
        dragState.endIndex = idx;
        dragState.moved = true;
      }
    }
    if (dragState.moved) {
      highlightSpanRange(root, dragState.startIndex, dragState.endIndex, dragState.host);
    }
  };

  const finishDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const state = dragState;
    dragState = null;
    clearSpanSelecting(root);

    const now = Date.now();
    if (now - openedAt < 400 && !state.moved) return;
    openedAt = now;

    const contextText = resolveContextTextFromWord(state.startEl);
    const scope = state.host || root;
    const words = [...(scope.querySelectorAll?.(".yt-furigana-word") || [])];
    const tokens = words.map((el) => ({
      surface: el.getAttribute("data-surface") || "",
      span: [
        Number.parseInt(el.getAttribute("data-span-start") || "", 10),
        Number.parseInt(el.getAttribute("data-span-end") || "", 10),
      ],
    }));

    if (state.moved && state.startIndex !== state.endIndex) {
      const merged = spanFromTokenRange(
        contextText,
        tokens,
        state.startIndex,
        state.endIndex
      );
      if (merged && isRegisterableSurface(merged.surface)) {
        const lo = Math.min(state.startIndex, state.endIndex);
        const hi = Math.max(state.startIndex, state.endIndex);
        const selectedEls = words.filter((el) => {
          const i = Number.parseInt(el.getAttribute("data-token-index") || "", 10);
          return i >= lo && i <= hi;
        });
        void openReadingPicker(state.startEl, {
          surface: merged.surface,
          currentReading: "",
          span: [merged.start, merged.end],
          merged: true,
          selectedEls,
          contextText,
        });
        return;
      }
    }

    const word =
      words.find(
        (el) =>
          Number.parseInt(el.getAttribute("data-token-index") || "", 10) ===
          state.startIndex
      ) || state.startEl;
    void openReadingPicker(word, { contextText });
  };

  const onClickBlock = (event) => {
    // pointer 経路で処理済み。合成 click で二重起動しない
    if (event.target.closest?.(".yt-furigana-word")) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }
  };

  root.addEventListener("pointerdown", onPointerDown, true);
  root.addEventListener("pointermove", onPointerMove, true);
  root.addEventListener("pointerup", finishDrag, true);
  root.addEventListener("pointercancel", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    dragState = null;
    clearSpanSelecting(root);
  }, true);
  root.addEventListener("click", onClickBlock, true);
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

  // 全画面切替で documentElement 側のポップアップが残らないようにする
  const onFullscreenChange = () => closeReadingPicker();
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
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
  }
  const mountRoot = resolveOverlayMountRoot(wordEl);
  if (el.parentElement !== mountRoot) {
    mountRoot.appendChild(el);
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
