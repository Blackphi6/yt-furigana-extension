# サイト（GitHub Pages）+ 公開読み API（Render）

公開 URL: https://blackphi6.github.io/yt-furigana-extension/

**静的サイト（GitHub Pages）＋ 読み API（Render 無料枠）** です。
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

### コードだけ直したあと（重要）

Blueprint の **Manual sync は `render.yaml` が変わらないと Docker を作り直さない**ことがあります。
次のどちらかをしてください。

1. サービス `yt-furigana-readings` を開く → **Manual Deploy** → **Deploy latest commit**
2. または `render.yaml` の `YT_FURIGANA_BUILD_ID` を上げてから Blueprint **Manual sync**

反映確認:

```bash
curl -s https://yt-furigana-readings.onrender.com/health
# buildId が proposals-quiz-… なら新ビルド

curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://yt-furigana-readings.onrender.com/v1/proposals \
  -H 'content-type: application/json' \
  -d '{"entries":[{"surface":"塗れ","reading":"ぬれ"}],"source":"demo"}'
# 200（または 429）なら提案 API あり。404 ならまだ古いイメージ
```

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
