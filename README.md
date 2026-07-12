# YT Furigana

YouTube / TVer の日本語字幕にひらがなルビを表示する Chrome 拡張です。

> **重要（権利・免責）**  
> 本拡張は、ブラウザ上で表示中の字幕にルビを重ねるクライアント側の表示加工です。字幕・歌詞などの著作権は各権利者に帰属します。再配布サービスではありません。  
> ご利用前に [利用条件・免責](docs/TERMS.md) と [プライバシーポリシー](docs/PRIVACY.md) を確認してください。OSS 帰属は [オープンソースライセンス](docs/OPEN-SOURCE-LICENSES.md) / [NOTICE](NOTICE) を参照。

## ビジネスモデル（Freemium）

- **Free（既定）**: 完全ローカル（Kuromoji / Sudachi / Hybrid）。クリックで読み学習。クラウド送信なし。
- **Premium**: 辞書の端末間同期・共有辞書・ホスト読みAPI。
- **支援**: [GitHub Sponsors](https://github.com/sponsors/Blackphi6)

詳細は [docs/FREEMIUM.md](docs/FREEMIUM.md)。

## セットアップ

```bash
npm install
npm run build
```

`chrome://extensions/` → デベロッパーモード → このフォルダを読み込み。

## 使い方

1. YouTube / TVer で日本語字幕を表示
2. 漢字の上にルビが付く
3. 漢字を押すと読み候補 → 端末内に学習
4. ポップアップでエンジン / Premium / ライセンス表記 / Sponsors

## ローカル読みエンジン（任意）

```bash
python3 -m venv .venv-reading
.venv-reading/bin/pip install -r reading-engine/requirements.txt
npm run reading-engine
```

Premium デモキー: `ytfp_live_demo_key_001`（サーバー起動時に自動作成）

## 開発

```bash
npm test
npm run watch
```

貢献は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## 文書一覧

| 文書 | リンク |
|------|--------|
| 利用条件・免責 | [docs/TERMS.md](docs/TERMS.md) |
| プライバシー | [docs/PRIVACY.md](docs/PRIVACY.md) |
| OSS ライセンス | [docs/OPEN-SOURCE-LICENSES.md](docs/OPEN-SOURCE-LICENSES.md) |
| Freemium | [docs/FREEMIUM.md](docs/FREEMIUM.md) |
| セキュリティ | [SECURITY.md](SECURITY.md) |
| ドキュメント索引 | [docs/README.md](docs/README.md) |

## ライセンス

本プロジェクトは **MIT License** です。全文は [`LICENSE`](LICENSE) を参照してください。

第三者ソフトウェア・辞書の帰属:

- [`NOTICE`](NOTICE) — 要約
- [`third_party/`](third_party/) — Apache-2.0 全文 / kuromoji（IPADIC）NOTICE
- 拡張ポップアップの「ライセンス / 帰属表示」→ `licenses/licenses.html`

| 成果物 | ライセンス |
|--------|------------|
| kuromoji.js | Apache-2.0 |
| mecab-ipadic（同梱データ） | NAIST / ICOT 条件付き |
| sudachi-wasm333 / SudachiDict | Apache-2.0 |
