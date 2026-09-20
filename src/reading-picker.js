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
export const CONTRIB_CONSENT_ID = "yt-furigana-contrib-consent";
const CONTRIB_TOAST_ID = "yt-furigana-contrib-toast";

/**
 * 候補ポップアップ／同意ダイアログ上の操作か。
 * 字幕ヒット判定（座標掘り）に回すと「送る」がルビクリックになる。
 * @param {EventTarget | null | undefined} target
 */
export function isFuriganaOverlayEventTarget(target) {
  if (!target || typeof target.closest !== "function") return false;
  return Boolean(
    target.closest(`#${POPUP_ID}, #${CONTRIB_CONSENT_ID}, #${CONTRIB_TOAST_ID}`)
  );
}

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
      ".ytp-caption-segment, .caption-visual-line, .segment-text, .vjs-text-track-cue-line, yt-live-chat-paid-message-renderer #message, yt-live-chat-ticker-paid-message-item-renderer #message, yt-live-chat-text-message-renderer #message, span[class*=BubblesComment__ContentSpan]"
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
  closeReadingPicker();
  const existing = document.getElementById(CONTRIB_CONSENT_ID);
  if (existing) existing.remove();

  const dialog = document.createElement("div");
  dialog.id = CONTRIB_CONSENT_ID;
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

  const swallow = (event) => {
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };
  dialog.addEventListener("pointerdown", swallow, true);
  dialog.addEventListener("pointerup", swallow, true);
  dialog.addEventListener("click", (event) => {
    swallow(event);
    const target = /** @type {HTMLElement} */ (event.target);
    const action = target.closest("[data-action]")?.getAttribute("data-action");
    if (action === "yes") void finish(true);
    if (action === "no") void finish(false);
  }, true);
}

/**
 * @param {string} message
 */
