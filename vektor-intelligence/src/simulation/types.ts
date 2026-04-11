/**
 * src/simulation/types.ts
 * VEKTOR Intelligence — Simulation type system
 * Version: 2.2.0
 *
 * FIXES in v2.2.0:
 *  - SimulationData now accepts BOTH `hint` and `simulationHint` from backend
 *    (backend sends `simulationHint`; engine reads `hint`). normalizeApiResponse()
 *    converts the backend payload into a valid SimulationData object.
 *  - `force` added to SimulationHint union so keyword-matched physics hints
 *    don't silently vanish.
 *  - VURERenderSpec + VURE helpers consolidated here (removed duplicate in
 *    vure-types.ts — import from here instead).
 *  - adaptVUREToSimulationData() extended to handle all domains, not just FUNCTION.
 */

// ─── Phase ────────────────────────────────────────────────────────────────────

export type Phase = 0 | 1;
export const PHASE_STUDENT: Phase = 0;
export const PHASE_EXPERT:  Phase = 1;

export const PHASE_LABEL: Record<Phase, string> = {
  0: "YOUR MODEL",
  1: "EXPERT MODEL",
};

export const PHASE_COLOR: Record<Phase, string> = {
  0: "#FF6B9D",
  1: "#00D4AA",
};

// ─── Simulation hints ─────────────────────────────────────────────────────────

/**
 * All hints the engine + backend can produce.
 * `force` was missing in v2.1 — caused physics simulations to silently fall
 * through to `generic` because the union type didn't include it.
 */
export type SimulationHint =
  | "graph_plot"
  | "transform"
  | "wave"
  | "orbital"
  | "force"       // ← FIXED: was missing, causing physics hint to be ignored
  | "molecule"
  | "sort"
  | "generic";

// Default hint per subject
export const SUBJECT_DEFAULT_HINT: Record<string, SimulationHint> = {
  mathematics:      "graph_plot",
  math:             "graph_plot",
  maths:            "graph_plot",
  physics:          "force",
  chemistry:        "molecule",
  biology:          "molecule",
  cs:               "sort",
  "computer science": "sort",
};

// ─── Backend alias → canonical hint ──────────────────────────────────────────

/**
 * Maps all hint aliases the backend might send → canonical SimulationHint.
 * This is the single source of truth for hint normalisation.
 */
export const HINT_ALIASES: Record<string, SimulationHint> = {
  // graph_plot family
  graph_plot:         "graph_plot",
  function:           "graph_plot",
  derivative:         "graph_plot",
  integral:           "graph_plot",
  calculus:           "graph_plot",
  limit:              "graph_plot",
  continuity:         "graph_plot",
  // transform family
  transform:          "transform",
  matrix:             "transform",
  linear_map:         "transform",
  eigenvalue:         "transform",
  eigenvector:        "transform",
  geometry:           "transform",
  // wave family
  wave:               "wave",
  standing_wave:      "wave",
  sound:              "wave",
  shm:                "wave",
  oscillation:        "wave",
  // orbital family
  orbital:            "orbital",
  kepler:             "orbital",
  planetary:          "orbital",
  circular_motion:    "orbital",
  // force family
  force:              "force",
  newton:             "force",
  mechanics:          "force",
  // molecule family
  molecule:           "molecule",
  molecular:          "molecule",
  bond:               "molecule",
  dna:                "molecule",
  cell:               "molecule",
  protein:            "molecule",
  membrane:           "molecule",
  thermodynamics:     "molecule",
  ideal_gas:          "molecule",
  reaction:           "molecule",
  em_field:           "molecule",
  electric_field:     "molecule",
  magnetic_field:     "molecule",
  coulomb:            "molecule",
  circuit:            "molecule",
  // sort family
  sort:               "sort",
  algorithm:          "sort",
  data_structure:     "sort",
  graph_traversal:    "sort",
  // generic fallback
  generic:            "generic",
  neural_net:         "generic",
  graph_topology:     "generic",
  quantum:            "generic",
  vector_field:       "generic",
};

/** Normalise any backend hint string → canonical SimulationHint. */
export function resolveHint(raw: string | undefined | null): SimulationHint {
  if (!raw) return "generic";
  const lower = raw.toLowerCase();
  return HINT_ALIASES[lower] ?? "generic";
}

// ─── Simulation params ────────────────────────────────────────────────────────

