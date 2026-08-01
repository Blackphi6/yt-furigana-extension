/** インストールログのみ（将来のメッセージ中継用） */
chrome.runtime.onInstalled.addListener(() => {
  console.info("[YT Super Chat Furigana] installed");
});
