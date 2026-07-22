# Chrome Web Store 提出キット

このフォルダ（または同内容の `store/cws-upload/`）を開けば、Developer Dashboard にそのまま貼れる／上げられるものを揃えています。

## 提出物一覧

| # | Dashboard 項目 | ファイル / 値 |
|---|----------------|---------------|
| 1 | パッケージ | `yt-furigana-extension.zip` |
| 2 | アイコン 128 | `icon128.png` |
| 3 | スクショ（最大5） | `screenshots/01`〜`04`（1280×800） |
| 4 | 小プロモ 440×280 | `promo-440x280.png`（任意） |
| 5 | 大プロモ 1400×560 | `promo-1400x560.png`（任意） |
| 6 | 文言 | `PASTE.txt` をコピー |

## URL（Dashboard に入力）

| 項目 | URL |
|------|-----|
| ホームページ | https://blackphi6.github.io/yt-furigana-extension/ |
| プライバシー | https://blackphi6.github.io/yt-furigana-extension/privacy.html |
| サポート | https://github.com/Blackphi6/yt-furigana-extension/issues |
| 英語PP（任意） | https://blackphi6.github.io/yt-furigana-extension/privacy.en.html |

## Dashboard 操作順（手動）

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) で新規アイテム
2. zip をアップロード
3. ストア掲載 → 説明・スクショ・プロモ・カテゴリを入力（`PASTE.txt`）
4. プライバシー慣行 → 単一目的・リモートコード No・広告 No・ポリシー URL
5. 権限の正当化（ホスト／storage／DNR）を `PASTE.txt` から貼る
6. 審査へ提出

公開後: `site/config.js` の `chromeStoreUrl` と README を更新。