export interface SimParams {
  // graph_plot
  func_type?:          number;   // 0=sine 1=cubic 2=parabola 3=abs
  amplitude?:          number;
  frequency?:          number;
  derivative_scale?:   number;   // 0.5 = wrong (d/dx x²=x), 1.0 = correct (2x)
  show_derivative?:    number;   // 0|1
  show_tangent?:       number;   // 0|1
  show_integral?:      number;   // 0|1
  integral_from?:      number;
  integral_to?:        number;
  // transform
  matrix_a?:           number;
  matrix_b?:           number;
  matrix_c?:           number;
  matrix_d?:           number;
  eigenval1?:          number;
  eigenval2?:          number;
  eigenvec1_x?:        number;
  eigenvec1_y?:        number;
  eigenvec2_x?:        number;
  eigenvec2_y?:        number;
  show_eigenvectors?:  number;
  show_grid?:          number;
  eigen_rotation?:     number;
  transform_amount?:   number;
  // wave
  frequency1?:         number;
  amplitude1?:         number;
  frequency2?:         number;
  amplitude2?:         number;
  phase_offset?:       number;
  wave_type?:          number;   // 0=transverse 1=longitudinal 2=standing
  show_superposition?: number;
  damping?:            number;
  wave_speed?:         number;
  // orbital
  eccentricity?:       number;
  semi_major?:         number;
  speed_model?:        number;   // 0=uniform 1=kepler
  show_area_sweep?:    number;
  show_focus?:         number;
  period_exponent?:    number;
  trail_length?:       number;
  // force
  scenario?:           number;   // 0=free_fall 1=projectile 2=inclined 3=collision
  mass1?:              number;
  mass2?:              number;
  gravity_model?:      number;   // 0=wrong 1=correct
  angle?:              number;
  friction?:           number;
  show_force_vectors?: number;
  show_trajectory?:    number;
  initial_velocity?:   number;
  // molecule
  molecule_type?:      number;
  bond_angle?:         number;
  temperature?:        number;
  pressure?:           number;
  show_field_lines?:   number;
  charge_sign?:        number;
  voltage?:            number;
  resistance?:         number;
  // generic / sort
  node_count?:         number;
  hierarchy?:          number;
  connection_density?: number;
  highlight_node?:     number;
  node_labels?:        string[];
  layout?:             number;
}

// ─── Delta ────────────────────────────────────────────────────────────────────

export interface SimDelta {
  key:          string;
  label:        string;
  studentValue: string;
  expertValue:  string;
}

// ─── Engine-facing data ───────────────────────────────────────────────────────

/**
 * SimulationData is the complete payload consumed by SimulationEngine.
 *
 * IMPORTANT: Always construct this via normalizeApiResponse() when the data
 * comes from the backend. The backend uses `simulationHint`; the engine uses
 * `hint`. normalizeApiResponse() bridges the gap.
 */
export interface SimulationData {
  hint:          SimulationHint;
  label:         string;
  studentParams: SimParams;
  expertParams:  SimParams;
  deltas:        SimDelta[];
}

/**
 * Raw shape of a backend SimulationResponse.
 * The backend sends `simulationHint` (not `hint`) — this is the source of the
 * historic silent failure where every simulation fell through to `generic`.
 */
export interface ApiSimulationResponse {
  simulatable:    boolean;
  simulationHint: string | null;   // backend key — different from engine key
  label:          string | null;
  studentParams:  SimParams;
  expertParams:   SimParams;
  deltas:         SimDelta[];
}

/**
 * normalizeApiResponse — converts a raw backend payload into a valid
 * SimulationData object the engine can consume.
 *
 * Call this immediately after receiving the API response, before passing
 * the data to SimulationCanvas or SimulationEngine.
 *
 * Returns null when the backend explicitly says simulatable=false.
 */
export function normalizeApiResponse(
  raw: ApiSimulationResponse | null | undefined,
): SimulationData | null {
  if (!raw || raw.simulatable === false) return null;

  const hint = resolveHint(raw.simulationHint);

  return {
    hint,
    label:         raw.label ?? raw.simulationHint ?? "Concept",
    studentParams: raw.studentParams ?? {},
    expertParams:  raw.expertParams  ?? {},
    deltas:        raw.deltas        ?? [],
  };
}

// ─── Engine internals ─────────────────────────────────────────────────────────

export type EngineState = "idle" | "loading" | "running" | "error";

export interface EngineStatus {
  state:     EngineState;
  template:  string | null;
  fps:       number;
  error?:    string;
}

export interface UniformDescriptor {
  name:  string;
  type:  "1f" | "2f" | "3f" | "4f" | "1i" | "mat3" | "mat4";
  value: number | number[] | Float32Array;
}

export interface DrawCall {
  mode:           number;
  count:          number;
  indexed:        boolean;
  instanceCount?: number;
}

export interface AttribDescriptor {
  name:     string;
  size:     number;
  stride:   number;
  offset:   number;
  divisor?: number;
}

export interface GeometryData {
  vertices:         Float32Array;
  attribs:          AttribDescriptor[];
  indices?:         Uint16Array;
  instances?:       Float32Array;
  instanceAttribs?: AttribDescriptor[];
}

