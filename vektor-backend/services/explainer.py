"""
VEKTOR Intelligence — RAG Explanation Service
Version: 2.0.0
Session: 12
Changes from v1.x:
  - 2-hop RAG context: includes prerequisites OF prerequisites
  - Misconception node descriptions explicitly injected for T3
  - Tier label + description passed to prompt
  - Adaptive path now returns node_id not just concept name
  - build_dkg_context() returns structured dict, not a string
"""

import json
import logging
import time
from typing import Optional

import google.generativeai as genai

logger = logging.getLogger(__name__)

_MODEL = "gemini-2.5-flash"

TIER_DESCRIPTIONS = {
    "T1": "Aligned — student's understanding matches the DKG structure",
    "T2": "Gap / Incomplete — surface understanding present but key DKG connections missing",
    "T3": "Misconception — student's model reverses or contradicts a DKG prerequisite relationship",
    "T4": "Fragmented — insufficient concept structure extracted to map to DKG",
}


def build_dkg_context(
    matched_nodes: list[dict],
    gap_nodes: list[dict],
    misconception_nodes: list[dict],
    dkg_graph,  # NetworkX DiGraph
    tier: str,
    hops: int = 2,
) -> str:
    """
    Build 2-hop RAG context string from matched DKG nodes.
    Includes: matched nodes, their prerequisites (1-hop), prerequisites of prerequisites (2-hop),
    successor nodes (1-hop), and for T3: the misconception nodes with full descriptions.

    Returns a structured text block for injection into the explanation prompt.
    """
    collected_ids = set()
    context_nodes = []

    def add_node(node_id: str, role: str):
        if node_id in collected_ids:
            return
        if not dkg_graph.has_node(node_id):
            return
        collected_ids.add(node_id)
        node_data = dkg_graph.nodes[node_id]
        context_nodes.append({
            "id": node_id,
            "label": node_data.get("label", node_id),
            "role": role,
            "tier": node_data.get("tier", "unknown"),
            "description": node_data.get("description", ""),
            "prerequisites": node_data.get("prerequisites", []),
            "successors": node_data.get("successors", []),
        })

    # Layer 0: matched nodes (what the student mentioned)
    for node in matched_nodes:
        add_node(node.get("id") or node.get("node_id", ""), "matched")

    # Layer 1: 1-hop prerequisites and successors of matched nodes
    for node in matched_nodes:
        node_id = node.get("id") or node.get("node_id", "")
        if dkg_graph.has_node(node_id):
            for pred in dkg_graph.predecessors(node_id):
                add_node(pred, "prerequisite_1hop")
            for succ in dkg_graph.successors(node_id):
                add_node(succ, "successor_1hop")

    # Layer 2: 2-hop prerequisites (prerequisites of prerequisites)
    if hops >= 2:
        prereq_1hop_ids = [n["id"] for n in context_nodes if n["role"] == "prerequisite_1hop"]
        for pid in prereq_1hop_ids:
            if dkg_graph.has_node(pid):
                for pred2 in dkg_graph.predecessors(pid):
                    add_node(pred2, "prerequisite_2hop")

    # T3 specific: explicitly add misconception nodes with priority
    for node in misconception_nodes:
        node_id = node.get("id") or node.get("node_id") or node.get("concept", "")
        add_node(node_id, "misconception_node")

    # Gap nodes
    for node in gap_nodes:
        node_id = node.get("id") or node.get("node_id") or node.get("concept", "")
        add_node(node_id, "gap_node")

    if not context_nodes:
        return "No DKG nodes matched for this query. Provide a general explanation based on the subject."

    # Format context as structured text
    lines = [f"=== DKG CONTEXT ({len(context_nodes)} nodes, {hops}-hop expansion) ===\n"]

    role_order = [
        "matched", "misconception_node", "gap_node",
        "prerequisite_1hop", "successor_1hop", "prerequisite_2hop"
    ]
    role_labels = {
        "matched": "MATCHED — student's concepts",
        "misconception_node": "MISCONCEPTION NODE — structural error here",
        "gap_node": "GAP NODE — missing connection",
        "prerequisite_1hop": "PREREQUISITE (1-hop) — must understand first",
        "successor_1hop": "SUCCESSOR (1-hop) — unlocked by this concept",
        "prerequisite_2hop": "PREREQUISITE (2-hop) — foundational dependency",
    }

    for role in role_order:
        nodes_in_role = [n for n in context_nodes if n["role"] == role]
        if not nodes_in_role:
            continue
        lines.append(f"\n[{role_labels[role]}]")
        for n in nodes_in_role:
            prereq_labels = []
            for pid in n["prerequisites"]:
                if dkg_graph.has_node(pid):
                    prereq_labels.append(dkg_graph.nodes[pid].get("label", pid))
            succ_labels = []
            for sid in n["successors"]:
                if dkg_graph.has_node(sid):
                    succ_labels.append(dkg_graph.nodes[sid].get("label", sid))

            lines.append(f"\n  Node: {n['label']} (id: {n['id']}, tier: {n['tier']})")
            lines.append(f"  Description: {n['description']}")
            if prereq_labels:
                lines.append(f"  Prerequisites: {', '.join(prereq_labels)}")
            if succ_labels:
                lines.append(f"  Unlocks: {', '.join(succ_labels)}")

    return "\n".join(lines)


