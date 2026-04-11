"""
Layer 4 — RAG Explanation Service
Version: 2.1.0

Called by main.py as:
    explanation, adaptive_path = await generate_explanation(
        query=body.query,
        tier=tier,
        gaps=gaps,
        misconceptions=misconceptions,
        skg_to_dkg=skg_to_dkg,
        dkg=dkg_nx,
    )

Returns: (explanation_str, adaptive_path_list)

AdaptivePathItem schema (must match models/session.py exactly):
    concept:    str
    reason:     str
    priority:   str          ← required
    blocked_by: Optional[str]
"""

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Optional

import networkx as nx

logger = logging.getLogger(__name__)

# gemini-2.0-flash is the correct model name for the new google-genai SDK
_MODEL = "gemini-2.5-flash"

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "explanation.txt"
_prompt_cache: Optional[str] = None

TIER_DESCRIPTIONS = {
    "T1": "Aligned — student's understanding matches the DKG structure",
    "T2": "Gap / Incomplete — surface understanding present but key DKG connections missing",
    "T3": "Misconception — student's model reverses or contradicts a DKG prerequisite relationship",
    "T4": "Fragmented — insufficient concept structure extracted to map to DKG",
}

# ─── Gemini client (lazy) ─────────────────────────────────────────────────────
_genai_client = None


def _get_client():
    global _genai_client
    if _genai_client is None:
        from google import genai
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not set")
        _genai_client = genai.Client(api_key=api_key)
    return _genai_client


def _load_prompt() -> str:
    global _prompt_cache
    if _prompt_cache is None:
        try:
            _prompt_cache = _PROMPT_PATH.read_text(encoding="utf-8")
        except Exception as e:
            logger.warning("Could not load explanation.txt: %s — using built-in prompt", e)
            _prompt_cache = _BUILTIN_PROMPT
    return _prompt_cache


