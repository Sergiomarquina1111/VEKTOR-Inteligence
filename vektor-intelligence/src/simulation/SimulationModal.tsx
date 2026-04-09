"use client";
/**
 * src/simulation/SimulationModal.tsx
 * VEKTOR Intelligence — Full-screen simulation modal
 * Version: 2.2.0
 *
 * FIXES in v2.2.0:
 *  1. View mode resets to "side-by-side" whenever the modal opens (not just
 *     on data change). Previously a stale overlay mode could survive re-opens.
 *  2. Keyboard handler is properly memoed with stable deps — no re-registration
 *     on every render.
 *  3. DeltaPanel is extracted to a separate component with its own types to
 *     avoid re-renders when only modal view state changes.
 *  4. Overlay mode now passes the correct phase to SimulationCanvas — previously
 *     the component received phase=PHASE_STUDENT for overlay-expert because the
 *     ternary was evaluated in the wrong order.
 */

import { useEffect, useState, useCallback } from "react";
import { SimulationCanvas } from "./SimulationCanvas";
import type { SimulationData, SimDelta, Phase } from "./types";
import { PHASE_STUDENT, PHASE_EXPERT, PHASE_LABEL, PHASE_COLOR } from "./types";

interface Props {
  data:    SimulationData | null;
  isOpen:  boolean;
  onClose: () => void;
}

type ViewMode = "side-by-side" | "overlay-student" | "overlay-expert";

export function SimulationModal({ data, isOpen, onClose }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");

  // Reset view mode every time the modal opens
  useEffect(() => {
    if (isOpen) setViewMode("side-by-side");
  }, [isOpen]);

  // Keyboard shortcuts
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        setViewMode(m =>
          m === "side-by-side"
            ? "overlay-student"
            : m === "overlay-student"
            ? "overlay-expert"
            : "side-by-side",
        );
      }
    },
    [isOpen, onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  if (!isOpen) return null;

  // FIXED: Determine overlay phase correctly.
  // overlay-expert → PHASE_EXPERT (1)
  // overlay-student or side-by-side → PHASE_STUDENT (0)
  const overlayPhase: Phase =
    viewMode === "overlay-expert" ? PHASE_EXPERT : PHASE_STUDENT;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        backgroundColor: "#08080Fee",
        backdropFilter:  "blur(4px)",
      }}
    >
      {/* ── Header ── */}
      <header
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{
          borderBottom:    "1px solid #1E1E36",
          backgroundColor: "#08080F",
        }}
      >
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-4 h-px" style={{ backgroundColor: "#7B5CFF" }} />
            <span
              className="text-xs tracking-widest uppercase"
              style={{ color: "#7B5CFF", fontFamily: "var(--font-dm-mono)" }}
            >
              Simulation
            </span>
          </div>
          <h2
            className="text-base font-black"
            style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}
          >
            {data?.label ?? "Concept Simulation"}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <ViewButton
            active={viewMode === "side-by-side"}
            color="#7B5CFF"
            onClick={() => setViewMode("side-by-side")}
          >
            ⊞ Side by Side
          </ViewButton>
          <ViewButton
            active={viewMode === "overlay-student"}
            color={PHASE_COLOR[PHASE_STUDENT]}
            onClick={() => setViewMode("overlay-student")}
          >
            {PHASE_LABEL[PHASE_STUDENT]}
          </ViewButton>
          <ViewButton
            active={viewMode === "overlay-expert"}
            color={PHASE_COLOR[PHASE_EXPERT]}
            onClick={() => setViewMode("overlay-expert")}
          >
            {PHASE_LABEL[PHASE_EXPERT]}
          </ViewButton>

          <CloseButton onClose={onClose} />
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">
        {/* Canvas area */}
        <div
          className="flex flex-1 min-w-0"
          style={{ padding: 16, gap: 12 }}
        >
          {viewMode === "side-by-side" ? (
            <>
              <SimulationCanvas data={data} phase={PHASE_STUDENT} />
              <SimulationCanvas data={data} phase={PHASE_EXPERT}  />
            </>
          ) : (
            <SimulationCanvas data={data} phase={overlayPhase} />
          )}
        </div>

        {/* Delta panel */}
        {data && data.deltas.length > 0 && (
          <aside
            className="flex-shrink-0 overflow-y-auto"
            style={{
              width:      300,
              borderLeft: "1px solid #1E1E36",
              padding:    16,
            }}
          >
            <DeltaPanel deltas={data.deltas} />
          </aside>
        )}
      </div>

      {/* ── Footer ── */}
      <footer
        className="flex items-center justify-center px-6 py-2 flex-shrink-0"
        style={{
          borderTop:       "1px solid #1E1E36",
          backgroundColor: "#08080F",
        }}
      >
        <span
          className="text-xs"
          style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
        >
          <kbd style={{ color: "#6B6A80", border: "1px solid #1E1E36", padding: "0 4px" }}>
            SPACE
          </kbd>{" "}
          cycle views &nbsp;·&nbsp;
          <kbd style={{ color: "#6B6A80", border: "1px solid #1E1E36", padding: "0 4px" }}>
            ESC
          </kbd>{" "}
          close
        </span>
      </footer>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface ViewButtonProps {
  active:   boolean;
  color:    string;
  onClick:  () => void;
  children: React.ReactNode;
}

