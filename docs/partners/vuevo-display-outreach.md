# VUEVO Display × ふりがな読みAPI — 連携のご提案

**宛先:** ピクシーダストテクノロジーズ株式会社 / VUEVO Display ご担当者様  
**日付:** 2026-07-26  
**提案者:** Blackphi6（OSS「YT Furigana」メンテナー）  
**返信窓口:** GitHub Issues https://github.com/Blackphi6/yt-furigana-extension/issues  
**製品サイト:** https://blackphi6.github.io/yt-furigana-extension/  
**ソース:** https://github.com/Blackphi6/yt-furigana-extension  
**公開読みAPI:** https://yt-furigana-readings.onrender.com  

---

## 1. ご提案の要点（30秒）

VUEVO Display はマイク音声をクラウドで文字起こし・翻訳し、画面に字幕表示する構成です。  
**画面上の日本語テキストに「漢字へふりがな（ルビ）を付与する」機能**を、既存のクラウド処理パイプラインに1ステップ追加する形で実現できます。

弊プロジェクトの **公開読みAPI**（`POST /v1/readings`）は、すでにクラウド上で稼働しており、字幕テキストを送ると候補制約型の高精度な読み（ふりがな）を返します。  
読み上げ（TTS）ではなく、**表示用テキストへのルビ付与**が本提案の範囲です。

## 2. 想定ユースケース

| 現場 | 価値 |
|------|------|
| 窓口・受付 / 案内所 | 漢字が難しい来訪者・子ども・日本語学習者にも字幕が読める |
| 聴覚障がい・難聴者向け情報保障 | 字幕の「見える化」に加え、読みまで見える |
| インバウンド＋日本語併記 | 翻訳と併用し、日本語側の可読性を上げる |
| 学校・福祉・公共 | 平易表示オプションとして差別化 |

※ VUEVO の強み（リアルタイム字幕・翻訳・両面ディスプレイ）はそのまま活かし、**日本語可読性レイヤ**だけを足す提案です。

## 3. 技術的な組み込みイメージ

```
マイク → VUEVO クラウド（音声認識・翻訳）
       → 【追加】読みAPIへ日本語字幕テキストをPOST
       → ルビ付きHTML / span配列を受信
       → 既存ディスプレイ描画
```

- **入力:** いま画面に出す予定の日本語文字列（短文・発話単位で可）
- **出力例:** トークンごとの `surface` / `reading` / `confidence` / `candidates`
- **制約:** 読みは候補ラティス内のみ（幻覚的な自由生成読みを構造的に抑制）
- **失敗時:** ルビなし本文のまま表示（劣化耐性）

### エンドポイント（公開デモ）

```http
POST https://yt-furigana-readings.onrender.com/v1/readings
Content-Type: application/json

{"text":"永遠の愛と市場規模"}
```

応答（要約）: `永遠→とわ`（文脈cue）、`市場→しじょう` など。

デモUI: https://blackphi6.github.io/yt-furigana-extension/  
技術概要: https://github.com/Blackphi6/yt-furigana-extension/blob/main/docs/READING-PIPELINE.md  
プライバシー: https://blackphi6.github.io/yt-furigana-extension/privacy.html  

### 本番向けオプション

1. **公開APIの利用**（検証・PoC）— 無料枠のためスリープ／レート制限あり  
2. **貴社クラウド内へのセルフホスト**（推奨）— Docker イメージあり。字幕本文を外部に出さない  
3. **専用インスタンス＋APIキー** — 商用SLA・鍵認証・専用URL

## 4. お願いしたいこと

1. 技術・プロダクト担当への本提案の転送  
2. **15〜30分のオンライン技術ヒアリング**（PoCの可否・セキュリティ要件の確認）  
3. 可能であれば、字幕テキストがクラウド内で扱われる箇所の概略共有（外部API呼び出しポイントの特定）

商用条件・ライセンス・NDA は貴社方針に合わせて柔軟に対応します。OSS本体は MIT。読みエンジンのクラウド運用形態は相談可能です。

## 5. フォーム送信用・短文（コピペ用）

```
【ご提案】VUEVO Display の日本語字幕へ「ふりがな（ルビ）」付与のご相談

ピクシーダストテクノロジーズ株式会社
VUEVO Display ご担当者様

突然のご連絡失礼いたします。OSS「YT Furigana」を開発している Blackphi6 と申します。

貴社 VUEVO Display は、音声をクラウドで文字起こし・翻訳し字幕表示する製品と理解しております（読み上げ機能ではなく、表示が主機能である点も把握しています）。
つきましては、クラウド側で生成された日本語テキストに対し、漢字へふりがなを付与する機能の技術連携をご相談したくご連絡しました。

当社（個人OSS）では候補制約型の公開読みAPIを提供しており、字幕テキストをPOSTすると高精度な読みを返せます。
貴社クラウドのテキスト処理パイプラインに外部API呼び出し、または貴社環境へのセルフホスト組み込みで実現可能と考えています。

■ デモ / 製品
https://blackphi6.github.io/yt-furigana-extension/
https://github.com/Blackphi6/yt-furigana-extension

■ 読みAPI（PoC用）
POST https://yt-furigana-readings.onrender.com/v1/readings
例: {"text":"永遠の愛と市場規模"}

■ お願い
・技術/プロダクト担当への転送
・PoC可否についての短時間MTG

用途想定: 聴覚障がい・難聴者向け情報保障、および日本語可読性の向上（子ども・学習者・窓口など）
導入検討というより、機能提携・技術検証のご相談です。

何卒ご検討のほど、よろしくお願いいたします。
```

## 6. 連絡チャネル（実施チェックリスト）

| # | チャネル | URL | 状態 |
|---|----------|-----|------|
| 1 | VUEVO Display 専用フォーム | https://form.vuevo.net/display_contact | 本文準備済・送信は連絡先入力待ち |
| 2 | 会社CONTACT | https://pixiedusttech.com/ja/contact | 同文で併送可 |
| 3 | 本リポ Issue（公開記録） | GitHub Issues | 作成する |
| 4 | X（@pixiedusttech） | https://x.com/pixiedusttech | 認証があればメンション可 |

---

本ドキュメントは提携の意思表明であり、両製品の提携・後援・互換を既成事実として示すものではありません。
