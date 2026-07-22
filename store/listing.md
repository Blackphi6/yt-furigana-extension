# Chrome Web Store 申請メモ

公開サイト（ポリシー URL）: https://blackphi6.github.io/yt-furigana-extension/

## 提出物

| 項目 | 場所 |
|------|------|
| パッケージ zip | `npm run pack:store` → `dist-store/yt-furigana-extension.zip` |
| ストア説明文 | 本ファイル |
| スクショ | `store/screenshots/`（`npm run pack:store` で生成） |
| プライバシー | https://blackphi6.github.io/yt-furigana-extension/privacy.html |

## 単一目的

YouTube / TVer の日本語字幕にふりがな（ルビ）を付ける。

## 短い説明（132 文字以内）

YouTube / TVer の日本語字幕にひらがなルビ（非公式）。端末内で処理。クリックで読みを覚えます。有料は読み辞書の移動などが任意。

製品名「YT Furigana」の「YT」は製品名の略称であり、YouTube の商標ではありません。

## 詳細説明

YT Furigana は、YouTube と TVer の日本語字幕にひらがなのふりがな（ruby）を重ねて表示する Chrome 拡張です。

【無料】
・この端末だけで動く読み付け（設定不要）
・字幕の漢字をクリックして読みを覚え直す
・迷った言葉のメモも端末内のみ（オフにできます）
・既定ではクラウドへ字幕を送りません
・みんなの読みパック（表層→読みのみ）を受け取れる（オフ可）

【有料オプション（任意）】
・直した読み辞書を別のパソコンへ移す
・指定サーバー上の共有辞書を手動で取り込む

ソース: https://github.com/Blackphi6/yt-furigana-extension
サイト: https://blackphi6.github.io/yt-furigana-extension/
料金: https://blackphi6.github.io/yt-furigana-extension/pricing.html

字幕・映像の著作権は各権利者に帰属します。本拡張は画面上の表示加工であり、コンテンツの再配布を目的としません。

YouTube、TVer、Google Chrome は各社の商標です。本拡張は各社の公式アプリ・公式機能ではありません。
「YT Furigana」の「YT」は製品名の略称であり、YouTube の商標ではありません。

## 権限の正当化

| 権限 | 理由 |
|------|------|
| storage | 設定・学習辞書の保存 |
| host: youtube.com / tver.jp | 字幕 DOM へのルビ付与 |
| host: yt-furigana-readings.onrender.com | **既定で** Free 共有読みパックを受信（オフ可）。任意の匿名訂正送信先 |
| host: localhost Ollama / 読みエンジン | ローカルエンジン接続（ユーザーが使う場合） |
| optional host: http(s)://*/* | ユーザーが指定した同期サーバー（有料オプション）。入力時のみ利用 |
| declarativeNetRequest (+ WithHostAccess) | ローカル Ollama 等のオリジン緩和 |

審査メモ: 通常再生では YouTube timedtext / 字幕配信 API を取得しません。画面上の字幕 DOM のみです。


## 審査用チェックリスト（手動）

- [ ] Google 開発者アカウントで新規アイテム作成
- [ ] zip をアップロード
- [ ] プライバシー URL・サポート URL を Pages に設定
- [ ] スクショ 1280×800 以上を 1 枚以上
- [ ] 単一目的の説明がストア文言と一致
- [ ] 公開後、`site/config.js` と README の Store URL を更新

※ ストア審査のアカウント操作・課金・本人確認は自動化できません。zip と文面までを本リポジトリで用意します。
