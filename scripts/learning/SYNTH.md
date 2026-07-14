# LLM synth (open-weight only)

Generate → blind verify → arbitrate across **three model families**,
then accept only labels that:

1. pass Sudachi **token-boundary** gate
2. agree with the intended gold via verifier or arbitrator

## Hardware profile (this repo default)

MacBook Pro **M3 Pro / 36GB** unified memory.

| Role | Model | RAM (approx) |
|------|-------|--------------|
| generate | `gpt-oss:20b` | ~13 GB |
| verify | `qwen2.5:14b` | ~9 GB |
| arbitrate | `gemma4:e4b` | ~10 GB |

`--fast` swaps verify/arbitrate to `qwen2.5-coder:7b` + `gemma3:4b`.

Never load all three at once (`keep_alive: 0`).

## Commands

```bash
# need Ollama running
ollama serve   # if not already

npm run learn:synth:dry
npm run learn:synth:fast -- --limit 2 --per-target 2
npm run learn:synth
```

Outputs (gitignored):

- `data/learning/synth-accepted.jsonl`
- `data/learning/synth-rejected.jsonl`
- `data/learning/synth-log.jsonl`

Accepted rows are merged as modern-domain seed when you run `npm run learn:ndl-build`.
