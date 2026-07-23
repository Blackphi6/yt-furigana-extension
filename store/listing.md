# Chrome Web Store 申請メモ（提出キット）

公開サイト: https://blackphi6.github.io/yt-furigana-extension/

## いちばん使うフォルダ

**`store/cws-upload/`** — zip・スクショ・プロモ・貼り付け文面をまとめた提出キット。

再生成:

```bash
npm run pack:store
npm run pack:cws   # cws-upload を更新
```

## 提出物

| 項目 | 場所 |
|------|------|
| パッケージ zip | `store/cws-upload/yt-furigana-extension.zip` |
| 貼り付け文面 | `store/cws-upload/PASTE.txt` |
| スクショ 1280×800 | `store/cws-upload/screenshots/`（4枚） |
| プロモ 440 / 1400 | `store/cws-upload/promo-*.png` |
| アイコン 128 | `store/cws-upload/icon128.png` |
| 手順 | `store/cws-upload/README.md` |

## カテゴリ（Dashboard の選択肢）

**ユーザー補助機能** を選ぶ。

次点は **教育**（日本語学習用途を前面に出す場合）。
エンタテイメント／ツールは弱い（補助・学習の方が審査の単一目的と一致しやすい）。

## 短い説明（132 文字以内）

YouTube / TVer の日本語字幕にひらがなルビ（非公式）。端末内で処理。クリックで読みを覚えます。有料は読み辞書の移動などが任意。

## 詳細説明

（`store/cws-upload/PASTE.txt` の【詳細説明】をそのまま使用）

## 権限の正当化

| 権限 | 理由 |
|------|------|
| storage | 設定・学習辞書の保存 |
| host: youtube.com / tver.jp | 字幕 DOM へのルビ付与 |
| host: yt-furigana-readings.onrender.com | Free 共有読みパック受信（オフ可）／任意の匿名訂正 |
| optional: localhost | ローカル Ollama / 読みエンジン（許可ダイアログ） |
| optional: http(s)://*/* | ユーザー指定の同期サーバー（有料） |
| declarativeNetRequest (+ WithHostAccess) | ローカル Ollama のオリジン緩和（許可後） |

審査メモ: 通常再生では YouTube timedtext を取得しません。画面上の字幕 DOM のみです。

## URL

| 項目 | URL |
|------|-----|
| ホームページ | https://blackphi6.github.io/yt-furigana-extension/ |
| プライバシー | https://blackphi6.github.io/yt-furigana-extension/privacy.html |
| サポート | https://github.com/Blackphi6/yt-furigana-extension/issues |

## 審査用チェックリスト（手動）

- [ ] Developer Dashboard で新規アイテム作成（$5 登録済み）
- [ ] `yt-furigana-extension.zip` をアップロード
- [ ] PASTE.txt の短い説明・詳細説明を貼る
- [ ] スクショ 01〜04 をアップロード（順序どおり）
- [ ] 任意: promo 440 / 1400 をアップロード
- [ ] プライバシー URL・サポート URL・ホームページを設定
- [ ] Privacy practices（リモートコード No / 広告 No / 単一目的）
- [ ] 権限の正当化を PASTE.txt から貼る
- [ ] 審査へ提出
- [ ] 公開後、`site/config.js` の `chromeStoreUrl` を更新

※ アカウント操作・本人確認・課金は自動化できません。