def _clean_json(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def _tier_str(tier) -> str:
    """Safely convert KnowledgeTier enum or any string to plain T1/T2/T3/T4."""
    t = str(tier)
    if "." in t:
        t = t.split(".")[-1]
    return t


# ─── DKG context builder ──────────────────────────────────────────────────────

def build_dkg_context(
    skg_to_dkg: dict,
    gaps: list,
    misconceptions: list,
    dkg_nx: nx.DiGraph,
    hops: int = 2,
) -> str:
    """
    Build a 2-hop RAG context string from matched DKG nodes.
    """
    collected_ids: set[str] = set()
    sections: dict[str, list[str]] = {
        "MATCHED — concepts the student mentioned": [],
        "MISCONCEPTION — structural error here": [],
        "GAP — missing connection": [],
        "PREREQUISITE (1-hop) — must know first": [],
        "SUCCESSOR (1-hop) — unlocked by matched concepts": [],
        "PREREQUISITE (2-hop) — foundational dependency": [],
    }

    def _node_text(node_id: str) -> str:
        if node_id not in dkg_nx:
            return ""
        d = dkg_nx.nodes[node_id]
        prereqs = [
            dkg_nx.nodes[p].get("label", p)
            for p in dkg_nx.predecessors(node_id)
            if dkg_nx.has_node(p)
        ]
        succs = [
            dkg_nx.nodes[s].get("label", s)
            for s in dkg_nx.successors(node_id)
            if dkg_nx.has_node(s)
        ]
        lines = [
            f"  Node: {d.get('label', node_id)} (id: {node_id}, tier: {d.get('tier', '?')})",
            f"  Description: {d.get('description', 'No description.')}",
        ]
        if prereqs:
            lines.append(f"  Prerequisites: {', '.join(prereqs)}")
        if succs:
            lines.append(f"  Unlocks: {', '.join(succs)}")
        return "\n".join(lines)

    def _add(node_id: str, section: str):
        if not node_id or node_id in collected_ids or not dkg_nx.has_node(node_id):
            return
        collected_ids.add(node_id)
        text = _node_text(node_id)
        if text:
            sections[section].append(text)

    # Layer 0 — directly matched nodes
    matched_ids = [v for v in skg_to_dkg.values() if v]
    for nid in matched_ids:
        _add(nid, "MATCHED — concepts the student mentioned")

    # Layer 1 — 1-hop predecessors + successors
    for nid in matched_ids:
        if dkg_nx.has_node(nid):
            for pred in dkg_nx.predecessors(nid):
                _add(pred, "PREREQUISITE (1-hop) — must know first")
            for succ in dkg_nx.successors(nid):
                _add(succ, "SUCCESSOR (1-hop) — unlocked by matched concepts")

    # Layer 2 — 2-hop predecessors
    if hops >= 2:
        for nid in list(collected_ids):
            if dkg_nx.has_node(nid):
                for pred2 in dkg_nx.predecessors(nid):
                    _add(pred2, "PREREQUISITE (2-hop) — foundational dependency")

    # Misconception nodes
    for m in misconceptions:
        nid = getattr(m, "dkg_node_id", None) or (m.get("dkg_node_id") if isinstance(m, dict) else None)
        if nid:
            _add(nid, "MISCONCEPTION — structural error here")

    # Gap nodes
    for g in gaps:
        nid = getattr(g, "dkg_node_id", None) or (g.get("dkg_node_id") if isinstance(g, dict) else None)
        if nid and nid != "unmatched":
            _add(nid, "GAP — missing connection")

    if not any(sections.values()):
        return "No DKG nodes matched. Provide a general explanation grounded in the subject and tier."

    lines = [f"=== DKG CONTEXT ({len(collected_ids)} nodes, {hops}-hop) ==="]
    for section, entries in sections.items():
        if entries:
            lines.append(f"\n[{section}]")
            lines.extend(entries)

    return "\n".join(lines)


# ─── Adaptive path normaliser ─────────────────────────────────────────────────

def _normalise_adaptive_path(raw_path: list) -> list:
    """
    Ensure every adaptive path item matches AdaptivePathItem schema exactly:
        concept:    str       (required)
        reason:     str       (required)
        priority:   str       (required) — "high" / "medium" / "low"
        blocked_by: str|None  (optional)

    Gemini may return extra fields (node_id, action) — we strip those.
    Gemini may omit priority — we default it.
    """
    normalised = []
    for i, item in enumerate(raw_path):
        if not isinstance(item, dict):
            continue
        priority_map = {0: "high", 1: "medium", 2: "low"}
        normalised.append({
            "concept":    str(item.get("concept", "Review knowledge graph")),
            "reason":     str(item.get("reason", item.get("action", "Study this concept next."))),
            "priority":   str(item.get("priority", priority_map.get(i, "medium"))),
            "blocked_by": item.get("blocked_by"),
        })
    return normalised


# ─── Main public function ─────────────────────────────────────────────────────

async def generate_explanation(
    query: str,
    tier,
    gaps: list,
    misconceptions: list,
    skg_to_dkg: dict,
    dkg: nx.DiGraph,
) -> tuple[str, list]:
    """
    Generate a RAG-grounded explanation for the student's query.

    Returns:
        (explanation_str, adaptive_path_list)
        adaptive_path_list items match AdaptivePathItem schema in models/session.py
    """
    tier_str         = _tier_str(tier)
    tier_description = TIER_DESCRIPTIONS.get(tier_str, "Unknown tier")

    dkg_context = build_dkg_context(
        skg_to_dkg=skg_to_dkg,
        gaps=gaps,
        misconceptions=misconceptions,
        dkg_nx=dkg,
        hops=2,
    )

    prompt = (
        _load_prompt()
        .replace("{{DKG_CONTEXT}}", dkg_context)
        .replace("{{STUDENT_QUERY}}", query)
        .replace("{{TIER}}", tier_str)
        .replace("{{TIER_DESCRIPTION}}", tier_description)
    )

    for attempt in range(3):
        try:
            client   = _get_client()
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=_MODEL,
                contents=prompt,
            )
            result      = json.loads(_clean_json(response.text))
            explanation = result.get("explanation", "")
            if not explanation:
                raise ValueError("Empty explanation in Gemini response")
            raw_path      = result.get("adaptive_path", [])
            adaptive_path = _normalise_adaptive_path(raw_path)
            logger.info("[EXPLAIN] OK on attempt %d — tier=%s path_items=%d",
                        attempt + 1, tier_str, len(adaptive_path))
            return explanation, adaptive_path

        except Exception as e:
            wait = [0.2, 0.4, 0.8][attempt]
            logger.warning("[EXPLAIN] Attempt %d failed: %s — retrying in %.1fs",
                           attempt + 1, e, wait)
            await asyncio.sleep(wait)

    logger.error("[EXPLAIN] All attempts failed — returning deterministic fallback")
    return _deterministic_fallback(query, tier_str, gaps, misconceptions)


