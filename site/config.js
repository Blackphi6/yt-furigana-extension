/* Public site config (GitHub Pages). */
window.YT_FURIGANA_SITE = {
  /**
   * 公開読み API（Render · free Web Service）。
   * 初回アクセス時はスリープ解除で数十秒かかることがあります。
   */
  readingApiUrl: "https://yt-furigana-readings.onrender.com",
  /**
   * 字幕書き出しが呼び出す拡張 ID の候補（先頭から順に試す）。
   * 1) Chrome Web Store 版  2) 開発者のローカル読み込み版（このマシンの既定）
   * ページ上の「拡張 ID」欄があればそちらを最優先する。
   */
  extensionId: "jpadpjpenggobbpdaclmlklajoihmgjh",
  extensionIds: [
    "jpadpjpenggobbpdaclmlklajoihmgjh",
    "eabmmgidjadifakdmjlcpapinmijeefb"
  ],
  /** Chrome Web Store 公開後に差し替え。空ならインストールページを使う */
  chromeStoreUrl: "",
  /** ライブチャット向け別拡張 */
  superchatChromeStoreUrl:
    "https://chromewebstore.google.com/detail/yt-live-chat-furigana/knhbpggekokgodfgbofpnppnjjmicami",
  superchatUrl: "https://blackphi6.github.io/yt-furigana-extension/superchat.html",
  installUrl: "https://blackphi6.github.io/yt-furigana-extension/install.html",
  siteUrl: "https://blackphi6.github.io/yt-furigana-extension",
  sponsorsUrl: "https://github.com/sponsors/Blackphi6",
  githubUrl: "https://github.com/Blackphi6/yt-furigana-extension",
  releaseZipUrl:
    "https://github.com/Blackphi6/yt-furigana-extension/releases/latest",
};
