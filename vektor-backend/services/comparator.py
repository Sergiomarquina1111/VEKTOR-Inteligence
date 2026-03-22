"""
Layer 3 — ML Graph Comparison & Tier Classification
Six graph-theoretic metrics computed against the DKG.
T1–T4 tier classifier applied to the metric scores.
"""

import logging
from typing import Optional

import networkx as nx

from models.session import (
    GraphMetrics,
    GapItem,
    MisconceptionItem,
    KnowledgeTier,
)

logger = logging.getLogger(__name__)


# ─── Tier Classifier Thresholds ───────────────────────────────────────────────
# Tunable after testing against 20-30 real queries.

T4_MIN_NODES = 2          # fewer than this → T4 (insufficient data)
T3_CONTRADICTION_RATE = 0.20   # at or above → T3 (misconception)
T1_WEIGHTED_ALIGNMENT = 0.60   # at or above → T1 (aligned)
T2_LOW_THRESHOLD = 0.30        # below → T2-low (shallow but no contradiction)

# Weighted alignment formula weights
W_NODE_COV = 0.35
W_EDGE_ALN = 0.35
W_PREREQ = 0.30


# ─── Metric 1: Node Coverage ──────────────────────────────────────────────────

def compute_node_coverage(skg_to_dkg: dict[str, Optional[str]], dkg: nx.DiGraph) -> float:
    """
    Fraction of DKG nodes that appear in the student's concept mapping.
    Matched = skg_to_dkg value is not None.
    """
    if not dkg.nodes:
        return 0.0
    matched = sum(1 for v in skg_to_dkg.values() if v is not None)
    # Coverage relative to student's attempted concepts, not all DKG nodes
    total_attempted = len(skg_to_dkg)
    if total_attempted == 0:
        return 0.0
    return matched / total_attempted


# ─── Metric 2: Edge Alignment ─────────────────────────────────────────────────

def compute_edge_alignment(skg: nx.DiGraph, dkg: nx.DiGraph, skg_to_dkg: dict[str, Optional[str]]) -> float:
    """
    Fraction of SKG edges where both endpoints are matched AND
    a directed path exists between the corresponding DKG nodes.
    """
    if not skg.edges:
        return 0.0

    aligned = 0
    total = 0
    for src, tgt in skg.edges:
        dkg_src = skg_to_dkg.get(src)
        dkg_tgt = skg_to_dkg.get(tgt)
        if dkg_src is None or dkg_tgt is None:
            continue
        total += 1
        if dkg_src in dkg and dkg_tgt in dkg:
            # Check if a path exists in either direction (DKG is prerequisite-directed)
            if nx.has_path(dkg, dkg_src, dkg_tgt) or nx.has_path(dkg, dkg_tgt, dkg_src):
                aligned += 1

    return aligned / total if total > 0 else 0.0


# ─── Metric 3: Contradiction Rate ────────────────────────────────────────────

def compute_contradiction_rate(
    skg: nx.DiGraph,
    dkg: nx.DiGraph,
    skg_to_dkg: dict[str, Optional[str]],
) -> tuple[float, list[tuple[str, str]]]:
    """
    Fraction of SKG edges where the direction reverses a DKG prerequisite relationship.
    Returns (rate, list_of_contradicting_edges).
    High rate → T3 misconception signal.
    """
    if not skg.edges:
        return 0.0, []

    total_mappable = 0
    contradictions = []

    for src, tgt in skg.edges:
        dkg_src = skg_to_dkg.get(src)
        dkg_tgt = skg_to_dkg.get(tgt)
        if dkg_src is None or dkg_tgt is None:
            continue
        if dkg_src not in dkg or dkg_tgt not in dkg:
            continue
        total_mappable += 1
        # Student says src → tgt (src leads to/requires tgt)
        # Check if DKG says the OPPOSITE: tgt is a prerequisite of src
        if dkg.has_edge(dkg_tgt, dkg_src):
            contradictions.append((src, tgt))

    rate = len(contradictions) / total_mappable if total_mappable > 0 else 0.0
    return rate, contradictions


# ─── Metric 4: Prerequisite Chain Coverage ───────────────────────────────────

