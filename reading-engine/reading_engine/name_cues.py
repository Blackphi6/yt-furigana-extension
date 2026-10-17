"""敬称など人名の手がかりの直前の語は、人名辞書の読みを使う（相場さん＝あいば）。

手がかりがあるときだけ、全件の人名辞書（約5.6万件、MIT）を引く。手がかりが無い一般語
（株の相場＝そうば）には使わないので、一般語を人名で読む危険は増えない。拡張の name-cues.js と揃える。
"""

from __future__ import annotations

import gzip
import json
from functools import lru_cache
from pathlib import Path

from reading_engine.personal_names import REPO_ROOT, load_personal_name_phrases

FULL_NAMES_GZ = REPO_ROOT / "data" / "generated" / "personal-name-phrases.json.gz"
# 人名のあとにしか付かない語。「様」は神仏（明神様）やお客にも付くので入れない
NAME_CUES = ("さん", "くん", "ちゃん", "氏", "先生", "選手", "監督", "容疑者", "被告", "議員")
MAX_NAME_LENGTH = 4


@lru_cache(maxsize=1)
def load_name_cue_phrases() -> dict[str, str]:
    names: dict[str, str] = {}
    if FULL_NAMES_GZ.is_file():
        data = json.loads(gzip.decompress(FULL_NAMES_GZ.read_bytes()).decode("utf-8"))
        data = data.get("phrases", data) if isinstance(data, dict) else {}
        names.update({str(k): str(v) for k, v in data.items() if len(str(k)) >= 2 and v})
    names.update(load_personal_name_phrases())
    return names


def find_name_before_cue(
    text: str, cue_start: int, names: dict[str, str]
) -> tuple[int, int, str, str] | None:
    """cue_start（手がかりの開始位置）の直前で最長の人名 (start, end, surface, reading)。"""
    if not any(text.startswith(cue, cue_start) for cue in NAME_CUES):
        return None
    for length in range(min(MAX_NAME_LENGTH, cue_start), 1, -1):
        surface = text[cue_start - length : cue_start]
        reading = names.get(surface)
        if reading:
            return (cue_start - length, cue_start, surface, reading)
    return None


def name_cue_spans(text: str, names: dict[str, str] | None = None) -> list[tuple[int, int, str, str]]:
    names = load_name_cue_phrases() if names is None else names
    spans: list[tuple[int, int, str, str]] = []
    for i in range(2, len(text)):
        hit = find_name_before_cue(text, i, names)
        if hit and (not spans or hit[0] >= spans[-1][1]):
            spans.append(hit)
    return spans
