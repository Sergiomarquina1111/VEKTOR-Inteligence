"""
VEKTOR Intelligence — Simulation Parameter Service
Version: 2.0.0
Session: 12
Changes from v1.x:
  - Complete Math keyword override table (30+ concepts)
  - Complete Physics keyword override table (29 DKG nodes)
  - T1/T3 split logic for ALL template families (not just graph_plot)
  - Fallback chain for every subject/concept
  - _force_params() replaces _force_differentiation() — general for all templates
  - Named constants for all discrete enum parameters
  - Full logging for all override decisions
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
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "simulation_params.txt"
_prompt_cache: Optional[str] = None

# ─── func_type constants (graph_plot) ─────────────────────────────────────────
FUNC_SINE = 0
FUNC_CUBIC = 1
FUNC_PARABOLA = 2
FUNC_ABS = 3

# ─── scenario constants (force) ───────────────────────────────────────────────
SCENARIO_FREE_FALL = 0
SCENARIO_PROJECTILE = 1
SCENARIO_INCLINED = 2
SCENARIO_COLLISION = 3

# ─── wave_type constants (wave) ───────────────────────────────────────────────
WAVE_TRANSVERSE = 0
WAVE_LONGITUDINAL = 1
WAVE_STANDING = 2

# ─── molecule_type constants (molecule) ───────────────────────────────────────
MOLECULE_WATER = 0
MOLECULE_CO2 = 1
MOLECULE_METHANE = 2
MOLECULE_GAS_PISTON = 3
MOLECULE_CIRCUIT = 4
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
    "geometry": "transform",
    "molecular": "molecule",
    "bond": "molecule",
    "dna": "molecule",
    "cell": "molecule",
    "protein": "molecule",
    "membrane": "molecule",
    "graph_traversal": "sort",
    "algorithm": "sort",
    "data_structure": "sort",
    "neural_net": "generic",
    "vector_field": "generic",
    "reaction": "molecule",
    "em_field": "generic",
    "quantum": "generic",
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
    # wave family
    (["wave", "frequency", "amplitude", "wavelength", "interference",
      "superposition", "standing wave", "harmonic", "oscillat", "vibrat",
      "sound", "transverse", "longitudinal"], "wave"),
    # orbital family
    (["orbit", "orbital", "kepler", "planetary", "planet", "elliptical orbit",
      "circular orbit", "perihelion", "aphelion", "satellite", "escape velocity",
      "gravitational field", "universal gravitation", "F = Gm"], "orbital"),
    # force family
    (["newton", "force", "f = ma", "f=ma", "free fall", "projectile",
      "momentum", "impulse", "friction", "acceleration due to gravity",
      "heavier", "fall faster", "fall slower", "inertia", "g = 9.8", "9.8 m/s",
      "action reaction", "third law", "normal force"], "force"),
    # molecule family — thermodynamics
    (["temperature", "thermal", "heat", "entropy", "thermodynamic", "carnot",
      "ideal gas", "pv = nrt", "pv=nrt", "boyle", "charles", "pressure volume",
      "kelvin", "absolute zero", "zeroth law", "first law thermo",
      "second law thermo", "irreversib"], "molecule"),
    # molecule family — electromagnetism
    (["electric charge", "coulomb", "electric field", "field line",
      "voltage", "ohm", "circuit", "resistor", "v = ir", "v=ir",
      "current", "ampere", "parallel circuit", "series circuit"], "molecule"),
    # generic family — angular momentum, maxwell, conservation laws
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
        with open(_PROMPT_PATH) as f:
            _prompt_cache = f.read()
    return _prompt_cache


def _resolve_hint(query: str, subject: str, gemini_hint: Optional[str]) -> str:
    """
    Determine the correct simulation hint from keyword matching.
    Gemini's hint is used only as a tie-breaker when no keyword matches.
    """
    q = query.lower()

    # Math subject: check math keyword table
    if subject in ("mathematics", "math", "maths"):
        for keywords, hint in _MATH_HINT_KEYWORDS:
            if any(kw in q for kw in keywords):
                logger.info(f"[HINT] Math keyword match → {hint}")
                return hint

    # Physics subject: check physics keyword table
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

    # Use Gemini's hint if it's valid
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


def _apply_graph_plot_t1(data: dict, query: str) -> dict:
    """Force graph_plot params for T1 (correct derivative/integral knowledge)."""
    q = query.lower()
    sp = data["studentParams"]
    ep = data["expertParams"]

    if any(kw in q for kw in ["integral", "antiderivativ", "area under", "∫"]):
        # T1 integral: show area on expert, not on student (visualisation)
        sp.update({"show_integral": 0, "show_derivative": 0, "show_tangent": 0,
                   "derivative_scale": 1.0})
        ep.update({"show_integral": 1, "show_derivative": 0, "show_tangent": 0,
                   "derivative_scale": 1.0})
        data["deltas"] = [{"key": "show_integral", "label": "Area visualisation",
                           "studentValue": "Not shown", "expertValue": "Shaded area shown"}]
    else:
        # T1 derivative: show derivative overlay on expert only
        sp.update({"derivative_scale": 1.0, "show_derivative": 0, "show_tangent": 1})
        ep.update({"derivative_scale": 1.0, "show_derivative": 1, "show_tangent": 1})
        data["deltas"] = [{"key": "show_derivative", "label": "Derivative curve",
                           "studentValue": "Not shown", "expertValue": "Shown — 2x (linear)"}]

    logger.info("[T1_APPLY] graph_plot T1 params applied")
    return data


def _apply_transform_t1(data: dict) -> dict:
    """Force transform params for T1 (correct eigenvalue/eigenvector knowledge)."""
    for side in ("studentParams", "expertParams"):
        data[side].update({
            "show_eigenvectors": 1,
            "eigen_rotation": 0.0,
            "show_grid": 0,
        })
    data["expertParams"]["show_grid"] = 1  # show grid transformation on expert only
    data["deltas"] = [{"key": "show_grid", "label": "Grid transformation",
                       "studentValue": "Not shown", "expertValue": "Shown — space stretches along eigenvector axes"}]
    logger.info("[T1_APPLY] transform T1 params applied")
    return data


def _apply_wave_t1(data: dict) -> dict:
    """Force wave params for T1 (correct wave knowledge)."""
    for side in ("studentParams", "expertParams"):
        data[side].update({"show_superposition": 0})
    data["expertParams"]["show_superposition"] = 1
    data["deltas"] = [{"key": "show_superposition", "label": "Superposition resultant",
                       "studentValue": "Not shown", "expertValue": "Resultant wave shown"}]
    logger.info("[T1_APPLY] wave T1 params applied")
    return data


def _apply_orbital_t1(data: dict) -> dict:
    """Force orbital params for T1 (correct Kepler knowledge)."""
    for side in ("studentParams", "expertParams"):
        data[side].update({"speed_model": 1, "show_focus": 1})
    data["expertParams"]["show_area_sweep"] = 1
    data["studentParams"]["show_area_sweep"] = 0
    data["deltas"] = [{"key": "show_area_sweep", "label": "Equal-area sweep",
                       "studentValue": "Not visualised", "expertValue": "Equal areas shown (Kepler 2nd law)"}]
    logger.info("[T1_APPLY] orbital T1 params applied")
    return data


def _apply_force_t1(data: dict) -> dict:
    """Force force params for T1 (correct Newton's laws knowledge)."""
    for side in ("studentParams", "expertParams"):
        data[side].update({"gravity_model": 1, "show_force_vectors": 0})
    data["expertParams"]["show_force_vectors"] = 1
    data["deltas"] = [{"key": "show_force_vectors", "label": "Force vector diagram",
                       "studentValue": "Not shown", "expertValue": "F=ma arrows shown"}]
    logger.info("[T1_APPLY] force T1 params applied")
    return data


def _sync_shape_params(data: dict, hint: str) -> dict:
    """
    Ensure shape/type parameters are identical between student and expert params.
    Only behavioral params (scale, speed_model, etc.) should differ.
    """
    sp = data.get("studentParams", {})
    ep = data.get("expertParams", {})

    if hint == "graph_plot":
        # Shape params that must always match
        for key in ("func_type", "amplitude", "frequency", "integral_from", "integral_to"):
            val = sp.get(key, ep.get(key))
            sp[key] = val
            ep[key] = val
        # Apply func_type keyword override
        q = data.get("_query", "")
        sp["func_type"] = _resolve_func_type(q, int(sp.get("func_type", FUNC_PARABOLA)))
        ep["func_type"] = sp["func_type"]

    elif hint == "transform":
        # Matrix entries must match
        for key in ("matrix_a", "matrix_b", "matrix_c", "matrix_d",
                    "eigenval1", "eigenval2", "eigenvec1_x", "eigenvec1_y",
                    "eigenvec2_x", "eigenvec2_y", "transform_amount"):
            val = ep.get(key, sp.get(key))  # trust expert params for matrix
            sp[key] = val
            ep[key] = val

    elif hint == "wave":
        for key in ("wave_type", "wave_speed"):
            val = sp.get(key, ep.get(key))
            sp[key] = val
            ep[key] = val

    elif hint == "orbital":
        for key in ("semi_major", "trail_length", "period_exponent"):
            val = ep.get(key, sp.get(key))
            sp[key] = val
            ep[key] = val

    elif hint == "force":
        for key in ("scenario", "mass1", "mass2", "angle", "initial_velocity"):
            val = sp.get(key, ep.get(key))
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


async def extract_simulation_params(
    query: str,
    subject: str,
    tier: str,
    gemini_hint: Optional[str],
    triples: list,
) -> dict:
    """
    Main entry point. Returns a complete SimulationResponse dict.
    All failures return simulatable=False — never crash the core pipeline.
    """
    t0 = time.time()

    try:
        prompt_template = _load_prompt()
    except Exception as e:
        logger.error(f"[SIM] Prompt load failed: {e}")
        return {"simulatable": False, "simulationHint": None, "label": None,
                "studentParams": {}, "expertParams": {}, "deltas": []}

    # Step 1: resolve hint via keyword override
    hint = _resolve_hint(query, subject, gemini_hint)

    # Step 2: call Gemini for parameter extraction
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
            # Strip markdown fences if present
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
        logger.error("[SIM] All Gemini attempts failed — returning not simulatable")
        return {"simulatable": False, "simulationHint": None, "label": None,
                "studentParams": {}, "expertParams": {}, "deltas": []}

    if not data.get("simulatable", False):
        return data

    # Step 3: inject query for downstream resolvers
    data["_query"] = query

    # Step 4: override hint (our keyword override takes precedence)
    data["simulationHint"] = hint

    # Step 5: sync shape params (type/matrix/etc must be identical between canvases)
    data = _sync_shape_params(data, hint)

    # Step 6: fill missing params with defaults
    data = _apply_defaults(data, hint)

    # Step 7: T1 overrides — if student stated something correctly,
    #         don't show a misconception comparison. Show a visualisation lesson.
    if tier == "T1":
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

    # Step 8: T1 correct derivative/integral specific override
    if hint == "graph_plot":
        if _is_correct_statement(query, _CORRECT_DERIVATIVE_PATTERNS):
            data = _apply_graph_plot_t1(data, query)
        elif _is_correct_statement(query, _CORRECT_INTEGRAL_PATTERNS):
            data = _apply_graph_plot_t1(data, query)

    # Step 9: Remove internal _query field before returning
    data.pop("_query", None)

    # Ensure hint aliases are resolved in the final response
    if data.get("simulationHint") in HINT_ALIASES:
        data["simulationHint"] = HINT_ALIASES[data["simulationHint"]]

    elapsed = (time.time() - t0) * 1000
    logger.info(f"[SIM] Complete in {elapsed:.0f}ms — hint={hint} tier={tier} simulatable={data.get('simulatable')}")
    return data