#!/usr/bin/env python3
"""Unit tests for staged demo proposals (not published to Free pack)."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reading-engine"
sys.path.insert(0, str(ROOT))

os.environ["YT_FURIGANA_PROPOSAL_COOLDOWN_SEC"] = "0"
os.environ["YT_FURIGANA_PROPOSAL_LLM"] = "0"
os.environ.pop("GROQ_API_KEY", None)
os.environ.pop("YT_FURIGANA_PROPOSAL_AUTO_CURATE", None)

from reading_engine import contributions as contrib  # noqa: E402
from reading_engine import proposals as prop  # noqa: E402


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        data = Path(tmp)
        contrib.DATA_DIR = data
        contrib.CONTRIBUTIONS_FILE = data / "contributions.jsonl"
        contrib.SHARED_READINGS_FILE = data / "shared-readings.json"
        contrib.CURATED_FILE = data / "shared-readings-curated.json"
        contrib.DEFAULT_SEED_PATH = data / "missing-seed.json"
        prop.PROPOSALS_FILE = data / "proposals.jsonl"
        prop._recent_proposals.clear()

        try:
            prop.validate_proposal_entries([])
            raise SystemExit("empty entries should fail")
        except ValueError as exc:
            assert str(exc) == "entries_required"

        try:
            prop.validate_proposal_entries([{"surface": "abc", "reading": "あ"}])
            raise SystemExit("latin surface should fail")
        except ValueError as exc:
            assert str(exc) == "no_valid_entries"

        entries = prop.validate_proposal_entries(
            [{"surface": "何故", "reading": "なぜ"}, {"surface": "何故", "reading": "なにゆえ"}]
        )
        assert len(entries) == 1
        assert entries[0]["reading"] == "なぜ"

        # heuristic rejects surface==reading
        bad = prop.heuristic_review("あいう", "あいう")
        assert bad["status"] == "rejected"

        ok_h = prop.heuristic_review("何故", "なぜ")
        assert ok_h["ok"] is True

        # stage does NOT publish to shared pack
        result = prop.append_proposals(
            entries, client_ip="10.1.0.1", source="demo", use_llm=False
        )
        assert result["staged"] is True
        assert result["published"] is False
        assert result["summary"]["pending"] == 1

        pack = contrib.rebuild_shared_readings()
        assert "何故" not in pack.get("entries", {}), "proposals must not auto-publish"

        listed = prop.list_proposals(status="pending")
        assert listed["count"] >= 1

        # admin promote after marking accepted
        rows = prop.iter_proposal_rows()
        for row in rows:
            if row.get("surface") == "何故":
                row["status"] = "accepted"
        prop._rewrite_all_rows(rows)

        promoted = prop.promote_accepted_proposals()
        assert promoted["promotedCount"] == 1
        pack2 = contrib.get_shared_readings_pack()
        assert pack2["entries"].get("何故") == "なぜ"

        # cooldown
        os.environ["YT_FURIGANA_PROPOSAL_COOLDOWN_SEC"] = "60"
        prop._recent_proposals.clear()
        more = prop.validate_proposal_entries(
            [{"surface": "夏日", "reading": "なつび"}]
        )
        prop.append_proposals(more, client_ip="10.1.0.2", use_llm=False)
        try:
            prop.append_proposals(more, client_ip="10.1.0.2", use_llm=False)
            raise SystemExit("proposal_cooldown should fire")
        except ValueError as exc:
            assert str(exc) == "proposal_cooldown"
        os.environ["YT_FURIGANA_PROPOSAL_COOLDOWN_SEC"] = "0"

    print("proposals python tests passed.")


if __name__ == "__main__":
    main()
