"""
Layer 1 — Natural Language Triple Extraction
Uses the new Google Gen AI SDK (google-genai).
Retries 3 times with 200/400/800ms backoff.
Deterministic T4 fallback if all attempts fail.
"""

import os
import json
import asyncio
import logging
import re
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Load prompt once at module import ───────────────────────────────────────
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "triple_extraction.txt"
_EXTRACTION_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

# ─── Allowed values ───────────────────────────────────────────────────────────
VALID_SUBJECTS = {"mathematics", "physics", "chemistry", "biology", "computer_science"}

# Relations that Gemini commonly returns — accept all, fallback to leads_to
VALID_RELATIONS = {
    "requires", "leads_to", "is_defined_as", "is_opposite_of",
    "is_type_of", "causes", "equals", "part_of", "has", "is",
    "produces", "gives", "defines", "implies", "contradicts",
    "is_equal_to", "is_derived_from", "is_inverse_of", "depends_on",
    "applies_to", "results_in", "is_related_to", "determines",
}

# ALL simulation hints the engine supports
VALID_HINTS = {
    "orbital", "wave", "force", "em_field", "quantum",
    "transform", "graph_plot", "graph_topology", "series", "vector_field",
    "molecule", "reaction", "bond", "periodic",
    "dna", "cell", "protein", "membrane",
    "sort", "graph_traversal", "neural_net", "algorithm", "data_structure",
    "geometry", "molecular",  # legacy names kept
    "generic",
}

SUBJECT_ALIASES = {
    "math": "mathematics", "maths": "mathematics",
    "cs": "computer_science", "comp sci": "computer_science",
    "computer science": "computer_science",
    "bio": "biology", "chem": "chemistry", "phys": "physics",
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


# ─── JSON cleaning ────────────────────────────────────────────────────────────

def _clean_json(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


# ─── Validation ───────────────────────────────────────────────────────────────

def _validate_and_normalise(data: dict) -> dict:
    # Subject
    subject = str(data.get("subject", "mathematics")).lower().strip()
    subject = SUBJECT_ALIASES.get(subject, subject)
    if subject not in VALID_SUBJECTS:
        subject = "mathematics"  # safe default rather than raising
    data["subject"] = subject

    # Confidence
    data["subjectConfidence"] = max(0.0, min(1.0, float(data.get("subjectConfidence", 0.7))))

    # Triples — lenient: accept any triple that has at least subject+object
    raw_triples = data.get("triples", [])
    if not isinstance(raw_triples, list):
        raw_triples = []

    cleaned = []
    for t in raw_triples[:8]:
        if not isinstance(t, dict):
            continue
        # Must have at minimum a subject and object (relation optional)
        subj = t.get("subject") or t.get("source") or t.get("node1")
        obj  = t.get("object") or t.get("target") or t.get("node2")
        if not subj or not obj:
            continue
        relation = str(t.get("relation", "leads_to")).lower().strip()
        if relation not in VALID_RELATIONS:
            relation = "leads_to"  # normalise unknown relations
        confidence = max(0.0, min(1.0, float(t.get("confidence", 0.75))))
        cleaned.append({
            "subject":    str(subj).lower().strip(),
            "relation":   relation,
            "object":     str(obj).lower().strip(),
            "confidence": confidence,
        })
    data["triples"] = cleaned

    # Simulation hint
    data["simulatable"] = bool(data.get("simulatable", False))
    hint = data.get("simulationHint")
    # Accept hint if simulatable flag is set AND hint is valid
    # But also accept hint even if simulatable=False — main.py resolves this now
    if hint and hint in VALID_HINTS:
        data["simulationHint"] = hint
        data["simulatable"]    = True   # if hint is valid, mark as simulatable
    else:
        data["simulationHint"] = None
        # Don't force simulatable=False — main.py uses subject default hint anyway

    logger.info("Validated: subject=%s triples=%d simulatable=%s hint=%s",
                data["subject"], len(cleaned), data["simulatable"], data.get("simulationHint"))
    return data


# ─── Gemini call ──────────────────────────────────────────────────────────────

async def _call_gemini(query: str) -> dict:
    client = _get_client()
    full_prompt = f"{_EXTRACTION_PROMPT}\n\nStudent query: {query}"

    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-flash",
        contents=full_prompt,
    )

    raw = response.text
    logger.debug("Gemini raw response: %.300s", raw)
    cleaned = _clean_json(raw)
    data = json.loads(cleaned)
    return _validate_and_normalise(data)


# ─── Public API ───────────────────────────────────────────────────────────────

async def extract_triples(query: str, subject_override: Optional[str] = None) -> dict:
    """
    Extract relational knowledge triples from a student query via Gemini.
    Retries 3 times (200 / 400 / 800 ms backoff).
    Returns a deterministic T4 fallback if all attempts fail.
    """
    last_error = None
    for attempt, delay_ms in enumerate([200, 400, 800], 1):
        try:
            logger.info("Gemini extraction attempt %d — %.80s...", attempt, query)
            result = await _call_gemini(query)
            if subject_override:
                result["subject"] = subject_override
            logger.info("Extraction OK — attempt %d, %d triples, subject=%s",
                        attempt, len(result["triples"]), result["subject"])
            return result
        except Exception as e:
            last_error = e
            logger.warning("Extraction attempt %d failed: %s", attempt, e)
            if attempt < 3:
                await asyncio.sleep(delay_ms / 1000)

    logger.error("All extraction attempts failed (%s). Returning T4 fallback.", last_error)
    return _fallback_extraction(query, subject_override)


def _fallback_extraction(query: str, subject_override: Optional[str]) -> dict:
    """Deterministic fallback — zero triples → comparator classifies as T4."""
    return {
        "subject":           subject_override or "mathematics",
        "subjectConfidence": 0.5,
        "triples":           [],
        "simulatable":       False,
        "simulationHint":    None,
    }


def gemini_available() -> bool:
    return os.getenv("GEMINI_API_KEY") is not None
