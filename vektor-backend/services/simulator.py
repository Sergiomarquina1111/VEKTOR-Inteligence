"""
VEKTOR Intelligence — Simulation Parameter Service
Version: 2.1.0
Session: 13

Changes from v2.0.0:
  - FIX: Gemini simulatable=False no longer kills the pipeline when keyword
    resolver already committed to a non-generic hint.  A safe default spec
    is constructed instead (see _build_fallback_spec).
  - FIX: _CORRECT_DERIVATIVE_PATTERNS extended to catch "derivative of x²
    is x" style wrong-answer queries so T3 misconception path fires correctly.
  - FIX: _apply_defaults now also called on the fallback spec so all required
    params are always present.
  - FIX: _sync_shape_params guard against missing keys in fallback spec.
  - No breaking changes to public API.
"""

import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

from google import genai

logger = logging.getLogger(__name__)

# ─── Model ────────────────────────────────────────────────────────────────────
_MODEL = "gemini-2.5-flash"
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "simulator_params.txt"
_prompt_cache: Optional[str] = None

# ─── func_type constants (graph_plot) ─────────────────────────────────────────
FUNC_SINE     = 0
FUNC_CUBIC    = 1
FUNC_PARABOLA = 2
FUNC_ABS      = 3

# ─── scenario constants (force) ───────────────────────────────────────────────
SCENARIO_FREE_FALL  = 0
SCENARIO_PROJECTILE = 1
SCENARIO_INCLINED   = 2
SCENARIO_COLLISION  = 3

# ─── wave_type constants (wave) ───────────────────────────────────────────────
WAVE_TRANSVERSE  = 0
WAVE_LONGITUDINAL = 1
WAVE_STANDING    = 2

# ─── molecule_type constants (molecule) ───────────────────────────────────────
MOLECULE_WATER      = 0
MOLECULE_CO2        = 1
MOLECULE_METHANE    = 2
MOLECULE_GAS_PISTON = 3
MOLECULE_CIRCUIT    = 4
MOLECULE_FIELD_LINES = 5

# ─── HINT → template mapping ──────────────────────────────────────────────────
SIMULATABLE_HINTS = {
    "graph_plot", "transform", "wave", "orbital", "force",
    "molecule", "sort", "generic",
    # legacy aliases
    "geometry", "molecular", "bond", "dna", "cell", "protein", "membrane",
    "graph_traversal", "algorithm", "data_structure", "neural_net",
    "vector_field", "reaction", "em_field", "quantum",
}

HINT_ALIASES = {
    "geometry":      "transform",
    "molecular":     "molecule",
    "bond":          "molecule",
    "dna":           "molecule",
    "cell":          "molecule",
    "protein":       "molecule",
    "membrane":      "molecule",
    "graph_traversal": "sort",
    "algorithm":     "sort",
    "data_structure": "sort",
    "neural_net":    "generic",
    "vector_field":  "generic",
    "reaction":      "molecule",
    "em_field":      "generic",
    "quantum":       "generic",
}

# ─── MATH keyword → hint override table ───────────────────────────────────────
_MATH_HINT_KEYWORDS = [
    # graph_plot family
    (["derivative", "differentiat", "d/dx", "tangent", "slope of", "rate of change",
      "instantaneous", "f'(x)", "dy/dx"], "graph_plot"),
    (["integral", "integrat", "antiderivativ", "area under", "∫", "definite integral",
      "indefinite integral", "riemann"], "graph_plot"),
    (["limit", "lim ", "approaches", "tends to", "continuity", "continuous",
      "discontinuity", "l'hopital", "epsilon delta"], "graph_plot"),
    (["critical point", "local max", "local min", "optimization", "extrema",
      "inflection", "concavity", "concave"], "graph_plot"),
    (["taylor series", "maclaurin", "power series", "series expansion",
      "polynomial approximation"], "graph_plot"),
    (["function", "f(x)", "parabola", "quadratic", "sine", "cosine", "graph of"], "graph_plot"),
    # transform family
    (["eigenvalue", "eigenvalues", "lambda", "characteristic value", "characteristic equation",
      "det(a-", "det(a -", "spectrum of", "spectral"], "transform"),
    (["eigenvector", "eigenvectors", "av = lv", "av=lv", "direction invariant",
      "characteristic vector", "eigenspace", "principal direction"], "transform"),
    (["linear transformation", "matrix transformation", "rotation matrix", "scaling matrix",
      "shear", "transformation matrix", "t(x) = ax"], "transform"),
    (["determinant", "det(a)", "det a", "|a|", "ad - bc", "ad-bc",
      "singular matrix", "invertible", "volume scaling"], "transform"),
    (["diagonalization", "diagonalizable", "pdp", "eigendecomposition",
      "spectral theorem", "matrix power"], "transform"),
    (["dot product", "inner product", "a·b", "a dot b", "projection",
      "orthogonal", "orthonormal", "gram-schmidt"], "transform"),
]

