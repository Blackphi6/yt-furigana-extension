# Freemium

## モデル

| プラン | 内容 | お金 |
|--------|------|------|
| **Free** | 標準 / Hybrid、クリック学習、端末内辞書、共有読みパック受信 | ¥0 |
| **Premium** | 読み辞書の端末間同期、指定サーバー共有辞書の手動取込 | 買い切り（Stripe） / Sponsors |
| **OSS支援** | [GitHub Sponsors](https://github.com/sponsors/Blackphi6) | 任意 |

本体のふりがなは常に Free。課金壁で普及を止めない。

公開サイト: https://blackphi6.github.io/yt-furigana-extension/  
インストール: https://blackphi6.github.io/yt-furigana-extension/install.html  
購入ページ: https://blackphi6.github.io/yt-furigana-extension/pricing.html

Premium の当面の受付は **GitHub Sponsors**。Stripe 自動購入は読みエンジンをホストしキーを設定したあとに有効になります。

## ローカルで Premium を試す

```bash
npm run reading-engine
```

拡張ポップアップ:

1. 同期サーバー: `http://127.0.0.1:8765`
2. ライセンス: ローカル読みエンジン起動時のみ自動作成されるデモキー（`docs` / reading-engine README 参照。**製品 UI・公開サイトには載せない**）
3. 「ライセンス検証」→ Premium
4. 「辞書を同期」「サーバー共有辞書」

本番（Render 等）ではデモキー自動作成と Stripe dry-run は無効です（`RENDER=true` / `YT_FURIGANA_ENV=production`）。

## Stripe（アカウント内の別サービス）

同じ Stripe アカウント（運営者の既存 Product とメール共通）内に **別 Product** として作成しています。

| モード | Product | Price (¥980 買い切り) |
|--------|---------|------------------------|
| Test | `prod_Us03UPjsqOraab` | `price_1TsG3X8H0GxhdXkpaefsbvrC` |
| Live | Dashboard または `scripts/setup-stripe-product.sh live` | 作成後に記入 |

詳細: [STRIPE.md](STRIPE.md)

## Stripe Checkout（本番）

読みエンジン側の環境変数:

```bash
export STRIPE_SECRET_KEY=sk_live_...
export STRIPE_PRICE_ID=price_...          # Premium 買い切り Price
export STRIPE_WEBHOOK_SECRET=whsec_...    # checkout.session.completed
export YT_FURIGANA_SITE_URL=https://blackphi6.github.io/yt-furigana-extension
export YT_FURIGANA_ADMIN_TOKEN=...
npm run reading-engine
```

エンドポイント:

| Method | Path | 説明 |
|--------|------|------|
| POST | `/v1/billing/checkout` | Checkout Session 作成（`successUrl` / `cancelUrl` / `email`） |
| GET | `/v1/billing/order?session_id=` | 発行済みライセンス取得 |
| POST | `/v1/billing/webhook` | Stripe Webhook（署名検証） |

`STRIPE_SECRET_KEY` または `STRIPE_PRICE_ID` が無い場合は **dry-run** で即ライセンス発行し、`success` URL へリダイレクトします（ローカル検証用）。

Webhook では `checkout.session.completed` を受け取り `mint_license` します。

サイトの `site/config.js` の `readingApiUrl` を本番ホストに合わせてください。

## 本番ホスト向け（ライセンス手動）

```bash
export YT_FURIGANA_LICENSE_KEYS=ytfp_live_xxxx,ytfp_live_yyyy
export YT_FURIGANA_API_KEYS=sk_live_....
export YT_FURIGANA_ADMIN_TOKEN=...
npm run reading-engine
```

- `YT_FURIGANA_API_KEYS` をセットすると `/v1/readings` も Bearer 必須
- ライセンス発行: `POST /v1/admin/mint-license`（adminToken 必須）または `node scripts/mint-license.mjs`

## 問題が起きたとき

平時は公開文書と自己調査で運用し、トラブルや規模拡大時に専門家へ相談する想定です。