export interface SimTemplate {
  vertexShader:   string;
  fragmentShader: string;
  getUniforms(params: SimParams, phase: Phase, time: number): UniformDescriptor[];
  buildGeometry(params: SimParams, phase: Phase): GeometryData;
  drawCall(phase: Phase): DrawCall;
}

// ─── Component props ──────────────────────────────────────────────────────────

export interface SimulationCanvasProps {
  data:    SimulationData | null;
  phase:   Phase;
  width?:  number;
  height?: number;
}

export interface SimulationModalProps {
  data:    SimulationData | null;
  isOpen:  boolean;
  onClose: () => void;
}

// ─── VURE (Universal Rendering Engine) — flat-array spec ─────────────────────

export const VUREDomain = {
  WAVE:      0,
  FIELD:     1,
  PARTICLE:  2,
  ORBITAL:   3,
  TRANSFORM: 4,
  FUNCTION:  5,
  GENERIC:   6,
} as const;

export type VUREDomainValue = typeof VUREDomain[keyof typeof VUREDomain];
export type VURETierValue   = 1 | 2 | 3 | 4;

export interface VUREDelta {
  key:          string;
  label:        string;
  studentValue: string;
  expertValue:  string;
}

export interface VURERenderSpec {
  simulatable:   boolean;
  domain:        VUREDomainValue;
  tier:          VURETierValue;
  label:         string;
  studentParams: number[];   // float[8]
  expertParams:  number[];   // float[8]
  deltas:        VUREDelta[];
}

// Maps simulationHint strings → VURE domain integers
export const HINT_TO_VURE_DOMAIN: Record<string, VUREDomainValue> = {
  wave:           VUREDomain.WAVE,
  standing_wave:  VUREDomain.WAVE,
  sound:          VUREDomain.WAVE,
  shm:            VUREDomain.WAVE,
  oscillation:    VUREDomain.WAVE,
  field:          VUREDomain.FIELD,
  em_field:       VUREDomain.FIELD,
  electric_field: VUREDomain.FIELD,
  magnetic_field: VUREDomain.FIELD,
  coulomb:        VUREDomain.FIELD,
  particle:       VUREDomain.PARTICLE,
  molecule:       VUREDomain.PARTICLE,
  bond:           VUREDomain.PARTICLE,
  dna:            VUREDomain.PARTICLE,
  cell:           VUREDomain.PARTICLE,
  protein:        VUREDomain.PARTICLE,
  membrane:       VUREDomain.PARTICLE,
  thermodynamics: VUREDomain.PARTICLE,
  ideal_gas:      VUREDomain.PARTICLE,
  orbital:        VUREDomain.ORBITAL,
  kepler:         VUREDomain.ORBITAL,
  planetary:      VUREDomain.ORBITAL,
  transform:      VUREDomain.TRANSFORM,
  matrix:         VUREDomain.TRANSFORM,
  linear_map:     VUREDomain.TRANSFORM,
  eigenvalue:     VUREDomain.TRANSFORM,
  eigenvector:    VUREDomain.TRANSFORM,
  // CRITICAL: graph_plot → FUNCTION, NOT transform
  graph_plot:     VUREDomain.FUNCTION,
  function:       VUREDomain.FUNCTION,
  derivative:     VUREDomain.FUNCTION,
  integral:       VUREDomain.FUNCTION,
  calculus:       VUREDomain.FUNCTION,
  limit:          VUREDomain.FUNCTION,
  continuity:     VUREDomain.FUNCTION,
  sort:           VUREDomain.GENERIC,
  graph_topology: VUREDomain.GENERIC,
  algorithm:      VUREDomain.GENERIC,
  data_structure: VUREDomain.GENERIC,
  neural_net:     VUREDomain.GENERIC,
  reaction:       VUREDomain.GENERIC,
  quantum:        VUREDomain.GENERIC,
};

// ─── VURE helper constructors ─────────────────────────────────────────────────

export function makeDefaultSpec(hint?: string, tier: VURETierValue = 2): VURERenderSpec {
  const domain = hint ? (HINT_TO_VURE_DOMAIN[hint] ?? VUREDomain.GENERIC) : VUREDomain.GENERIC;
  return {
    simulatable:   true,
    domain,
    tier,
    label:         hint ?? "Concept",
    studentParams: [0, 0, 0, 0, 0.7, 0, 0.75, 0],
    expertParams:  [0, 1, 1, 0, 0.7, 1, 0.75, 0],
    deltas:        [],
  };
}

/**
 * makeFunctionSpec — builds VURERenderSpec for derivative/integral queries.
 *
 * float[8] layout for FUNCTION domain:
 *   [0] func_type         (2 = parabola)
 *   [1] show_tangent      (0|1)
 *   [2] derivative_scale  (0.5 = wrong d/dx x²=x, 1.0 = correct 2x)
 *   [3] show_integral     (0|1)
 *   [4] amplitude
 *   [5] show_derivative   (0|1)
 *   [6] frequency
 *   [7] reserved
 */
