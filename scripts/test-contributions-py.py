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
os.environ["YT_FURIGANA_CONTRIB_COOLDOWN_SEC"] = "0"

from reading_engine import contributions as contrib  # noqa: E402


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        data = Path(tmp)
        contrib.DATA_DIR = data
        contrib.CONTRIBUTIONS_FILE = data / "contributions.jsonl"
        contrib.SHARED_READINGS_FILE = data / "shared-readings.json"
        contrib.CURATED_FILE = data / "shared-readings-curated.json"
        contrib.DEFAULT_SEED_PATH = data / "missing-seed.json"
        contrib._recent_votes.clear()

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
            "何故", "なぜ", context_left="ああ", context_right="いい"
        )
        # same IP spam does not multiply unique votes
        contrib.append_contribution(entry, client_ip="10.0.0.1")
        contrib.append_contribution(entry, client_ip="10.0.0.1")
        contrib.append_contribution(entry, client_ip="10.0.0.1")
        pack = contrib.rebuild_shared_readings()
        assert "何故" not in pack["entries"], "need 2 unique voters"

        contrib.append_contribution(entry, client_ip="10.0.0.2")
        pack2 = contrib.rebuild_shared_readings()
        assert pack2["entries"].get("何故") == "なぜ"

        # competing reading with fewer unique voters loses
        other = contrib.validate_contribution("何故", "なにゆえ")
        contrib.append_contribution(other, client_ip="10.0.0.3")
        pack3 = contrib.rebuild_shared_readings()
        assert pack3["entries"].get("何故") == "なぜ"

        # threshold=1 accepts single unique voter for new surface
        solo = contrib.validate_contribution("夏日", "なつび")
        contrib.append_contribution(solo, client_ip="10.0.0.9")
        pack4 = contrib.rebuild_shared_readings(threshold=1)
        assert pack4["entries"].get("夏日") == "なつび"

        # curated seed fills gaps; curated wins over votes on same surface
        result = contrib.merge_curated_entries({"故郷": "ふるさと", "何故": "なにゆえ"})
        assert result["ok"] is True
        pack5 = contrib.get_shared_readings_pack()
        assert pack5["entries"].get("故郷") == "ふるさと"
        assert pack5["entries"].get("何故") == "なにゆえ", "curated beats votes"

        # cooldown rejects rapid same voter+surface
        os.environ["YT_FURIGANA_CONTRIB_COOLDOWN_SEC"] = "60"
        contrib._recent_votes.clear()
        cool = contrib.validate_contribution("直書き", "じかがき")
        contrib.append_contribution(cool, client_ip="10.0.0.8")
        try:
            contrib.append_contribution(cool, client_ip="10.0.0.8")
            raise SystemExit("cooldown should fire")
        except ValueError as exc:
            assert str(exc) == "vote_cooldown"
        os.environ["YT_FURIGANA_CONTRIB_COOLDOWN_SEC"] = "0"

    print("contributions python tests passed.")


if __name__ == "__main__":
    main()