# ─── PHYSICS keyword → hint override table ────────────────────────────────────
_PHYSICS_HINT_KEYWORDS = [
    (["wave", "frequency", "amplitude", "wavelength", "interference",
      "superposition", "standing wave", "harmonic", "oscillat", "vibrat",
      "sound", "transverse", "longitudinal"], "wave"),
    (["orbit", "orbital", "kepler", "planetary", "planet", "elliptical orbit",
      "circular orbit", "perihelion", "aphelion", "satellite", "escape velocity",
      "gravitational field", "universal gravitation", "F = Gm"], "orbital"),
    (["newton", "force", "f = ma", "f=ma", "free fall", "projectile",
      "momentum", "impulse", "friction", "acceleration due to gravity",
      "heavier", "fall faster", "fall slower", "inertia", "g = 9.8", "9.8 m/s",
      "action reaction", "third law", "normal force"], "force"),
    (["temperature", "thermal", "heat", "entropy", "thermodynamic", "carnot",
      "ideal gas", "pv = nrt", "pv=nrt", "boyle", "charles", "pressure volume",
      "kelvin", "absolute zero", "zeroth law", "first law thermo",
      "second law thermo", "irreversib"], "molecule"),
    (["electric charge", "coulomb", "electric field", "field line",
      "voltage", "ohm", "circuit", "resistor", "v = ir", "v=ir",
      "current", "ampere", "parallel circuit", "series circuit"], "molecule"),
    (["angular momentum", "torque", "l = iω", "l=iω", "moment of inertia",
      "conservation of angular", "spinning"], "generic"),
    (["maxwell", "electromagnetic wave", "speed of light", "faraday",
      "lenz", "induction", "flux", "ampere-maxwell", "displacement current"], "generic"),
    (["conservation of energy", "conservation of momentum", "elastic collision",
      "inelastic collision", "kinetic energy", "potential energy",
      "ke + pe", "mgh", "½mv²", "0.5mv²"], "force"),
    (["circular motion", "centripetal", "centrifugal", "v²/r", "angular velocity",
      "period of rotation", "uniform circular"], "orbital"),
]

# ─── MATH func_type keyword override table ────────────────────────────────────
_FUNC_KEYWORDS = {
    FUNC_PARABOLA: [
        "x^2", "x²", "x square", "x squared", "quadratic", "parabola",
        "power rule", "derivative of x", "d/dx x", "d/dx(x", "x to the 2",
        "second power", "area under parabola", "integral of x²", "integral of x^2",
    ],
    FUNC_ABS: [
        "|x|", "absolute value", "abs(x)", "sharp corner", "cusp",
        "non-differentiable", "not differentiable", "differentiable at origin",
        "differentiable at 0", "v shape",
    ],
    FUNC_CUBIC: [
        "cubic", "x^3", "x³", "x cubed", "inflection point", "inflection",
        "f''=0", "f'' = 0", "second derivative zero", "changes concavity",
    ],
    FUNC_SINE: [
        "sin", "cos", "sine", "cosine", "trigonometric", "trig derivative",
        "d/dx sin", "d/dx cos", "periodic function", "oscillating function",
        "taylor series", "maclaurin", "smooth function", "limit", "continuity",
    ],
}

