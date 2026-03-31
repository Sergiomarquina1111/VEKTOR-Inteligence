"""
vektor-backend/services/simulator.py
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

# ── func_type constants — MUST match the GLSL shader in graph_plot.ts ─────────
# Shader:  < 0.5 → sine
#          < 1.5 → cubic (k³ - k)
#          < 2.5 → parabola (k²)   ← x², quadratic, derivative topics
#          else  → absolute value
FUNC_SINE     = 0
FUNC_CUBIC    = 1
FUNC_PARABOLA = 2
FUNC_ABS      = 3

# ── Keyword → func_type override ──────────────────────────────────────────────
# When a query clearly involves a specific function, override whatever Gemini
# chose. Prevents Gemini picking sine (0) for x² / derivative queries.
_FUNC_KEYWORDS: list[tuple[list[str], int]] = [
    (["x^2", "x²", "x square", "quadratic", "parabola", "x*x",
      "power rule", "derivative of x", "d/dx(x"], FUNC_PARABOLA),
    (["sine", "sin(x)", "cosine", "cos(x)", "sinusoidal"], FUNC_SINE),
    (["cubic", "x^3", "x³", "x cube"], FUNC_CUBIC),
    (["absolute value", "abs(x)", "|x|", "modulus function"], FUNC_ABS),
]

# ── T1 correct-statement detector for graph_plot ───────────────────────────────
# Gemini pattern-matches ANY x² + derivative query to the T3 misconception
# example and returns derivative_scale=0.5 on studentParams even when the
# student stated the correct rule. These multi-keyword patterns detect that.
_CORRECT_DERIVATIVE_PATTERNS: list[list[str]] = [
    ["derivative of x", "is 2x"],
    ["derivative of x", "2x"],
    ["d/dx", "x^2", "2x"],
    ["d/dx", "x²", "2x"],
    ["power rule", "2x"],
    ["x square", "2x"],
    ["x squared", "2x"],
]

_MODEL = "gemini-2.5-flash"


def _get_client() -> genai.Client:
    return genai.Client(api_key=os.getenv("GEMINI_API_KEY", ""))


def _load_prompt() -> str:
    global _PROMPT_CACHE
    if not _PROMPT_CACHE:
        try:
            _PROMPT_CACHE = _PROMPT_PATH.read_text(encoding="utf-8")
            logger.info("[simulator] Loaded prompt from %s", _PROMPT_PATH.resolve())
        except FileNotFoundError:
            logger.warning("[simulator] simulation_params.txt not found — using fallback")
            _PROMPT_CACHE = _FALLBACK_PROMPT
    return _PROMPT_CACHE


def _resolve_func_type(query: str, func_type: int) -> int:
    """
    Override func_type based on keywords in the student's query.
    Hard override so x² queries always render a parabola regardless of
    what Gemini returns.
    """
    q = query.lower()
    for keywords, ftype in _FUNC_KEYWORDS:
        if any(kw in q for kw in keywords):
            if ftype != func_type:
                logger.info("[simulator] func_type override: %d → %d", func_type, ftype)
            return ftype
    return func_type


def _is_correct_derivative_statement(query: str) -> bool:
    """
    Returns True if the student stated the derivative CORRECTLY
    (e.g. "the derivative of x square is 2x").

    Gemini ignores the tier context and still returns derivative_scale=0.5
    for any x² derivative query because it pattern-matches the T3 example.
    This Python-level check lets us override that before it reaches the frontend.
    """
    q = query.lower()
    for pattern in _CORRECT_DERIVATIVE_PATTERNS:
        if all(kw in q for kw in pattern):
            logger.info("[simulator] Correct derivative statement detected — forcing T1 params")
            return True
    return False


def _apply_graph_plot_tier1(data: dict, query: str) -> dict:
    """
    Applied when the student states a CORRECT graph_plot fact (T1).

    Both canvases show the same f(x) with derivative_scale=1.0.
    The only difference: YOUR MODEL has show_derivative=0 (they know the
    rule but haven't visualised it), EXPERT MODEL has show_derivative=1
    (derivative curve overlaid in cyan to show what it looks like).

    This is pedagogically correct for T1 — the student knows the answer,
    so VEKTOR shows them the next layer: what the derivative looks like as
    a continuous curve.
    """
    sp = dict(data.get("studentParams", {}))
    ep = dict(data.get("expertParams",  {}))

    func_type = _resolve_func_type(
        query, int(sp.get("func_type", ep.get("func_type", FUNC_PARABOLA)))
    )
    amplitude = float(ep.get("amplitude", sp.get("amplitude", 1.0)))
    frequency = float(ep.get("frequency", sp.get("frequency", 0.9)))

    for d in (sp, ep):
        d["func_type"]        = func_type
        d["amplitude"]        = amplitude
        d["frequency"]        = frequency
        d["derivative_scale"] = 1.0   # correct on both — student stated it right

    sp["show_derivative"] = 0   # YOUR MODEL: knows the rule, no curve overlay
    ep["show_derivative"] = 1   # EXPERT MODEL: derivative curve in cyan

    data["studentParams"] = sp
    data["expertParams"]  = ep
    data["deltas"] = [
        {
            "key":          "show_derivative",
            "label":        "Derivative Visualisation",
            "studentValue": "Knows d/dx(x²) = 2x but hasn't visualised it as a curve",
            "expertValue":  "Derivative shown in cyan — slope at every point of x²",
        }
    ]
    logger.info("[simulator] T1 graph_plot applied — func_type=%d", func_type)
    return data


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

            logger.info("[simulator] raw response (attempt %d): %s", attempt + 1, raw[:500])

            data = json.loads(raw.strip())

            if not data.get("simulatable", False):
                logger.info("[simulator] simulatable=false for hint=%s", resolved_hint)
                return {"simulatable": False}

            for field in ("hint", "label", "studentParams", "expertParams"):
                if field not in data:
                    logger.warning("[simulator] missing field '%s'", field)
                    return {"simulatable": False}

            data.setdefault("deltas", [])

            # ── GRAPH_PLOT PROCESSING ──────────────────────────────────────────
            if data.get("hint") == "graph_plot":
                sp = data.get("studentParams", {})
                ep = data.get("expertParams",  {})

                # Step 1 — Lock shape params (func_type, amplitude, frequency)
                #          identical on both canvases; apply keyword override.
                raw_func       = ep.get("func_type", sp.get("func_type", FUNC_PARABOLA))
                canonical_func = _resolve_func_type(query, int(raw_func))
                canonical_amp  = ep.get("amplitude", sp.get("amplitude", 1.0))
                canonical_freq = ep.get("frequency", sp.get("frequency", 0.9))

                sp["func_type"] = canonical_func;  ep["func_type"] = canonical_func
                sp["amplitude"] = canonical_amp;   ep["amplitude"] = canonical_amp
                sp["frequency"] = canonical_freq;  ep["frequency"] = canonical_freq

                data["studentParams"] = sp
                data["expertParams"]  = ep

                # Step 2 — T1 override: Gemini returns derivative_scale=0.5 on
                #          studentParams even when the student is CORRECT because
                #          it pattern-matches the T3 misconception example.
                #          Detect correct statements and apply T1 layout instead.
                if _is_correct_derivative_statement(query):
                    data = _apply_graph_plot_tier1(data, query)
                    logger.info("[simulator] OK (T1 override) — hint=%s label=%s",
                                data["hint"], data["label"])
                    return data

            # ── VALIDATION: catch identical params (rare after T1 override) ───
            sp = data["studentParams"]
            ep = data["expertParams"]
            if sp == ep or not data["deltas"]:
                logger.warning("[simulator] studentParams == expertParams — forcing differentiation")
                data = _force_differentiation(data, subject, resolved_hint, tier, query)

            logger.info("[simulator] OK — hint=%s label=%s deltas=%d",
                        data["hint"], data["label"], len(data["deltas"]))
            return data

        except json.JSONDecodeError as e:
            logger.warning("[simulator] JSON parse error attempt %d: %s", attempt + 1, e)
        except Exception as e:
            logger.warning("[simulator] Gemini error attempt %d: %s", attempt + 1, e)

    logger.warning("[simulator] All 3 attempts failed — returning simulatable=False")
    return {"simulatable": False}


def _force_differentiation(data: dict, subject: str, hint: str, tier: str,
                            query: str = "") -> dict:
    """
    Safety net: when Gemini returns identical studentParams and expertParams,
    apply subject-aware defaults that guarantee a visible visual difference.
    """
    sp = dict(data.get("studentParams", {}))
    ep = dict(data.get("expertParams",  {}))
    is_misconception = "T3" in tier

    if hint == "orbital":
        sp.setdefault("speed_model",  0)
        sp.setdefault("eccentricity", 0.0)
        ep["speed_model"]  = 1
        ep["eccentricity"] = 0.45
        if is_misconception:
            sp["speed_model"] = 0
            sp["eccentricity"] = 0.0
        data["deltas"] = [
            {"key": "speed_model",  "label": "Speed Model",
             "studentValue": "Constant speed (circular orbit)",
             "expertValue":  "Variable speed — Kepler's 2nd Law"},
            {"key": "eccentricity", "label": "Orbit Shape",
             "studentValue": "Circle (e=0.0)",
             "expertValue":  "Ellipse (e=0.45)"},
        ]

    elif hint == "wave":
        amp = float(sp.get("amplitude", 1.0))
        sp["wave_speed"] = round(amp * 1.8, 2)
        ep["wave_speed"] = 1.0
        ep["amplitude"]  = amp
        data["deltas"] = [
            {"key": "wave_speed", "label": "Wave Speed",
             "studentValue": f"Proportional to amplitude ({sp['wave_speed']})",
             "expertValue":  "Constant — independent of amplitude (1.0)"},
        ]

    elif hint == "molecule":
        mol = sp.get("molecule_type", "water")
        correct_angles = {"water": 104.5, "methane": 109.5, "co2": 180.0}
        wrong_angles   = {"water": 90.0,  "methane": 90.0,  "co2": 120.0}
        sp["bond_angle"]    = wrong_angles.get(mol, 90.0)
        ep["bond_angle"]    = correct_angles.get(mol, 104.5)
        sp["molecule_type"] = mol
        ep["molecule_type"] = mol
        data["deltas"] = [
            {"key": "bond_angle", "label": "Bond Angle",
             "studentValue": f"{sp['bond_angle']}° (incorrect geometry)",
             "expertValue":  f"{ep['bond_angle']}° (VSEPR theory)"},
        ]

    elif hint == "graph_plot":
        # Resolve func_type from params AND keywords — default PARABOLA, never sine.
        raw_func  = sp.get("func_type", ep.get("func_type", FUNC_PARABOLA))
        func_type = _resolve_func_type(query, int(raw_func))
        amplitude = float(sp.get("amplitude", ep.get("amplitude", 1.0)))
        frequency = float(sp.get("frequency", ep.get("frequency", 0.9)))

        for d in (sp, ep):
            d["func_type"] = func_type
            d["amplitude"] = amplitude
            d["frequency"] = frequency

        sp["show_derivative"]  = 0
        sp["derivative_scale"] = 1.0
        ep["show_derivative"]  = 1
        ep["derivative_scale"] = 1.0
        data["deltas"] = [
            {"key": "show_derivative", "label": "Derivative Visualisation",
             "studentValue": "Knows the rule but doesn't see the derivative as a curve",
             "expertValue":  "Derivative shown as slope at every point on f(x)"},
        ]

    elif hint == "transform":
        sp["eigen_rotation"] = 0.785
        ep["eigen_rotation"] = 0.0
        data["deltas"] = [
            {"key": "eigen_rotation", "label": "Eigenvector Rotation",
             "studentValue": "Rotates 45° after transformation",
             "expertValue":  "No rotation — eigenvectors only scale"},
        ]

    elif hint == "sort":
        sp["algorithm"] = "bubble"
        ep["algorithm"] = "merge"
        data["deltas"] = [
            {"key": "algorithm", "label": "Algorithm",
             "studentValue": "Bubble sort — O(n²) comparisons",
             "expertValue":  "Merge sort — O(n log n) optimal"},
        ]

    else:  # generic
        sp["hierarchy"]  = 0
        sp["node_count"] = max(int(sp.get("node_count", 4)), 4)
        sp["complexity"] = 0.3
        ep["hierarchy"]  = 1
        ep["node_count"] = max(int(ep.get("node_count", 8)), 7)
        ep["complexity"] = 0.8
        data["deltas"] = [
            {"key": "hierarchy",  "label": "Conceptual Structure",
             "studentValue": "Flat — concepts not connected hierarchically",
             "expertValue":  "Hierarchical — deep interconnected understanding"},
            {"key": "complexity", "label": "Depth",
             "studentValue": "Surface level (0.3)",
             "expertValue":  "Deep understanding (0.8)"},
        ]

    data["studentParams"] = sp
    data["expertParams"]  = ep
    return data


# ── Fallback prompt (used when simulation_params.txt is missing) ──────────────
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
graph_plot:{ "func_type": 2, "amplitude": 1.0, "frequency": 1.0, "x_offset": 0.0, "derivative_scale": 1.0, "show_derivative": 1 }
sort:      { "algorithm": "merge", "array_size": 8 }
molecule:  { "molecule_type": "water", "bond_angle": 104.5 }
generic:   { "node_count": 8, "hierarchy": 1, "complexity": 0.8 }

RULES:
1. studentParams reflects what the student believes
2. expertParams uses scientifically accepted values
3. deltas lists only parameters that ACTUALLY differ
4. When in doubt, use defaults — a working simulation beats simulatable: false
"""