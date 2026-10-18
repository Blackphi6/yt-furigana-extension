"""読み推定 v2 の規則表（拡張の furigana-ruby-engine と共有）。

packages/furigana-ruby-engine/rules/v2-rules.json を読む。拡張（JS）も同じファイルを読むので、
固定句・文脈の手がかり・人名の手がかり・接尾語の誤読は片方だけ直すことがない。
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from reading_engine.personal_names import REPO_ROOT

V2_RULES_JSON = REPO_ROOT / "packages" / "furigana-ruby-engine" / "rules" / "v2-rules.json"


@lru_cache(maxsize=1)
def load_v2_rules() -> dict[str, Any]:
    if not V2_RULES_JSON.is_file():
        return {"nameCues": [], "falseSuffixReadings": {}, "phrases": {}, "contextRules": []}
    return json.loads(Path(V2_RULES_JSON).read_text(encoding="utf-8"))