# ─── CORRECT derivative patterns → T1 override ───────────────────────────────
_CORRECT_DERIVATIVE_PATTERNS = [
    ["derivative of x", "is 2x"],
    ["derivative of x", "2x"],
    ["d/dx", "x^2", "2x"],
    ["d/dx", "x²", "2x"],
    ["power rule", "2x"],
    ["power rule", "nx^(n-1)"],
    ["x square", "2x"],
    ["x squared", "2x"],
    ["x^2", "equals 2x"],
    ["derivative", "correct"],
]

# ─── WRONG derivative patterns → T3 misconception ────────────────────────────
# These look "almost right" but carry the classic off-by-factor-of-2 error.
_WRONG_DERIVATIVE_PATTERNS = [
    ["derivative of x", "is x"],       # "the derivative of x² is x"
    ["derivative of x", "equals x"],
    ["d/dx", "x^2", "= x"],
    ["d/dx", "x²", "= x"],
    ["d/dx x^2", "x"],
    ["d/dx x²", "x"],
    ["x square", "is x"],
    ["x squared", "is x"],
    ["power rule", "drop the exponent"],  # "just drop the exponent"
]

_CORRECT_INTEGRAL_PATTERNS = [
    ["integral of x^2", "x^3/3"],
    ["integral of x²", "x³/3"],
    ["antiderivative of x^2", "x^3"],
    ["∫x²", "x³"],
]

_CORRECT_EIGENVALUE_PATTERNS = [
    ["eigenvalue", "det(a - λi) = 0"],
    ["eigenvalue", "det(a-λi)"],
    ["characteristic equation", "det"],
    ["eigenvalue", "scalar"],
    ["av = λv"],
    ["eigenvector", "direction", "not rotate"],
    ["eigenvector", "only scaled"],
]


def _load_prompt() -> str:
    global _prompt_cache
    if _prompt_cache is None:
        with open(_PROMPT_PATH, encoding = "utf-8") as f:
            _prompt_cache = f.read()
    return _prompt_cache


def _resolve_hint(query: str, subject: str, gemini_hint: Optional[str]) -> str:
    """
    Determine the correct simulation hint from keyword matching.
    Gemini's hint is used only as a tie-breaker when no keyword matches.
    """
    q = query.lower()

    if subject in ("mathematics", "math", "maths"):
        for keywords, hint in _MATH_HINT_KEYWORDS:
            if any(kw in q for kw in keywords):
                logger.info(f"[HINT] Math keyword match → {hint}")
                return hint

    if subject in ("physics", "phys"):
        for keywords, hint in _PHYSICS_HINT_KEYWORDS:
            if any(kw in q for kw in keywords):
                logger.info(f"[HINT] Physics keyword match → {hint}")
                return hint

    # Cross-subject fallbacks
    wave_kw = ["wave", "frequency", "amplitude", "oscillat", "vibrat", "interference", "sound"]
    if any(kw in q for kw in wave_kw):
        return "wave"

    orbital_kw = ["orbit", "kepler", "planet", "ellipse", "perihelion", "aphelion"]
    if any(kw in q for kw in orbital_kw):
        return "orbital"

    force_kw = ["newton", "force", "f=ma", "f = ma", "free fall", "projectile", "momentum"]
    if any(kw in q for kw in force_kw):
        return "force"

    transform_kw = ["eigenvalue", "eigenvector", "matrix transform", "linear transform", "determinant"]
    if any(kw in q for kw in transform_kw):
        return "transform"

    graph_kw = ["derivative", "integral", "limit", "function", "differentiat", "antiderivativ"]
    if any(kw in q for kw in graph_kw):
        return "graph_plot"

    if gemini_hint and gemini_hint in SIMULATABLE_HINTS:
        resolved = HINT_ALIASES.get(gemini_hint, gemini_hint)
        logger.info(f"[HINT] Using Gemini hint: {gemini_hint} → {resolved}")
        return resolved

    logger.info("[HINT] No match found → generic")
    return "generic"


def _resolve_func_type(query: str, gemini_func_type: int) -> int:
    """Override func_type based on query keywords."""
    q = query.lower()
    for func_type, keywords in _FUNC_KEYWORDS.items():
        if any(kw in q for kw in keywords):
            if func_type != gemini_func_type:
                logger.info(f"[FUNC_TYPE] Override: {gemini_func_type} → {func_type}")
            return func_type
    return gemini_func_type


