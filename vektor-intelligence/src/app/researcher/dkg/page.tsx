"use client";
import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/store/authstore";

const ACCENT        = "#2BD9A0";
const ACCENT_DIM    = "#2BD9A015";
const ACCENT_BORDER = "#2BD9A035";

const SUBJECT_COLOR: Record<string, string> = {
  Mathematics: "#C8FF00", Physics: "#00E5FF", Chemistry: "#2BD9A0",
  Biology: "#FF6B6B", "Computer Science": "#FFB800",
};
const TIER_NODE_COLOR: Record<string, string> = {
  foundational: "#C8FF00", intermediate: "#00E5FF",
  advanced:     "#FFB800", expert:       "#A855F7",
};

interface DKGNode {
  id:          string;
  label:       string;
  tier:        string;
  prereqs:     string[];
  description: string;
  x:           number;
  y:           number;
}

// ── Mock DKG ──────────────────────────────────────────────────────
// REPLACE: onSnapshot(doc(db, "dkg", subject)) to get live DKG
const MOCK_DKG: DKGNode[] = [
  { id:"n0",  label:"Vectors",         tier:"foundational", prereqs:[],           description:"Directed quantities in n-dimensional space.",         x:0.08, y:0.20 },
  { id:"n1",  label:"Dot Product",     tier:"foundational", prereqs:["n0"],       description:"Scalar product measuring alignment of two vectors.", x:0.20, y:0.10 },
  { id:"n2",  label:"Cross Product",   tier:"foundational", prereqs:["n0"],       description:"Vector product yielding perpendicular vector.",       x:0.08, y:0.38 },
  { id:"n3",  label:"Linear Indep.",   tier:"intermediate", prereqs:["n0","n1"],  description:"Non-redundant set of vectors spanning a subspace.",   x:0.36, y:0.15 },
  { id:"n4",  label:"Matrix Mult.",    tier:"foundational", prereqs:["n0"],       description:"Linear transformation composition via arrays.",       x:0.32, y:0.35 },
  { id:"n5",  label:"Determinant",     tier:"intermediate", prereqs:["n3","n4"],  description:"Scalar encoding volume scaling of a transformation.", x:0.48, y:0.18 },
  { id:"n6",  label:"Inverse",         tier:"intermediate", prereqs:["n4","n5"],  description:"Matrix undoing a linear transformation.",             x:0.52, y:0.35 },
  { id:"n7",  label:"Rank",            tier:"intermediate", prereqs:["n3","n4"],  description:"Dimension of the column space of a matrix.",          x:0.28, y:0.56 },
  { id:"n8",  label:"Null Space",      tier:"intermediate", prereqs:["n4","n7"],  description:"Set of vectors mapped to zero by a transformation.",  x:0.44, y:0.56 },
  { id:"n9",  label:"Eigenvalues",     tier:"advanced",     prereqs:["n3","n5","n6"], description:"Scalars for which Av = λv — critical T3 node.",   x:0.64, y:0.18 },
  { id:"n10", label:"Eigenvectors",    tier:"advanced",     prereqs:["n9"],       description:"Directions unchanged by a linear transformation.",   x:0.76, y:0.32 },
  { id:"n11", label:"Diagonalize",     tier:"advanced",     prereqs:["n9","n10"], description:"Expressing a matrix as PDP⁻¹ for computation.",      x:0.84, y:0.18 },
  { id:"n12", label:"Orthogonality",   tier:"advanced",     prereqs:["n1","n3"],  description:"Perpendicularity generalized to inner product spaces.",x:0.60, y:0.50 },
  { id:"n13", label:"Projections",     tier:"advanced",     prereqs:["n12"],      description:"Closest point in a subspace to a given vector.",      x:0.72, y:0.60 },
  { id:"n14", label:"SVD",             tier:"expert",       prereqs:["n10","n12","n13"], description:"Factorizes any matrix into U·Σ·Vᵀ.",          x:0.86, y:0.54 },
  { id:"n15", label:"Trace",           tier:"foundational", prereqs:["n4"],       description:"Sum of diagonal entries = sum of eigenvalues.",       x:0.20, y:0.72 },
  { id:"n16", label:"Symmetric",       tier:"intermediate", prereqs:["n4","n12"], description:"Matrices equal to their transpose — always diag.",   x:0.36, y:0.76 },
  { id:"n17", label:"Row Echelon",     tier:"foundational", prereqs:["n4"],       description:"Upper triangular form for solving linear systems.",   x:0.52, y:0.76 },
  { id:"n18", label:"Gauss–Jordan",    tier:"intermediate", prereqs:["n17"],      description:"Complete row reduction to reduced echelon form.",     x:0.66, y:0.76 },
  { id:"n19", label:"Char. Poly.",     tier:"advanced",     prereqs:["n9","n5"],  description:"det(A − λI) = 0 — the eigenvalue equation.",          x:0.82, y:0.76 },
];

