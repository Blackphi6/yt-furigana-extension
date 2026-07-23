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

### 永年無料・常時起動について（現実）

Render **Free** は hobby 向けで、次は仕様です（有料にしない限り変わりません）。

| 期待 | Free の実態 |
|------|-------------|
| ずっと起動 | **15分無通信でスリープ**（復帰〜1分）。常時起動は Starter 以上（有料） |
| 月いくらでも | **月 750 インスタンス時間**。常時起こしっぱなしにすると枠を食い切って月末まで停止し得る |
| データ永続 | ディスクは消える。共有読みは **Git の seed**（`npm run export:shared-readings`）が本体 |
| 永遠に無料 | ベンダー方針変更の可能性あり。拡張本体のルビは **端末内エンジン**なので API 停止でも視聴は続く |

**採用方針:** スリープは許容し、デモ UI の「起こしています…」表示でごまかす。常時起動の有料枠・Keep-alive ping・OCI 移植はしない（必要になったらそのとき）。

**推奨:** Keep-alive の定期 ping は「起こしっぱなし＝無料枠消費」なので既定では入れません。

### 古いデプロイ事故を防ぐ

1. Blueprint 適用後、サービス設定で **Auto-Deploy = On commit**（`render.yaml` の `autoDeployTrigger: commit`）
2. GitHub Actions `Probe public reading API` が `/v1/proposals` 等の欠落を日次＋関連 push で検知
3. 手元確認: `node scripts/probe-public-api.mjs`

### コードだけ直したあと（Auto-Deploy が Off のとき）

Blueprint の **Manual sync は `render.yaml` が変わらないと Docker を作り直さない**ことがあります。
次のどちらかをしてください。

1. サービス `yt-furigana-readings` を開く → **Manual Deploy** → **Deploy latest commit**
2. または `render.yaml` の `YT_FURIGANA_BUILD_ID` を上げてから Blueprint **Manual sync**

反映確認:

```bash
node scripts/probe-public-api.mjs
# または
curl -s https://yt-furigana-readings.onrender.com/health
# buildId が proposals-quiz-… なら新ビルド
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