def _is_correct_statement(query: str, patterns: list) -> bool:
    """Check if query matches any multi-keyword correct-statement pattern."""
    q = query.lower()
    for pattern in patterns:
        if all(kw in q for kw in pattern):
            logger.info(f"[T1_DETECT] Correct statement pattern matched: {pattern}")
            return True
    return False


def _is_wrong_derivative(query: str) -> bool:
    """
    Detect the classic 'derivative of x² = x' misconception.
    Returns True when the student drops the coefficient-2 from the power rule.
    """
    return _is_correct_statement(query, _WRONG_DERIVATIVE_PATTERNS)


# ─── T1 param overrides ───────────────────────────────────────────────────────

def _apply_graph_plot_t1(data: dict, query: str) -> dict:
    q = query.lower()
    sp = data["studentParams"]
    ep = data["expertParams"]

    if any(kw in q for kw in ["integral", "antiderivativ", "area under", "∫"]):
        sp.update({"show_integral": 0, "show_derivative": 0, "show_tangent": 0, "derivative_scale": 1.0})
        ep.update({"show_integral": 1, "show_derivative": 0, "show_tangent": 0, "derivative_scale": 1.0})
        data["deltas"] = [{"key": "show_integral", "label": "Area visualisation",
                           "studentValue": "Not shown", "expertValue": "Shaded area shown"}]
    else:
        sp.update({"derivative_scale": 1.0, "show_derivative": 0, "show_tangent": 1})
        ep.update({"derivative_scale": 1.0, "show_derivative": 1, "show_tangent": 1})
        data["deltas"] = [{"key": "show_derivative", "label": "Derivative curve",
                           "studentValue": "Not shown", "expertValue": "Shown — 2x (linear)"}]

    logger.info("[T1_APPLY] graph_plot T1 params applied")
    return data


def _apply_graph_plot_t3_wrong_derivative(data: dict) -> dict:
    """
    T3 misconception: student thinks d/dx x² = x (missing the factor of 2).
    student: derivative_scale=0.5 (slope is half of correct), show_derivative=0
    expert:  derivative_scale=1.0 (correct slope),           show_derivative=1
    """
    sp = data["studentParams"]
    ep = data["expertParams"]

    sp.update({
        "func_type":       FUNC_PARABOLA,
        "derivative_scale": 0.5,   # represents "f'(x) = x" — half the correct slope
        "show_derivative":  0,
        "show_tangent":    1,
        "show_integral":   0,
    })
    ep.update({
        "func_type":       FUNC_PARABOLA,
        "derivative_scale": 1.0,   # represents "f'(x) = 2x" — correct
        "show_derivative":  1,
        "show_tangent":    1,
        "show_integral":   0,
    })

    data["deltas"] = [
        {
            "key":          "derivative_scale",
            "label":        "Derivative slope at x = 1",
            "studentValue": "1.0  (believes d/dx x² = x)",
            "expertValue":  "2.0  (correct: d/dx x² = 2x)",
        },
        {
            "key":          "show_derivative",
            "label":        "Derivative curve f'(x)",
            "studentValue": "Not shown",
            "expertValue":  "f'(x) = 2x shown in cyan",
        },
    ]

    logger.info("[T3_APPLY] graph_plot wrong-derivative misconception params applied")
    return data


def _apply_transform_t1(data: dict) -> dict:
    for side in ("studentParams", "expertParams"):
        data[side].update({"show_eigenvectors": 1, "eigen_rotation": 0.0, "show_grid": 0})
    data["expertParams"]["show_grid"] = 1
    data["deltas"] = [{"key": "show_grid", "label": "Grid transformation",
                       "studentValue": "Not shown",
                       "expertValue": "Shown — space stretches along eigenvector axes"}]
    logger.info("[T1_APPLY] transform T1 params applied")
    return data


