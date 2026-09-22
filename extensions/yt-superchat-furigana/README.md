# YT Live Chat Furigana

YouTube ライブの **Super Chat**（＋上部ティッカー）と **通常チャット**、および **StreamYard** ステージ上のコメントバナー本文に、端末内 kuromoji でふりがなを付ける Chrome 拡張です。Super Chat / 通常チャットは個別オン／オフ。辞書は本体と同じく **小型を先に・Sudachi Full／地名などはアイドル後**。**スパチャ累積パネル**・CSV・**1枚PNG（タイムコード付き）**・**プレビューのふりがな**・アーカイブの手動全件取得・**名前／本文／金額検索**に対応。Orion/iOS ではチャット iframe を親から横断し、kuromoji が失敗したときは公開読み API に自動フォールバックします。

- 製品ページ: https://blackphi6.github.io/yt-furigana-extension/superchat.html
- プライバシー: https://blackphi6.github.io/yt-furigana-extension/privacy-superchat.html
- [YT Furigana](https://github.com/Blackphi6/yt-furigana-extension)（字幕向け）とは**別拡張・別ストアアイテム**

パッケージパスは互換のため `extensions/yt-superchat-furigana` のままです。

## 開発者向けビルド

```bash
npm run superchat:build
# 読み込みフォルダ: extensions/yt-superchat-furigana
```

## Chrome Web Store 提出キット

```bash
npm run pack:superchat
# → store/superchat-cws-upload/
```

中身: zip・PASTE.txt・スクショ・CHECKLIST。手順はキット内 README。

## 対象 / 非対象

| 対象 | 非対象 |
|------|--------|
| Super Chat 本文 | 動画ページ下のコメント欄 |
| 上部ティッカーの SC 文言 | timedtext / 字幕 API |
| 通常ライブチャット本文 | メンバーシップ文言全般 |
| StreamYard ステージコメント（Bubbles） | 有料チャットオーバーレイ専用 UI |
| 「スパチャのみ表示」（通常チャット行を隠す） | |
| Ctrl+Shift+L でスパチャのみ表示を切替 | |
| スパチャ累積パネル / CSV / 1枚PNG / プレビューふりがな | 開く前の自動全件（ライブ） |
| 配信中の本文SC＋上部ティッカーの取り込み | 配信中のチャット巻き戻し（動画DVRとは別） |
| アーカイブ「全件取得」（手動・低頻度） | timedtext / 字幕 API |
| 全件取得後の検索（名前・本文・金額） | |
| 読み未登録のクリック登録（端末内） | |

## 注意

非公式です。Google / YouTube / StreamYard とは無関係。「YT」は製品名の略称です。