const MOCK_EDGES = MOCK_DKG.flatMap((n) => n.prereqs.map((p) => ({ from: p, to: n.id })));

// ══════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════
export default function ResearcherDKGPage() {
  const { user }                      = useAuthStore();
  const canvasRef                     = useRef<HTMLCanvasElement>(null);
  const rafRef                        = useRef<number>(0);
  const [activeSubject, setActiveSubject] = useState("Mathematics");
  const [nodes,         setNodes]     = useState<DKGNode[]>(MOCK_DKG);
  const [hoveredNode,   setHoveredNode]  = useState<DKGNode | null>(null);
  const [selectedNode,  setSelectedNode] = useState<DKGNode | null>(null);
  const [particles,     setParticles] = useState<{edge:typeof MOCK_EDGES[0];t:number;speed:number}[]>([]);

  // ── Firestore: live DKG doc ────────────────────────────────────
  // REPLACE: onSnapshot(doc(db, "dkg", activeSubject.toLowerCase()))
  // to get live version with node/edge updates when researcher publishes

  // ── Canvas animation ──────────────────────────────────────────
  useEffect(() => {
    const pts = MOCK_EDGES.map((e) => ({ edge: e, t: Math.random(), speed: 0.002 + Math.random() * 0.003 }));
    setParticles(pts);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    function resize() {
      const w = canvas!.parentElement!.clientWidth;
      const h = 420;
      canvas!.style.width  = w + "px";
      canvas!.style.height = h + "px";
      canvas!.width  = w * dpr;
      canvas!.height = h * dpr;
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      const ctx = canvas!.getContext("2d")!;
      const w = canvas!.width / dpr;
      const h = canvas!.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "rgba(255,255,255,0.025)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,h); ctx.stroke(); }
      for (let gy = 0; gy < h; gy += 40) { ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(w,gy); ctx.stroke(); }

      // Edges
      MOCK_EDGES.forEach(({ from, to }) => {
        const na = nodes.find((n) => n.id === from);
        const nb = nodes.find((n) => n.id === to);
        if (!na || !nb) return;
        const isHighlighted =
          (selectedNode && (selectedNode.id === from || selectedNode.id === to)) ||
          (hoveredNode  && (hoveredNode.id  === from || hoveredNode.id  === to));

        ctx.strokeStyle = isHighlighted ? "rgba(43,217,160,0.4)" : "rgba(255,255,255,0.06)";
        ctx.lineWidth   = isHighlighted ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(na.x * w, na.y * h);
        ctx.lineTo(nb.x * w, nb.y * h);
        ctx.stroke();
      });

      // Flow particles
      setParticles((prev) => {
        const next = prev.map((p) => {
          const na = nodes.find((n) => n.id === p.edge.from);
          const nb = nodes.find((n) => n.id === p.edge.to);
          if (!na || !nb) return p;
          const t = (p.t + p.speed) % 1;
          const px = (na.x + (nb.x - na.x) * t) * w;
          const py = (na.y + (nb.y - na.y) * t) * h;
          const col = TIER_NODE_COLOR[na.tier] || ACCENT;
          ctx.fillStyle = col + "66";
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
          return { ...p, t };
        });
        return next;
      });

      // Nodes
      nodes.forEach((node) => {
        const x = node.x * w;
        const y = node.y * h;
        const col = TIER_NODE_COLOR[node.tier] || ACCENT;
        const isHovered  = hoveredNode?.id  === node.id;
        const isSelected = selectedNode?.id === node.id;
        const r = isSelected ? 10 : isHovered ? 9 : 6;

        if (isHovered || isSelected) {
          ctx.shadowColor = col; ctx.shadowBlur = 16;
        }
        ctx.fillStyle = col + (isSelected ? "30" : isHovered ? "22" : "15");
        ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = `rgba(240,242,255,${isHovered || isSelected ? 0.9 : 0.45})`;
        ctx.font = isHovered || isSelected ? `600 11px 'Space Grotesk',sans-serif` : `500 9px 'DM Mono',monospace`;
        ctx.textAlign = "center";
        ctx.fillText(node.label, x, y + r + 13);
      });

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, [nodes, hoveredNode, selectedNode]);

  // ── Canvas mouse interaction ──────────────────────────────────
  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / canvas.offsetWidth;
    const my = (e.clientY - rect.top) / canvas.offsetHeight;
    const found = nodes.find((n) => Math.hypot(n.x - mx, n.y - my) < 0.035) || null;
    setHoveredNode(found);
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / canvas.offsetWidth;
    const my = (e.clientY - rect.top) / canvas.offsetHeight;
    const found = nodes.find((n) => Math.hypot(n.x - mx, n.y - my) < 0.035) || null;
    setSelectedNode(found?.id === selectedNode?.id ? null : found);
  }

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-6 h-px" style={{ backgroundColor: ACCENT }} />
            <span className="text-xs tracking-widest uppercase"
              style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}>DKG Explorer</span>
          </div>
          <h1 className="text-2xl font-black"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
            Domain Knowledge Graph
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1"
            style={{ backgroundColor: ACCENT_DIM, color: ACCENT, border: `1px solid ${ACCENT_BORDER}`,
              fontFamily: "var(--font-dm-mono)" }}>v2.4.1</span>
          <button
            className="px-4 py-2 text-xs font-black tracking-widest transition-all"
            style={{ backgroundColor: ACCENT, color: "#08080F", fontFamily: "var(--font-syne)" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >+ PUBLISH UPDATE</button>
        </div>
      </div>

      {/* ── Subject selector ── */}
      <div className="flex gap-2">
        {Object.entries(SUBJECT_COLOR).map(([s, c]) => (
          <button key={s}
            onClick={() => setActiveSubject(s)}
            className="flex items-center gap-2 px-3 py-2 text-xs transition-all"
            style={{
              backgroundColor: activeSubject === s ? `${c}12` : "transparent",
              border: activeSubject === s ? `1px solid ${c}40` : "1px solid #1E1E36",
              color: activeSubject === s ? c : "#6B6A80",
              fontFamily: "var(--font-dm-mono)",
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
            {s.split(" ")[0]}
          </button>
        ))}
      </div>

      {/* ── Two-col layout: canvas + stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="relative" style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
            <div className="absolute top-3 left-4 z-10 text-xs tracking-widest"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
              FLOW FIELD · HOVER & CLICK TO INSPECT
            </div>
            <canvas
              ref={canvasRef}
              style={{ cursor: hoveredNode ? "pointer" : "crosshair", display: "block" }}
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={handleCanvasClick}
            />
          </div>

          {/* Tier legend */}
          <div className="flex gap-4 mt-3">
            {Object.entries(TIER_NODE_COLOR).map(([t, c]) => (
              <div key={t} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                <span className="text-xs capitalize" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats + node detail */}
        <div className="space-y-4">
          {/* DKG stats */}
          {[
            { label: "Total Nodes", val: nodes.length,  color: ACCENT },
            { label: "Edges",       val: MOCK_EDGES.length, color: "#C8FF00" },
            { label: "Foundational",val: nodes.filter(n=>n.tier==="foundational").length, color: "#C8FF00" },
            { label: "Expert Nodes",val: nodes.filter(n=>n.tier==="expert").length, color: "#A855F7" },
          ].map((s) => (
            <div key={s.label} className="p-4"
              style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
              <div className="text-xs tracking-widest uppercase mb-1"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{s.label}</div>
              <div className="text-2xl font-black"
                style={{ fontFamily: "var(--font-syne)", color: s.color }}>{s.val}</div>
            </div>
          ))}

          {/* Selected node detail */}
          {selectedNode && (
            <div className="p-4" style={{ backgroundColor: "#0F0F1A", border: `1px solid ${ACCENT_BORDER}` }}>
              <div className="text-xs tracking-widest uppercase mb-2"
                style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}>Selected Node</div>
              <div className="font-black text-base mb-1"
                style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>{selectedNode.label}</div>
              <div className="text-xs mb-2 leading-relaxed" style={{ color: "#6B6A80" }}>
                {selectedNode.description}
              </div>
              <div className="text-xs px-2 py-0.5 inline-block capitalize mb-2"
                style={{ backgroundColor: `${TIER_NODE_COLOR[selectedNode.tier]}15`,
                  color: TIER_NODE_COLOR[selectedNode.tier],
                  border: `1px solid ${TIER_NODE_COLOR[selectedNode.tier]}30`,
                  fontFamily: "var(--font-dm-mono)" }}>
                {selectedNode.tier}
              </div>
              <div className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                {selectedNode.prereqs.length} prerequisite{selectedNode.prereqs.length !== 1 ? "s" : ""}
                {selectedNode.prereqs.length > 0 && ": " +
                  selectedNode.prereqs.map((p) => nodes.find((n) => n.id === p)?.label).join(", ")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Node list table ── */}
      <div style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
        <div className="px-5 py-3 border-b" style={{ borderColor: "#1E1E36" }}>
          <span className="text-xs tracking-widest uppercase"
            style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>All Concept Nodes</span>
        </div>
        <div className="divide-y" style={{ borderColor: "#1E1E3620" }}>
          {nodes.map((n) => (
            <div key={n.id}
              className="flex items-center gap-4 px-5 py-3 cursor-pointer transition-colors"
              style={{ borderBottom: "1px solid #1E1E3620" }}
              onClick={() => setSelectedNode(n.id === selectedNode?.id ? null : n)}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#08080F")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: TIER_NODE_COLOR[n.tier] || ACCENT }} />
              <span className="text-sm font-bold flex-1"
                style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}>{n.label}</span>
              <span className="text-xs capitalize"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{n.tier}</span>
              <span className="text-xs"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                {n.prereqs.length} prereqs
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}