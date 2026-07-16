# 商標・帰属・第三者コンテンツ（Trademark & Attribution）

最終更新: 2026-07-16  
**法的助言ではありません。**

## 1. 製品名「YT Furigana」

- **「YT」は製品名の略称であり、YouTube および Google の商標・サービス名ではありません。**
- 本拡張は Google / YouTube / TVer の**公式アプリ・公式機能・提携製品ではありません**。
- ストア説明・サイトでは「YouTube / TVer の字幕に対応する**非公式**ツール」と表記します。

## 2. プラットフォーム・サービス名（事実記載のみ）

| 名称 | 用法 | 注意 |
|------|------|------|
| YouTube | 対応サイトとして記載 | ロゴ・公式風デザインを使わない |
| TVer | 対応サイトとして記載 | 同上 |
| Google Chrome / Chrome Web Store | 配布先として記載 | Google 製公式拡張ではない |
| GitHub / GitHub Sponsors | リポジトリ・支援 | GitHub 後援・認定ではない |
| Stripe | Premium 決済（任意） | Stripe 提携サービスではない |
| Ollama | 任意のローカル LLM 接続 | Ollama 公式製品ではない |

## 3. OSS・辞書（帰属必須）

同梱・利用する成果物の一覧とライセンス全文は次を参照:

- [`COPYING`](../COPYING) — 出典・感謝（まずここ）
- [`NOTICE`](../NOTICE) — 第三者帰属要約
- [`docs/OPEN-SOURCE-LICENSES.md`](OPEN-SOURCE-LICENSES.md)
- [`licenses/licenses.html`](../licenses/licenses.html) — 拡張内表示

主な同梱物: kuromoji / IPADIC、NEologd フレーズ抽出、Sudachi、BudouX、CMUdict（英→カタカナ事前変換）など。

**使わないデータ（意図的）:** JMdict、Wiktionary 等の ShareAlike 系を英語カタカナ辞書に使わない（[`docs/ENGLISH-KATAKANA.md`](ENGLISH-KATAKANA.md)）。

## 4. 技術記事・他製品名の参照

- 候補制約型読み付けの設計は、公開技術記事の考え方に**着想を得た独立実装**です（[`docs/READING-PIPELINE.md`](READING-PIPELINE.md)）。
- **第三者の製品名・サービス名を、提携・互換・同系統と誤認させる表現は使いません。**
- 開発者向けコード内でも、UI・ストア・サイトに出る文言は中立表現に統一します。

## 5. 字幕・歌詞・コンテンツ著作権

- 字幕・歌詞・映像の**著作権は各権利者に帰属**します。
- 本拡張は画面上のルビ表示加工のみ。コンテンツの**収集・再配布サービスではありません**。
- 学習ログは既定で端末内のみ。ユーザーが書き出した JSONL を開発者が自動収集する仕組みはありません。
- 歌詞スクレイピング・SERP スクレイピングを学習データにしない（[`data/creative-ruby/README.md`](../data/creative-ruby/README.md)、[`CONTRIBUTING.md`](../CONTRIBUTING.md)）。

## 6. Web サイトのみ（拡張本体とは別）

- [`site/`](../site/) は GitHub Pages 用。表示のため **Google Fonts**（Shippori Mincho、Zen Kaku Gothic New）を読み込むことがあります。
- フォントのライセンスは [Google Fonts](https://fonts.google.com/) 各ファミリーの表記に従います。

## 7. 学習用データ（拡張に同梱しない）

| データ | ライセンス | 用途 |
|--------|------------|------|
| NDL 青空振り仮名 / 書誌振り仮名 | PD / CC BY 4.0 等（上流） | reading-engine 学習のみ |
| 合成コーパス（Groq 等） | オープンウェイト生成＋自前ゲート | 学習のみ |

詳細: [`reading-engine/train/README.md`](../reading-engine/train/README.md)

## 8. リリース前チェック（要約）

- [ ] ストア・manifest・サイトに **非公式** 表明がある
- [ ] 第三者製品名の**借用・提携暗示**が UI にない
- [ ] `NOTICE` / `third_party/` が store zip に入る（`npm run pack:store`）
- [ ] プライバシー URL が最新
- [ ] アイコンが YouTube ロゴに似ていない

詳細: [`docs/RELEASE-LEGAL-CHECKLIST.md`](RELEASE-LEGAL-CHECKLIST.md)
