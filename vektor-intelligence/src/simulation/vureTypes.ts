// VEKTOR Universal Rendering Engine — TypeScript types
// Session 13 — complete rewrite

// Domain integers must match VUREShader.glsl u_domain values exactly
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

// Maps simulationHint strings (from backend) to domain integers
export const HINT_TO_DOMAIN: Record<string, VUREDomainValue> = {
  // Wave domain
  wave:           VUREDomain.WAVE,
  standing_wave:  VUREDomain.WAVE,
  sound:          VUREDomain.WAVE,
  shm:            VUREDomain.WAVE,
  oscillation:    VUREDomain.WAVE,
  // Field domain
  field:          VUREDomain.FIELD,
  em_field:       VUREDomain.FIELD,
  electric_field: VUREDomain.FIELD,
  magnetic_field: VUREDomain.FIELD,
  coulomb:        VUREDomain.FIELD,
  // Particle domain
  particle:       VUREDomain.PARTICLE,
  molecule:       VUREDomain.PARTICLE,
  bond:           VUREDomain.PARTICLE,
  dna:            VUREDomain.PARTICLE,
  cell:           VUREDomain.PARTICLE,
  protein:        VUREDomain.PARTICLE,
  membrane:       VUREDomain.PARTICLE,
  thermodynamics: VUREDomain.PARTICLE,
  ideal_gas:      VUREDomain.PARTICLE,
  // Orbital domain
  orbital:        VUREDomain.ORBITAL,
  kepler:         VUREDomain.ORBITAL,
  planetary:      VUREDomain.ORBITAL,
  // Transform domain
  transform:      VUREDomain.TRANSFORM,
  matrix:         VUREDomain.TRANSFORM,
  linear_map:     VUREDomain.TRANSFORM,
  eigenvalue:     VUREDomain.TRANSFORM,
  eigenvector:    VUREDomain.TRANSFORM,
  // Function domain — CRITICAL: graph_plot goes here, NOT transform
  graph_plot:     VUREDomain.FUNCTION,
  function:       VUREDomain.FUNCTION,
  derivative:     VUREDomain.FUNCTION,
  integral:       VUREDomain.FUNCTION,
  calculus:       VUREDomain.FUNCTION,
  limit:          VUREDomain.FUNCTION,
  continuity:     VUREDomain.FUNCTION,
  // Generic fallback
  sort:           VUREDomain.GENERIC,
  graph_topology: VUREDomain.GENERIC,
  algorithm:      VUREDomain.GENERIC,
  data_structure: VUREDomain.GENERIC,
  neural_net:     VUREDomain.GENERIC,
  reaction:       VUREDomain.GENERIC,
  quantum:        VUREDomain.GENERIC,
};

export type VURETierValue = 1 | 2 | 3 | 4;

// One delta entry shown in the WHAT DIFFERS panel
export interface VUREDelta {
  key:          string;
  label:        string;
  studentValue: string;
  expertValue:  string;
}

// The complete render spec returned by the backend and consumed by the engine
export interface VURERenderSpec {
  simulatable:   boolean;
  domain:        VUREDomainValue;
  tier:          VURETierValue;
  label:         string;
  studentParams: number[];   // float[8] — YOUR MODEL
  expertParams:  number[];   // float[8] — EXPERT MODEL
  deltas:        VUREDelta[];
}

// Fallback spec for when backend returns legacy hint-based format
export function makeDefaultSpec(hint?: string, tier: VURETierValue = 2): VURERenderSpec {
  const domain = hint ? (HINT_TO_DOMAIN[hint] ?? VUREDomain.GENERIC) : VUREDomain.GENERIC;
  return {
    simulatable:   true,
    domain,
    tier,
    label:         hint ?? 'Concept',
    studentParams: [0, 0, 0, 0, 0.7, 0, 0.75, 0],
    expertParams:  [0, 1, 1, 0, 0.7, 1, 0.75, 0],
    deltas: [],
  };
}

// Default function domain spec for derivative of x² queries
export function makeFunctionSpec(
  tier: VURETierValue,
  isCorrect: boolean
): VURERenderSpec {
  const studentParams = isCorrect
    ? [2, 1, 1.0, 0, 0.7, 0, 0.75, 0]   // T1: correct slope, no deriv curve
    : [2, 1, 0.5, 0, 0.7, 0, 0.75, 0];  // T3: wrong slope (x instead of 2x)

  const expertParams = isCorrect
    ? [2, 1, 1.0, 0, 0.7, 1, 0.75, 0]   // T1: correct slope + deriv curve
    : [2, 1, 1.0, 0, 0.7, 1, 0.75, 0];  // T3: correct slope + deriv curve

  const deltas: VUREDelta[] = isCorrect
    ? [
        {
          key:          'show_deriv_curve',
          label:        'Derivative curve',
          studentValue: 'Not shown',
          expertValue:  'Shown — f\'(x) = 2x in cyan',
        },
      ]
    : [
        {
          key:          'deriv_scale',
          label:        'Derivative slope at x=0.5',
          studentValue: '0.5 (thinks d/dx x² = x)',
          expertValue:  '1.0 (correct: d/dx x² = 2x)',
        },
        {
          key:          'show_deriv_curve',
          label:        'Derivative curve',
          studentValue: 'Not shown',
          expertValue:  'Shown — f\'(x) = 2x in cyan',
        },
      ];

  return {
    simulatable: true,
    domain:      VUREDomain.FUNCTION,
    tier,
    label:       'Derivative of x²',
    studentParams,
    expertParams,
    deltas,
  };
}