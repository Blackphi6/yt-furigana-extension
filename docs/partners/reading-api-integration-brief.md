# Reading API — Integration brief (for partners)

Minimal contract for adding Japanese furigana (ruby) to caption text.

## Endpoint

`POST /v1/readings`  
Public PoC: `https://yt-furigana-readings.onrender.com/v1/readings`

### Request

```json
{
  "text": "噂が町中に広まった。",
  "return_candidates": true
}
```

Optional: `user_dict` (surface → reading map) for proper nouns.

### Response (shape)

```json
{
  "reading": "うわさげまちじゅうにひろまった",
  "tokens": [
    {
      "surface": "町中",
      "span": [3, 5],
      "reading": "まちじゅう",
      "confidence": 0.95,
      "source": "cue",
      "candidates": ["まちじゅう", "まちなか"]
    }
  ]
}
```

Render with HTML `<ruby>` / `<rt>`, or your own caption compositor using `span` + `reading`.

## Design guarantees

1. Readings stay inside a candidate lattice (no free-form LLM readings as final output).
2. Idioms / high-trust patterns override (e.g. 下手に出る → したて).
3. Low confidence → dictionary base fallback.
4. Failures should fall back to plain caption text (no blank screen).

## Deployment options

| Mode | Where text goes | Notes |
|------|-----------------|-------|
| Public PoC URL | Our Render free tier | Sleep / rate limits; OK for demos |
| Self-host Docker in your VPC | Stays in your cloud | Preferred for production captions |
| Dedicated keyed instance | Our host + Bearer | Commercial ops discussion |

## Links

- Demo: https://blackphi6.github.io/yt-furigana-extension/
- Repo: https://github.com/Blackphi6/yt-furigana-extension
- Pipeline: https://github.com/Blackphi6/yt-furigana-extension/blob/main/docs/READING-PIPELINE.md
- Privacy: https://blackphi6.github.io/yt-furigana-extension/privacy.html

## Contact

GitHub Issues: https://github.com/Blackphi6/yt-furigana-extension/issues  
Maintainer: Blackphi6
