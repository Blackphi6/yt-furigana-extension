# 開発者インジェスト（非公開）

GitHub Pages には載せません。ローカルで開いて Render の admin API を叩きます。

```bash
# リポジトリルートで
python3 -m http.server 4173
# → http://127.0.0.1:4173/tools/dev-ingest/
```

必要なもの: Render の `YT_FURIGANA_ADMIN_TOKEN`（Dashboard → Environment）
