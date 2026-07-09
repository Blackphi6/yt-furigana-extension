# YT Furigana

YouTubeの日本語字幕にひらがなのルビを表示するChrome拡張機能です。

## 機能

- YouTube動画の日本語字幕に `<ruby>` タグでひらがなルビを表示
- **ローカル LLM（Ollama）** — 軽量モデルで文脈理解（例: 一組目→ひとくみめ）
- **Kuromoji** — 辞書ベースのフォールバック（Ollama未起動時）
- 字幕トランスクリプトにも対応
- ポップアップからエンジン切り替え・接続テスト

## 技術スタック

- **Ollama** + 軽量モデル（`qwen2.5:1.5b` 推奨）
- **Kuromoji**（オフラインフォールバック）
- Chrome Extension Manifest V3

## セットアップ

### 1. Ollama をインストール

[ollama.com](https://ollama.com) からインストールし、軽量モデルを取得:

```bash
ollama pull qwen2.5:1.5b
```

より軽くしたい場合: `qwen2.5:0.5b`  
精度優先の場合: `qwen2.5:3b`

### 2. 拡張機能をビルド

```bash
npm install
npm run build
```

### 3. Chrome に読み込み

`chrome://extensions/` → デベロッパーモード → このフォルダを読み込み

### 4. 接続確認

拡張機能ポップアップで「接続テスト」を押し、Ollama への接続を確認

## Chrome への読み込み

1. `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」
4. このプロジェクトのルートフォルダ（`manifest.json` がある場所）を選択

## 使い方

1. YouTubeで動画を開く
2. 字幕を日本語で表示する
3. 漢字の上にひらがなのルビが自動で表示されます
4. 拡張機能アイコンから表示のオン/オフを切り替えられます

## 開発

```bash
npm run watch
```

ファイル変更後、Chrome拡張機能ページで「更新」ボタンを押してください。

## ライセンス

MIT
