"use client";
/**
 * src/simulation/SimulationCanvas.tsx
 * Single WebGL2 canvas — phase=0 = YOUR MODEL, phase=1 = EXPERT MODEL
 *
 * FIX: when `phase` prop changes (overlay mode toggle), the engine's internal
 * phase is updated immediately so colors and params stay correct.
 */
import { useEffect, useRef, useState } from "react";
import { SimulationEngine } from "./SimulationEngine";
import type { SimulationData, Phase, EngineStatus } from "./types";
import { PHASE_LABEL, PHASE_COLOR } from "./types";

interface Props { data: SimulationData | null; phase: Phase; width?: number; height?: number; }

export function SimulationCanvas({ data, phase, width = 480, height = 400 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SimulationEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ state: "idle", template: null, fps: 0 });

  const label = PHASE_LABEL[phase];
  const color = PHASE_COLOR[phase];

  // Create engine once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new SimulationEngine(canvas, phase, setStatus);
    engineRef.current = engine;
    return () => { engine.destroy(); engineRef.current = null; };
  }, []); // eslint-disable-line

  // ── FIX: update engine phase when prop changes (overlay mode) ──────────────
  // When the user switches from side-by-side to overlay-expert, React reuses
  // this component instance — the engine is NOT recreated. Without this effect,
  // the engine keeps its original phase=0, rendering student colors on the
  // expert canvas. This effect syncs the engine phase and reloads with the
  // correct params/colors whenever the phase prop changes.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setPhase(phase);
    // If data is already loaded, reload immediately so colors update
    if (data) {
      engine.load(data).then(() => engine.start());
    }
  }, [phase]); // eslint-disable-line

  // Load data when it arrives
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !data) return;
    engine.load(data).then(() => engine.start());
  }, [data]);

  return (
    <div className="flex flex-col" style={{ border: `1px solid ${color}40`, backgroundColor: "#08080F", flex: 1, minWidth: 0 }}>
      <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${color}30` }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}`, animation: status.state === "running" ? "pulse 2s infinite" : "none" }} />
          <span className="text-xs font-black tracking-widest" style={{ color, fontFamily: "var(--font-syne)" }}>{label}</span>
        </div>
        <div className="flex items-center gap-3">
          {status.state === "loading" && <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Loading...</span>}
          {status.state === "running" && <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{status.fps} fps</span>}
          {status.state === "error"   && <span className="text-xs" style={{ color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}>⚠ {status.error}</span>}
        </div>
      </div>
      <div className="flex-1 relative" style={{ minHeight: height }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", position: "absolute", inset: 0 }} />
        {(!data || status.state === "idle") && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "none" }}>
            <div className="text-center">
              <div className="text-4xl mb-3" style={{ color: `${color}30` }}>{phase === 0 ? "◎" : "◈"}</div>
              <p className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Simulation appears<br />after a query</p>
            </div>
          </div>
        )}
      </div>
      {data && (
        <div className="px-4 py-2 flex-shrink-0" style={{ borderTop: `1px solid ${color}20` }}>
          <p className="text-xs text-center" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{data.label}</p>
        </div>
      )}
    </div>
  );
}
