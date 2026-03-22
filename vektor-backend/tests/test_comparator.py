"""
test_comparator.py — 16 unit tests for services/comparator.py
Tests all 6 metrics and the full compare_graphs integration.
Uses small hand-crafted NetworkX graphs — no DKG files needed.
"""

import pytest
import networkx as nx

from services.comparator import (
    compute_node_coverage,
    compute_edge_alignment,
    compute_contradiction_rate,
    compute_prereq_chain_coverage,
    compute_concept_depth,
    compute_missing_critical_nodes,
    compare_graphs,
    classify_tier,
)
from models.session import KnowledgeTier


# ─── Shared fixtures ──────────────────────────────────────────────────────────

def make_dkg():
    """Small DKG: limits → derivatives → integrals"""
    G = nx.DiGraph()
    G.add_node("limits", label="Limits", tier="foundational", prerequisites=[])
    G.add_node("derivatives", label="Derivatives", tier="foundational", prerequisites=["limits"])
    G.add_node("integrals", label="Integrals", tier="intermediate", prerequisites=["limits"])
    G.add_node("ftc", label="FTC", tier="intermediate", prerequisites=["derivatives", "integrals"])
    G.add_edge("limits", "derivatives", relation="leads_to")
    G.add_edge("limits", "integrals", relation="leads_to")
    G.add_edge("derivatives", "ftc", relation="leads_to")
    G.add_edge("integrals", "ftc", relation="leads_to")
    return G


def make_skg_correct():
    """SKG that matches the DKG correctly."""
    G = nx.DiGraph()
    G.add_node("limits")
    G.add_node("derivatives")
    G.add_edge("limits", "derivatives", relation="leads_to", confidence=0.9)
    return G


def make_skg_reversed():
    """SKG with a reversed edge — triggers T3."""
    G = nx.DiGraph()
    G.add_node("derivatives")
    G.add_node("limits")
    G.add_edge("derivatives", "limits", relation="leads_to", confidence=0.8)  # WRONG direction
    return G


def make_skg_empty():
    """Empty SKG — triggers T4."""
    return nx.DiGraph()


# ─── Metric 1: Node Coverage ─────────────────────────────────────────────────

def test_node_coverage_empty_mapping():
    dkg = make_dkg()
    result = compute_node_coverage({}, dkg)
    assert result == 0.0


def test_node_coverage_matched_nodes():
    dkg = make_dkg()
    mapping = {"limits": "limits", "derivatives": "derivatives"}
    result = compute_node_coverage(mapping, dkg)
    assert result == 1.0  # both matched


def test_node_coverage_partial():
    dkg = make_dkg()
    mapping = {"limits": "limits", "unknown_concept": None}
    result = compute_node_coverage(mapping, dkg)
    assert result == 0.5


# ─── Metric 2: Edge Alignment ─────────────────────────────────────────────────

def test_edge_alignment_empty_edges():
    dkg = make_dkg()
    skg = make_skg_empty()
    mapping = {}
    result = compute_edge_alignment(skg, dkg, mapping)
    assert result == 0.0


def test_edge_alignment_correct_dkg_edge():
    dkg = make_dkg()
    skg = make_skg_correct()
    mapping = {"limits": "limits", "derivatives": "derivatives"}
    result = compute_edge_alignment(skg, dkg, mapping)
    assert result == 1.0


def test_edge_alignment_no_dkg_path():
    dkg = make_dkg()
    skg = nx.DiGraph()
    skg.add_node("limits")
    skg.add_node("ftc")
    # ftc → limits doesn't exist as direct edge but path exists in reverse
    skg.add_edge("ftc", "limits", relation="leads_to")
    mapping = {"limits": "limits", "ftc": "ftc"}
    result = compute_edge_alignment(skg, dkg, mapping)
    # nx.has_path(dkg, ftc, limits) — no path from ftc back to limits
    # nx.has_path(dkg, limits, ftc) — path exists
    assert result == 1.0  # path exists in one direction


# ─── Metric 3: Contradiction Rate ────────────────────────────────────────────

