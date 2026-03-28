"use client";
/**
 * src/simulation/SimulationModal.tsx
 * Full-screen WebGL2 simulation modal — YOUR MODEL vs EXPERT MODEL
 */
import { useEffect, useState, useCallback } from "react";
import { SimulationCanvas } from "./SimulationCanvas";
import type { SimulationData, Phase, SimDelta } from "./types";
import { PHASE_STUDENT, PHASE_EXPERT, PHASE_LABEL, PHASE_COLOR } from "./types";

interface Props { data: SimulationData | null; isOpen: boolean; onClose: () => void; }
type ViewMode = "side-by-side" | "overlay-student" | "overlay-expert";

export function SimulationModal({ data, isOpen, onClose }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "Escape") onClose();
    if (e.key === " ") { e.preventDefault(); setViewMode(m => m === "side-by-side" ? "overlay-student" : m === "overlay-student" ? "overlay-expert" : "side-by-side"); }
  }, [isOpen, onClose]);

  useEffect(() => { window.addEventListener("keydown", handleKey); return () => window.removeEventListener("keydown", handleKey); }, [handleKey]);
  useEffect(() => { if (isOpen) setViewMode("side-by-side"); }, [isOpen]);

  if (!isOpen) return null;
  const overlayPhase: Phase = viewMode === "overlay-expert" ? PHASE_EXPERT : PHASE_STUDENT;

  const btnStyle = (active: boolean, color: string) => ({
    border: `1px solid ${active ? color : "#1E1E36"}`,
    backgroundColor: active ? `${color}20` : "transparent",
    color: active ? color : "#6B6A80",
    fontFamily: "var(--font-dm-mono)", fontSize: "12px", cursor: "pointer",
    padding: "6px 12px",
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "#08080Fee", backdropFilter: "blur(4px)" }}>
      <header className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #1E1E36", backgroundColor: "#08080F" }}>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-4 h-px" style={{ backgroundColor: "#7B5CFF" }} />
            <span className="text-xs tracking-widest uppercase" style={{ color: "#7B5CFF", fontFamily: "var(--font-dm-mono)" }}>Simulation</span>
          </div>
          <h2 className="text-base font-black" style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}>{data?.label ?? "Concept Simulation"}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMode("side-by-side")} style={btnStyle(viewMode === "side-by-side", "#7B5CFF")}>⊞ Side by Side</button>
          <button onClick={() => setViewMode("overlay-student")} style={btnStyle(viewMode === "overlay-student", PHASE_COLOR[PHASE_STUDENT])}>YOUR MODEL</button>
          <button onClick={() => setViewMode("overlay-expert")}  style={btnStyle(viewMode === "overlay-expert",  PHASE_COLOR[PHASE_EXPERT])}>EXPERT MODEL</button>
          <button onClick={onClose} style={{ ...btnStyle(false, "#FF3D57"), marginLeft: 16 }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#FF3D5760")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}>
            ✕ Close &nbsp;<span style={{ color: "#3A3A5C" }}>ESC</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-1 min-w-0" style={{ padding: 16, gap: 12 }}>
          {viewMode === "side-by-side" ? (
            <><SimulationCanvas data={data} phase={PHASE_STUDENT} /><SimulationCanvas data={data} phase={PHASE_EXPERT} /></>
          ) : (
            <SimulationCanvas data={data} phase={overlayPhase} />
          )}
        </div>
        {data && data.deltas.length > 0 && (
          <div className="flex-shrink-0 overflow-y-auto" style={{ width: 300, borderLeft: "1px solid #1E1E36", padding: 16 }}>
            <DeltaPanel deltas={data.deltas} />
          </div>
        )}
      </div>

      <footer className="flex items-center justify-center px-6 py-2 flex-shrink-0" style={{ borderTop: "1px solid #1E1E36", backgroundColor: "#08080F" }}>
        <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
          <kbd style={{ color: "#6B6A80", border: "1px solid #1E1E36", padding: "0 4px" }}>SPACE</kbd> cycle views &nbsp;·&nbsp;
          <kbd style={{ color: "#6B6A80", border: "1px solid #1E1E36", padding: "0 4px" }}>ESC</kbd> close
        </span>
      </footer>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

function DeltaPanel({ deltas }: { deltas: SimDelta[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-px" style={{ backgroundColor: "#6B6A80" }} />
          <span className="text-xs tracking-widest uppercase" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>What Differs</span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)" }}>Parameters that differ between your model and the expert model.</p>
      </div>
      {deltas.map((d, i) => (
        <div key={i} className="flex flex-col gap-2 p-3" style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
          <span className="text-xs font-black" style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}>{d.label}</span>
          {([{ phase: PHASE_STUDENT, val: d.studentValue }, { phase: PHASE_EXPERT, val: d.expertValue }] as {phase: Phase, val: string}[]).map(({ phase, val }) => (
            <div key={phase} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: PHASE_COLOR[phase], fontFamily: "var(--font-dm-mono)" }}>{PHASE_LABEL[phase]}</span>
              <span className="text-xs px-2 py-0.5" style={{ backgroundColor: `${PHASE_COLOR[phase]}15`, border: `1px solid ${PHASE_COLOR[phase]}30`, color: PHASE_COLOR[phase], fontFamily: "var(--font-dm-mono)" }}>{val}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
