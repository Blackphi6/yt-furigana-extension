#!/usr/bin/env python3
"""Unit tests for anonymous contributions aggregation."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reading-engine"
sys.path.insert(0, str(ROOT))

os.environ["YT_FURIGANA_CONTRIB_MIN_VOTES"] = "2"

from reading_engine import contributions as contrib  # noqa: E402


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        data = Path(tmp)
        contrib.DATA_DIR = data
        contrib.CONTRIBUTIONS_FILE = data / "contributions.jsonl"
        contrib.SHARED_READINGS_FILE = data / "shared-readings.json"
        contrib.CURATED_FILE = data / "shared-readings-curated.json"
        contrib.DEFAULT_SEED_PATH = data / "missing-seed.json"

        try:
            contrib.validate_contribution("", "あ")
            raise SystemExit("empty surface should fail")
        except ValueError:
            pass

        try:
            contrib.validate_contribution("abc", "あ")
            raise SystemExit("latin surface should fail")
        except ValueError:
            pass

        entry = contrib.validate_contribution(
            "何故", "なぜ", "今日は", "か分から"
        )
        assert entry["surface"] == "何故"
        assert entry["reading"] == "なぜ"
        assert entry["contextLeft"] == "今日は"
        assert entry["contextRight"] == "か分から"

        contrib.append_contribution(entry)
        pack1 = contrib.get_shared_readings_pack()
        assert "何故" not in pack1["entries"], "need 2 votes by default"

        contrib.append_contribution(entry)
        pack2 = contrib.get_shared_readings_pack()
        assert pack2["entries"].get("何故") == "なぜ"

        # competing reading with fewer votes loses
        other = contrib.validate_contribution("何故", "なにゆえ")
        contrib.append_contribution(other)
        pack3 = contrib.rebuild_shared_readings()
        assert pack3["entries"].get("何故") == "なぜ"

        # threshold=1 accepts single vote for new surface
        solo = contrib.validate_contribution("夏日", "なつび")
        contrib.append_contribution(solo)
        pack4 = contrib.rebuild_shared_readings(threshold=1)
        assert pack4["entries"].get("夏日") == "なつび"

        # curated seed fills gaps; curated wins over votes on same surface
        result = contrib.merge_curated_entries({"故郷": "ふるさと", "何故": "なにゆえ"})
        assert result["ok"] is True
        pack5 = contrib.get_shared_readings_pack()
        assert pack5["entries"].get("故郷") == "ふるさと"
        assert pack5["entries"].get("何故") == "なにゆえ", "curated beats votes"

    print("contributions python tests passed.")


if __name__ == "__main__":
    main()
