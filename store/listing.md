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

YouTube / TVer の日本語字幕にひらがなルビ（非公式）。ローカル解析が既定。Premium で辞書同期・共有辞書・ホストAPI。

製品名「YT Furigana」の「YT」は製品名の略称であり、YouTube の商標ではありません。

## 詳細説明

YT Furigana は、YouTube と TVer の日本語字幕にひらがなのふりがな（ruby）を重ねて表示する Chrome 拡張です。

【Free】
・Kuromoji / Sudachi / Hybrid による端末内の読み付け
・字幕の漢字クリックで読み学習（端末内）
・クラウドへの字幕送信なし（既定）

【Premium（任意・買い切り）】
・辞書の端末間同期
・共有辞書の取り込み
・ホスト型読み API

ソース: https://github.com/Blackphi6/yt-furigana-extension
サイト: https://blackphi6.github.io/yt-furigana-extension/
料金: https://blackphi6.github.io/yt-furigana-extension/pricing.html

字幕・映像の著作権は各権利者に帰属します。本拡張は画面上の表示加工であり、コンテンツの再配布を目的としません。

YouTube、TVer、Google Chrome は各社の商標です。本拡張は各社の公式アプリ・公式機能ではありません。

## 権限の正当化

| 権限 | 理由 |
|------|------|
| storage | 設定・学習辞書の保存 |
| host: youtube.com / tver.jp | 字幕 DOM へのルビ付与 |
| optional host: http(s)://*/* | ユーザー指定の読み API / Ollama |
| declarativeNetRequest | ローカル Ollama への CORS 緩和（任意） |

## 審査用チェックリスト（手動）

- [ ] Google 開発者アカウントで新規アイテム作成
- [ ] zip をアップロード
- [ ] プライバシー URL・サポート URL を Pages に設定
- [ ] スクショ 1280×800 以上を 1 枚以上
- [ ] 単一目的の説明がストア文言と一致
- [ ] 公開後、`site/config.js` と README の Store URL を更新

※ ストア審査のアカウント操作・課金・本人確認は自動化できません。zip と文面までを本リポジトリで用意します。
