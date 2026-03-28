/**
 * src/simulation/types.ts
 * VEKTOR Intelligence — Simulation Engine Types
 */

export type SimulationHint =
  | "orbital" | "wave" | "force" | "em_field" | "quantum"
  | "transform" | "graph_plot" | "graph_topology" | "series" | "vector_field"
  | "molecule" | "reaction" | "bond" | "periodic"
  | "dna" | "cell" | "protein" | "membrane"
  | "sort" | "graph_traversal" | "neural_net" | "algorithm" | "data_structure"
  | "generic";

export const PHASE_STUDENT = 0 as const;
export const PHASE_EXPERT  = 1 as const;
export type Phase = typeof PHASE_STUDENT | typeof PHASE_EXPERT;

export const PHASE_LABEL: Record<Phase, string> = {
  [PHASE_STUDENT]: "YOUR MODEL",
  [PHASE_EXPERT]:  "EXPERT MODEL",
};

export const PHASE_COLOR: Record<Phase, string> = {
  [PHASE_STUDENT]: "#FF3D57",
  [PHASE_EXPERT]:  "#C8FF00",
};

export type SimParamValue = number | string | boolean | number[];
export type SimParams = Record<string, SimParamValue>;

export interface SimulationData {
  hint:          SimulationHint;
  subject:       string;
  label:         string;
  studentParams: SimParams;
  expertParams:  SimParams;
  deltas:        SimDelta[];
}

export interface SimDelta {
  key:          string;
  label:        string;
  studentValue: string;
  expertValue:  string;
}

export type UniformType = "1f"|"2f"|"3f"|"4f"|"1i"|"1fv"|"2fv"|"3fv"|"mat3"|"mat4";

export interface UniformDescriptor {
  name:  string;
  type:  UniformType;
  value: number | number[];
}

export interface TemplateGeometry {
  vertices:         Float32Array;
  instances?:       Float32Array;
  indices?:         Uint16Array;
  attribs:          AttribDescriptor[];
  instanceAttribs?: AttribDescriptor[];
}

export interface AttribDescriptor {
  name:     string;
  size:     number;
  offset:   number;
  stride:   number;
  divisor?: number;
}

export interface DrawCall {
  mode:           number;
  count:          number;
  instanceCount?: number;
  indexed?:       boolean;
}

export interface SimTemplate {
  hint:            SimulationHint | SimulationHint[];
  label:           string;
  subjects:        string[];
  buildGeometry(params: SimParams, phase: Phase): TemplateGeometry;
  getUniforms(params: SimParams, phase: Phase, time: number): UniformDescriptor[];
  drawCall(phase: Phase): DrawCall;
  vertexShader:    string;
  fragmentShader:  string;
}

export type EngineState = "idle" | "loading" | "running" | "paused" | "error";

export interface EngineStatus {
  state:    EngineState;
  template: SimulationHint | null;
  fps:      number;
  error?:   string;
}

export interface SimulationCanvasProps {
  data:      SimulationData | null;
  phase:     Phase;
  width?:    number;
  height?:   number;
  onStatus?: (status: EngineStatus) => void;
}

export interface SimulationModalProps {
  data:    SimulationData | null;
  isOpen:  boolean;
  onClose: () => void;
}

export const SUBJECT_DEFAULT_HINT: Record<string, SimulationHint> = {
  mathematics:      "graph_plot",
  physics:          "wave",
  chemistry:        "molecule",
  biology:          "cell",
  computer_science: "sort",
};