function showContributionToast(message) {
  document.getElementById(CONTRIB_TOAST_ID)?.remove();
  const toast = document.createElement("div");
  toast.id = CONTRIB_TOAST_ID;
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
    for (const rt of word.querySelectorAll("rt, .ytf-tver-rt")) {
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

  // かな接尾辞は字形が細いので、TVer 操作レイヤー越えの座標ヒット用に下限を取る
  const isKanaWord =
    typeof word.classList?.contains === "function" &&
    word.classList.contains("yt-furigana-word--kana");
  const minW = isKanaWord ? 14 : 0;
  const minH = isKanaWord ? 22 : 0;
  if (right - left < minW) {
    const cx = (left + right) / 2;
    left = cx - minW / 2;
    right = cx + minW / 2;
  }
  if (bottom - top < minH) {
    const cy = (top + bottom) / 2;
    top = cy - minH / 2;
    bottom = cy + minH / 2;
  }

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

  const fromRt = event.target
    ?.closest?.("rt, .ytf-tver-rt")
    ?.closest?.(".yt-furigana-word");
  if (fromRt instanceof HTMLElement && root.contains(fromRt)) return fromRt;

  return resolveFuriganaWordUnderPoint(event.clientX, event.clientY, root);
}

/**
 * 指定座標のふりがな語。TVer のように操作レイヤーが被る場合も掘る。
 * @param {number} clientX
 * @param {number} clientY
 * @param {ParentNode | Element} scope
 * @returns {HTMLElement | null}
 */
export function resolveFuriganaWordUnderPoint(clientX, clientY, scope) {
  if (!scope || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null;
  }
  const contains = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    if (
      typeof document !== "undefined" &&
      (scope === document || scope === document.documentElement)
    ) {
      return true;
    }
    return typeof scope.contains === "function" ? scope.contains(el) : true;
  };

  if (typeof document !== "undefined" && typeof document.elementFromPoint === "function") {
    try {
      const top = document.elementFromPoint(clientX, clientY);
      const direct = top?.closest?.(".yt-furigana-word");
      if (contains(direct)) return /** @type {HTMLElement} */ (direct);
    } catch {
      /* ignore */
    }
  }

  const atPoint = findFuriganaWordAtPoint(clientX, clientY, scope);
  if (contains(atPoint)) return atPoint;

  if (
    typeof document !== "undefined" &&
    typeof document.elementsFromPoint === "function"
  ) {
    try {
      for (const el of document.elementsFromPoint(clientX, clientY)) {
        const word = el?.closest?.(".yt-furigana-word");
        if (contains(word)) return /** @type {HTMLElement} */ (word);
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

const CAPTION_DRAG_HOST_SELECTOR =
  ".vjs-text-track-cue-line, .ytp-caption-segment, .caption-visual-line, .segment-text, yt-live-chat-paid-message-renderer #message, yt-live-chat-ticker-paid-message-item-renderer #message, yt-live-chat-text-message-renderer #message, span[class*=BubblesComment__ContentSpan]";

/**
 * ドラッグ範囲のホスト。TVer は行内が複数 span に割れるので、
 * data-yt-furigana-original（各 span）より cue-line を優先する。
 * @param {Element} wordEl
 * @returns {Element | null}
 */
export function resolveCaptionDragHost(wordEl) {
  if (!wordEl || typeof wordEl.closest !== "function") return null;
  return (
    wordEl.closest(CAPTION_DRAG_HOST_SELECTOR) ||
    wordEl.closest("[data-yt-furigana-original], [data-ytscf-original]") ||
    wordEl.parentElement
  );
}

/**
 * ホスト内の語を DOM 順で集め、複数 original span の文字位置を連結オフセットに揃える。
 * TVer は行が色分け span に割れ、data-token-index が span ごとに 0 から振り直される。
 * @param {Element} host
 * @returns {{ words: HTMLElement[], tokens: { surface: string, span: number[] }[], contextText: string }}
 */
export function collectDragWordsInHost(host) {
  if (!host || typeof host.querySelectorAll !== "function") {
    return { words: [], tokens: [], contextText: "" };
  }

  const originalUnits = [
    ...host.querySelectorAll("[data-yt-furigana-original], [data-ytscf-original]")
  ];

  /** @type {HTMLElement[]} */
  const words = [];
  /** @type {{ surface: string, span: number[] }[]} */
  const tokens = [];
  let contextText = "";
  let offset = 0;

  const pushWord = (word, baseOffset) => {
    if (!word || typeof word.getAttribute !== "function") return;
    const surface = word.getAttribute("data-surface") || "";
    const s = Number.parseInt(word.getAttribute("data-span-start") || "", 10);
    const e = Number.parseInt(word.getAttribute("data-span-end") || "", 10);
    words.push(/** @type {HTMLElement} */ (word));
    tokens.push({
      surface,
      span: [
        Number.isFinite(s) ? s + baseOffset : NaN,
        Number.isFinite(e) ? e + baseOffset : NaN
      ]
    });
  };

  if (originalUnits.length > 0) {
    for (const unit of originalUnits) {
      const orig =
        unit.getAttribute("data-yt-furigana-original") ||
        unit.getAttribute("data-ytscf-original") ||
        "";
      for (const word of unit.querySelectorAll(".yt-furigana-word")) {
        const owner =
          word.closest?.("[data-yt-furigana-original], [data-ytscf-original]") ||
          unit;
        if (owner !== unit) continue;
        pushWord(word, offset);
      }
      contextText += orig;
      offset += orig.length;
    }
  } else {
    const orig =
      (host instanceof HTMLElement &&
        (host.getAttribute("data-yt-furigana-original") ||
          host.getAttribute("data-ytscf-original"))) ||
      "";
    contextText = orig;
    for (const word of host.querySelectorAll(".yt-furigana-word")) {
      pushWord(word, 0);
    }
  }

  return { words, tokens, contextText };
}

const SPAN_DRAG_THRESHOLD_PX = 6;

function clearSpanSelecting(root) {
  root
    ?.querySelectorAll?.(".yt-furigana-word.is-span-selecting")
    ?.forEach((el) => el.classList.remove("is-span-selecting"));
  root
    ?.querySelectorAll?.(".yt-furigana-span-dragging")
    ?.forEach((el) => el.classList.remove("yt-furigana-span-dragging"));
}

/**
 * @param {ParentNode} root
 * @param {number} i0
 * @param {number} i1
 * @param {HTMLElement[]} words
 * @param {Element | null} host
 */
function highlightSpanRange(root, i0, i1, words, host) {
  clearSpanSelecting(root);
  host?.classList?.add("yt-furigana-span-dragging");
  const lo = Math.min(i0, i1);
  const hi = Math.max(i0, i1);
  for (let i = lo; i <= hi; i += 1) {
    words[i]?.classList?.add("is-span-selecting");
  }
}

function resolveContextTextFromWord(wordEl) {
  const host = resolveCaptionDragHost(wordEl);
  if (host) {
    const { contextText } = collectDragWordsInHost(host);
    if (contextText) return contextText;
  }
  return (
    wordEl.closest("[data-yt-furigana-original]")?.getAttribute("data-yt-furigana-original") ||
    wordEl.closest("[data-ytscf-original]")?.getAttribute("data-ytscf-original") ||
    wordEl.closest(CAPTION_DRAG_HOST_SELECTOR)?.textContent ||
    ""
  );
}

/**
 * 字幕上のクリック／ドラッグ／キーボードで候補を開く。
 * TVer は操作レイヤーが字幕の上に乗るため、座標ヒットも併用する。
 */
export function installReadingPicker(root = document) {
  let openedAt = 0;
  /** @type {{ pointerId: number, startX: number, startY: number, startIndex: number, endIndex: number, moved: boolean, startEl: HTMLElement, host: Element | null, words: HTMLElement[], tokens: { surface: string, span: number[] }[], contextText: string } | null} */
  let dragState = null;

  const eventRoot =
    typeof window !== "undefined" ? window : root;

  const onPointerDown = (event) => {
    if (isFuriganaOverlayEventTarget(event.target)) return;
    if (typeof event.button === "number" && event.button !== 0) return;

    const wordEl = resolveActivatedWord(event, root);
    if (!wordEl) {
      if (Date.now() - openedAt > 400) closeReadingPicker();
      return;
    }

    const host = resolveCaptionDragHost(wordEl);
    const collected = host
      ? collectDragWordsInHost(host)
      : {
          words: [wordEl],
          tokens: [
            {
              surface: wordEl.getAttribute("data-surface") || "",
              span: [
                Number.parseInt(wordEl.getAttribute("data-span-start") || "", 10),
                Number.parseInt(wordEl.getAttribute("data-span-end") || "", 10)
              ]
            }
          ],
          contextText: resolveContextTextFromWord(wordEl)
        };
    const startIndex = collected.words.indexOf(wordEl);
    const startSurface = wordEl.getAttribute("data-surface") || "";

    // 行内に複数語あるときは DOM 順でドラッグ（かな接尾辞も端点可）
    if (startIndex < 0) {
      if (Date.now() - openedAt > 400) closeReadingPicker();
      return;
    }
    if (collected.words.length < 2) {
      // かな単独クリックは登録対象外（「さん」だけ開かない）
      if (!isRegisterableSurface(startSurface)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const now = Date.now();
      if (now - openedAt < 400) return;
      openedAt = now;
      void openReadingPicker(wordEl, {
        contextText: collected.contextText || resolveContextTextFromWord(wordEl)
      });
      return;
    }

    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startIndex,
      endIndex: startIndex,
      moved: false,
      startEl: wordEl,
      host,
      words: collected.words,
      tokens: collected.tokens,
      contextText: collected.contextText
    };
    // 語ノードへの capture は TVer（親が pointer-events:none）で即失効しやすい。
    // window キャプチャ購読だけで追う。
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  const onPointerMove = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (Math.hypot(dx, dy) >= SPAN_DRAG_THRESHOLD_PX) dragState.moved = true;

    // ヒットは document 全体（操作レイヤー越え）。採用はホスト内の語だけ。
    const under = resolveFuriganaWordUnderPoint(
      event.clientX,
      event.clientY,
      root
    );
    if (under) {
      const idx = dragState.words.indexOf(under);
      if (idx >= 0 && idx !== dragState.endIndex) {
        dragState.endIndex = idx;
        dragState.moved = true;
      }
    }
    if (dragState.moved) {
      event.preventDefault();
      highlightSpanRange(
        root,
        dragState.startIndex,
        dragState.endIndex,
        dragState.words,
        dragState.host
      );
    }
  };

  const finishDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (isFuriganaOverlayEventTarget(event.target)) {
      dragState = null;
      clearSpanSelecting(root);
      return;
    }
    const state = dragState;
    dragState = null;
    clearSpanSelecting(root);

    const now = Date.now();
    if (now - openedAt < 400 && !state.moved) return;
    openedAt = now;

    const contextText =
      state.contextText || resolveContextTextFromWord(state.startEl);
    const { words, tokens } = state;

    if (state.moved && state.startIndex !== state.endIndex) {
      const merged = spanFromTokenRange(
        contextText,
        tokens,
        state.startIndex,
        state.endIndex
      );
      // span が欠けていても表層連結でまとめ登録できるようにする
      const lo = Math.min(state.startIndex, state.endIndex);
      const hi = Math.max(state.startIndex, state.endIndex);
      const selectedEls = words.slice(lo, hi + 1);
      const fallbackSurface = selectedEls
        .map((el) => el.getAttribute("data-surface") || "")
        .join("");
      const surface = merged?.surface || fallbackSurface;
      if (surface && isRegisterableSurface(surface)) {
        void openReadingPicker(state.startEl, {
          surface,
          currentReading: "",
          span: merged ? [merged.start, merged.end] : null,
          merged: true,
          selectedEls,
          contextText
        });
        return;
      }
    }

    const word = words[state.startIndex] || state.startEl;
    void openReadingPicker(word, { contextText });
  };

  const onClickBlock = (event) => {
    // pointer 経路で処理済み。合成 click で二重起動しない
    // TVer は target が操作レイヤーなので座標でも語を見て止める
    if (isFuriganaOverlayEventTarget(event.target)) return;
    if (event.target.closest?.(".yt-furigana-word")) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return;
    }
    if (
      resolveFuriganaWordUnderPoint(event.clientX, event.clientY, root)
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }
  };

  const onPointerCancel = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    dragState = null;
    clearSpanSelecting(root);
  };

  eventRoot.addEventListener("pointerdown", onPointerDown, true);
  eventRoot.addEventListener("pointermove", onPointerMove, true);
  eventRoot.addEventListener("pointerup", finishDrag, true);
  eventRoot.addEventListener("pointercancel", onPointerCancel, true);
  eventRoot.addEventListener("click", onClickBlock, true);
  root.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closeReadingPicker();
        return;
      }
      if (isFuriganaOverlayEventTarget(event.target)) return;
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

/**
 * 数字チップを既存ルビ帯の上に出すための top/left。
 * 隣接 rt の上端が分かるときは、そのさらに上へ押し上げる。
 * @param {{
 *   wordTop: number,
 *   wordLeft: number,
 *   wordWidth: number,
 *   tipHeight: number,
 *   tipWidth: number,
 *   baseFontPx?: number,
 *   nearbyFuriganaTop?: number | null,
 *   viewportWidth?: number,
 *   viewportMin?: number
 * }} input
 */
export function computeFloatingTipPlacement({
  wordTop,
  wordLeft,
  wordWidth,
  tipHeight,
  tipWidth,
  baseFontPx = 16,
  nearbyFuriganaTop = null,
  viewportWidth = 1024,
  viewportMin = 8
}) {
  const tipH = Math.max(1, Number(tipHeight) || 1);
  const tipW = Math.max(1, Number(tipWidth) || 1);
  // 既存ふりがな帯（約 0.55em）＋すき間。チップをルビ行の上へ
  const furiganaBand = Math.max(12, Number(baseFontPx) || 16) * 0.7 + 8;
  let top = Number(wordTop) - tipH - furiganaBand;
  if (nearbyFuriganaTop != null && Number.isFinite(nearbyFuriganaTop)) {
    top = Math.min(top, nearbyFuriganaTop - tipH - 6);
  }
  top = Math.max(viewportMin, top);
  const left = Math.min(
    Math.max(viewportMin, Number(wordLeft) + Number(wordWidth) / 2 - tipW / 2),
    Number(viewportWidth) - tipW - viewportMin
  );
  return { left, top };
}

/**
 * 同じ字幕行付近の rt 上端（いちばん高いもの）。無ければ null。
 * @param {HTMLElement} wordEl
 * @returns {number | null}
 */
function findNearbyFuriganaTop(wordEl) {
  const host =
    wordEl.closest?.(
      "[data-yt-furigana-styled], .ytp-caption-segment, .caption-visual-line, .vjs-text-track-cue-line, .yt-furigana-one-line"
    ) || wordEl.parentElement;
  if (!host?.querySelectorAll) return null;
  const wordRect = wordEl.getBoundingClientRect();
  let minTop = null;
  for (const rt of host.querySelectorAll("rt, .ytf-tver-rt")) {
    if (!(rt instanceof HTMLElement)) continue;
    const r = rt.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    // 横に近接（数字の左右の漢字ルビ）
    if (r.right < wordRect.left - 48 || r.left > wordRect.right + 48) continue;
    // 縦も同帯（大きく下は別行）
    if (r.top > wordRect.bottom + 8) continue;
    if (minTop == null || r.top < minTop) minTop = r.top;
  }
  return minTop;
}

function removeFloatingTip() {
  document.getElementById(FLOATING_TIP_ID)?.remove();
}

/**
 * 数字チップなど、親の overflow で ::after が切れうる環境向けに fixed で出す。
 * 既存ふりがなの上に重ねないよう、ルビ帯よりさらに上へ置く。
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
  const { left, top } = computeFloatingTipPlacement({
    wordTop: rect.top,
    wordLeft: rect.left,
    wordWidth: rect.width,
    tipHeight: height,
    tipWidth: width,
    baseFontPx: basePx,
    nearbyFuriganaTop: findNearbyFuriganaTop(wordEl),
    viewportWidth: window.innerWidth,
    viewportMin: 8
  });
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
