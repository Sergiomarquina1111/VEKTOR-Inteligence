"""
test_extractor.py — 9 unit tests for services/extractor.py
Tests validation and normalisation logic only (no LLM calls).
"""

import pytest
from services.extractor import _validate_and_normalise, _fallback_extraction, _clean_json


# ── Test 1: Valid data passes through unchanged ────────────────────────────────
def test_valid_data_passes():
    data = {
        "subject": "mathematics",
        "subjectConfidence": 0.95,
        "triples": [
            {"subject": "derivative", "relation": "equals", "object": "rate of change", "confidence": 0.9}
        ],
        "simulatable": False,
        "simulationHint": None,
    }
    result = _validate_and_normalise(data)
    assert result["subject"] == "mathematics"
    assert len(result["triples"]) == 1
    assert result["triples"][0]["subject"] == "derivative"


# ── Test 2: Subject aliases normalised ────────────────────────────────────────
def test_subject_alias_math():
    data = {"subject": "math", "subjectConfidence": 0.9, "triples": [], "simulatable": False, "simulationHint": None}
    result = _validate_and_normalise(data)
    assert result["subject"] == "mathematics"


def test_subject_alias_cs():
    data = {"subject": "cs", "subjectConfidence": 0.9, "triples": [], "simulatable": False, "simulationHint": None}
    result = _validate_and_normalise(data)
    assert result["subject"] == "computer_science"


# ── Test 3: subjectConfidence clamped to [0, 1] ───────────────────────────────
def test_confidence_clamped_above():
    data = {"subject": "physics", "subjectConfidence": 1.5, "triples": [], "simulatable": False, "simulationHint": None}
    result = _validate_and_normalise(data)
    assert result["subjectConfidence"] == 1.0


def test_confidence_clamped_below():
    data = {"subject": "physics", "subjectConfidence": -0.3, "triples": [], "simulatable": False, "simulationHint": None}
    result = _validate_and_normalise(data)
    assert result["subjectConfidence"] == 0.0


# ── Test 4: Triples capped at 8 ───────────────────────────────────────────────
def test_triples_capped_at_8():
    triple = {"subject": "x", "relation": "equals", "object": "y", "confidence": 0.8}
    data = {
        "subject": "mathematics",
        "subjectConfidence": 0.9,
        "triples": [triple] * 12,
        "simulatable": False,
        "simulationHint": None,
    }
    result = _validate_and_normalise(data)
    assert len(result["triples"]) == 8


# ── Test 5: Missing required fields raises ValueError ─────────────────────────
def test_missing_required_field_raises():
    data = {"subject": "mathematics", "triples": []}  # missing subjectConfidence, simulatable, simulationHint
    with pytest.raises(ValueError, match="Missing required keys"):
        _validate_and_normalise(data)


# ── Test 6: Unknown subject raises ValueError ─────────────────────────────────
def test_unknown_subject_raises():
    data = {"subject": "astrology", "subjectConfidence": 0.9, "triples": [], "simulatable": False, "simulationHint": None}
    with pytest.raises(ValueError, match="Unknown subject"):
        _validate_and_normalise(data)


# ── Test 7: simulationHint cleared when simulatable=False ────────────────────
def test_simulation_hint_cleared_when_not_simulatable():
    data = {
        "subject": "mathematics",
        "subjectConfidence": 0.9,
        "triples": [],
        "simulatable": False,
        "simulationHint": "orbital",
    }
    result = _validate_and_normalise(data)
    assert result["simulationHint"] is None


# ── Test 8: JSON fence stripping ──────────────────────────────────────────────
def test_clean_json_strips_fences():
    raw = "```json\n{\"key\": \"value\"}\n```"
    cleaned = _clean_json(raw)
    assert cleaned == '{"key": "value"}'


def test_clean_json_strips_bare_fences():
    raw = "```\n{\"key\": \"value\"}\n```"
    cleaned = _clean_json(raw)
    assert cleaned == '{"key": "value"}'


# ── Test 9: Fallback extraction returns valid structure ───────────────────────
def test_fallback_extraction_structure():
    result = _fallback_extraction("what is gravity", "physics")
    assert result["subject"] == "physics"
    assert result["triples"] == []
    assert result["simulatable"] is False
    assert result["simulationHint"] is None


def test_fallback_extraction_default_subject():
    result = _fallback_extraction("something vague", None)
    assert result["subject"] == "mathematics"  # default
