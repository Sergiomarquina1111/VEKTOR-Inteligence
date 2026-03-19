"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  collection, query, where, orderBy, limit, onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/store/authstore";

const ACCENT        = "#7B5CFF";
const ACCENT_DIM    = "#7B5CFF15";
const ACCENT_BORDER = "#7B5CFF35";

const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Science"] as const;
type Subject = (typeof SUBJECTS)[number];

const SUBJECT_COLOR: Record<Subject, string> = {
  Mathematics:       "#C8FF00",
  Physics:           "#00E5FF",
  Chemistry:         "#2BD9A0",
  Biology:           "#FF6B6B",
  "Computer Science":"#FFB800",
};

// ── Types ──────────────────────────────────────────────────────────
interface HeatmapNode {
  concept:  string;
  t1Count:  number;
  t2Count:  number;
  t3Count:  number;
  lastUpdated: string;
}

// ── Mock fallback data ─────────────────────────────────────────────
// REPLACE: pulled from classes/{classId}.heatmapCache via onSnapshot
const MOCK_NODES: Record<Subject, HeatmapNode[]> = {
  Mathematics: [
    { concept: "Vectors",            t1Count: 22, t2Count: 4,  t3Count: 1,  lastUpdated: "" },
    { concept: "Dot Product",        t1Count: 18, t2Count: 6,  t3Count: 3,  lastUpdated: "" },
    { concept: "Matrix Mult.",       t1Count: 20, t2Count: 5,  t3Count: 2,  lastUpdated: "" },
    { concept: "Determinants",       t1Count: 15, t2Count: 8,  t3Count: 4,  lastUpdated: "" },
    { concept: "Eigenvalues",        t1Count: 8,  t2Count: 7,  t3Count: 12, lastUpdated: "" },
    { concept: "Eigenvectors",       t1Count: 6,  t2Count: 9,  t3Count: 11, lastUpdated: "" },
    { concept: "Linear Indep.",      t1Count: 10, t2Count: 8,  t3Count: 9,  lastUpdated: "" },
    { concept: "Basis",              t1Count: 14, t2Count: 8,  t3Count: 5,  lastUpdated: "" },
    { concept: "Rank",               t1Count: 16, t2Count: 7,  t3Count: 4,  lastUpdated: "" },
    { concept: "Null Space",         t1Count: 9,  t2Count: 10, t3Count: 7,  lastUpdated: "" },
    { concept: "Orthogonality",      t1Count: 7,  t2Count: 8,  t3Count: 11, lastUpdated: "" },
    { concept: "Projections",        t1Count: 11, t2Count: 9,  t3Count: 6,  lastUpdated: "" },
    { concept: "Diagonalization",    t1Count: 5,  t2Count: 10, t3Count: 8,  lastUpdated: "" },
    { concept: "SVD",                t1Count: 3,  t2Count: 5,  t3Count: 4,  lastUpdated: "" },
    { concept: "Trace",              t1Count: 19, t2Count: 5,  t3Count: 3,  lastUpdated: "" },
    { concept: "Inverse",            t1Count: 17, t2Count: 7,  t3Count: 3,  lastUpdated: "" },
    { concept: "Transpose",          t1Count: 21, t2Count: 4,  t3Count: 2,  lastUpdated: "" },
    { concept: "Row Echelon",        t1Count: 13, t2Count: 9,  t3Count: 5,  lastUpdated: "" },
    { concept: "Gauss–Jordan",       t1Count: 12, t2Count: 8,  t3Count: 6,  lastUpdated: "" },
    { concept: "Char. Polynomial",   t1Count: 4,  t2Count: 9,  t3Count: 9,  lastUpdated: "" },
  ],
  Physics: [
    { concept: "Kinematics",         t1Count: 24, t2Count: 2, t3Count: 1, lastUpdated: "" },
    { concept: "Newton's Laws",      t1Count: 22, t2Count: 4, t3Count: 2, lastUpdated: "" },
    { concept: "Momentum",           t1Count: 18, t2Count: 6, t3Count: 3, lastUpdated: "" },
    { concept: "Energy",             t1Count: 20, t2Count: 5, t3Count: 2, lastUpdated: "" },
    { concept: "Waves",              t1Count: 15, t2Count: 8, t3Count: 4, lastUpdated: "" },
    { concept: "Thermodynamics",     t1Count: 10, t2Count: 9, t3Count: 6, lastUpdated: "" },
    { concept: "Maxwell's Eqs.",     t1Count: 6,  t2Count: 8, t3Count: 9, lastUpdated: "" },
    { concept: "Optics",             t1Count: 14, t2Count: 9, t3Count: 4, lastUpdated: "" },
    { concept: "Quantum Basics",     t1Count: 4,  t2Count: 6, t3Count: 5, lastUpdated: "" },
    { concept: "Special Relativity", t1Count: 3,  t2Count: 4, t3Count: 3, lastUpdated: "" },
  ],
  Chemistry:        [],
  Biology:          [],
  "Computer Science": [],
};

