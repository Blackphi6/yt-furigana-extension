# リリース状態（v1.7.1）

## 完成しているもの

| 項目 | 状態 |
|------|------|
| Free ローカルふりがな | 完成 |
| 公開サイト（Pages） | https://blackphi6.github.io/yt-furigana-extension/ |
| インストール手順 | `/install.html` |
| プライバシー / 利用規約 | Pages + `docs/` |
| Freemium（辞書同期・共有・ホストAPI） | コード完成（要 reading-engine） |
| Stripe Checkout / webhook | コード完成（要 Stripe キー） |
| Premium 当面の受付 | GitHub Sponsors |
| Chrome Web Store 用 zip / 文面 | `npm run pack:store` / `store/listing.md` |
| GitHub Release | タグ `v1.7.1` に zip 添付 |

## あとからでよいもの

1. **Chrome Web Store 公開** — 開発者アカウントで zip を手動提出。公開後 `site/config.js` の `chromeStoreUrl` を更新
2. **読みエンジン本番ホスト + Stripe キー** — `readingApiUrl` / `STRIPE_*` を設定すると料金ページの自動購入が有効
3. **問題が起きたときの専門家相談** — 平時は公開文書＋自己調査で運用

## 利用者向けの完成形（いま）

1. サイトからインストール → Free ですぐ使える
2. Premium が必要なら Sponsors → キーを受け取る → ポップアップで検証
3. ストアや Stripe は準備でき次第、設定を差し替えるだけ
