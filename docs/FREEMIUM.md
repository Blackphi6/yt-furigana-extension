# Freemium

## モデル

| プラン | 内容 | お金 |
|--------|------|------|
| **Free** | Kuromoji / Sudachi / Hybrid、クリック学習、端末内辞書、BYO localhost 読みAPI、Ollama | ¥0 |
| **Premium** | 辞書クラウド同期、共有辞書パック、ホスト読みAPI（APIキー） | 買い切り（Stripe） / Sponsors |
| **OSS支援** | [GitHub Sponsors](https://github.com/sponsors/Blackphi6) | 任意 |

本体のふりがなは常に Free。課金壁で普及を止めない。

公開サイト: https://blackphi6.github.io/yt-furigana-extension/  
購入ページ: https://blackphi6.github.io/yt-furigana-extension/pricing.html

## ローカルで Premium を試す

```bash
npm run reading-engine
```

拡張ポップアップ:

1. 同期サーバー: `http://127.0.0.1:8765`
2. ライセンス: `ytfp_live_demo_key_001`
3. 「ライセンス検証」→ Premium
4. 「辞書を同期」「共有辞書」

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

## 弁護士レビュー

プライバシー・利用規約・COPYING 等はテンプレ／OSS 慣行に基づく文書であり、**弁護士によるレビューは本リポジトリ作業の範囲外**です。商用公開前に専門家へ依頼してください。
