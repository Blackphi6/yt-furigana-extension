# Freemium

## モデル

| プラン | 内容 | お金 |
|--------|------|------|
| **Free** | Kuromoji / Sudachi / Hybrid、クリック学習、端末内辞書、BYO localhost 読みAPI、Ollama | ¥0 |
| **Premium** | 辞書クラウド同期、共有辞書パック、ホスト読みAPI（APIキー） | ライセンス / Sponsors |
| **OSS支援** | [GitHub Sponsors](https://github.com/sponsors/Blackphi6) | 任意 |

本体のふりがなは常に Free。課金壁で普及を止めない。

## ローカルで Premium を試す

```bash
npm run reading-engine
```

拡張ポップアップ:

1. 同期サーバー: `http://127.0.0.1:8765`
2. ライセンス: `ytfp_live_demo_key_001`
3. 「ライセンス検証」→ Premium
4. 「辞書を同期」「共有辞書」

## 本番ホスト向け

```bash
export YT_FURIGANA_LICENSE_KEYS=ytfp_live_xxxx,ytfp_live_yyyy
export YT_FURIGANA_API_KEYS=sk_live_....
export YT_FURIGANA_ADMIN_TOKEN=...
npm run reading-engine
```

- `YT_FURIGANA_API_KEYS` をセットすると `/v1/readings` も Bearer 必須
- ライセンス発行: `POST /v1/admin/mint-license`（adminToken 必須）または `node scripts/mint-license.mjs`

## Stripe など

現状はライセンスファイル＋環境変数。決済は Stripe でキーを発行し `licenses.json` / env に載せる運用を想定（未配線）。
