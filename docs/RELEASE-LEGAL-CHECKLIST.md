# Chrome Web Store / リリース前チェック（法務・プライバシー）

最終更新: 2026-07-16  
**法的助言ではありません。** ストア審査・各国法の最終判断は運営者自身（必要なら弁護士）で行ってください。

## コード側で整えたこと（このリポジトリ）

| 項目 | 状態 |
|------|------|
| Free 既定で開発者サーバーへ字幕を送らない | 実装どおり |
| 広告・トラッキング SDK なし | 実装どおり |
| リモートコード実行なし（MV3 / 静的バンドル） | 実装どおり |
| ライセンスキー・読み API キーは `chrome.storage.local`（sync 非同期） | `settings-storage.js` |
| 学習ログ（字幕断片・URL）は端末内のみ・自動蓄積をポリシー／UI に明記 | PRIVACY / popup |
| 帰属: kuromoji / IPADIC / NEologd / Sudachi / BudouX / CMUdict | NOTICE / COPYING / licenses / pack の `third_party/` |
| ストア zip に `third_party/`・LICENSE・NOTICE・COPYING を同梱 | `npm run pack:store` |

## CWS ダッシュボードで必ず自分で入力すること

### Privacy practices（単一用途・データ利用）

想定回答のたたき台（実際の実装に合わせて確認）:

1. **単一用途**  
   YouTube / TVer の日本語字幕にふりがな（ルビ）を表示する。
2. **収集するユーザーデータ**  
   - 既定: 開発者へは送信しない。端末内に設定・辞書・学習ログ（字幕断片・ページ URL）を保存。  
   - 任意: ユーザーが読み API / Ollama / Premium 同期を有効にした場合のみ、指定先へ字幕テキストや辞書・ライセンスキーを送信。
3. **リモートコードの使用** → **No**
4. **販売・広告目的でのユーザーデータの利用** → **No**（広告なし）
5. **プライバシーポリシー URL**  
   `https://blackphi6.github.io/yt-furigana-extension/privacy.html`  
   （GitHub Pages をデプロイ済みであること）
6. **権限の正当化（審査コメント用）**  
   - `storage`: 設定・辞書・学習ログ  
   - `host` YouTube / TVer: 字幕 DOM へのルビ重ね  
   - `localhost` Ollama: 任意ローカル LLM  
   - `optional_host_permissions` http(s): ユーザー指定の読み API / Premium 同期のみ  
   - `declarativeNetRequest*`: Ollama 向け CORS 緩和ルール

### 掲載前の手動確認

- [ ] GitHub Pages の privacy / terms / pricing が最新（ローカル `site/` を push・デプロイ）
- [ ] ストア説明文に「字幕は端末内解析」「任意で外部 API」を明記
- [ ] スクリーンショットはプレースホルダではなく実画面（`store/screenshots`）
- [ ] アイコン・名称・説明が他社商標を過度に暗示しない（YouTube / TVer は「対応サイト」として事実記載）
- [ ] Premium / Stripe を公開する場合: 返金・キャンセル・サポート連絡先を pricing / terms に記載
- [ ] 旧 zip や `.env` / 秘密鍵を zip に入れていないこと（`pack:store` の INCLUDE のみ）

## 法的に「グレー／運営者判断」な点（コードでは解消できない）

| 論点 | 説明 |
|------|------|
| YouTube / TVer 利用規約 | クライアント側オーバーレイは一般的だが、各 ToS 違反リスクは利用者・運営の判断。TERMS で利用者責任を明記済み。 |
| 字幕テキストの著作権 | 再配布サービスではないと TERMS に明記。学習ログの書き出しはユーザー操作。開発者がユーザーの inbox を集める仕組みは既定にない。 |
| 学習ログの自動蓄積 | 端末内のみだが「収集」に該当しうる → ポリシーと popup で開示済み。オプトアウトが必要なら別途 UI 追加を検討。 |
| Premium 決済（Stripe） | PCI は Stripe 側。自前サーバーのライセンス発行・メールは別途 DP / 利用規約が必要。 |
| 子ども・GDPR / 個人情報保護法 | 13 歳未満対象外と記載。EEA 向け本格対応（DPA・同意 UI）は未実装 → EU 大規模配布なら追加検討。 |
| optional `http://*/*` `https://*/*` | CWS で「広い権限」として説明を求められることがある。説明文で「ユーザー指定 URL のみ」と書く。 |

## リリース手順（技術）

```bash
npm test
npm run build
npm run pack:store
# → dist-store/yt-furigana-extension.zip
```

Pages を更新する場合は `site/` をデプロイしてから CWS のポリシー URL を確認する。