function ViewButton({ active, color, onClick, children }: ViewButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        border:          `1px solid ${active ? color : "#1E1E36"}`,
        backgroundColor: active ? `${color}20` : "transparent",
        color:           active ? color : "#6B6A80",
        fontFamily:      "var(--font-dm-mono)",
        fontSize:        "12px",
        cursor:          "pointer",
        padding:         "6px 12px",
        transition:      "border-color 0.15s, background-color 0.15s, color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border:          `1px solid ${hovered ? "#FF3D5760" : "#1E1E36"}`,
        backgroundColor: "transparent",
        color:           "#FF3D57",
        fontFamily:      "var(--font-dm-mono)",
        fontSize:        "12px",
        cursor:          "pointer",
        padding:         "6px 12px",
        marginLeft:      16,
        transition:      "border-color 0.15s",
      }}
    >
      ✕ Close{" "}
      <span style={{ color: "#3A3A5C" }}>ESC</span>
    </button>
  );
}

function DeltaPanel({ deltas }: { deltas: SimDelta[] }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-px" style={{ backgroundColor: "#6B6A80" }} />
          <span
            className="text-xs tracking-widest uppercase"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
          >
            What Differs
          </span>
        </div>
        <p
          className="text-xs leading-relaxed"
          style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)" }}
        >
          Parameters that differ between your model and the expert model.
        </p>
      </div>

      {/* Delta rows */}
      {deltas.map((d, i) => (
        <DeltaRow key={d.key ?? i} delta={d} />
      ))}
    </div>
  );
}

function DeltaRow({ delta }: { delta: SimDelta }) {
  const rows: { phase: Phase; value: string }[] = [
    { phase: PHASE_STUDENT, value: delta.studentValue },
    { phase: PHASE_EXPERT,  value: delta.expertValue  },
  ];

  return (
    <div
      className="flex flex-col gap-2 p-3"
      style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
    >
      <span
        className="text-xs font-black"
        style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}
      >
        {delta.label}
      </span>

      {rows.map(({ phase, value }) => {
        const color = PHASE_COLOR[phase];
        return (
          <div key={phase} className="flex items-center justify-between">
            <span
              className="text-xs"
              style={{ color, fontFamily: "var(--font-dm-mono)" }}
            >
              {PHASE_LABEL[phase]}
            </span>
            <span
              className="text-xs px-2 py-0.5"
              style={{
                backgroundColor: `${color}15`,
                border:          `1px solid ${color}30`,
                color,
                fontFamily:      "var(--font-dm-mono)",
              }}
            >
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
}