"""公開デモと同じ「公の場→おおやけ」補正。"""
from reading_engine import CONTEXT_RULES, MANUAL_PHRASES, ReadingEngine


def test_kou_no_ba_ooyake():
    eng = ReadingEngine()
    out = eng.analyze("公の場で私的な感情を露わにするべきではない。")
    kou = next(t for t in out["tokens"] if t["surface"] == "公")
    assert kou["reading"] == "おおやけ", kou
    assert any(r["surface"] == "公" for r in CONTEXT_RULES)
    assert MANUAL_PHRASES["揚子江"] == "ようすこう"


if __name__ == "__main__":
    test_kou_no_ba_ooyake()
    print("test-parakeet-context-py: ok")
