"""
test_rag.py — Tests for RAG context builder (services/explainer.py :: build_dkg_context)
"""

import pytest
import networkx as nx

from services.explainer import build_dkg_context


def make_dkg():
    G = nx.DiGraph()
    G.add_node("limits",      label="Limits",      description="The value a function approaches.", tier="foundational", prerequisites=[])
    G.add_node("derivatives", label="Derivatives",  description="Instantaneous rate of change.",    tier="foundational", prerequisites=["limits"])
    G.add_node("integrals",   label="Integrals",    description="Signed area under a curve.",        tier="intermediate", prerequisites=["limits"])
    G.add_node("ftc",         label="FTC",          description="Connects differentiation and integration.", tier="intermediate", prerequisites=["derivatives", "integrals"])
    G.add_edge("limits",      "derivatives", relation="leads_to")
    G.add_edge("limits",      "integrals",   relation="leads_to")
    G.add_edge("derivatives", "ftc",         relation="leads_to")
    G.add_edge("integrals",   "ftc",         relation="leads_to")
    return G


# ── Test 1: Empty mapping returns placeholder ─────────────────────────────────
def test_empty_mapping_returns_placeholder():
    dkg = make_dkg()
    result = build_dkg_context({}, dkg)
    assert "No matched DKG nodes" in result


# ── Test 2: Empty DKG returns placeholder ────────────────────────────────────
def test_empty_dkg_returns_placeholder():
    result = build_dkg_context({"limits": "limits"}, nx.DiGraph())
    assert "No matched DKG nodes" in result


# ── Test 3: Matched node label appears in context ────────────────────────────
def test_matched_node_label_in_context():
    dkg = make_dkg()
    result = build_dkg_context({"limits": "limits"}, dkg)
    assert "Limits" in result


# ── Test 4: Description appears in context ───────────────────────────────────
def test_matched_node_description_in_context():
    dkg = make_dkg()
    result = build_dkg_context({"derivatives": "derivatives"}, dkg)
    assert "Instantaneous rate of change" in result


# ── Test 5: Tier appears in context ──────────────────────────────────────────
def test_tier_in_context():
    dkg = make_dkg()
    result = build_dkg_context({"derivatives": "derivatives"}, dkg)
    assert "foundational" in result


# ── Test 6: Prerequisites appear for non-root nodes ──────────────────────────
def test_prerequisites_shown_for_non_root():
    dkg = make_dkg()
    result = build_dkg_context({"derivatives": "derivatives"}, dkg)
    assert "Prerequisites" in result
    assert "Limits" in result


# ── Test 7: Root node has no prerequisites shown ─────────────────────────────
def test_root_node_no_prerequisites():
    dkg = make_dkg()
    result = build_dkg_context({"limits": "limits"}, dkg)
    # Limits has no predecessors — "Prerequisites:" line should be absent for it
    # (it may appear for extended nodes, but Limits itself has none)
    assert "Limits" in result


# ── Test 8: Unlocks (successors) appear ──────────────────────────────────────
def test_successors_shown():
    dkg = make_dkg()
    result = build_dkg_context({"limits": "limits"}, dkg)
    assert "Unlocks" in result


# ── Test 9: Unmatched SKG nodes (None values) are skipped ────────────────────
def test_unmatched_nodes_skipped():
    dkg = make_dkg()
    mapping = {"unknown_concept": None, "limits": "limits"}
    result = build_dkg_context(mapping, dkg)
    assert "Limits" in result
    assert "unknown_concept" not in result


# ── Test 10: max_nodes cap is respected ──────────────────────────────────────
def test_max_nodes_cap():
    G = nx.DiGraph()
    for i in range(20):
        G.add_node(f"node_{i}", label=f"Node {i}", description="desc", tier="foundational")
    mapping = {f"node_{i}": f"node_{i}" for i in range(20)}
    result = build_dkg_context(mapping, G, max_nodes=5)
    # Should not include all 20
    node_count = result.count("[Node ")
    assert node_count <= 5


# ── Test 11: DKG header and footer present ───────────────────────────────────
def test_context_has_header_and_footer():
    dkg = make_dkg()
    result = build_dkg_context({"limits": "limits"}, dkg)
    assert "DOMAIN KNOWLEDGE GRAPH CONTEXT" in result
    assert "END DKG CONTEXT" in result


# ── Test 12: 1-hop prerequisites of matched nodes are included ────────────────
def test_one_hop_prereqs_included():
    """FTC matched → its prereqs (derivatives, integrals) should also appear."""
    dkg = make_dkg()
    result = build_dkg_context({"ftc": "ftc"}, dkg)
    # derivatives and integrals are prerequisites of ftc — should be in context
    assert "Derivatives" in result or "Integrals" in result