def compute_prereq_chain_coverage(
    skg_to_dkg: dict[str, Optional[str]],
    dkg: nx.DiGraph,
) -> float:
    """
    For each matched DKG node, what fraction of its prerequisite ancestors
    are also present in the student's concept mapping?
    """
    matched_dkg_nodes = {v for v in skg_to_dkg.values() if v is not None}
    if not matched_dkg_nodes:
        return 0.0

    total_prereqs = 0
    covered_prereqs = 0

    for dkg_node in matched_dkg_nodes:
        if dkg_node not in dkg:
            continue
        # Get all ancestors (prerequisites) of this node
        ancestors = nx.ancestors(dkg, dkg_node)
        total_prereqs += len(ancestors)
        covered_prereqs += len(ancestors & matched_dkg_nodes)

    return covered_prereqs / total_prereqs if total_prereqs > 0 else 1.0


# ─── Metric 5: Concept Depth ─────────────────────────────────────────────────

_TIER_DEPTH = {"foundational": 0.25, "intermediate": 0.50, "advanced": 0.75, "expert": 1.0}


def compute_concept_depth(skg_to_dkg: dict[str, Optional[str]], dkg: nx.DiGraph) -> float:
    """Average tier depth of matched DKG nodes."""
    depths = []
    for dkg_node in skg_to_dkg.values():
        if dkg_node and dkg_node in dkg:
            tier = dkg.nodes[dkg_node].get("tier", "foundational")
            depths.append(_TIER_DEPTH.get(tier, 0.25))
    return sum(depths) / len(depths) if depths else 0.0


# ─── Metric 6: Missing Critical Nodes ────────────────────────────────────────

def compute_missing_critical_nodes(
    skg_to_dkg: dict[str, Optional[str]],
    dkg: nx.DiGraph,
) -> list[str]:
    """
    Prerequisites of matched nodes that are absent from the student's concept mapping.
    These are the most important gaps — the student tried to discuss downstream concepts
    without the foundational nodes.
    """
    matched_dkg_nodes = {v for v in skg_to_dkg.values() if v is not None}
    missing = set()
    for dkg_node in matched_dkg_nodes:
        if dkg_node not in dkg:
            continue
        for prereq_id in dkg.nodes[dkg_node].get("prerequisites", []):
            if prereq_id not in matched_dkg_nodes and prereq_id in dkg:
                missing.add(prereq_id)
    # Return labels not IDs
    return [dkg.nodes[n].get("label", n) for n in missing]


# ─── Full Comparison ──────────────────────────────────────────────────────────

def compare_graphs(
    skg: nx.DiGraph,
    dkg: nx.DiGraph,
    skg_to_dkg: dict[str, Optional[str]],
) -> GraphMetrics:
    """
    Run all 6 metrics and return a GraphMetrics object.
    """
    node_coverage = compute_node_coverage(skg_to_dkg, dkg)
    edge_alignment = compute_edge_alignment(skg, dkg, skg_to_dkg)
    contradiction_rate, _ = compute_contradiction_rate(skg, dkg, skg_to_dkg)
    prereq_chain = compute_prereq_chain_coverage(skg_to_dkg, dkg)
    concept_depth = compute_concept_depth(skg_to_dkg, dkg)
    missing_critical = compute_missing_critical_nodes(skg_to_dkg, dkg)

    weighted_alignment = (
        W_NODE_COV * node_coverage +
        W_EDGE_ALN * edge_alignment +
        W_PREREQ * prereq_chain
    )

    return GraphMetrics(
        node_coverage=round(node_coverage, 4),
        edge_alignment=round(edge_alignment, 4),
        contradiction_rate=round(contradiction_rate, 4),
        prereq_chain_coverage=round(prereq_chain, 4),
        concept_depth=round(concept_depth, 4),
        missing_critical_nodes=missing_critical,
        weighted_alignment=round(weighted_alignment, 4),
    )


# ─── T1–T4 Classifier ─────────────────────────────────────────────────────────