async def generate_explanation(
    query: str,
    subject: str,
    tier: str,
    dkg_context: str,
    prompt_template: str,
) -> dict:
    """
    Call Gemini with the v2.0.0 explanation prompt.
    Returns dict with explanation, tier_reasoning, key_misconception, adaptive_path.
    Falls back to a structured deterministic response if Gemini fails.
    """
    tier_description = TIER_DESCRIPTIONS.get(tier, "Unknown tier")

    prompt = (
        prompt_template
        .replace("{{DKG_CONTEXT}}", dkg_context)
        .replace("{{STUDENT_QUERY}}", query)
        .replace("{{TIER}}", tier)
        .replace("{{TIER_DESCRIPTION}}", tier_description)
    )

    for attempt in range(3):
        try:
            client = genai.Client()
            response = client.models.generate_content(
                model=_MODEL,
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                ),
            )
            raw = response.text
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw)
            _validate_explanation_response(result)
            logger.info(f"[EXPLAIN] Generated on attempt {attempt+1}")
            return result
        except Exception as e:
            wait = [0.2, 0.4, 0.8][attempt]
            logger.warning(f"[EXPLAIN] Attempt {attempt+1} failed: {e}. Retrying in {wait}s")
            time.sleep(wait)

    # Deterministic fallback
    logger.error("[EXPLAIN] All attempts failed — returning deterministic fallback")
    return _deterministic_fallback(query, tier, tier_description)


def _validate_explanation_response(result: dict):
    """Raise ValueError if required fields are missing or malformed."""
    if "explanation" not in result:
        raise ValueError("Missing 'explanation' field")
    if "adaptive_path" not in result or len(result["adaptive_path"]) < 1:
        raise ValueError("Missing or empty 'adaptive_path'")
    for item in result["adaptive_path"]:
        if "concept" not in item or "node_id" not in item:
            raise ValueError(f"adaptive_path item missing concept/node_id: {item}")


def _deterministic_fallback(query: str, tier: str, tier_description: str) -> dict:
    """Return a safe deterministic response when Gemini is unavailable."""
    explanation = (
        f"Your query about '{query[:80]}' has been classified as {tier} ({tier_description}). "
        f"The AI explanation service is temporarily unavailable. "
        f"Please review the knowledge graph visualisation above — the matched nodes (blue), "
        f"gap nodes (amber), and any misconception nodes (red) show where your understanding "
        f"aligns with and diverges from the domain knowledge graph."
    )
    return {
        "explanation": explanation,
        "tier_reasoning": f"Tier {tier} assigned based on graph comparison metrics.",
        "key_misconception": None,
        "adaptive_path": [
            {"concept": "Review matched nodes", "node_id": "unknown",
             "reason": "Your matched concepts are the starting point for deeper study.",
             "action": "Examine the DKG graph and follow the prerequisite chain upward."},
        ],
    }