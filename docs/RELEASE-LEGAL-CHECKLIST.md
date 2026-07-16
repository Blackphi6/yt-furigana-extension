# Chrome Web Store / リリース前チェック（法務・プライバシー）

最終更新: 2026-07-16  
**法的助言ではありません。** ストア審査・各国法の最終判断は運営者自身（必要なら弁護士）で行ってください。

索引: [`TRADEMARK-AND-ATTRIBUTION.md`](TRADEMARK-AND-ATTRIBUTION.md)

## コード・文書側で整えたこと

| カテゴリ | 項目 | 状態 |
|----------|------|------|
| プライバシー | Free 既定で開発者サーバーへ字幕を送らない | 実装どおり |
| プライバシー | 秘密キーは `chrome.storage.local` | `settings-storage.js` |
| プライバシー | 学習ログの端末内自動蓄積を開示 | PRIVACY / popup |
| セキュリティ | 広告・トラッキング SDK なし | 実装どおり |
| セキュリティ | リモートコード実行なし（MV3） | 実装どおり |
| OSS 帰属 | kuromoji / IPADIC / NEologd / Sudachi / BudouX / CMUdict | NOTICE / COPYING / licenses |
| 配布物 | store zip に `third_party/`・LICENSE・NOTICE・COPYING | `pack:store` |
| 商標 | 非公式表明（manifest / popup / site / store 文面） | 済 |
| 商標 | 「YT」≠ YouTube の明記 | TERMS / site フッター / popup |
| 商標 | 第三者製品名の提携暗示を除去（例: 旧 JRM 表記） | 済 |
| コンテンツ | 再配布しない・歌詞スクレイピング禁止 | TERMS / CONTRIBUTING |
| データ | JMdict / Wiktionary SA を英カタカナに使わない | ENGLISH-KATAKANA.md |
| サイト | Google Fonts 利用の注記（拡張本体とは別） | privacy / 各ページフッター |

## 自動監査コマンド（リリース前）

```bash
# 第三者製品名・旧表記が残っていないか
rg -i 'JRM|jrm|2-38|ja\.2-38|jrm-demo|同系統|公式機能|SecurData|説明文エディタ' \
  --glob '!{.agents,node_modules,dist,dist-store}/**'

npm test
npm run build
npm run pack:store
```

## CWS ダッシュボード

### Privacy practices

1. **単一用途** — YouTube / TVer の日本語字幕にふりがな（ルビ）を表示（**非公式**）。
2. **データ** — 既定は端末内のみ。任意で読み API / Ollama / Premium 同期。
3. **リモートコード** → No
4. **データ販売・広告** → No
5. **ポリシー URL** — `https://blackphi6.github.io/yt-furigana-extension/privacy.html`

### 審査コメント用（英語）

```text
Unofficial accessibility tool for Japanese captions on YouTube and TVer.
"YT" in the product name is not a YouTube trademark.
No affiliation with Google, YouTube, or TVer.
Default processing is local; remote APIs only when the user configures them.
```

### 掲載前チェック

- [ ] Pages 最新（`site/` push → Actions）
- [ ] ストア説明に **非公式**・端末内解析・任意 API
- [ ] 製品名「YT Furigana」が YouTube 公式と誤認されない説明
- [ ] スクリーンショット実画面
- [ ] アイコンが YouTube ロゴに似ていない
- [ ] Premium / Stripe 返金・サポート連絡先
- [ ] zip に `.env` / 秘密鍵なし

## 残るグレー（運営者判断）

| 論点 | 説明 |
|------|------|
| YouTube / TVer ToS | オーバーレイの契約上の位置づけは各社判断 |
| 製品名の「YT」 | 非公式表明済み。CWS で名称変更を求められたら「Furigana for JP Captions」等を検討 |
| 学習ログ | 端末内のみだが開示対象。オプトアウト UI は未実装 |
| GDPR / 児童 | 13 歳未満対象外と記載。EEA 本格対応は未実装 |

## 技術手順

```bash
npm test && npm run build && npm run pack:store
# → dist-store/yt-furigana-extension.zip
```
