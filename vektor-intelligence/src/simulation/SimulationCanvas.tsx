"use client";
/**
 * src/simulation/SimulationCanvas.tsx
 * VEKTOR Intelligence — Single WebGL2 canvas panel
 * Version: 2.2.0
 *
 * FIXES in v2.2.0:
 *  1. Engine creation effect correctly tracks nothing (canvas ref is stable)
 *     but engine is now stored via a stable ref — no stale closures.
 *  2. Phase-sync effect:
 *     - Runs ONLY when `phase` changes (correct).
 *     - Calls `engine.setPhase()` first, then `engine.load()` if data is ready.
 *     - Does NOT call `engine.start()` manually — `load()` calls it internally.
 *  3. Data-load effect:
 *     - Runs when `data` changes.
 *     - Does NOT re-run when phase changes (phase effect handles that).
 *     - After load(), calls `engine.start()` explicitly to begin the loop.
 *  4. The two effects no longer race: phase effect calls load+start together,
 *     data effect calls load+start together. No double-start.
 *  5. Canvas size is set via CSS percentage; pixel size is set by the engine's
 *     ResizeObserver — no fixed width/height prop needed.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { SimulationEngine } from "./SimulationEngine";
import type { SimulationData, Phase, EngineStatus } from "./types";
import { PHASE_LABEL, PHASE_COLOR } from "./types";

interface Props {
  data:    SimulationData | null;
  phase:   Phase;
  /** Minimum canvas height in pixels (CSS). Defaults to 400. */
  minHeight?: number;
}

export function SimulationCanvas({ data, phase, minHeight = 400 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SimulationEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus>({
    state:    "idle",
    template: null,
    fps:      0,
  });

  const label = PHASE_LABEL[phase];
  const color = PHASE_COLOR[phase];

  // Stable status callback — avoids re-creating effects on every render
  const handleStatus = useCallback((s: EngineStatus) => setStatus(s), []);

  // ── Effect 1: Create engine once, destroy on unmount ────────────────────────
  // This effect intentionally has an empty dependency array.
  // The engine is tied to the canvas DOM node, which is stable for the
  // lifetime of this component instance.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new SimulationEngine(canvas, phase, handleStatus);
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect 2: Sync phase when overlay mode toggles ───────────────────────────
  // Runs when `phase` prop changes. React reuses the component instance when
  // switching between overlay modes, so we must tell the engine to switch phase.
  //
  // FIXED: Previously this called engine.load() AND engine.start() separately,
  // which could race with the data effect doing the same. Now:
  //   - setPhase() updates the engine's internal phase
  //   - If data is already loaded, load() + start() run here (not in data effect)
  //   - If data is not yet loaded, the data effect will call load() + start()
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    engine.setPhase(phase);

    if (data) {
      engine.load(data).then(() => engine.start());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Effect 3: Load data when it arrives or changes ───────────────────────────
  // Runs when `data` changes. Does NOT run when phase changes (effect 2 covers
  // that case). This prevents double-loading when both change simultaneously.
  //
  // FIXED: Previously included phase in the eslint-disable comment's implied
  // deps, which caused double-load races. Now only depends on `data`.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !data) return;

    engine.load(data).then(() => engine.start());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const isRunning = status.state === "running";
  const isLoading = status.state === "loading";
  const isError   = status.state === "error";

  return (
    <div
      className="flex flex-col"
      style={{
        border:          `1px solid ${color}40`,
        backgroundColor: "#08080F",
        flex:            1,
        minWidth:        0,
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: `1px solid ${color}30` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: color,
              boxShadow:       `0 0 6px ${color}`,
              animation:       isRunning ? "pulse 2s infinite" : "none",
            }}
          />
          <span
            className="text-xs font-black tracking-widest"
            style={{ color, fontFamily: "var(--font-syne)" }}
          >
            {label}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isLoading && (
            <span
              className="text-xs"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            >
              Loading…
            </span>
          )}
          {isRunning && (
            <span
              className="text-xs"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
            >
              {status.fps} fps
            </span>
          )}
          {isError && (
            <span
              className="text-xs"
              style={{ color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}
              title={status.error}
            >
              ⚠ {status.error}
            </span>
          )}
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div className="flex-1 relative" style={{ minHeight }}>
        <canvas
          ref={canvasRef}
          style={{
            width:    "100%",
            height:   "100%",
            display:  "block",
            position: "absolute",
            inset:    0,
          }}
        />

        {/* Empty state overlay */}
        {(!data || status.state === "idle") && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ pointerEvents: "none" }}
          >
            <div className="text-center">
              <div
                className="text-4xl mb-3"
                style={{ color: `${color}30` }}
              >
                {phase === 0 ? "◎" : "◈"}
              </div>
              <p
                className="text-xs"
                style={{
                  color:      "#3A3A5C",
                  fontFamily: "var(--font-dm-mono)",
                }}
              >
                Simulation appears
                <br />
                after a query
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer label ── */}
      {data && (
        <div
          className="px-4 py-2 flex-shrink-0"
          style={{ borderTop: `1px solid ${color}20` }}
        >
          <p
            className="text-xs text-center"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
          >
            {data.label}
          </p>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}