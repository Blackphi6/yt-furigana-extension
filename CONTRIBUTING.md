# Contributing

Thanks for contributing to YT Furigana.

## License of contributions

By submitting a pull request or other contribution, you agree that your contribution is provided under the MIT License (same as this repository), and that you have the right to submit it.

Do **not** contribute:

- Copyrighted lyrics/subtitle dumps scraped for redistribution
- Proprietary dictionary data you are not allowed to relicense
- Secrets, API keys, or personal data
- Wording that implies endorsement by YouTube, TVer, Google, or other third-party brands
- Third-party **product or service names** used as if this project were official, affiliated, or “compatible with” that brand in user-facing text

See `docs/TRADEMARK-AND-ATTRIBUTION.md` and `docs/TERMS.md`.

## Development

```bash
npm install
npm test
npm run build
```

See `README.md`, `docs/OPEN-SOURCE-LICENSES.md`, and `docs/TERMS.md`.

## 禁止: YouTube timedtext の連打（429 / 自宅IP制限）

**通常の字幕表示は、ネイティブ字幕DOMへのルビ差し込みだけにすること。**  
` /api/timedtext ` や page-caption-bridge / 字幕プリフェッチを、起動時や再生ループで自動連打しない。

開発中の連打で YouTube が回線IPを一時制限すると、拡張OFFでも Wi‑Fi 上の全端末で本体字幕が出なくなる（モバイル回線では出る）。公式の解除手段はなく、復旧は待ちか別IPのみ。IPoE ではIPを変えにくい。

詳細・エージェント向け拘束は `.cursor/rules/youtube-timedtext-429.mdc` を参照。
