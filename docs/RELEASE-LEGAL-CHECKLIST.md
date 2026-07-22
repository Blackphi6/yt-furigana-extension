# Chrome Web Store / リリース前チェック（法務・プライバシー）

最終更新: 2026-07-22  
**法的助言ではありません。** ストア審査・各国法の最終判断は運営者自身（必要なら弁護士）で行ってください。

索引: [`TRADEMARK-AND-ATTRIBUTION.md`](TRADEMARK-AND-ATTRIBUTION.md)

## コード・文書側で整えたこと

| カテゴリ | 項目 | 状態 |
|----------|------|------|
| プライバシー | Free 既定で字幕本文を開発者サーバーへ送らない | 実装どおり |
| プライバシー | 共有読みパック受信（既定オン・オフ可）を開示 | PRIVACY / popup / listing |
| プライバシー | 秘密キーは `chrome.storage.local` | `settings-storage.js` |
| プライバシー | 学習ログの端末内自動蓄積を開示 | PRIVACY / popup |
| プライバシー | 学習ログのオプトアウト UI | popup `learningInboxEnabled` |
| セキュリティ | 広告・トラッキング SDK なし | 実装どおり |
| セキュリティ | リモートコード実行なし（MV3）＋ CSP 明示 | manifest |
| セキュリティ | ルビ HTML エスケープ / デモキー非掲載 / dry-run 本番禁止 | 済 |
| OSS 帰属 | kuromoji / IPADIC / NEologd / Sudachi / BudouX / CMUdict | NOTICE / COPYING / licenses |
| 配布物 | store zip に `third_party`・LICENSE・NOTICE・COPYING。bridge 非同梱 | `pack:store` |
| 商標 | 非公式表明（manifest / popup / site / store 文面） | 済 |
| 商標 | 「YT」≠ YouTube の明記 | TERMS / site フッター / popup |
| 監査 | `npm run audit:legal` を `npm test` に組み込み | 済 |
| コンテンツ | 再配布しない・歌詞スクレイピング禁止 | TERMS / CONTRIBUTING |
| サイト | Google Fonts 利用の注記（拡張本体とは別） | privacy / 各ページフッター |

## 自動監査コマンド（リリース前）

```bash
npm run audit:legal
npm test
npm run build
npm run pack:store
```

## CWS ダッシュボード

### Privacy practices（記入例）

1. **単一用途** — Unofficial furigana (ruby) on Japanese captions on YouTube / TVer.
2. **Personally identifiable information** — No account required. Optional email only on Stripe Checkout (site, not extension).
3. **Website content** — Reads on-screen caption DOM to add ruby. Does **not** fetch YouTube timedtext on the normal playback path. Optional opt-in may send surface/reading/short context (not video URL). Local learning inbox may store caption snippets + page URL **on device** (opt-out).
4. **Remote code** → No
5. **Data use** — Improve readings locally; optional anonymous contribution aggregation; optional Premium sync to user-configured server.
6. **Data sale / ads / transfer for unrelated use** → No
7. **Certification** — Privacy policy URL: `https://blackphi6.github.io/yt-furigana-extension/privacy.html` (EN: `privacy.en.html`)

### 審査コメント用（英語）

```text
Unofficial accessibility tool for Japanese captions on YouTube and TVer.
"YT" in the product name is not a YouTube trademark.
No affiliation with Google, YouTube, or TVer.
Caption text is processed locally by default (no timedtext fetch on the normal playback path).
Optional: receive a shared surface→reading pack from the public reading API (on by default, user can disable).
Optional: send anonymous reading corrections only when the user opts in.
Premium sync / BYO reading API only when the user configures a server URL.
Support: GitHub Issues. Refunds: Stripe purchases within 14 days if unused (card fees may apply).
```

### 掲載前チェック

- [ ] Pages 最新（`site/` push → Actions）← **提出前必須**
- [ ] ストア説明に **非公式**・端末内解析・共有パック受信
- [ ] 製品名「YT Furigana」が YouTube 公式と誤認されない説明
- [ ] スクリーンショット実画面（理想）または製品モック（現状 pack 生成物）
- [ ] アイコンが YouTube ロゴに似ていない（円＋ルビ風マーク）
- [ ] Premium / Stripe 返金・サポート連絡先（pricing / terms）
- [ ] zip に `.env` / 秘密鍵 / page-caption-bridge なし
- [ ] Render: `YT_FURIGANA_ENV=production`・dry-run/demo オフ・seed 同梱デプロイ

## 残るグレー（運営者判断）

| 論点 | 説明 |
|------|------|
| YouTube / TVer ToS | オーバーレイの契約上の位置づけは各社判断 |
| 製品名の「YT」 | 非公式表明済み。CWS で名称変更を求められたら「Furigana for JP Captions」等を検討 |
| 学習ログ | 端末内のみ。ポップアップでオプトアウト・消去可 |
| GDPR / 児童 | 13 歳未満対象外と記載。EEA は端末内削除＋Issues。DPA 本格対応は未 |
| Render free disk | ライセンスは `YT_FURIGANA_LICENSE_KEYS` で永続化推奨 |

## 技術手順

```bash
npm test && npm run build && npm run pack:store
# → dist-store/yt-furigana-extension.zip
```