def _apply_wave_t1(data: dict) -> dict:
    for side in ("studentParams", "expertParams"):
        data[side].update({"show_superposition": 0})
    data["expertParams"]["show_superposition"] = 1
    data["deltas"] = [{"key": "show_superposition", "label": "Superposition resultant",
                       "studentValue": "Not shown", "expertValue": "Resultant wave shown"}]
    logger.info("[T1_APPLY] wave T1 params applied")
    return data


def _apply_orbital_t1(data: dict) -> dict:
    for side in ("studentParams", "expertParams"):
        data[side].update({"speed_model": 1, "show_focus": 1})
    data["expertParams"]["show_area_sweep"] = 1
    data["studentParams"]["show_area_sweep"] = 0
    data["deltas"] = [{"key": "show_area_sweep", "label": "Equal-area sweep",
                       "studentValue": "Not visualised",
                       "expertValue": "Equal areas shown (Kepler 2nd law)"}]
    logger.info("[T1_APPLY] orbital T1 params applied")
    return data


def _apply_force_t1(data: dict) -> dict:
    for side in ("studentParams", "expertParams"):
        data[side].update({"gravity_model": 1, "show_force_vectors": 0})
    data["expertParams"]["show_force_vectors"] = 1
    data["deltas"] = [{"key": "show_force_vectors", "label": "Force vector diagram",
                       "studentValue": "Not shown", "expertValue": "F=ma arrows shown"}]
    logger.info("[T1_APPLY] force T1 params applied")
    return data


# ─── Shape sync + defaults ────────────────────────────────────────────────────

def _sync_shape_params(data: dict, hint: str) -> dict:
    """Ensure shape/type parameters are identical between student and expert params."""
    sp = data.get("studentParams", {})
    ep = data.get("expertParams", {})

    if hint == "graph_plot":
        for key in ("func_type", "amplitude", "frequency", "integral_from", "integral_to"):
            val = sp.get(key, ep.get(key))
            if val is not None:
                sp[key] = val
                ep[key] = val
        q = data.get("_query", "")
        ft = _resolve_func_type(q, int(sp.get("func_type", FUNC_PARABOLA)))
        sp["func_type"] = ft
        ep["func_type"] = ft

    elif hint == "transform":
        for key in ("matrix_a", "matrix_b", "matrix_c", "matrix_d",
                    "eigenval1", "eigenval2", "eigenvec1_x", "eigenvec1_y",
                    "eigenvec2_x", "eigenvec2_y", "transform_amount"):
            val = ep.get(key, sp.get(key))
            if val is not None:
                sp[key] = val
                ep[key] = val

    elif hint == "wave":
        for key in ("wave_type", "wave_speed"):
            val = sp.get(key, ep.get(key))
            if val is not None:
                sp[key] = val
                ep[key] = val

    elif hint == "orbital":
        for key in ("semi_major", "trail_length", "period_exponent"):
            val = ep.get(key, sp.get(key))
            if val is not None:
                sp[key] = val
                ep[key] = val

    elif hint == "force":
        for key in ("scenario", "mass1", "mass2", "angle", "initial_velocity"):
            val = sp.get(key, ep.get(key))
            if val is not None:
                sp[key] = val
                ep[key] = val

    data["studentParams"] = sp
    data["expertParams"] = ep
    return data


