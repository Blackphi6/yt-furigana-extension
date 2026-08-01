# YT Super Chat Furigana

YouTube ライブの **Super Chat**（＋上部ティッカー）本文に、端末内 kuromoji でふりがなを付ける Chrome 拡張です。

- 製品ページ: https://blackphi6.github.io/yt-furigana-extension/superchat.html
- プライバシー: https://blackphi6.github.io/yt-furigana-extension/privacy-superchat.html
- [YT Furigana](https://github.com/Blackphi6/yt-furigana-extension)（字幕向け）とは**別拡張・別ストアアイテム**

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
| Super Chat 本文 | 通常ライブチャット |
| 上部ティッカーの SC 文言 | timedtext / 字幕 API |
| 読み未登録のクリック登録（端末内） | メンバーシップ文言全般 |

## 注意

非公式です。Google / YouTube とは無関係。「YT」は製品名の略称です。
