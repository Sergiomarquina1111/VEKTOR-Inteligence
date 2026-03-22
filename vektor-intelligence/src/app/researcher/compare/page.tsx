// ─────────────────────────────────────────────────────────────────────────────
// FILE 1 — src/app/researcher/compare/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
"use client";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/authstore";

const ACCENT        = "#2BD9A0";
const ACCENT_DIM    = "#2BD9A015";
const ACCENT_BORDER = "#2BD9A035";

const CONCEPT_NAMES = [
  "Vectors","Dot Product","Matrix Mult.","Determinants","Eigenvalues",
  "Eigenvectors","Linear Indep.","Basis","Rank","Null Space",
];
const MOCK_A = [82,71,68,55,29,24,48,52,38,35];
const MOCK_B = [91,85,80,72,58,52,61,66,60,61];

function CohortCanvas({
  id, data, color, label,
}: { id: string; data: number[]; color: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.parentElement!.clientWidth;
    const h = 260;
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cols = 5;
    const rows = Math.ceil(data.length / cols);
    const cw = w / cols, ch = h / rows;

    data.forEach((val, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = col * cw, y = row * ch;
      const alpha = 0.08 + (val / 100) * 0.7;
      ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
      ctx.fillStyle = color;
      ctx.font = `700 11px 'DM Mono',monospace`;
      ctx.textAlign = "center";
      ctx.fillText(val + "%", x + cw / 2, y + ch / 2 + 2);
      ctx.fillStyle = "rgba(240,242,255,0.5)";
      ctx.font = `500 8px 'DM Mono',monospace`;
      const lbl = CONCEPT_NAMES[i]?.length > 8 ? CONCEPT_NAMES[i].slice(0, 7) + "…" : CONCEPT_NAMES[i] || "";
      ctx.fillText(lbl, x + cw / 2, y + ch / 2 + 16);
    });
  }, [data, color]);
  return <canvas ref={ref} style={{ display: "block" }} />;
}

export default function ResearcherComparePage() {
  const diffData = CONCEPT_NAMES.map((c, i) => ({
    concept: c, a: MOCK_A[i], b: MOCK_B[i], diff: MOCK_B[i] - MOCK_A[i],
  })).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-6 h-px" style={{ backgroundColor: ACCENT }} />
          <span className="text-xs tracking-widest uppercase"
            style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}>Cohort Analysis</span>
        </div>
        <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
          Compare Groups
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          { id:"a", label:"Cohort A — JEE Aspirants", sub:"n=142 · Jan–Mar 2026", color:"#00E5FF", avg:"T2.3", data:MOCK_A },
          { id:"b", label:"Cohort B — Undergraduates", sub:"n=89 · Jan–Mar 2026",  color:"#C8FF00", avg:"T1.8", data:MOCK_B },
        ].map((c) => (
          <div key={c.id} style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
            <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid #1E1E36" }}>
              <div>
                <div className="font-black text-sm" style={{ fontFamily: "var(--font-syne)", color: c.color }}>
                  {c.label}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                  {c.sub}
                </div>
              </div>
              <span className="text-xs px-2 py-1"
                style={{ backgroundColor: `${c.color}15`, color: c.color, border: `1px solid ${c.color}30`,
                  fontFamily: "var(--font-dm-mono)" }}>AVG {c.avg}</span>
            </div>
            <CohortCanvas id={c.id} data={c.data} color={c.color} label={c.label} />
            <div className="px-4 py-2 text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
              T1 alignment % per concept node — darker = higher alignment
            </div>
          </div>
        ))}
      </div>

      <div className="p-5" style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
        <div className="font-black text-sm mb-4" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
          Concept Divergence — Largest Gaps Between Cohorts
        </div>
        <div className="flex gap-6 mb-4">
          {[{ label:"Cohort A", color:"#00E5FF" },{ label:"Cohort B", color:"#C8FF00" }].map((l) => (
            <div key={l.label} className="flex items-center gap-2">
              <div className="w-4 h-1.5" style={{ backgroundColor: l.color + "80" }} />
              <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{l.label}</span>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {diffData.map((d) => (
            <div key={d.concept} className="grid items-center gap-3" style={{ gridTemplateColumns:"120px 1fr 70px" }}>
              <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{d.concept}</span>
              <div className="relative h-4 overflow-hidden" style={{ backgroundColor: "#1E1E36" }}>
                <div className="absolute inset-y-0 left-0" style={{ width:`${d.a}%`, backgroundColor:"#00E5FF60" }} />
                <div className="absolute inset-y-0" style={{ left:`${d.a}%`, width:`${Math.max(0,d.b-d.a)}%`, backgroundColor:"#C8FF0060" }} />
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ fontFamily: "var(--font-dm-mono)" }}>
                <span style={{ color:"#00E5FF" }}>{d.a}%</span>
                <span style={{ color:"#3A3A5C" }}>/</span>
                <span style={{ color:"#C8FF00" }}>{d.b}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}