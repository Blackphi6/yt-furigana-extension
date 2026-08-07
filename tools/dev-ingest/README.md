# 開発者インジェスト

**常時アクセス（推奨・スマホ可）** — Render 上の非公開 UI（GitHub Pages には載せない）:

https://yt-furigana-readings.onrender.com/admin/dev-ingest/

または短縮: https://yt-furigana-readings.onrender.com/admin/ingest

- 初回: `YT_FURIGANA_ADMIN_TOKEN`（キュー送信用）と Groq `gsk_…` 全文（抽出用・ブラウザ直）を保存
- 抽出はブラウザ→Groq 優先（Render 経由の 403 を避ける）。キー全文は作成時のみ表示
- 無料枠はスリープするので、久しぶりのときは起き上がり待ち

ローカル複製:

```bash
python3 -m http.server 4173
# http://127.0.0.1:4173/tools/dev-ingest/
```
