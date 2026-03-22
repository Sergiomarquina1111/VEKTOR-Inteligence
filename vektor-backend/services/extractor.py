"""
Layer 1 — Natural Language Triple Extraction
Gemini API only. Exponential backoff: 200ms / 400ms / 800ms.
"""

import os
import json
import asyncio
import logging
import re
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Load prompt once at module import ────────────────────────────────────────
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "triple_extraction.txt"
_EXTRACTION_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

# ─── Allowed values ───────────────────────────────────────────────────────────
VALID_SUBJECTS = {"mathematics", "physics", "chemistry", "biology", "computer_science"}
VALID_RELATIONS = {"requires", "leads_to", "is_defined_as", "is_opposite_of", "is_type_of", "causes", "equals", "part_of"}
VALID_HINTS    = {"orbital", "wave", "force", "transform", "graph_plot", "geometry", "sort", "graph_traversal", "molecular", "reaction"}
SUBJECT_ALIASES = {
    "math": "mathematics", "maths": "mathematics",
    "cs": "computer_science", "comp sci": "computer_science", "computer science": "computer_science",
    "bio": "biology", "chem": "chemistry", "phys": "physics",
}

# ─── Gemini client (lazy) ─────────────────────────────────────────────────────
_gemini_client = None   # genai.GenerativeModel — imported lazily


def _get_gemini():
    global _gemini_client
    if _gemini_client is None:
        import google.generativeai as genai
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not set")
        genai.configure(api_key=api_key)
        _gemini_client = genai.GenerativeModel("gemini-1.5-flash")
    return _gemini_client


# ─── JSON cleaning ────────────────────────────────────────────────────────────

def _clean_json(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


# ─── Validation ───────────────────────────────────────────────────────────────

def _validate_and_normalise(data: dict) -> dict:
    required = {"subject", "subjectConfidence", "triples", "simulatable", "simulationHint"}
    missing = required - data.keys()
    if missing:
        raise ValueError(f"Missing required keys: {missing}")

    subject = str(data["subject"]).lower().strip()
    subject = SUBJECT_ALIASES.get(subject, subject)
    if subject not in VALID_SUBJECTS:
        raise ValueError(f"Unknown subject: {subject!r}")
    data["subject"] = subject

    data["subjectConfidence"] = max(0.0, min(1.0, float(data["subjectConfidence"])))

    if not isinstance(data["triples"], list):
        raise ValueError("triples must be a list")

    cleaned = []
    for t in data["triples"][:8]:
        if not all(k in t for k in ("subject", "relation", "object", "confidence")):
            continue
        t["subject"]    = str(t["subject"]).lower().strip()
        t["object"]     = str(t["object"]).lower().strip()
        relation        = str(t["relation"]).lower().strip()
        t["relation"]   = relation if relation in VALID_RELATIONS else "leads_to"
        t["confidence"] = max(0.0, min(1.0, float(t.get("confidence", 0.5))))
        cleaned.append(t)
    data["triples"] = cleaned

    data["simulatable"] = bool(data.get("simulatable", False))
    hint = data.get("simulationHint")
    data["simulationHint"] = hint if (data["simulatable"] and hint in VALID_HINTS) else None

    return data


# ─── Gemini call ──────────────────────────────────────────────────────────────

async def _call_gemini(query: str) -> dict:
    model = _get_gemini()
    full_prompt = f"{_EXTRACTION_PROMPT}\n\nStudent query: {query}"
    response = await asyncio.to_thread(model.generate_content, full_prompt)
    data = json.loads(_clean_json(response.text))
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
            logger.info("Gemini extraction attempt %d — %.60s...", attempt, query)
            result = await _call_gemini(query)
            if subject_override:
                result["subject"] = subject_override
            logger.info("Extraction OK (attempt %d, %d triples)", attempt, len(result["triples"]))
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
        "subject": subject_override or "mathematics",
        "subjectConfidence": 0.5,
        "triples": [],
        "simulatable": False,
        "simulationHint": None,
    }


def gemini_available() -> bool:
    return os.getenv("GEMINI_API_KEY") is not None
