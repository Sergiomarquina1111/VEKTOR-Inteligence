"""
Layer 2 — Dual Graph Construction
- Loads Domain Knowledge Graph (DKG) from JSON files
- Builds Student Knowledge Graph (SKG) from extracted triples using NetworkX
- Matches SKG concept nodes to DKG nodes via sentence-transformers semantic similarity
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional

import networkx as nx
import numpy as np

logger = logging.getLogger(__name__)

# ─── DKG file locations ───────────────────────────────────────────────────────
_DKG_DIR = Path(__file__).parent.parent / "dkg"

# ─── In-memory DKG cache (loaded once at startup) ────────────────────────────
_dkg_cache: dict[str, dict] = {}         # key → raw JSON dict
_dkg_nx_cache: dict[str, nx.DiGraph] = {} # key → NetworkX DiGraph
_dkg_embeddings_cache: dict[str, tuple] = {}  # key → (node_ids, embedding_matrix)

# ─── Semantic model (singleton — loaded once at startup) ──────────────────────
_embed_model = None


def load_sentence_transformer():
    """Load sentence-transformers model. Called once at app startup."""
    global _embed_model
    if _embed_model is not None:
        return
    try:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading sentence-transformers model (all-MiniLM-L6-v2)...")
        _embed_model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("sentence-transformers model loaded.")
    except Exception as e:
        logger.error("Failed to load sentence-transformers: %s", e)
        _embed_model = None


def sentence_transformer_loaded() -> bool:
    return _embed_model is not None


# ─── DKG loading ──────────────────────────────────────────────────────────────

def load_all_dkgs():
    """Load all DKG JSON files from the dkg/ directory into memory."""
    if not _DKG_DIR.exists():
        logger.warning("DKG directory not found: %s", _DKG_DIR)
        return

    for json_file in _DKG_DIR.glob("*.json"):
        key = json_file.stem  # e.g. "mathematics_linear_algebra"
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            _dkg_cache[key] = data
            _dkg_nx_cache[key] = _build_nx_graph(data)
            _precompute_dkg_embeddings(key, data)
            logger.info("Loaded DKG: %s (%d nodes, %d edges)", key, data["nodeCount"], data["edgeCount"])
        except Exception as e:
            logger.error("Failed to load DKG %s: %s", json_file, e)


def get_loaded_dkg_keys() -> list[str]:
    return list(_dkg_cache.keys())


def _build_nx_graph(dkg_data: dict) -> nx.DiGraph:
    """Convert a DKG JSON dict into a NetworkX DiGraph."""
    G = nx.DiGraph()
    for node in dkg_data["nodes"]:
        G.add_node(
            node["id"],
            label=node["label"],
            description=node["description"],
            tier=node["tier"],
            aliases=node.get("aliases", []),
            prerequisites=node.get("prerequisites", []),
        )
    for edge in dkg_data["edges"]:
        G.add_edge(edge["source"], edge["target"], relation=edge["relation"], weight=edge.get("weight", 1.0))
    return G


def _precompute_dkg_embeddings(key: str, dkg_data: dict):
    """Pre-compute embeddings for all DKG node labels + aliases."""
    if _embed_model is None:
        return
    node_ids = []
    texts = []
    for node in dkg_data["nodes"]:
        node_ids.append(node["id"])
        # Combine label + aliases into a single rich text for embedding
        all_labels = [node["label"]] + node.get("aliases", [])
        texts.append(" | ".join(all_labels))

    embeddings = _embed_model.encode(texts, normalize_embeddings=True)
    _dkg_embeddings_cache[key] = (node_ids, embeddings)


# ─── DKG selection ────────────────────────────────────────────────────────────

def _select_dkg_key(subject: str) -> Optional[str]:
    """
    Select the best DKG for a subject.
    Priority: exact subject match → first partial match.
    e.g. subject='mathematics' → tries 'mathematics_calculus' first, then 'mathematics_linear_algebra'
    """
    subject = subject.lower().replace(" ", "_")

    # Exact match first
    if subject in _dkg_cache:
        return subject

    # Partial match — return first loaded DKG for that subject
    for key in _dkg_cache:
        if key.startswith(subject):
            return key

    logger.warning("No DKG found for subject: %s. Loaded DKGs: %s", subject, list(_dkg_cache.keys()))
    return None


def get_dkg_for_subject(subject: str) -> Optional[tuple[dict, nx.DiGraph]]:
    """Return (raw_data, nx_graph) for a subject, or None if not loaded."""
    key = _select_dkg_key(subject)
    if key is None:
        return None
    return _dkg_cache[key], _dkg_nx_cache[key]


# ─── SKG construction ─────────────────────────────────────────────────────────

def build_skg(triples: list[dict]) -> nx.DiGraph:
    """
    Build a Student Knowledge Graph (SKG) from extracted triples.
    Returns a NetworkX DiGraph where nodes are student concept strings
    and edges are the relations between them.
    """
    G = nx.DiGraph()
    for triple in triples:
        src = triple["subject"]
        tgt = triple["object"]
        rel = triple["relation"]
        conf = triple.get("confidence", 0.5)
        G.add_node(src, label=src, confidence=conf)
        G.add_node(tgt, label=tgt, confidence=conf)
        G.add_edge(src, tgt, relation=rel, confidence=conf)
    return G


# ─── Semantic matching ────────────────────────────────────────────────────────

_SIMILARITY_THRESHOLD = 0.45  # minimum cosine similarity to count as a match


def match_skg_to_dkg(skg: nx.DiGraph, subject: str) -> dict[str, Optional[str]]:
    """
    Match each SKG node to the closest DKG node via semantic similarity.

    Returns:
        dict mapping skg_node_id → dkg_node_id (or None if no match above threshold)
    """
    if not skg.nodes:
        return {}

    dkg_key = _select_dkg_key(subject)
    if dkg_key is None or dkg_key not in _dkg_embeddings_cache:
        logger.warning("Cannot match SKG — no DKG embeddings for subject: %s", subject)
        return {n: None for n in skg.nodes}

    node_ids, dkg_embs = _dkg_embeddings_cache[dkg_key]

    # Embed all SKG node labels
    skg_labels = list(skg.nodes)
    if _embed_model is None:
        # No model — return no matches
        return {n: None for n in skg_labels}

    skg_embs = _embed_model.encode(skg_labels, normalize_embeddings=True)

    # Cosine similarity — dot product of normalised vectors = cosine similarity
    similarity_matrix = np.dot(skg_embs, dkg_embs.T)  # shape: (len_skg, len_dkg)

    mapping: dict[str, Optional[str]] = {}
    for i, skg_label in enumerate(skg_labels):
        best_idx = int(np.argmax(similarity_matrix[i]))
        best_score = float(similarity_matrix[i][best_idx])
        if best_score >= _SIMILARITY_THRESHOLD:
            mapping[skg_label] = node_ids[best_idx]
            logger.info("MATCH '%s' → '%s' (score=%.3f)", skg_label, node_ids[best_idx], best_score)
        else:
            mapping[skg_label] = None
            logger.info("NO MATCH '%s' best=%s score=%.3f (threshold=%.2f)", skg_label, node_ids[best_idx], best_score, _SIMILARITY_THRESHOLD)

    return mapping


def get_similarity_scores(skg: nx.DiGraph, subject: str) -> dict[str, float]:
    """Return the best similarity score per SKG node (for metadata in the response)."""
    if not skg.nodes or _embed_model is None:
        return {}

    dkg_key = _select_dkg_key(subject)
    if dkg_key not in _dkg_embeddings_cache:
        return {}

    node_ids, dkg_embs = _dkg_embeddings_cache[dkg_key]
    skg_labels = list(skg.nodes)
    skg_embs = _embed_model.encode(skg_labels, normalize_embeddings=True)
    sim_matrix = np.dot(skg_embs, dkg_embs.T)

    return {
        label: float(np.max(sim_matrix[i]))
        for i, label in enumerate(skg_labels)
    }