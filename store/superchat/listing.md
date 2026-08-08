# Chrome Web Store 申請メモ — YT Live Chat Furigana

公開サイト: https://blackphi6.github.io/yt-furigana-extension/superchat.html

## 提出キット

**`store/superchat-cws-upload/`**

```bash
npm run pack:superchat
```

## カテゴリ

**ユーザー補助機能**（次点: 教育）

## 権限

| 権限 | 理由 |
|------|------|
| storage | Super Chat / 通常チャットの個別オンオフ・スパチャのみ表示・手動読み |
| host: youtube.com / m.youtube.com | ライブチャット DOM へのルビ（`all_frames` で chat iframe） |
| host: streamyard.com | StreamYard ステージコメントバナーへのルビ |

timedtext / scripting / DNR は使わない。

## ショートカット

| コマンド | 既定 |
|----------|------|
| スパチャのみ表示を切り替え | Ctrl+Shift+L（Mac も Control+Shift+L） |

変更: `chrome://extensions/shortcuts`

## 商標

「YT」は製品名の略称。YouTube / Google / StreamYard 非公式。
