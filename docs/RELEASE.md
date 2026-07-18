# リリース状態（v1.8.0）

## 完成しているもの

| 項目 | 状態 |
|------|------|
| Free ローカルふりがな（標準 / Hybrid） | 完成 |
| 公開サイト（Pages） | https://blackphi6.github.io/yt-furigana-extension/ |
| インストール手順 | `/install.html` |
| プライバシー / 利用規約 | Pages + `docs/` |
| 公開読みデモ API（Render） | https://yt-furigana-readings.onrender.com |
| Freemium（辞書同期・共有） | コード完成（要 reading-engine） |
| Stripe Checkout / webhook | コード完成（要 Stripe キー） |
| Premium 当面の受付 | GitHub Sponsors |
| Chrome Web Store 用 zip / 文面 | `npm run pack:store` / `store/listing.md` |
| GitHub Release | タグ `v1.8.0` に zip 添付 |

## 利用者向けの完成形（いま）

1. サイトからインストール → Free ですぐ使える
2. Premium が必要なら Sponsors → キーを受け取る → ポップアップで検証
3. Chrome Web Store は開発者アカウントで zip を手動提出（公開後 `site/config.js` の Store URL を更新）

## ストア提出（手動・アカウント必須）

提出物は `dist-store/yt-furigana-extension.zip` と `store/listing.md`。審査・課金・本人確認は自動化できません。
