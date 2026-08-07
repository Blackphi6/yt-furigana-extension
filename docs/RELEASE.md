# リリース状態（v1.9.7 / live-chat-v1.1.1）

## 完成しているもの

| 項目 | 状態 |
|------|------|
| Free ローカルふりがな（標準 / Hybrid） | 完成 |
| ルビ範囲選択→読み指定（ドラッグ） | 完成（本体・Live Chat 共通） |
| 公開サイト（Pages） | https://blackphi6.github.io/yt-furigana-extension/ |
| インストール手順 | `/install.html` |
| プライバシー / 利用規約 | Pages + `docs/` |
| 公開読みデモ API（Render） | https://yt-furigana-readings.onrender.com |
| Freemium（辞書同期・共有） | コード完成（要 reading-engine） |
| Stripe Checkout / webhook | コード完成（要 Stripe キー） |
| Premium 当面の受付 | GitHub Sponsors |
| Chrome Web Store 用 zip / 文面 | `npm run pack:store` / `store/listing.md` |
| Live Chat 用 zip | `npm run pack:superchat` |
| GitHub Release | `pack:store` / `pack:superchat` が自動更新 |

## 利用者向けの完成形（いま）

1. サイトからインストール → Free ですぐ使える
2. Premium が必要なら Sponsors → キーを受け取る → ポップアップで検証
3. Chrome Web Store は開発者アカウントで zip を手動提出（公開後 `site/config.js` の Store URL を更新）

## ストア提出（手動・アカウント必須）

提出物は `dist-store/yt-furigana-extension.zip` と `store/listing.md`。審査・課金・本人確認は自動化できません。

## GitHub Release（自動）

`npm run pack:store` と `npm run pack:superchat` は zip 作成後に GitHub Release を作成／更新します。

| 製品 | タグ | コマンド |
|------|------|----------|
| YT Furigana | `v{manifest.version}` | `npm run pack:store` |
| YT Live Chat Furigana | `live-chat-v{version}` | `npm run pack:superchat` |

- zip のみ欲しいとき: `SKIP_GITHUB_RELEASE=1 npm run pack:store`
- Release だけやり直す: `npm run release:github` / `npm run release:github:live-chat`
- 前提: バージョン上げた変更を commit & push 済み、`gh` 認証済み
