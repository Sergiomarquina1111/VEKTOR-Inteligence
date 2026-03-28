/**
 * src/simulation/index.ts
 * VEKTOR Intelligence — Simulation Module Barrel Export
 */

export { SimulationModal }  from "./SimulationModal";
export { SimulationCanvas } from "./SimulationCanvas";
export { SimulationEngine } from "./SimulationEngine";

export type {
  SimulationData, SimulationHint, SimulationModalProps, SimulationCanvasProps,
  SimParams, SimDelta, SimTemplate, Phase, EngineStatus, EngineState,
} from "./types";

export {
  PHASE_STUDENT, PHASE_EXPERT, PHASE_LABEL, PHASE_COLOR, SUBJECT_DEFAULT_HINT,
} from "./types";
