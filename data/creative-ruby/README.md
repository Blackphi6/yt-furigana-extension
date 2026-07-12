# Creative ruby lane

Standard dictionaries do not teach 氷菓→あいす. That reading exists in novels/lyrics
and is easy to *find* via Google — but SERP snippets are not a clean training corpus
(copyright, noise, no structured pairs).

## What works

1. **Seed dict** (`seed.jsonl`) — curated high-signal pairs + cue words
2. **Harvest** from files you already have with `《》` or `<ruby>`:

```bash
npm run harvest-ruby -- path/to/lyrics.txt >> data/creative-ruby/harvested.jsonl
npm run harvest-ruby -- --html page.html >> data/creative-ruby/harvested.jsonl
```

3. Community PRs / user dict in the extension (same lane)

## What does not

Scraping Google result pages for training data. Hits prove demand; they are not labels.
