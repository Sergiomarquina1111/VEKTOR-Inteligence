"""
test_classifier.py — 20 fabricated T1/T2/T3/T4 classification pairs.
Required by Phase 1 exit condition in the product specification.
5 T1 cases · 5 T2 cases · 5 T3 cases · 5 T4 cases
"""

import pytest
import networkx as nx

from services.comparator import classify_tier, compare_graphs
from models.session import KnowledgeTier, GraphMetrics


# ─── Helper: build metrics directly ──────────────────────────────────────────

def metrics(
    node_cov=0.8,
    edge_aln=0.8,
    contradiction=0.0,
    prereq=0.8,
    depth=0.5,
    missing=None,
):
    wa = 0.35 * node_cov + 0.35 * edge_aln + 0.30 * prereq
    return GraphMetrics(
        node_coverage=node_cov,
        edge_alignment=edge_aln,
        contradiction_rate=contradiction,
        prereq_chain_coverage=prereq,
        concept_depth=depth,
        missing_critical_nodes=missing or [],
        weighted_alignment=round(wa, 4),
    )


def skg_with_nodes(n: int) -> nx.DiGraph:
    G = nx.DiGraph()
    for i in range(n):
        G.add_node(f"concept_{i}")
    return G


# ─── T1 cases (Aligned — weighted_alignment >= 0.60, no contradiction) ───────

def test_t1_near_perfect():
    skg = skg_with_nodes(5)
    m = metrics(node_cov=0.95, edge_aln=0.95, prereq=0.95, contradiction=0.0)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T1
    assert label == "Aligned"
    assert score >= 0.75


def test_t1_just_above_threshold():
    skg = skg_with_nodes(4)
    m = metrics(node_cov=0.65, edge_aln=0.65, prereq=0.60, contradiction=0.0)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T1
    assert label == "Aligned"


def test_t1_high_node_coverage_moderate_edge():
    skg = skg_with_nodes(6)
    m = metrics(node_cov=0.90, edge_aln=0.70, prereq=0.75, contradiction=0.0)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T1


def test_t1_full_coverage():
    skg = skg_with_nodes(8)
    m = metrics(node_cov=1.0, edge_aln=1.0, prereq=1.0, contradiction=0.0)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T1
    assert score == pytest.approx(1.0, abs=0.01)


def test_t1_score_above_075():
    skg = skg_with_nodes(5)
    m = metrics(node_cov=0.85, edge_aln=0.80, prereq=0.85, contradiction=0.0)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T1
    assert score >= 0.75


# ─── T2 cases (Gap — 0.30 <= weighted_alignment < 0.60, no contradiction) ────

def test_t2_moderate_coverage():
    skg = skg_with_nodes(4)
    m = metrics(node_cov=0.50, edge_aln=0.50, prereq=0.50, contradiction=0.0)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T2
    assert label == "Incomplete"


def test_t2_low_edge_alignment():
    skg = skg_with_nodes(3)
    m = metrics(node_cov=0.60, edge_aln=0.30, prereq=0.50, contradiction=0.0)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T2


def test_t2_surface_understanding():
    skg = skg_with_nodes(3)
    m = metrics(node_cov=0.55, edge_aln=0.45, prereq=0.40, contradiction=0.0)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T2


def test_t2_missing_prereqs():
    skg = skg_with_nodes(4)
    m = metrics(node_cov=0.70, edge_aln=0.60, prereq=0.20, contradiction=0.0,
                missing=["Limits", "Continuity"])
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T2


def test_t2_just_below_t1():
    skg = skg_with_nodes(3)
    m = metrics(node_cov=0.58, edge_aln=0.58, prereq=0.58, contradiction=0.0)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T2


# ─── T3 cases (Misconception — contradiction_rate >= 0.20) ───────────────────

def test_t3_boundary_exactly_020():
    skg = skg_with_nodes(4)
    m = metrics(node_cov=0.7, edge_aln=0.5, prereq=0.6, contradiction=0.20)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T3
    assert label == "Misconception"


def test_t3_just_below_boundary_not_t3():
    """contradiction_rate of 0.19 should NOT classify as T3."""
    skg = skg_with_nodes(4)
    m = metrics(node_cov=0.7, edge_aln=0.5, prereq=0.6, contradiction=0.19)
    tier, score, label = classify_tier(m, skg)
    assert tier != KnowledgeTier.T3


def test_t3_high_contradiction():
    skg = skg_with_nodes(5)
    m = metrics(node_cov=0.6, edge_aln=0.4, prereq=0.5, contradiction=0.60)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T3


def test_t3_overrides_good_coverage():
    """Even high node coverage, if contradiction rate is above threshold → T3."""
    skg = skg_with_nodes(6)
    m = metrics(node_cov=0.90, edge_aln=0.80, prereq=0.85, contradiction=0.25)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T3


def test_t3_score_below_t2():
    """T3 score should be lower than equivalent T2 score — worse diagnosis."""
    skg = skg_with_nodes(4)
    t3 = metrics(node_cov=0.6, edge_aln=0.5, prereq=0.5, contradiction=0.30)
    t2 = metrics(node_cov=0.6, edge_aln=0.5, prereq=0.5, contradiction=0.0)
    _, t3_score, _ = classify_tier(t3, skg)
    _, t2_score, _ = classify_tier(t2, skg)
    assert t3_score < t2_score


# ─── T4 cases (Fragmented — node_count < 2) ──────────────────────────────────

def test_t4_empty_skg():
    skg = skg_with_nodes(0)
    m = metrics(node_cov=0.0, edge_aln=0.0, prereq=0.0, contradiction=0.0)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T4
    assert label == "Fragmented"
    assert score <= 0.25


def test_t4_single_node():
    skg = skg_with_nodes(1)
    m = metrics(node_cov=0.1, edge_aln=0.0, prereq=0.0, contradiction=0.0)
    tier, score, label = classify_tier(m, skg)
    assert tier == KnowledgeTier.T4


def test_t4_score_below_025():
    skg = skg_with_nodes(0)
    m = metrics(node_cov=0.0, edge_aln=0.0, prereq=0.0)
    _, score, _ = classify_tier(m, skg)
    assert score <= 0.25


def test_t4_score_in_range():
    skg = skg_with_nodes(0)
    m = metrics()
    _, score, _ = classify_tier(m, skg)
    assert 0.0 <= score <= 1.0


def test_score_ordering_t1_gt_t2_gt_t3():
    """T1 score > T2 score > T3 score for comparable inputs."""
    skg = skg_with_nodes(5)
    t1_m = metrics(node_cov=0.85, edge_aln=0.85, prereq=0.85, contradiction=0.0)
    t2_m = metrics(node_cov=0.50, edge_aln=0.50, prereq=0.50, contradiction=0.0)
    t3_m = metrics(node_cov=0.50, edge_aln=0.50, prereq=0.50, contradiction=0.40)

    _, t1_score, _ = classify_tier(t1_m, skg)
    _, t2_score, _ = classify_tier(t2_m, skg)
    _, t3_score, _ = classify_tier(t3_m, skg)

    assert t1_score > t2_score
    assert t2_score > t3_score