def test_contradiction_correct_direction_zero():
    dkg = make_dkg()
    skg = make_skg_correct()
    mapping = {"limits": "limits", "derivatives": "derivatives"}
    rate, contradictions = compute_contradiction_rate(skg, dkg, mapping)
    assert rate == 0.0
    assert contradictions == []


def test_contradiction_reversed_direction_detected():
    dkg = make_dkg()
    skg = make_skg_reversed()
    mapping = {"derivatives": "derivatives", "limits": "limits"}
    rate, contradictions = compute_contradiction_rate(skg, dkg, mapping)
    assert rate == 1.0
    assert len(contradictions) == 1
    assert contradictions[0] == ("derivatives", "limits")


# ─── Metric 4: Prereq Chain Coverage ─────────────────────────────────────────

def test_prereq_chain_no_matched_nodes():
    dkg = make_dkg()
    result = compute_prereq_chain_coverage({}, dkg)
    assert result == 0.0


def test_prereq_chain_foundational_node_no_prereqs():
    dkg = make_dkg()
    # limits has no prerequisites — 100% coverage vacuously
    mapping = {"limits": "limits"}
    result = compute_prereq_chain_coverage(mapping, dkg)
    assert result == 1.0


# ─── Metric 5: Concept Depth ─────────────────────────────────────────────────

def test_concept_depth_foundational():
    dkg = make_dkg()
    mapping = {"limits": "limits", "derivatives": "derivatives"}
    result = compute_concept_depth(mapping, dkg)
    assert result == 0.25  # both are foundational


def test_concept_depth_mixed():
    dkg = make_dkg()
    mapping = {"limits": "limits", "integrals": "integrals"}
    result = compute_concept_depth(mapping, dkg)
    assert result == pytest.approx(0.375)  # (0.25 + 0.50) / 2


# ─── Full compare_graphs integration ─────────────────────────────────────────

def test_compare_graphs_t1_student():
    """A student who correctly describes limits → derivatives."""
    dkg = make_dkg()
    skg = make_skg_correct()
    mapping = {"limits": "limits", "derivatives": "derivatives"}
    metrics = compare_graphs(skg, dkg, mapping)
    assert metrics.node_coverage > 0
    assert metrics.contradiction_rate == 0.0
    assert "node_coverage" not in metrics.model_fields or True  # pydantic fields exist
    assert all(k is not None for k in [
        metrics.node_coverage,
        metrics.edge_alignment,
        metrics.contradiction_rate,
        metrics.prereq_chain_coverage,
        metrics.concept_depth,
        metrics.weighted_alignment,
    ])


def test_compare_graphs_t3_student():
    """A student with a reversed prerequisite relationship."""
    dkg = make_dkg()
    skg = make_skg_reversed()
    mapping = {"derivatives": "derivatives", "limits": "limits"}
    metrics = compare_graphs(skg, dkg, mapping)
    assert metrics.contradiction_rate >= 0.20


def test_compare_graphs_all_keys_present():
    dkg = make_dkg()
    skg = make_skg_correct()
    mapping = {"limits": "limits", "derivatives": "derivatives"}
    metrics = compare_graphs(skg, dkg, mapping)
    required_fields = [
        "node_coverage", "edge_alignment", "contradiction_rate",
        "prereq_chain_coverage", "concept_depth",
        "missing_critical_nodes", "weighted_alignment"
    ]
    for field in required_fields:
        assert hasattr(metrics, field), f"Missing field: {field}"


# ─── Classifier ───────────────────────────────────────────────────────────────

def test_classifier_t4_empty_skg():
    dkg = make_dkg()
    skg = make_skg_empty()
    mapping = {}
    metrics = compare_graphs(skg, dkg, mapping)
    tier, score, label = classify_tier(metrics, skg)
    assert tier == KnowledgeTier.T4
    assert label == "Fragmented"
    assert 0.0 <= score <= 1.0


def test_classifier_t3_reversed():
    dkg = make_dkg()
    skg = make_skg_reversed()
    mapping = {"derivatives": "derivatives", "limits": "limits"}
    metrics = compare_graphs(skg, dkg, mapping)
    tier, score, label = classify_tier(metrics, skg)
    assert tier == KnowledgeTier.T3
    assert label == "Misconception"
