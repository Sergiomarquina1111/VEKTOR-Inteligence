"""
Vektor-backend/services/simulator.py
VEKTOR Intelligence — Simulation Parameter Extractor

Calls Gemini to produce studentParams and expertParams for the WebGL2
simulation engine. Runs after session analysis completes.

Language convention:
  - studentParams: the student's extracted model  (label: "YOUR MODEL")
  - expertParams:  the domain-correct parameters  (label: "EXPERT MODEL")
  - Never uses the word "wrong" in any output field.
"""

import json
import logging
import re
import os
from pathlib import Path
from typing import Optional
import asyncio

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "simulation_params.txt"
_PROMPT_CACHE: str = ""

SIMULATABLE_HINTS = {
    "orbital", "wave", "force", "em_field", "quantum",
    "transform", "graph_plot", "graph_topology", "series", "vector_field",
    "molecule", "reaction", "bond", "periodic",
    "dna", "cell", "protein", "membrane",
    "sort", "graph_traversal", "neural_net", "algorithm", "data_structure",
    "generic",
}

SUBJECT_DEFAULT_HINT = {
    "mathematics":      "graph_plot",
    "physics":          "wave",
    "chemistry":        "molecule",
    "biology":          "cell",
    "computer_science": "sort",
}

# ── Model name — must match what your project uses everywhere else ────────────
_MODEL = "gemini-2.5-flash-lite"


def _get_client() -> genai.Client:
    return genai.Client(api_key=os.getenv("GEMINI_API_KEY", ""))


def _load_prompt() -> str:
    global _PROMPT_CACHE
    if not _PROMPT_CACHE:
        try:
            _PROMPT_CACHE = _PROMPT_PATH.read_text(encoding="utf-8")
            logger.info("[simulator] Loaded prompt from %s", _PROMPT_PATH.resolve())
        except FileNotFoundError:
            logger.warning("[simulator] simulation_params.txt not found at %s — using fallback",
                           _PROMPT_PATH.resolve())
            _PROMPT_CACHE = _FALLBACK_PROMPT
    return _PROMPT_CACHE


async def extract_simulation_params(
    query:   str,
    subject: str,
    hint:    Optional[str],
    triples: list,
    tier:    str,
) -> dict:
    """
    Extract WebGL2 simulation parameters from a student query.

    Returns dict with keys:
      simulatable:   bool
      hint:          str
      label:         str
      studentParams: dict  (student's model — "YOUR MODEL")
      expertParams:  dict  (domain-correct — "EXPERT MODEL")
      deltas:        list[{key, label, studentValue, expertValue}]

    Never raises — returns {"simulatable": False} on any failure.
    """
    resolved_hint = hint if hint in SIMULATABLE_HINTS else SUBJECT_DEFAULT_HINT.get(subject, "generic")

    prompt = f"""{_load_prompt()}

---
## CURRENT QUERY

Query:          {query}
Subject:        {subject}
simulationHint: {resolved_hint}
Tier:           {tier}
Triples:        {json.dumps(triples, ensure_ascii=False)}

Respond ONLY with valid JSON. No markdown fences. No preamble.
"""

    client = _get_client()

    for attempt in range(3):
        try:
            # Run the sync SDK call in a thread so we don't block the async event loop
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: client.models.generate_content(
                    model=_MODEL,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                        max_output_tokens=2048,
                        response_mime_type="application/json",
                    ),
                )
            )

            raw = response.text.strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$",          "", raw)
            data = json.loads(raw.strip())

            if not data.get("simulatable", False):
                logger.info("[simulator] Gemini returned simulatable=false for hint=%s", resolved_hint)
                return {"simulatable": False}

            for field in ("hint", "label", "studentParams", "expertParams"):
                if field not in data:
                    logger.warning("[simulator] missing field '%s' in response", field)
                    return {"simulatable": False}

            data.setdefault("deltas", [])
            logger.info("[simulator] OK — hint=%s label=%s deltas=%d",
                        data["hint"], data["label"], len(data["deltas"]))
            return data

        except json.JSONDecodeError as e:
            logger.warning("[simulator] JSON parse error attempt %d: %s | raw=%s",
                           attempt + 1, e, raw[:200] if "raw" in dir() else "N/A")
        except Exception as e:
            logger.warning("[simulator] Gemini error attempt %d: %s", attempt + 1, e)

    logger.warning("[simulator] All 3 attempts failed — returning simulatable=False")
    return {"simulatable": False}

# ── Fallback prompt (used when simulation_params.txt is missing) ──────────────
# Full aggressive version — simulation_params.txt is canonical but this
# ensures the simulator never silently fails due to a missing file.

_FALLBACK_PROMPT = """
You are a physics/mathematics/chemistry/biology/CS parameter extractor.
Produce two parameter objects for a WebGL2 animation simulation:
- studentParams: parameters matching what the STUDENT described (label: YOUR MODEL)
- expertParams:  the domain-correct parameters (label: EXPERT MODEL)

CRITICAL RULE — ALWAYS SIMULATE:
You MUST return simulatable: true for any STEM query.
Only return simulatable: false if the query is completely off-topic (e.g. "hello").
If unsure which template fits, use "generic". Do NOT refuse to simulate STEM content.

OUTPUT FORMAT — Respond ONLY with valid JSON. No preamble, no markdown fences.
{
  "simulatable": true,
  "hint": "<wave|orbital|transform|graph_plot|sort|molecule|generic>",
  "label": "<concept name, 2-5 words>",
  "studentParams": {},
  "expertParams":  {},
  "deltas": [
    { "key": "<param>", "label": "<Human readable>", "studentValue": "<string>", "expertValue": "<string>" }
  ]
}

TEMPLATE SCHEMAS:
wave:      { "frequency": 1.0, "amplitude": 1.0, "phase_shift": 0, "wave_speed": 1.0, "damping": 0, "components": 1 }
orbital:   { "eccentricity": 0.45, "semi_major": 0.5, "speed_model": 1, "period": 8.0 }
transform: { "matrix_a": 2.0, "matrix_b": 0.0, "matrix_c": 0.0, "matrix_d": 0.5, "eigenval1": 2.0, "eigenval2": 0.5, "eigenvec1_x": 1.0, "eigenvec1_y": 0.0, "eigenvec2_x": 0.0, "eigenvec2_y": 1.0, "eigen_rotation": 0.0 }
graph_plot:{ "func_type": 1, "amplitude": 1.0, "frequency": 1.0, "x_offset": 0.0, "derivative_scale": 1.0, "show_derivative": 1 }
sort:      { "algorithm": "merge", "array_size": 8 }
molecule:  { "molecule_type": "water", "bond_angle": 104.5 }
generic:   { "node_count": 8, "hierarchy": 1, "complexity": 0.8 }

RULES:
1. studentParams reflects what the student believes
2. expertParams uses scientifically accepted values
3. deltas lists only parameters that ACTUALLY differ
4. When in doubt, use defaults — a working simulation beats simulatable: false
"""