def _apply_defaults(data: dict, hint: str) -> dict:
    """Fill in any missing required params with safe defaults."""
    sp = data.get("studentParams", {})
    ep = data.get("expertParams", {})

    defaults = {
        "graph_plot": {
            "func_type": FUNC_PARABOLA, "amplitude": 0.8, "frequency": 0.9,
            "derivative_scale": 1.0, "show_derivative": 0, "show_integral": 0,
            "show_tangent": 1, "integral_from": -0.8, "integral_to": 0.8,
        },
        "transform": {
            "matrix_a": 3.0, "matrix_b": 0.0, "matrix_c": 0.0, "matrix_d": 2.0,
            "eigenval1": 3.0, "eigenval2": 2.0,
            "eigenvec1_x": 1.0, "eigenvec1_y": 0.0,
            "eigenvec2_x": 0.0, "eigenvec2_y": 1.0,
            "show_eigenvectors": 1, "show_grid": 0,
            "eigen_rotation": 0.0, "transform_amount": 1,
        },
        "wave": {
            "frequency1": 1.0, "amplitude1": 0.7, "frequency2": 1.0, "amplitude2": 0.7,
            "phase_offset": 0.0, "wave_type": WAVE_TRANSVERSE,
            "show_superposition": 0, "damping": 0.0, "wave_speed": 1.0,
        },
        "orbital": {
            "eccentricity": 0.45, "semi_major": 0.55, "speed_model": 1,
            "show_area_sweep": 0, "show_focus": 1,
            "period_exponent": 1.5, "trail_length": 0.6,
        },
        "force": {
            "scenario": SCENARIO_FREE_FALL, "mass1": 5, "mass2": 1,
            "gravity_model": 1, "angle": 45, "friction": 0,
            "show_force_vectors": 1, "show_trajectory": 1, "initial_velocity": 5,
        },
        "molecule": {
            "molecule_type": MOLECULE_GAS_PISTON, "bond_angle": 104.5,
            "temperature": 0.6, "pressure": 0.5,
            "show_field_lines": 0, "charge_sign": 1,
            "voltage": 3.0, "resistance": 2.0,
        },
        "generic": {
            "node_count": 6, "hierarchy": 1, "connection_density": 0.5,
            "highlight_node": 0, "node_labels": [], "layout": 1,
        },
    }

    d = defaults.get(hint, defaults["generic"])
    for key, val in d.items():
        sp.setdefault(key, val)
        ep.setdefault(key, val)

    data["studentParams"] = sp
    data["expertParams"] = ep
    return data


# ─── NEW: fallback spec builder ───────────────────────────────────────────────

def _build_fallback_spec(hint: str, subject: str, tier: str, query: str) -> dict:
    """
    Build a minimal simulatable spec when Gemini returns simulatable=False
    but the keyword resolver already committed to a real hint.

    This guarantees the simulation pipeline never fails silently for concepts
    that our keyword tables definitively recognise.
    """
    logger.warning(
        "[SIM] Gemini returned simulatable=False but keyword resolver committed to "
        f"hint={hint!r}. Building fallback spec."
    )

    # Human-readable label from the query (first 60 chars, title-cased)
    raw_label = query.strip()[:60]
    label = raw_label[0].upper() + raw_label[1:] if raw_label else f"{subject.title()} concept"

    data = {
        "simulatable":    True,
        "simulationHint": hint,
        "label":          label,
        "studentParams":  {},
        "expertParams":   {},
        "deltas":         [],
    }

    # Store query for downstream resolvers
    data["_query"] = query

    # Fill defaults first so all required keys exist
    data = _apply_defaults(data, hint)

    # Then apply any concept-specific misconception overrides
    if hint == "graph_plot":
        if _is_wrong_derivative(query):
            logger.info("[SIM] Fallback: wrong-derivative misconception detected → T3 override")
            data = _apply_graph_plot_t3_wrong_derivative(data)
        elif _is_correct_statement(query, _CORRECT_DERIVATIVE_PATTERNS):
            logger.info("[SIM] Fallback: correct derivative detected → T1 override")
            data = _apply_graph_plot_t1(data, query)
        elif _is_correct_statement(query, _CORRECT_INTEGRAL_PATTERNS):
            logger.info("[SIM] Fallback: correct integral detected → T1 override")
            data = _apply_graph_plot_t1(data, query)

    return data


# ─── Main entry point ─────────────────────────────────────────────────────────

