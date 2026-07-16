# サイト（GitHub Pages）

ソースはリポジトリの `site/`。`main` への push で Actions が Pages にデプロイします。

公開 URL: https://blackphi6.github.io/yt-furigana-extension/

初回のみ GitHub リポジトリ設定で **Settings → Pages → Source: GitHub Actions** を選んでください。

フッターの商標注記は `site/partials/trademark-footer.html` と同内容を各 HTML に記載しています（Pages は include 不可）。

`config.js` の `readingApiUrl` を読みエンジン URL に合わせてください。

## 読みデモ（学習確認）

候補制約型読み API のローカル確認用 UI:

1. ターミナル A: `export YT_FURIGANA_RERANKER_PATH=reading-engine/train/artifacts/reranker-prod`（任意）→ `npm run reading-engine`
2. ターミナル B: `npm run demo:site` → http://127.0.0.1:4173/reading-demo.html

候補・確信度・根拠（trust / cue / reranker 等）を表で確認できます。
