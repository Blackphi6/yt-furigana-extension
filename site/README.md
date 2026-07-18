# サイト（GitHub Pages）+ 公開読み API（Render）

公開 URL: https://blackphi6.github.io/yt-furigana-extension/

JRM デモと同様、**静的サイト（常時）＋ 読み API（無料ホスト）** です。
ローカルでエンジンを立てなくても、トップのデモから公開 API を呼べます。

## 構成

| 層 | URL |
|----|-----|
| UI | https://blackphi6.github.io/yt-furigana-extension/ |
| 読み API | https://yt-furigana-readings.onrender.com |
| OpenAPI | https://yt-furigana-readings.onrender.com/docs |
| 学習レポート | ./learning-report.html |

`config.js` の `readingApiUrl` がデモの接続先です。

## 初回のみ: Render に無料 Web Service を作る

Hugging Face の無料 Docker Space は 2026 年時点で PRO 必須のため、**Render free** を使います。

1. https://render.com で GitHub アカウント連携（無料プラン）
2. Dashboard → **New** → **Blueprint**
3. このリポジトリ `Blackphi6/yt-furigana-extension` を選び、ルートの `render.yaml` を適用
4. サービス名 `yt-furigana-readings` → URL は `https://yt-furigana-readings.onrender.com`
5. 初回ビルドが終わるまで数分待つ

無料枠はアイドルでスリープします。デモの最初のリクエストだけ数十秒かかることがあります。

サービス名を変えた場合は `site/config.js` の `readingApiUrl` を合わせてください。

## ローカル確認

```bash
# API（Docker）
docker build -f reading-engine/deploy/Dockerfile -t yt-furigana-readings .
docker run --rm -p 7860:7860 yt-furigana-readings

# サイト
npm run demo:site
# → http://127.0.0.1:4173/  （API URL 欄を http://127.0.0.1:7860 に）
```

フッターの商標注記は `site/partials/trademark-footer.html` と同内容を各 HTML に記載しています。
