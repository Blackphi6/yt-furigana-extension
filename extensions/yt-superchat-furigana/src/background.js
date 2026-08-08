/**
 * キーボードショートカット（スパチャのみ表示の切替など）
 */
import {
  TOGGLE_HIDE_TEXT_COMMAND,
  withToggledHideTextMessages
} from "./state.js";

const STORAGE_KEY = "ytscfState";

chrome.runtime.onInstalled.addListener(() => {
  console.info("[YT Live Chat Furigana] installed");
});

/**
 * スパチャのみ表示を反転して保存。
 * @returns {Promise<boolean>} 切替後の hideTextMessages
 */
export async function toggleHideTextMessages() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const next = withToggledHideTextMessages(data?.[STORAGE_KEY]);
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next.hideTextMessages;
}

chrome.commands.onCommand.addListener((command) => {
  if (command !== TOGGLE_HIDE_TEXT_COMMAND) return;
  void toggleHideTextMessages().catch((err) => {
    console.warn("[YT Live Chat Furigana] shortcut failed", err);
  });
});