def classify_tier(
    metrics: GraphMetrics,
    skg: nx.DiGraph,
) -> tuple[KnowledgeTier, float, str]:
    """
    Classify a student's understanding into T1–T4.

    Returns:
        (tier, tier_score, tier_label)
        tier_score: 0.0–1.0 alignment quality score
    """
    node_count = len(skg.nodes)

    # T4 — Fragmented / Insufficient data
    if node_count < T4_MIN_NODES:
        score = max(0.0, node_count / T4_MIN_NODES) * 0.25  # cap at 0.25
        return KnowledgeTier.T4, round(score, 3), "Fragmented"

    # T3 — Misconception (checked before T2 — highest priority diagnostic)
    if metrics.contradiction_rate >= T3_CONTRADICTION_RATE:
        # Score inversely proportional to contradiction severity
        score = max(0.0, 0.35 - (metrics.contradiction_rate - T3_CONTRADICTION_RATE) * 0.5)
        return KnowledgeTier.T3, round(score, 3), "Misconception"

    # T1 — Aligned
    if metrics.weighted_alignment >= T1_WEIGHTED_ALIGNMENT:
        # Score scales from 0.75 → 1.0 in the T1 band
        normalised = (metrics.weighted_alignment - T1_WEIGHTED_ALIGNMENT) / (1.0 - T1_WEIGHTED_ALIGNMENT)
        score = 0.75 + normalised * 0.25
        return KnowledgeTier.T1, round(min(score, 1.0), 3), "Aligned"

    # T2 — Gap / Incomplete
    normalised = metrics.weighted_alignment / T1_WEIGHTED_ALIGNMENT
    score = T2_LOW_THRESHOLD + normalised * (T1_WEIGHTED_ALIGNMENT - T2_LOW_THRESHOLD)
    return KnowledgeTier.T2, round(score, 3), "Incomplete"


# ─── Gap and Misconception builders ──────────────────────────────────────────

def build_gap_list(
    skg_to_dkg: dict[str, Optional[str]],
    dkg: nx.DiGraph,
    metrics: GraphMetrics,
) -> list[GapItem]:
    """Build gap items from unmatched concepts and missing critical nodes."""
    gaps = []

    # Unmatched SKG nodes → T2 gaps
    for skg_concept, dkg_node in skg_to_dkg.items():
        if dkg_node is None:
            gaps.append(GapItem(
                concept=skg_concept,
                dkg_node_id="unmatched",
                description=f"'{skg_concept}' could not be matched to any concept in the domain knowledge graph.",
                priority="medium",
            ))

    # Missing critical nodes → high priority gaps
    for label in metrics.missing_critical_nodes[:5]:  # cap at 5
        gaps.append(GapItem(
            concept=label,
            dkg_node_id=_label_to_id(label, dkg),
            description=f"'{label}' is a prerequisite for concepts you referenced but is missing from your understanding.",
            priority="high",
        ))

    return gaps[:8]  # cap total gaps at 8


def build_misconception_list(
    skg: nx.DiGraph,
    dkg: nx.DiGraph,
    skg_to_dkg: dict[str, Optional[str]],
) -> list[MisconceptionItem]:
    """Build misconception items from contradicting edges."""
    _, contradictions = compute_contradiction_rate(skg, dkg, skg_to_dkg)
    result = []
    for src, tgt in contradictions[:5]:  # cap at 5
        dkg_src = skg_to_dkg.get(src)
        dkg_tgt = skg_to_dkg.get(tgt)
        src_label = dkg.nodes[dkg_src].get("label", src) if dkg_src and dkg_src in dkg else src
        tgt_label = dkg.nodes[dkg_tgt].get("label", tgt) if dkg_tgt and dkg_tgt in dkg else tgt
        result.append(MisconceptionItem(
            concept=src_label,
            student_belief=f"'{src}' leads to or requires '{tgt}'",
            correct_understanding=f"In the domain knowledge graph, '{tgt_label}' is a prerequisite of '{src_label}', not the other way around.",
            dkg_node_id=dkg_src or "unknown",
        ))
    return result


# ─── Utility ──────────────────────────────────────────────────────────────────

def _label_to_id(label: str, dkg: nx.DiGraph) -> str:
    """Reverse lookup: find a node ID by its label."""
    for node_id, data in dkg.nodes(data=True):
        if data.get("label", "").lower() == label.lower():
            return node_id
    return "unknown"
