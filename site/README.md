# サイト（GitHub Pages）+ 公開読み API（Hugging Face Spaces）

公開 URL: https://blackphi6.github.io/yt-furigana-extension/

JRM デモと同様、**静的サイト（常時）＋ 読み API（無料 Space）** です。
ローカルでエンジンを立てなくても、トップのデモから公開 API を呼べます。

## 構成

| 層 | URL |
|----|-----|
| UI | https://blackphi6.github.io/yt-furigana-extension/ |
| 読み API | https://blackphil-yt-furigana-readings.hf.space |
| OpenAPI | https://blackphil-yt-furigana-readings.hf.space/docs |
| 学習レポート | ./learning-report.html |

`config.js` の `readingApiUrl` がデモの接続先です。

## 初回のみ: Hugging Face Space を作る

1. https://huggingface.co/join でアカウント作成
2. https://huggingface.co/settings/tokens で **Write** トークン作成
3. GitHub リポジトリ Secrets に `HF_TOKEN` を登録
4. Actions → **Deploy reading Space** → Run workflow  
   （または手動で Space `Blackphil/yt-furigana-readings` を Docker SDK で作成し、`reading-engine/deploy` の手順で同期）

Space が sleep から起きると初回だけ数十秒かかることがあります。

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
