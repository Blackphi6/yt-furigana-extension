# YT Furigana local reading engine (JRM-compatible)

Local-first reading API for the Chrome extension. No cloud fee.

## Research notes (2026-07)

| Option | Status | Notes |
|--------|--------|-------|
| **JRM** (2-38.com) | Closed weights | Strong; API/commercial |
| **Yomikata** | Open (~94%, 130 heteronyms) | Pins `torch==1.13.1` — hard on modern macOS ARM |
| **ModernBERT-Ja** (SB Intuitions 30m–310m) | Best open encoder base | Needs fine-tune for readings (JRM-style) |
| **llm-jp-modernbert** | Open | Similar; not SOTA over SB Intuitions on JGLUE |

**This MVP** = UniDic lattice + context cue rerank + creative-ruby dict (JRM-shaped API).  
**Next** = fine-tune `sbintuitions/modernbert-ja-30m` on NDL + synthetic (see `train/README.md`).

Creative ruby (氷菓→あいす) is a separate lane: seed dict + harvest from structured ruby HTML / `《》` text — not Google SERP dumps.

## Freemium endpoints

| Path | Auth | Notes |
|------|------|-------|
| `POST /v1/readings` | optional | Set `YT_FURIGANA_API_KEYS` to require Bearer |
| `POST /v1/license/verify` | license in body | Activates Premium in the extension |
| `GET/PUT /v1/dict/sync` | Bearer license | Per-license user dictionary |
| `GET /v1/dict/shared` | Bearer license | Shared pack (何故か / 直書き …) |
| `POST /v1/admin/mint-license` | admin token | `YT_FURIGANA_ADMIN_TOKEN` |

Demo license (auto-created): `ytfp_live_demo_key_001`

See `docs/FREEMIUM.md`.

## License / attribution

This engine is part of YT Furigana (MIT). Third-party notices for UniDic / fugashi etc. are summarized in the repo root `NOTICE` and `docs/OPEN-SOURCE-LICENSES.md`.

## Run

```bash
# from repo root (once)
python3 -m venv .venv-reading
.venv-reading/bin/pip install -r reading-engine/requirements.txt

# run API
npm run reading-engine
# → http://127.0.0.1:8765/v1/readings
```

Extension: engine **読みAPI** → URL `http://127.0.0.1:8765`

```bash
npm run reading-engine:test
curl -s http://127.0.0.1:8765/v1/readings -H 'content-type: application/json' \
  -d '{"text":"夏の木陰に「氷菓」を口に放り込んで"}' | python3 -m json.tool
```