async def extract_simulation_params(
    query: str,
    subject: str,
    tier: str,
    gemini_hint: Optional[str],
    triples: list,
) -> dict:
    """
    Main entry point.  Returns a complete SimulationResponse dict.
    All failures return simulatable=False — never crash the core pipeline.

    Flow:
      1. Keyword resolver commits to a hint  (never falls back to Gemini on mismatch)
      2. Gemini is called for rich parameter extraction
      3. If Gemini returns simulatable=False AND hint != 'generic' → use fallback spec
      4. Shape sync + defaults + tier overrides applied
    """
    t0 = time.time()

    NOT_SIMULATABLE = {
        "simulatable": False, "simulationHint": None, "label": None,
        "studentParams": {}, "expertParams": {}, "deltas": [],
    }

    try:
        prompt_template = _load_prompt()
    except Exception as e:
        logger.error(f"[SIM] Prompt load failed: {e}")
        return NOT_SIMULATABLE

    # ── Step 1: keyword-driven hint resolution ─────────────────────────────────
    hint = _resolve_hint(query, subject, gemini_hint)

    # ── Step 2: call Gemini ────────────────────────────────────────────────────
    prompt = (
        f"{prompt_template}\n\n"
        f"QUERY: {query}\n"
        f"SUBJECT: {subject}\n"
        f"TIER: {tier}\n"
        f"SIMULATION HINT: {hint}\n"
        f"TRIPLES: {json.dumps(triples)}\n"
        f"Return only the JSON object."
    )

    data = None
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
            data = json.loads(raw)
            break
        except Exception as e:
            wait = [0.2, 0.4, 0.8][attempt]
            logger.warning(f"[SIM] Attempt {attempt+1} failed: {e}. Retrying in {wait}s")
            time.sleep(wait)

    if data is None:
        logger.error("[SIM] All Gemini attempts failed.")
        # ── KEY FIX A: Gemini totally unreachable + keyword hint → fallback ───
        if hint != "generic":
            data = _build_fallback_spec(hint, subject, tier, query)
        else:
            return NOT_SIMULATABLE

    # ── KEY FIX B: Gemini returned simulatable=False but we know the hint ──────
    # When the keyword resolver already committed to a real (non-generic) hint,
    # Gemini is wrong to say it's not simulatable — it just didn't recognise the
    # short student query as a STEM statement.  Build a fallback instead.
    if not data.get("simulatable", False):
        if hint != "generic":
            data = _build_fallback_spec(hint, subject, tier, query)
        else:
            logger.info("[SIM] hint=generic and simulatable=False → not simulatable")
            return NOT_SIMULATABLE

    # ── Step 3: inject query for downstream resolvers ──────────────────────────
    data["_query"] = query

    # ── Step 4: override hint (keyword table wins over Gemini) ────────────────
    data["simulationHint"] = hint

    # ── Step 5: sync shape params ──────────────────────────────────────────────
    data = _sync_shape_params(data, hint)

    # ── Step 6: fill missing params with defaults ──────────────────────────────
    data = _apply_defaults(data, hint)

    # ── Step 7: T3 wrong-derivative check (must run before T1 — T3 takes priority
    #    when the student's statement is identifiably wrong) ────────────────────
    if hint == "graph_plot" and _is_wrong_derivative(query):
        data = _apply_graph_plot_t3_wrong_derivative(data)

    # ── Step 8: T1 overrides ──────────────────────────────────────────────────
    elif tier == "T1":
        if hint == "graph_plot":
            data = _apply_graph_plot_t1(data, query)
        elif hint == "transform":
            if _is_correct_statement(query, _CORRECT_EIGENVALUE_PATTERNS):
                data = _apply_transform_t1(data)
        elif hint == "wave":
            data = _apply_wave_t1(data)
        elif hint == "orbital":
            data = _apply_orbital_t1(data)
        elif hint == "force":
            data = _apply_force_t1(data)

    # ── Step 9: T1 correct derivative/integral specific override ──────────────
    elif hint == "graph_plot":
        if _is_correct_statement(query, _CORRECT_DERIVATIVE_PATTERNS):
            data = _apply_graph_plot_t1(data, query)
        elif _is_correct_statement(query, _CORRECT_INTEGRAL_PATTERNS):
            data = _apply_graph_plot_t1(data, query)

    # ── Step 10: cleanup ──────────────────────────────────────────────────────
    data.pop("_query", None)

    if data.get("simulationHint") in HINT_ALIASES:
        data["simulationHint"] = HINT_ALIASES[data["simulationHint"]]

    elapsed = (time.time() - t0) * 1000
    logger.info(
        f"[SIM] Complete in {elapsed:.0f}ms — "
        f"hint={hint} tier={tier} simulatable={data.get('simulatable')}"
    )
    return data