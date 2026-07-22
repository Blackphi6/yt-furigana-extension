# YT Furigana

YouTube / TVer の日本語字幕にひらがなルビを表示する Chrome 拡張です（非公式・各社とは無関係）。

字幕・歌詞などの著作権は各権利者に帰属します。本拡張は画面上の表示加工であり、コンテンツの再配布を目的としません。

**商標:** YouTube、TVer、Google Chrome は各社の商標です。**「YT」は製品名の略称であり、YouTube の商標ではありません。** Kuromoji、Sudachi、NEologd 等は各プロジェクトの名称です。詳細は [`docs/TRADEMARK-AND-ATTRIBUTION.md`](docs/TRADEMARK-AND-ATTRIBUTION.md)。

**サイト**: https://blackphi6.github.io/yt-furigana-extension/  
**インストール**: https://blackphi6.github.io/yt-furigana-extension/install.html  
**料金 / Premium**: https://blackphi6.github.io/yt-furigana-extension/pricing.html  
**プライバシー**: https://blackphi6.github.io/yt-furigana-extension/privacy.html  
**リリース状態**: [docs/RELEASE.md](docs/RELEASE.md)

## 機能

- **Free（既定）**: 端末内の読み付け（標準 / Hybrid）。クリック学習。みんなの読みパック受信（オフ可）
- **Premium（任意）**: 読み辞書の端末間同期・サーバー共有辞書 — [docs/FREEMIUM.md](docs/FREEMIUM.md)
- **支援**: [GitHub Sponsors](https://github.com/sponsors/Blackphi6)

## セットアップ

```bash
npm install
npm run build
```

`chrome://extensions/` → デベロッパーモード → このフォルダを読み込み。

Chrome Web Store 用 zip:

```bash
npm run pack:store
# → dist-store/yt-furigana-extension.zip
# 説明文・チェックリスト: store/listing.md
```

## 使い方

1. YouTube / TVer で日本語字幕を表示
2. 漢字の上にルビが付く
3. 漢字を押すと読み候補 → 端末内に学習

## ローカル読みエンジン（任意）

```bash
python3 -m venv .venv-reading
.venv-reading/bin/pip install -r reading-engine/requirements.txt
npm run reading-engine
```

Stripe 未設定時は Checkout が dry-run でライセンスを即発行します。

## 開発

```bash
npm test
npm run watch
```

## ライセンス

本プロジェクトのソースは **MIT License** です。  
辞書・形態素解析器などの第三者成果物の出典と条件は、NEologd と同様に次を参照してください。

- [COPYING](COPYING) — 出典一覧・感謝・無保証（まずここ）
- [LICENSE](LICENSE) — MIT 全文
- [NOTICE](NOTICE) / [third_party/](third_party/) — Apache-2.0・IPADIC 等

プライバシー等の補足文書: [docs/](docs/README.md)
