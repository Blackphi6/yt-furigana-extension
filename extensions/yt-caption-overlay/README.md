# YT Caption Overlay（実験用・別拡張）

自作の字幕ファイル（SRT / WebVTT / SRV3 / timedtext json3）を、YouTube プレイヤー上に**疑似表示**する Chrome 拡張です。

- YouTube timedtext / 字幕 API には**一切アクセスしません**
- [YT Furigana](https://github.com/Blackphi6/yt-furigana-extension) 本体とは別 ID・別インストール
- 書き出しサイト（`/export.html`）で作った `.vtt` / `.ytt` をそのまま載せられます

## 読み込み方

```bash
# リポジトリルートで
npm run overlay:build
```

1. Chrome で `chrome://extensions`
2. 「デベロッパーモード」オン
3. 「パッケージ化されていない拡張機能を読み込む」
4. このフォルダを指定: `extensions/yt-caption-overlay`

## 使い方

1. YouTube で動画を開く
2. 拡張アイコン → 字幕ファイルを選択
3. プレイヤー下部にオーバーレイ表示
4. 文字サイズ・表示オンオフはポップアップから変更

## 注意

- 非公式・実験用です。公開ストア提出は想定していません
- ネイティブ字幕と二重表示になる場合は、YouTube 側の字幕をオフにしてください
- 権利者の許諾範囲で利用してください
