# Stripe（YT Furigana）

同じ Stripe アカウント（メール共通）内に、**別 Product** として切り分けています。  
SecurData / 説明文エディタとは `metadata.app=yt-furigana-extension` で区別します（別会社アカウントではない）。

## 作成済み（テストモード）

| 項目 | ID |
|------|-----|
| Product | `prod_Us03UPjsqOraab` |
| Price（¥980 / 買い切り） | `price_1TsG3X8H0GxhdXkpaefsbvrC` |

再作成: `scripts/setup-stripe-product.sh test`

## ライブモード

CLI の `rk_live_`（restricted key）では Product 作成権限がありません。次のいずれか:

1. Dashboard → Product catalog → 「YT Furigana Premium」を同内容で作成（¥980・One time・JPY）
2. または `sk_live_...` を用意して `scripts/setup-stripe-product.sh live`
3. または `stripe login` で書き込み可能なキーを再取得

## ローカル接続

```bash
cp reading-engine/.env.example reading-engine/.env
# STRIPE_SECRET_KEY / STRIPE_PRICE_ID / STRIPE_WEBHOOK_SECRET を記入

# Webhook（ローカル）
stripe listen --forward-to localhost:8765/v1/billing/webhook
# 表示された whsec_ を .env に

npm run reading-engine
```

サイトの `site/config.js` の `readingApiUrl` を本番エンジン URL に合わせると、料金ページの Stripe 購入が有効になります。