// ── Cell component ─────────────────────────────────────────────────
function HeatCell({
  node, total, onHover,
}: { node: HeatmapNode; total: number; onHover: (n: HeatmapNode | null) => void }) {
  const t3Ratio  = total > 0 ? node.t3Count / total : 0;
  const t2Ratio  = total > 0 ? node.t2Count / total : 0;
  const t1Ratio  = total > 0 ? node.t1Count / total : 0;

  let bg: string;
  let border: string;
  if (t3Ratio > 0.3)       { bg = `rgba(255,61,87,${0.15 + t3Ratio * 0.55})`; border = `rgba(255,61,87,0.5)`; }
  else if (t2Ratio > 0.3)  { bg = `rgba(255,184,0,${0.12 + t2Ratio * 0.4})`; border = `rgba(255,184,0,0.35)`; }
  else if (t1Ratio > 0.5)  { bg = `rgba(200,255,0,${0.1 + t1Ratio * 0.3})`; border = `rgba(200,255,0,0.25)`; }
  else                     { bg = "rgba(58,58,92,0.3)"; border = "rgba(58,58,92,0.4)"; }

  return (
    <div
      className="relative p-2 cursor-pointer transition-all duration-150"
      style={{ backgroundColor: bg, border: `1px solid ${border}` }}
      onMouseEnter={() => onHover(node)}
      onMouseLeave={() => onHover(null)}
    >
      {/* T3 badge */}
      {node.t3Count > 0 && (
        <div
          className="absolute top-1 right-1 text-xs px-1"
          style={{ backgroundColor: "#FF3D57", color: "#fff", fontFamily: "var(--font-dm-mono)", fontSize: 8 }}
        >{node.t3Count}T3</div>
      )}

      <div
        className="text-xs font-semibold truncate mb-1"
        style={{ color: "#F0F0FF", fontFamily: "var(--font-dm-mono)", fontSize: 10 }}
      >{node.concept}</div>

      {/* Mini tier bar */}
      <div className="h-1 flex overflow-hidden" style={{ backgroundColor: "#1E1E36" }}>
        <div style={{ width: `${t1Ratio * 100}%`, backgroundColor: "#C8FF00" }} />
        <div style={{ width: `${t2Ratio * 100}%`, backgroundColor: "#FFB800" }} />
        <div style={{ width: `${t3Ratio * 100}%`, backgroundColor: "#FF3D57" }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════
export default function TeacherHeatmapPage() {
  const { user } = useAuthStore();
  const [activeSubject, setActiveSubject] = useState<Subject>("Mathematics");
  const [nodes, setNodes]                 = useState<HeatmapNode[]>(MOCK_NODES["Mathematics"]);
  const [totalStudents, setTotalStudents] = useState(28); // REPLACE: from class doc
  const [hoveredNode, setHoveredNode]     = useState<HeatmapNode | null>(null);
  const [sortBy, setSortBy]               = useState<"t3" | "t2" | "t1" | "alpha">("t3");

  // ── Firestore: live heatmapCache listener ──────────────────────
  // REPLACE: onSnapshot on classes/{classId} — heatmapCache updates
  // every time a student session writes to Firestore
  useEffect(() => {
    if (!user?.classIds?.length) return;
    // onSnapshot(doc(db, "classes", user.classIds[0]), (snap) => {
    //   if (!snap.exists()) return;
    //   const data = snap.data();
    //   const cache = data.heatmapCache || {};
    //   setTotalStudents(data.studentIds?.length || 0);
    //   const nodeList = Object.entries(cache)
    //     .filter(([, v]: any) => v.subject === activeSubject)
    //     .map(([concept, v]: any) => ({
    //       concept, t1Count: v.t1Count, t2Count: v.t2Count, t3Count: v.t3Count, lastUpdated: v.lastUpdated,
    //     }));
    //   setNodes(nodeList);
    // });

    // Using mock data until backend is wired
    setNodes(MOCK_NODES[activeSubject] || []);
  }, [user?.classIds, activeSubject]);

  // ── Sort ───────────────────────────────────────────────────────
  const sorted = [...nodes].sort((a, b) => {
    if (sortBy === "t3")    return b.t3Count - a.t3Count;
    if (sortBy === "t2")    return b.t2Count - a.t2Count;
    if (sortBy === "t1")    return b.t1Count - a.t1Count;
    return a.concept.localeCompare(b.concept);
  });

  const totalT3  = nodes.reduce((s, n) => s + n.t3Count, 0);
  const totalT2  = nodes.reduce((s, n) => s + n.t2Count, 0);
  const totalT1  = nodes.reduce((s, n) => s + n.t1Count, 0);

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-6 h-px" style={{ backgroundColor: ACCENT }} />
            <span className="text-xs tracking-widest uppercase"
              style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}>Live Heatmap</span>
          </div>
          <h1 className="text-2xl font-black"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
            Misconception Heatmap
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#C8FF00", animation: "pulse 2s infinite" }} />
            <span className="text-xs tracking-widest" style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}>LIVE</span>
          </div>
          <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
            {totalStudents} students · {nodes.length} nodes
          </span>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "T1 Aligned",       val: totalT1,  color: "#C8FF00", desc: "concept nodes confirmed" },
          { label: "T2 Gaps",          val: totalT2,  color: "#FFB800", desc: "surface-level understanding" },
          { label: "T3 Misconceptions",val: totalT3,  color: "#FF3D57", desc: "need immediate intervention" },
        ].map((s) => (
          <div key={s.label} className="p-4"
            style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
            <div className="text-xs tracking-widest uppercase mb-2"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{s.label}</div>
            <div className="text-3xl font-black leading-none mb-1"
              style={{ fontFamily: "var(--font-syne)", color: s.color }}>{s.val}</div>
            <div className="text-xs" style={{ color: "#6B6A80" }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* ── Subject tabs + sort ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1">
          {SUBJECTS.map((s) => {
            const t3 = (MOCK_NODES[s] || []).reduce((sum, n) => sum + n.t3Count, 0);
            const active = s === activeSubject;
            return (
              <button key={s}
                onClick={() => setActiveSubject(s)}
                className="flex items-center gap-2 px-3 py-2 text-xs transition-all duration-150"
                style={{
                  backgroundColor: active ? ACCENT_DIM : "transparent",
                  border: active ? `1px solid ${ACCENT_BORDER}` : "1px solid #1E1E36",
                  color: active ? ACCENT : "#6B6A80",
                  fontFamily: "var(--font-dm-mono)",
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SUBJECT_COLOR[s] }} />
                {s.split(" ")[0]}
                {t3 > 0 && (
                  <span className="px-1 text-xs"
                    style={{ backgroundColor: "#FF3D5715", color: "#FF3D57", fontSize: 9 }}>{t3}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>SORT</span>
          {(["t3","t2","t1","alpha"] as const).map((s) => (
            <button key={s}
              onClick={() => setSortBy(s)}
              className="px-2 py-1 text-xs transition-all"
              style={{
                backgroundColor: sortBy === s ? ACCENT_DIM : "transparent",
                border: sortBy === s ? `1px solid ${ACCENT_BORDER}` : "1px solid #1E1E36",
                color: sortBy === s ? ACCENT : "#6B6A80",
                fontFamily: "var(--font-dm-mono)",
              }}
            >{s === "alpha" ? "A–Z" : s.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-6">
        {[
          { label: "T1 Aligned",        color: "#C8FF00" },
          { label: "T2 Gap",            color: "#FFB800" },
          { label: "T3 Misconception",  color: "#FF3D57" },
          { label: "T4 Unknown",        color: "#3A3A5C" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <div className="w-3 h-3" style={{ backgroundColor: l.color + "60", border: `1px solid ${l.color}50` }} />
            <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{l.label}</span>
          </div>
        ))}
        <span className="ml-auto text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
          Hover cells to inspect
        </span>
      </div>

      {/* ── Heatmap grid + tooltip ── */}
      <div className="relative">
        {sorted.length > 0 ? (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}
          >
            {sorted.map((node) => (
              <HeatCell
                key={node.concept}
                node={node}
                total={totalStudents}
                onHover={setHoveredNode}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-3"
            style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
            <span style={{ color: ACCENT, fontSize: 28 }}>⬡</span>
            <p className="text-xs" style={{ color: "#6B6A80" }}>
              No heatmap data yet for {activeSubject}.
            </p>
            <p className="text-xs" style={{ color: "#3A3A5C" }}>
              Cells populate as students submit sessions — live via Firestore onSnapshot.
            </p>
          </div>
        )}

        {/* Tooltip */}
        {hoveredNode && (
          <div
            className="fixed z-50 p-4 pointer-events-none"
            style={{
              backgroundColor: "#0F0F1A",
              border: `1px solid ${ACCENT_BORDER}`,
              minWidth: 200,
              right: 32,
              top: 120,
            }}
          >
            <div className="font-black text-sm mb-3"
              style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
            >{hoveredNode.concept}</div>
            {[
              { label: "T1 Aligned",       val: hoveredNode.t1Count, color: "#C8FF00" },
              { label: "T2 Gap",           val: hoveredNode.t2Count, color: "#FFB800" },
              { label: "T3 Misconception", val: hoveredNode.t3Count, color: "#FF3D57" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between mb-1.5">
                <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                  {r.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold" style={{ color: r.color, fontFamily: "var(--font-dm-mono)" }}>
                    {r.val}
                  </span>
                  <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                    ({totalStudents > 0 ? Math.round((r.val / totalStudents) * 100) : 0}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}