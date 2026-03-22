"""
Layer 4 — RAG-enhanced AI Explanation & Adaptive Path Generator
Gemini only.

RAG strategy: DKG-aware context injection.
Before calling Gemini, we retrieve the full descriptions, prerequisite chains,
and edge relationships for every matched DKG node from the in-memory NetworkX
graph and inject them directly into the prompt. The LLM explains the gap with
full knowledge of what the correct understanding looks like — not just the
student's raw text.
"""

import json
import logging
import asyncio
import re
import os
from pathlib import Path
from typing import Optional

import networkx as nx

from models.session import GapItem, MisconceptionItem, KnowledgeTier, AdaptivePathItem

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "explanation.txt"
_EXPLANATION_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

_TIER_LABELS = {
    KnowledgeTier.T1: "T1 — Aligned",
    KnowledgeTier.T2: "T2 — Gap / Incomplete",
    KnowledgeTier.T3: "T3 — Misconception",
    KnowledgeTier.T4: "T4 — Fragmented",
}

_FALLBACK_EXPLANATIONS = {
    KnowledgeTier.T1: "Your understanding aligns well with the domain knowledge graph. The concepts you described are correctly connected. Continue building on this foundation.",
    KnowledgeTier.T2: "Your understanding captures the surface of this topic but is missing key connections between concepts. Review the prerequisite relationships for the concepts you mentioned.",
    KnowledgeTier.T3: "Your model has a structural error: one or more concept relationships are reversed compared to the domain knowledge graph. A misconception at this level blocks downstream understanding.",
    KnowledgeTier.T4: "Your query didn't provide enough conceptual structure to map your understanding. Try explaining a specific aspect of the topic in more detail.",
}


# ─── RAG: DKG context builder ─────────────────────────────────────────────────

def build_dkg_context(
    skg_to_dkg: dict[str, Optional[str]],
    dkg: nx.DiGraph,
    max_nodes: int = 8,
) -> str:
    """
    Retrieve and format DKG node context for all matched SKG concepts.

    For each matched node we extract:
      - Canonical label + description
      - Tier (foundational / intermediate / advanced / expert)
      - Direct prerequisite labels
      - Direct successor labels (what this concept unlocks)

    This forms the RAG context injected into the LLM prompt.
    max_nodes caps the context to avoid token bloat.
    """
    matched_ids = [v for v in skg_to_dkg.values() if v is not None]
    if not matched_ids or not dkg.nodes:
        return "No matched DKG nodes available."

    # Also include 1-hop prerequisites of matched nodes for richer context
    extended_ids = set(matched_ids)
    for node_id in matched_ids:
        if node_id in dkg:
            for prereq_id in dkg.predecessors(node_id):
                extended_ids.add(prereq_id)

    # Cap total nodes to avoid prompt bloat
    ids_to_render = list(extended_ids)[:max_nodes]

    lines = ["=== DOMAIN KNOWLEDGE GRAPH CONTEXT ==="]
    for node_id in ids_to_render:
        if node_id not in dkg:
            continue
        data = dkg.nodes[node_id]
        label       = data.get("label", node_id)
        description = data.get("description", "No description available.")
        tier        = data.get("tier", "unknown")

        prereqs = [
            dkg.nodes[p].get("label", p)
            for p in dkg.predecessors(node_id)
            if p in dkg
        ]
        successors = [
            dkg.nodes[s].get("label", s)
            for s in dkg.successors(node_id)
            if s in dkg
        ]

        lines.append(f"\n[{label}] ({tier})")
        lines.append(f"  Definition: {description}")
        if prereqs:
            lines.append(f"  Prerequisites: {', '.join(prereqs)}")
        if successors:
            lines.append(f"  Unlocks: {', '.join(successors[:4])}")  # cap successors shown

    lines.append("\n=== END DKG CONTEXT ===")
    return "\n".join(lines)


# ─── Prompt assembly ──────────────────────────────────────────────────────────

def _build_prompt_context(
    query: str,
    tier: KnowledgeTier,
    gaps: list[GapItem],
    misconceptions: list[MisconceptionItem],
    dkg_context: str,
) -> str:
    gap_text  = "\n".join(f"- {g.concept}: {g.description}" for g in gaps)  or "None identified."
    misc_text = "\n".join(
        f"- {m.concept}: student believes '{m.student_belief}' | correct: '{m.correct_understanding}'"
        for m in misconceptions
    ) or "None identified."

    return f"""Student query: {query}

Knowledge tier: {_TIER_LABELS[tier]}

Gaps found:
{gap_text}

Misconceptions found:
{misc_text}

{dkg_context}"""


# ─── Gemini call ──────────────────────────────────────────────────────────────

def _clean_json(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


async def _call_gemini_explain(prompt_context: str) -> dict:
    import google.generativeai as genai
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")
    full_prompt = f"{_EXPLANATION_PROMPT}\n\n{prompt_context}"
    response = await asyncio.to_thread(model.generate_content, full_prompt)
    return json.loads(_clean_json(response.text))


def _parse_adaptive_path(raw: list[dict]) -> list[AdaptivePathItem]:
    result = []
    for item in raw[:3]:
        result.append(AdaptivePathItem(
            concept=item.get("concept", "Unknown concept"),
            reason=item.get("reason", ""),
            priority=item.get("priority", "medium"),
            blocked_by=item.get("blocked_by"),
        ))
    return result


# ─── Public API ───────────────────────────────────────────────────────────────

async def generate_explanation(
    query: str,
    tier: KnowledgeTier,
    gaps: list[GapItem],
    misconceptions: list[MisconceptionItem],
    skg_to_dkg: Optional[dict] = None,
    dkg: Optional[nx.DiGraph] = None,
) -> tuple[str, list[AdaptivePathItem]]:
    """
    Generate RAG-enhanced AI explanation and adaptive path.

    The DKG context for matched nodes is retrieved from the in-memory
    NetworkX graph and injected into the prompt before calling Gemini.

    Returns: (explanation_text, adaptive_path_items)
    """
    # ── RAG: build DKG context ────────────────────────────────────────────────
    dkg_context = build_dkg_context(skg_to_dkg or {}, dkg or nx.DiGraph())
    logger.info("RAG context built: %d chars", len(dkg_context))

    prompt_context = _build_prompt_context(query, tier, gaps, misconceptions, dkg_context)

    # ── Gemini with retry ─────────────────────────────────────────────────────
    last_error = None
    for attempt, delay_ms in enumerate([200, 400, 800], 1):
        try:
            data = await _call_gemini_explain(prompt_context)
            explanation  = data.get("explanation", _FALLBACK_EXPLANATIONS[tier])
            adaptive_path = _parse_adaptive_path(data.get("adaptivePath", []))
            logger.info("Explanation generated (attempt %d)", attempt)
            return explanation, adaptive_path
        except Exception as e:
            last_error = e
            logger.warning("Explainer attempt %d failed: %s", attempt, e)
            if attempt < 3:
                await asyncio.sleep(delay_ms / 1000)

    logger.error("All explainer attempts failed (%s). Using deterministic fallback.", last_error)
    fallback_path = [
        AdaptivePathItem(concept="Review prerequisites",  reason="Strengthen foundational understanding.", priority="high"),
        AdaptivePathItem(concept="Concept mapping",       reason="Map how the concepts you know connect.", priority="medium"),
        AdaptivePathItem(concept="Practice problems",     reason="Apply concepts in varied problem contexts.", priority="low"),
    ]
    return _FALLBACK_EXPLANATIONS[tier], fallback_path