export function makeFunctionSpec(
  tier:      VURETierValue,
  isCorrect: boolean,
): VURERenderSpec {
  const studentParams = isCorrect
    ? [2, 1, 1.0, 0, 0.8, 0, 0.9, 0]
    : [2, 1, 0.5, 0, 0.8, 0, 0.9, 0];

  const expertParams = [2, 1, 1.0, 0, 0.8, 1, 0.9, 0];

  const deltas: VUREDelta[] = isCorrect
    ? [
        {
          key:          "show_derivative",
          label:        "Derivative curve",
          studentValue: "Not shown",
          expertValue:  "f'(x) = 2x shown in violet",
        },
      ]
    : [
        {
          key:          "derivative_scale",
          label:        "Tangent slope at x = 1",
          studentValue: "1.0  (believes d/dx x² = x)",
          expertValue:  "2.0  (correct: d/dx x² = 2x)",
        },
        {
          key:          "show_derivative",
          label:        "Derivative curve f'(x)",
          studentValue: "Not shown",
          expertValue:  "f'(x) = 2x shown in violet",
        },
      ];

  return {
    simulatable:  true,
    domain:       VUREDomain.FUNCTION,
    tier,
    label:        isCorrect
      ? "Derivative of x² — visualised"
      : "Derivative of x² — misconception",
    studentParams,
    expertParams,
    deltas,
  };
}

/**
 * adaptVUREToSimulationData — bridges VURERenderSpec → SimulationData.
 *
 * Covers all domains so the bridge layer doesn't silently produce empty params
 * for non-FUNCTION domains.
 */
export function adaptVUREToSimulationData(
  spec: VURERenderSpec,
  hint: SimulationHint = "generic",
): SimulationData {
  function arrayToParams(arr: number[], domain: VUREDomainValue): SimParams {
    switch (domain) {
      case VUREDomain.FUNCTION:
        return {
          func_type:        arr[0] ?? 2,
          show_tangent:     arr[1] ?? 1,
          derivative_scale: arr[2] ?? 1.0,
          show_integral:    arr[3] ?? 0,
          amplitude:        arr[4] ?? 0.8,
          show_derivative:  arr[5] ?? 0,
          frequency:        arr[6] ?? 0.9,
        };
      case VUREDomain.WAVE:
        return {
          frequency1:        arr[0] ?? 1.0,
          amplitude1:        arr[1] ?? 0.7,
          frequency2:        arr[2] ?? 1.0,
          amplitude2:        arr[3] ?? 0.7,
          phase_offset:      arr[4] ?? 0.0,
          wave_type:         arr[5] ?? 0,
          show_superposition:arr[6] ?? 0,
          damping:           arr[7] ?? 0.0,
        };
      case VUREDomain.ORBITAL:
        return {
          eccentricity:    arr[0] ?? 0.45,
          semi_major:      arr[1] ?? 0.55,
          speed_model:     arr[2] ?? 1,
          show_area_sweep: arr[3] ?? 0,
          show_focus:      arr[4] ?? 1,
          period_exponent: arr[5] ?? 1.5,
          trail_length:    arr[6] ?? 0.6,
        };
      case VUREDomain.TRANSFORM:
        return {
          matrix_a:        arr[0] ?? 3.0,
          matrix_b:        arr[1] ?? 0.0,
          matrix_c:        arr[2] ?? 0.0,
          matrix_d:        arr[3] ?? 2.0,
          show_eigenvectors:arr[4] ?? 1,
          show_grid:       arr[5] ?? 0,
          eigen_rotation:  arr[6] ?? 0.0,
          transform_amount:arr[7] ?? 1,
        };
      case VUREDomain.PARTICLE:
        return {
          molecule_type:  arr[0] ?? 3,
          temperature:    arr[1] ?? 0.6,
          pressure:       arr[2] ?? 0.5,
          bond_angle:     arr[3] ?? 104.5,
          show_field_lines:arr[4] ?? 0,
          charge_sign:    arr[5] ?? 1,
          voltage:        arr[6] ?? 3.0,
          resistance:     arr[7] ?? 2.0,
        };
      default:
        return {
          node_count:         arr[0] ?? 6,
          hierarchy:          arr[1] ?? 1,
          connection_density: arr[2] ?? 0.5,
          highlight_node:     arr[3] ?? 0,
          layout:             arr[4] ?? 1,
        };
    }
  }

  return {
    hint,
    label:         spec.label,
    studentParams: arrayToParams(spec.studentParams, spec.domain),
    expertParams:  arrayToParams(spec.expertParams,  spec.domain),
    deltas:        spec.deltas,
  };
}