def _deterministic_fallback(
    query: str,
    tier_str: str,
    gaps: list,
    misconceptions: list,
) -> tuple[str, list]:
    """
    Safe fallback when Gemini is unavailable.
    Returns valid (explanation_str, adaptive_path_list) matching the Pydantic schema.
    adaptive_path items include all required fields: concept, reason, priority.
    """
    messages = {
        "T1": (
            f"Your understanding of '{query[:80]}' aligns with the domain knowledge graph. "
            "The concepts you described match the expected relationships. "
            "Review the graph above to see which successor concepts are now unlocked."
        ),
        "T2": (
            f"Your understanding of '{query[:80]}' is partially correct but incomplete — "
            f"{len(gaps)} gap(s) detected. "
            "The amber nodes in the knowledge graph show the prerequisite concepts "
            "that are missing from your current understanding."
        ),
        "T3": (
            f"Your query '{query[:80]}' contains a structural mismatch with the domain model — "
            f"{len(misconceptions)} misconception(s) detected. "
            "The red nodes in the knowledge graph show where your relationship direction "
            "differs from the expert model. Address these before moving forward."
        ),
        "T4": (
            f"Your query '{query[:80]}' did not contain enough structured concept information "
            "to map to the knowledge graph. "
            "Try rephrasing with a specific concept name, formula, or theorem."
        ),
    }

    explanation = messages.get(tier_str, messages["T4"])

    # All three fields required by AdaptivePathItem
    adaptive_path = [
        {
            "concept":    "Review the knowledge graph",
            "reason":     "The visualisation above shows your understanding mapped against the expert model. Click each node to read its description.",
            "priority":   "high",
            "blocked_by": None,
        },
        {
            "concept":    "Identify gap nodes",
            "reason":     "Amber nodes represent concepts present in the expert model but missing from your description.",
            "priority":   "medium",
            "blocked_by": None,
        },
        {
            "concept":    "Follow the prerequisite chain",
            "reason":     "Each node shows which concepts must be understood first — work from foundational to advanced.",
            "priority":   "low",
            "blocked_by": None,
        },
    ]

    return explanation, adaptive_path


# ─── Built-in fallback prompt ─────────────────────────────────────────────────

_BUILTIN_PROMPT = """You are the explanation engine for VEKTOR Intelligence, a STEM learning platform.
Generate a precise, DKG-grounded explanation based on the context below.

{{DKG_CONTEXT}}

STUDENT QUERY: {{STUDENT_QUERY}}
TIER: {{TIER}} — {{TIER_DESCRIPTION}}

Rules:
1. Ground every factual claim in the DKG context. Cite node labels by name.
2. T3: name the exact misconception, explain why it is structurally wrong using the DKG prerequisite chain, then state the correct model.
3. T2: acknowledge what is correct, then identify the specific missing DKG connection.
4. T1: confirm what is correct and point to one deeper successor concept.
5. T4: ask for more specificity, name 1-2 foundational DKG nodes to start from.

Return ONLY a JSON object, no markdown fences:
{
  "explanation": "<full explanation text>",
  "tier_reasoning": "<one sentence on why this tier was assigned>",
  "key_misconception": "<T3 only: the wrong belief in one sentence. null otherwise>",
  "adaptive_path": [
    {
      "concept": "<DKG node label>",
      "reason": "<why this is the recommended next step>",
      "priority": "high"
    },
    {
      "concept": "<DKG node label>",
      "reason": "<why>",
      "priority": "medium"
    },
    {
      "concept": "<DKG node label>",
      "reason": "<why>",
      "priority": "low"
    }
  ]
}
"""