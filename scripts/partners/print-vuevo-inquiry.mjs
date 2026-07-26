#!/usr/bin/env node
/**
 * VUEVO Display お問い合わせ用の本文を標準出力する。
 * 使い方: node scripts/partners/print-vuevo-inquiry.mjs
 */
const body = `【ご提案】VUEVO Display の日本語字幕へ「ふりがな（ルビ）」付与のご相談

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

■ 技術ブリーフ（英語・短文）
https://github.com/Blackphi6/yt-furigana-extension/blob/main/docs/partners/reading-api-integration-brief.md

■ お願い
・技術/プロダクト担当への転送
・PoC可否についての短時間MTG

用途想定: 聴覚障がい・難聴者向け情報保障、および日本語可読性の向上（子ども・学習者・窓口など）
導入検討というより、機能提携・技術検証のご相談です。

何卒ご検討のほど、よろしくお願いいたします。`;

console.log(body);
