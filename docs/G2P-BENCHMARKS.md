# 公開 G2P / ふりがなベンチマーク

外部向けに「ふりがなエンジンがどれだけ読めるか」を数値で示すための評価メモ。  
再現: `npm run eval:g2p`（結果 JSON: `data/eval/public-g2p-bench-latest.json`）

## 重要: 何を比較しているか

| 指標 | 意味 | 注意 |
|------|------|------|
| **対象漢字の読み一致** | 文中の target に期待読みが付いたか | TTS 音声判定とは別モダリティ |
| **全文かな CER / KER** | 文全体をかな化したときの文字誤り率 | OpenJTalk / Haqumei の KER と近いが正規化差あり |
| **内部ゲート** | seed / hard / easy | 製品回帰用。公開リーダーボードではない |

[ja-tts-g2p-bench](https://github.com/filmapp/ja-tts-g2p-bench) の公開 TTS 正解率（Gemini 80% 等）は **合成音声を teacher-forcing で採点**したもの。本リポジトリは **テキスト側のルビ読み**。並べるときは必ず「text-side」と明記する。解説記事: [Zenn](https://zenn.dev/tellernovel_inc/articles/ja-tts-g2p-benchmark)。

### Parayomi からパクった仕組み / パクっていないもの

参照: [Zenn](https://zenn.dev/parakeet_tech/articles/936532be817118) / [HF Space](https://huggingface.co/spaces/Parakeet-Inc/Parayomi)

**パクった（公開されている評価思想・デモ）**

- 文脈依存の同形異音看板文（人気・上手×3・金・表・角・弾・何人・紅葉）
- 多数派既定＋少数派は cue のみ（私／尊い／街／上手 など）
- 常用漢字付表（熟字訓）フレーズ
- JKYB-Parakeet 失敗ランキング → cue 収穫（`npm run learn:promote-parakeet-ranked`）
- agent-debate の GapFinder で Parayomi 表層を優先

**パクっていない**

- Parayomi 本体のニューラル重み・学習コード（非公開）
- HF Space への常時 API 依存

```bash
node scripts/test-parayomi-examples.mjs
npm run learn:promote-parakeet-ranked -- --top=30 --apply
```

## 調査で拾ったデータセット

| データセット | 規模 | ライセンス | 本 eval | 備考 |
|--------------|------|------------|---------|------|
| [filmapp/ja-tts-g2p-bench](https://github.com/filmapp/ja-tts-g2p-bench) | 151 問（採点対象） | MIT | ✅ 本丸 | 同形異音・数字・義訓など 8 カテゴリ |
| [ja-tts-g2p blindspot v1](https://github.com/filmapp/ja-tts-g2p-bench) | 151 問 | MIT | ✅ | LLM 生成の盲点セット（text-side） |
| [YOMI-Bench](https://github.com/benchmark-release/YOMI-Bench) | 377 問 | MIT | ✅ | 語内漢字の複数読み予測（few-shot 0） |
| [sbintuitions/joyo-kanji-yomi-benchmark](https://huggingface.co/datasets/sbintuitions/joyo-kanji-yomi-benchmark) | 13,095 文 / 常用漢字全読み | MIT | ✅ | 漢字レベル。ASR/TTS キットあり |
| [Parakeet-Inc/JKYB-Parakeet](https://huggingface.co/datasets/Parakeet-Inc/joyo-kanji-yomi-benchmark-parakeet) | 13,536 文（修正＋付表） | MIT | ✅ | [Zenn](https://zenn.dev/parakeet_tech/articles/936532be817118)。natural 読みで採点 |
| [CyberAgentAILab/jvs_nonpara_kana](https://github.com/CyberAgentAILab/jvs_nonpara_kana) | 3,000 文 | **CC BY-SA 4.0** | ✅ cache のみ | 拡張に同梱しない。Interspeech 2026 |
| [o24s/japanese-g2p-benchmark](https://github.com/o24s/japanese-g2p-benchmark) | 複合 | code Apache / data SA | 参照 | Haqumei / OpenJTalk の KER 公表値 |
| [passaglia/yomikata](https://github.com/passaglia/yomikata) | 異読み ~130 | MIT | 未同梱 | BERT 異読み特化。比較相手として有用 |
| AJIMEE / JSUT-label / ROHAN / 京大 Wiki 誤入力 | — | 多く SA | 未直接 | o24s 経由の二次利用が現実的 |
| NDL / Aozora ふりがなコーパス | 大規模 | 研究利用中心 | 学習用 | 公開「スコア比較」より学習向け |

ShareAlike のデータは `.cache/eval/` に置き、**数値だけ**をリポジトリに残す。

## 最新結果（ローカル実行）

生成日時は JSON の `generatedAt` を参照。以下は代表値。

### 1. ja-tts-g2p-bench（対象読み一致）

| システム | 正解率 | 備考 |
|----------|--------|------|
| **yt-furigana（Sudachi+phrases+context）** | **72.2%** (109/151) | 95% CI 約 65–79% |
| yt-furigana（Kuromoji+phrases） | 71.5% | |
| Sudachi のみ | 64.2% | |
| Kuromoji のみ | 62.9% | |
| （参考）VOICEVOX / OpenJTalk dict ※音声 | 69.5% | 論文リーダーボード |
| （参考）Gemini 3.1 Flash TTS ※音声 | 80.1% | 同上 |
| （参考）gpt-4o-mini-tts ※音声 | 56.3% | 同上 |

フレーズ辞書 + 文脈読みで Sudachi 単体から **約 +8pt**。text-side では辞書系 TTS（VOICEVOX）帯に並び、クラウド TTS 上位（Gemini）の下。

全文 stim CER（修正後の HTML→かな）は最良で約 **4.2%**。

### 2. Joyo Kanji Yomi（常用漢字・対象漢字読み）

| システム | 正解率（全 13,095 文・元 JKYB） |
|----------|------------------------|
| yt-furigana | **97.0%** (12704/13095) |
| Sudachi のみ | 96.9% (12690/13095) |

常用漢字の「文脈で一意な読み」では辞書ベースが既に強い。差は小さく、**異読みベンチ（ja-tts-g2p）の方が製品差別化が見える**。

### 2b. JKYB-Parakeet（修正＋付表）

先頭 2,000 文（2026-08-13 text-side）。全件は `--joyo-parakeet-limit=13536`。

| システム | 正解率 |
|----------|--------|
| yt-furigana（Sudachi+phrases） | **97.8%** (1956/2000) |
| Sudachi のみ | 97.7% (1954/2000) |

付表（`joyo_appendix_reading`）はこの 2,000 件スライスにほぼ含まれず、差は小さい。Parayomi 99.8% は専用 G2P＋全件で、同列比較しない。

### 3. JVS-nonpara-kana（全文 CER, n=500）

| システム | CER |
|----------|-----|
| yt-furigana Sudachi+phrases | **8.68%** |
| Sudachi のみ | 8.63% |
| fugashi UniDic | 10.10% |

参考: o24s 公表の全文 KER（別正規化・別セット含む）は Haqumei ~1.6%、素の pyopenjtalk ~5%。  
我々は「ルビ用パイプラインの読み連結」なので、専用 G2P（長音・四つ仮名戻し等）より高い CER になりやすい。**字幕ふりがな用途では対象漢字一致の方が説明力が高い。**

### 4. 内部ゲート

seed / hard-heteronym / easy-regression: **すべて 100%**（`npm run learn:gate` と同趣旨）。

## 再現コマンド

```bash
# 既定: JVS 500 + Joyo 2000 + g2p 151 + internal
NODE_OPTIONS=--max-old-space-size=8192 npm run eval:g2p

# 法人名辞書まで載せる（ヒープ大）
NODE_OPTIONS=--max-old-space-size=12288 npm run eval:g2p -- --with-corporate

# Joyo 全件
NODE_OPTIONS=--max-old-space-size=8192 npm run eval:g2p -- --joyo-limit=13095 --skip-internal

# JKYB-Parakeet のみ（site JSON は上書きしない）
NODE_OPTIONS=--max-old-space-size=8192 npm run eval:g2p -- --skip-internal --jvs-limit=0 --joyo-limit=0 --joyo-parakeet-limit=2000 --no-site
```

## 外部説明の言い方（推奨）

- 「公開の文脈依存漢字読みベンチ（ja-tts-g2p-bench）で **text-side 72%**。辞書のみ Sudachi より +8pt。音声ベンチの VOICEVOX 帯に相当」
- 「常用漢字読みベンチ（Joyo）では text-side **97%** 台。Parakeet 改訂版は付表込みで別掲」
- 「TTS デモの耳コピ順位そのものではない。読みの正しさを自動採点した」

## 変更ファイル

- `scripts/eval/run-public-g2p-benches.mjs`
- `data/eval/public-g2p-bench-latest.json`
- `npm run eval:g2p`
