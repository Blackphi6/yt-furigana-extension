/** インストールログのみ（将来のメッセージ中継用） */
chrome.runtime.onInstalled.addListener(() => {
  console.info("[YT Live Chat Furigana] installed");
});
