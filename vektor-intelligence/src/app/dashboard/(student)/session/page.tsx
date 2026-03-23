"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/authstore";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── Types ──────────────────────────────────────────────────────────
type Tier = "T1" | "T2" | "T3" | "T4" | null;

interface GraphNode {
  id:     string;
  label:  string;
  x:      number;
  y:      number;
  status: "aligned" | "gap" | "misconception" | "unvisited" | "unknown";
}
interface GraphEdge {
  from:   string;
  to:     string;
  status: "correct" | "wrong" | "missing";
}

// ── Real API shapes ────────────────────────────────────────────────
interface ApiGapItem {
  concept:     string;
  dkg_node_id: string;
  description: string;
  priority:    "high" | "medium" | "low";
}
interface ApiMisconceptionItem {
  concept:               string;
  student_belief:        string;
  correct_understanding: string;
  dkg_node_id:           string;
}
interface ApiGraphNode {
  id:               string;
  label:            string;
  tier?:            string;
  matched_dkg_id?:  string;
  similarity_score?: number;
}
interface ApiDKGNode {
  id:            string;
  label:         string;
  tier:          string;
  description:   string;
  prerequisites: string[];
  is_matched:    boolean;
  match_status:  "aligned" | "gap" | "misconception" | "unvisited";
}
interface ApiGraphEdge {
  source:          string;
  target:          string;
  relation:        string;
  contradicts_dkg: boolean;
}
interface ApiAdaptivePathItem {
  concept:     string;
  reason:      string;
  priority:    string;
  blocked_by?: string;
}
interface ApiResponse {
  sessionId:         string;
  userId:            string;
  subject:           string;
  subjectConfidence: number;
  tier:              string;
  tierLabel:         string;
  tierScore:         number;
  query:             string;
  skg: { nodes: ApiGraphNode[]; edges: ApiGraphEdge[] };
  dkg: { nodes: ApiDKGNode[];   edges: ApiGraphEdge[] };
  metrics: {
    node_coverage:          number;
    edge_alignment:         number;
    contradiction_rate:     number;
    prereq_chain_coverage:  number;
    concept_depth:          number;
    missing_critical_nodes: string[];
    weighted_alignment:     number;
  };
  gaps:             ApiGapItem[];
  misconceptions:   ApiMisconceptionItem[];
  explanation:      string;
  adaptivePath:     ApiAdaptivePathItem[];
  simulation:       { simulatable: boolean; simulationHint?: string };
  dkgVersion:       string;
  dkgNodeCount:     number;
  processingTimeMs: number;
}

interface SessionResult {
  tier:             Tier;
  tierLabel:        string;
  tierScore:        number;
  subject:          string;
  skgNodes:         GraphNode[];
  skgEdges:         GraphEdge[];
  dkgNodes:         GraphNode[];
  dkgEdges:         GraphEdge[];
  explanation:      string;
  gaps:             ApiGapItem[];
  misconceptions:   ApiMisconceptionItem[];
  aligned:          number;
  adaptivePath:     ApiAdaptivePathItem[];
  metrics:          ApiResponse["metrics"] | null;
  simulatable:      boolean;
  simulationHint:   string | null;
  dkgVersion:       string;
  processingTimeMs: number;
}

interface ChatMessage {
  role:       "user" | "ai";
  content:    string;
  streaming?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SUBJECT_COLORS: Record<string, string> = {
  mathematics:      "#1A4D9F",
  physics:          "#5B3FCC",
  chemistry:        "#006677",
  biology:          "#3A6B00",
  computer_science: "#7A5200",
};
const SUBJECT_LABELS: Record<string, string> = {
  mathematics:      "Mathematics",
  physics:          "Physics",
  chemistry:        "Chemistry",
  biology:          "Biology",
  computer_science: "Computer Science",
};
const SUBJECTS = Object.keys(SUBJECT_COLORS);

const TIER_CONFIG = {
  T1: { color: "#C8FF00", label: "Aligned",      bg: "#C8FF0010", desc: "Your understanding matches the expert model."                          },
  T2: { color: "#FFB800", label: "Gap",           bg: "#FFB80010", desc: "You understand the surface but are missing key connections."            },
  T3: { color: "#FF3D57", label: "Misconception", bg: "#FF3D5710", desc: "Your mental model has a structural error blocking downstream concepts." },
  T4: { color: "#7B5CFF", label: "Fragmented",    bg: "#7B5CFF10", desc: "Not enough conceptual structure to map your understanding."             },
};
const STAGE_BG: Record<string, string> = {
  T1:   "radial-gradient(ellipse at 50% 100%, #C8FF0008 0%, #08080F 60%)",
  T2:   "radial-gradient(ellipse at 50% 100%, #FFB80008 0%, #08080F 60%)",
  T3:   "radial-gradient(ellipse at 50% 100%, #FF3D5712 0%, #08080F 60%)",
  T4:   "radial-gradient(ellipse at 50% 100%, #7B5CFF10 0%, #08080F 60%)",
  none: "none",
};
const SIMULATION_HINT_LABELS: Record<string, string> = {
  orbital:         "Orbital Mechanics",
  wave:            "Wave Behaviour",
  force:           "Force Diagram",
  transform:       "Matrix Transform",
  graph_plot:      "Graph / Function",
  geometry:        "Geometry",
  sort:            "Sorting Algorithm",
  graph_traversal: "Graph Traversal",
  molecular:       "Molecular Structure",
  reaction:        "Chemical Reaction",
};

// ── Layout helpers ─────────────────────────────────────────────────
function layoutNodes(nodes: { id: string; label: string; status: GraphNode["status"] }[]): GraphNode[] {
  const cols = Math.max(2, Math.ceil(Math.sqrt(nodes.length)));
  return nodes.map((n, i) => ({
    id:     n.id,
    label:  n.label,
    x:      70 + (i % cols) * 100,
    y:      60 + Math.floor(i / cols) * 90,
    status: n.status,
  }));
}

// ── Map ApiResponse → SessionResult ───────────────────────────────
function mapApiResponse(data: ApiResponse): SessionResult {
  const contradictingSources = new Set(
    (data.skg?.edges || []).filter(e => e.contradicts_dkg).map(e => e.source)
  );
  const skgNodes = layoutNodes(
    (data.skg?.nodes || []).map(n => ({
      id:     n.id,
      label:  n.label,
      status: contradictingSources.has(n.id)
        ? "misconception"
        : n.matched_dkg_id
          ? (n.similarity_score && n.similarity_score >= 0.72 ? "aligned" : "gap")
          : "unknown",
    }))
  );
  const skgEdges: GraphEdge[] = (data.skg?.edges || []).map(e => ({
    from:   e.source,
    to:     e.target,
    status: e.contradicts_dkg ? "wrong" : "correct",
  }));

  // ── DKG — real nodes from backend ────────────────────────────
  const dkgNodes = layoutNodes(
    (data.dkg?.nodes || []).map(n => ({
      id:     n.id,
      label:  n.label,
      status: n.match_status === "aligned"       ? "aligned"
            : n.match_status === "misconception" ? "misconception"
            : n.match_status === "gap"           ? "gap"
            : "unvisited",
    }))
  );
  const dkgEdges: GraphEdge[] = (data.dkg?.edges || []).map(e => ({
    from:   e.source,
    to:     e.target,
    status: "correct" as const,
  }));

  const gaps: ApiGapItem[] = (data.gaps || []).map(g =>
    typeof g === "string"
      ? { concept: g, dkg_node_id: "unknown", description: "", priority: "medium" as const }
      : g
  );
  const misconceptions: ApiMisconceptionItem[] = (data.misconceptions || []).map(m =>
    typeof m === "string"
      ? { concept: m, student_belief: "", correct_understanding: "", dkg_node_id: "unknown" }
      : m
  );

  return {
    tier:             (data.tier as Tier) || "T4",
    tierLabel:        data.tierLabel || "Fragmented",
    tierScore:        data.tierScore || 0,
    subject:          data.subject,
    skgNodes,
    skgEdges,
    dkgNodes,
    dkgEdges,
    explanation:      data.explanation || "",
    gaps,
    misconceptions,
    aligned:          skgNodes.filter(n => n.status === "aligned").length,
    adaptivePath:     data.adaptivePath || [],
    metrics:          data.metrics || null,
    simulatable:      data.simulation?.simulatable ?? false,
    simulationHint:   data.simulation?.simulationHint ?? null,
    dkgVersion:       data.dkgVersion || "1.0.0",
    processingTimeMs: data.processingTimeMs || 0,
  };
}

// ── Save session to Firestore ──────────────────────────────────────
async function saveSession(
  userId: string, classId: string | undefined,
  subject: string, query: string, result: SessionResult,
  duration: number, dkgVersion: string
) {
  try {
    await addDoc(collection(db, "sessions"), {
      userId, classId: classId ?? null, subject, query,
      tier: result.tier, conceptsAligned: result.aligned,
      gapsFound: result.gaps.length, misconceptions: result.misconceptions.length,
      duration, dkgVersion, createdAt: Timestamp.now(),
    });
  } catch (err) { console.error("[saveSession]", err); }
}

// ══════════════════════════════════════════════════════════════════
// GRAPH PANEL
// ══════════════════════════════════════════════════════════════════
function GraphPanel({ title, nodes, edges, subjectColor, animate, emptyLabel }: {
  title: string; nodes: GraphNode[]; edges: GraphEdge[];
  subjectColor: string; animate: boolean; emptyLabel?: string;
}) {
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const nodeColor = (s: GraphNode["status"]) => {
    switch (s) {
      case "aligned":       return subjectColor;
      case "gap":           return "#FFB800";
      case "misconception": return "#FF3D57";
      default:              return "#3A3A5C";
    }
  };
  const edgeColor = (s: GraphEdge["status"]) =>
    s === "wrong" ? "#FF3D57" : s === "missing" ? "#FF6B6B40" : `${subjectColor}60`;

  return (
    <div className="flex flex-col h-full" style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
      <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid #1E1E36" }}>
        <span className="text-xs tracking-widest uppercase"
          style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{title}</span>
        <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
          {nodes.length} nodes
        </span>
      </div>
      <div className="flex-1 relative overflow-hidden">
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-center px-4"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)", lineHeight: 1.8 }}>
              {emptyLabel || "No data yet"}
            </span>
          </div>
        ) : (
          <svg width="100%" height="100%" viewBox="0 0 420 360" className="absolute inset-0">
            <defs>
              <marker id={`arr-${title}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#3A3A5C60" />
              </marker>
            </defs>
            {edges.map((edge, i) => {
              const from = nodeMap[edge.from];
              const to   = nodeMap[edge.to];
              if (!from || !to) return null;
              return (
                <line key={`e-${i}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={edgeColor(edge.status)}
                  strokeWidth={edge.status === "wrong" ? 2 : 1.5}
                  strokeDasharray={edge.status === "missing" ? "4 4" : "none"}
                  markerEnd={`url(#arr-${title})`}
                  style={{ opacity: animate ? 1 : 0, transition: `opacity 0.4s ease ${i * 60}ms` }} />
              );
            })}
            {nodes.map((node, i) => (
              <g key={node.id}
                style={{ opacity: animate ? 1 : 0, transition: `opacity 0.3s ease ${i * 50}ms` }}>
                {node.status === "misconception" && (
                  <circle cx={node.x} cy={node.y} r={19} fill="none" stroke="#FF3D57"
                    strokeWidth={1} opacity={0.35}
                    style={{ animation: "nodePulse 1.5s ease-in-out infinite" }} />
                )}
                <circle cx={node.x} cy={node.y}
                  r={node.status === "unvisited" ? 8 : 12}
                  fill={`${nodeColor(node.status)}15`}
                  stroke={nodeColor(node.status)}
                  strokeWidth={node.status === "unvisited" ? 1 : 1.5}
                  strokeDasharray={node.status === "unvisited" ? "3 3" : "none"} />
                <text x={node.x} y={node.y + 24} textAnchor="middle"
                  fill={nodeColor(node.status)} fontSize={7.5}
                  fontFamily="var(--font-dm-mono)">
                  {node.label.length > 14 ? node.label.slice(0, 13) + "…" : node.label}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// SIMULATION MODAL
// ══════════════════════════════════════════════════════════════════
function SimulationModal({ hint, query, tier, subject, onClose }: {
  hint: string; query: string; tier: Tier; subject: string; onClose: () => void;
}) {
  const tierCfg = tier ? TIER_CONFIG[tier] : TIER_CONFIG.T2;

  const renderSim = () => {
    switch (hint) {
      case "transform":  return <TransformSim />;
      case "graph_plot": return <GraphPlotSim />;
      case "wave":       return <WaveSim />;
      case "force":      return <ForceSim />;
      case "sort":       return <SortSim />;
      default:           return <GenericSim subjectColor={SUBJECT_COLORS[subject] || "#1A4D9F"} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "#08080FCC", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col"
        style={{ width: 760, maxHeight: "88vh", backgroundColor: "#0F0F1A",
                 border: "1px solid #1E1E36", overflow: "hidden" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid #1E1E36" }}>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tierCfg.color }} />
            <span className="text-sm font-black tracking-widest uppercase"
              style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}>Concept Simulation</span>
            <span className="text-xs px-2 py-0.5"
              style={{ backgroundColor: "#16162A", color: "#6B6A80",
                       border: "1px solid #1E1E36", fontFamily: "var(--font-dm-mono)" }}>
              {SIMULATION_HINT_LABELS[hint] || hint}
            </span>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1.5"
            style={{ color: "#3A3A5C", border: "1px solid #1E1E36", fontFamily: "var(--font-dm-mono)" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#FF3D5750")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}>
            ✕ Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Query echo */}
          <div className="mb-4 px-4 py-3" style={{ backgroundColor: "#16162A", border: "1px solid #1E1E36" }}>
            <p className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Your query</p>
            <p className="text-sm mt-1 leading-relaxed"
              style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)" }}>{query}</p>
          </div>

          {/* Phase labels */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="px-4 py-3" style={{ backgroundColor: "#FF3D5710", border: "1px solid #FF3D5730" }}>
              <p className="text-xs mb-1" style={{ color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}>
                YOUR MODEL
              </p>
              <p className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)" }}>
                What your query implies about this concept
              </p>
            </div>
            <div className="px-4 py-3" style={{ backgroundColor: "#C8FF0010", border: "1px solid #C8FF0030" }}>
              <p className="text-xs mb-1" style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}>
                CORRECT MODEL
              </p>
              <p className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)" }}>
                What the Domain Knowledge Graph says is correct
              </p>
            </div>
          </div>

          <div style={{ border: "1px solid #1E1E36", backgroundColor: "#08080F" }}>
            {renderSim()}
          </div>
        </div>

        <div className="px-6 py-4 flex-shrink-0 flex items-center justify-between"
          style={{ borderTop: "1px solid #1E1E36" }}>
          <p className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
            Tier {tier} · {tierCfg.label} · The gap between the two models is your lesson
          </p>
          <button onClick={onClose}
            className="px-5 py-2 text-xs font-black tracking-widest"
            style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}>
            GOT IT →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Simulation renderers ───────────────────────────────────────────

function PhaseToggle({ phase, onToggle }: { phase: "student" | "correct"; onToggle: () => void }) {
  return (
    <div className="flex justify-center mt-3">
      <button onClick={onToggle}
        className="px-4 py-2 text-xs font-black tracking-widest"
        style={{ backgroundColor: phase === "student" ? "#FF3D5720" : "#C8FF0020",
                 color: phase === "student" ? "#FF3D57" : "#C8FF00",
                 border: `1px solid ${phase === "student" ? "#FF3D5750" : "#C8FF0050"}`,
                 fontFamily: "var(--font-dm-mono)" }}>
        {phase === "student" ? "→ See correct model" : "← See your model"}
      </button>
    </div>
  );
}

function TransformSim() {
  const [phase, setPhase] = useState<"student" | "correct">("student");
  const [animating, setAnimating] = useState(false);
  function toggle() { setAnimating(true); setTimeout(() => { setPhase(p => p === "student" ? "correct" : "student"); setAnimating(false); }, 350); }

  const student = [
    { x: 200, y: 180, label: "eigenvalue = direction-invariant vector", color: "#FF3D57" },
  ];
  const correct = [
    { x: 150, y: 160, label: "λ = scalar",     color: "#C8FF00" },
    { x: 280, y: 130, label: "v = eigenvector", color: "#00E5FF" },
    { x: 210, y:  70, label: "Av = λv",         color: "#C8FF00" },
  ];
  const pts = phase === "student" ? student : correct;

  return (
    <div className="p-4">
      <svg width="100%" height="220" viewBox="0 0 420 220"
        style={{ opacity: animating ? 0.2 : 1, transition: "opacity 0.35s" }}>
        {[60,120,180,240,300,360].map(x => <line key={x} x1={x} y1={20} x2={x} y2={200} stroke="#1E1E36" strokeWidth={0.5} />)}
        {[40,80,120,160,200].map(y  => <line key={y} x1={40} y1={y} x2={400} y2={y} stroke="#1E1E36" strokeWidth={0.5} />)}
        <line x1={40} y1={110} x2={400} y2={110} stroke="#2A2A4A" strokeWidth={1} />
        <line x1={200} y1={20} x2={200} y2={200} stroke="#2A2A4A" strokeWidth={1} />
        <defs>
          {["FF3D57","C8FF00","00E5FF"].map(c => (
            <marker key={c} id={`a${c}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill={`#${c}`} />
            </marker>
          ))}
        </defs>
        {pts.map((pt, i) => (
          <g key={i} style={{ transition: "all 0.5s ease" }}>
            <line x1={200} y1={110} x2={pt.x} y2={pt.y}
              stroke={pt.color} strokeWidth={2}
              markerEnd={`url(#a${pt.color.replace("#","")})`} />
            <circle cx={pt.x} cy={pt.y} r={6} fill={`${pt.color}20`} stroke={pt.color} strokeWidth={1.5} />
            <text x={pt.x + 10} y={pt.y + 4} fill={pt.color} fontSize={9} fontFamily="var(--font-dm-mono)">
              {pt.label.length > 20 ? pt.label.slice(0,19)+"…" : pt.label}
            </text>
          </g>
        ))}
      </svg>
      <PhaseToggle phase={phase} onToggle={toggle} />
    </div>
  );
}

function GraphPlotSim() {
  const [phase, setPhase] = useState<"student" | "correct">("student");
  const [animating, setAnimating] = useState(false);
  function toggle() { setAnimating(true); setTimeout(() => { setPhase(p => p === "student" ? "correct" : "student"); setAnimating(false); }, 350); }
  const W = 420, H = 200, ox = 40, oy = 100, sy = 60;

  function studentPath() {
    let d = `M ${ox} ${oy}`;
    for (let i = 0; i <= 360; i += 5) {
      const x = ox + (i / 360) * (W - ox - 20);
      const y = oy - Math.sin((i * Math.PI) / 180) * sy * 1.6;
      d += ` L ${x} ${y}`;
    }
    return d;
  }
  function correctPath() {
    let d = `M ${ox} ${oy - sy}`;
    for (let i = 0; i <= 360; i += 5) {
      const x = ox + (i / 360) * (W - ox - 20);
      const y = oy - Math.cos((i * Math.PI) / 180) * sy;
      d += ` L ${x} ${y}`;
    }
    return d;
  }

  return (
    <div className="p-4">
      <svg width="100%" height="200" viewBox={`0 0 ${W} ${H}`}
        style={{ opacity: animating ? 0.2 : 1, transition: "opacity 0.35s" }}>
        <line x1={ox} y1={20} x2={ox} y2={H-10} stroke="#2A2A4A" strokeWidth={1.5} />
        <line x1={ox} y1={oy} x2={W-10} y2={oy} stroke="#2A2A4A" strokeWidth={1.5} />
        <path d={phase === "student" ? studentPath() : correctPath()}
          fill="none" stroke={phase === "student" ? "#FF3D57" : "#C8FF00"} strokeWidth={2}
          style={{ transition: "stroke 0.4s" }} />
        <text x={ox+10} y={30} fill={phase === "student" ? "#FF3D57" : "#C8FF00"}
          fontSize={10} fontFamily="var(--font-dm-mono)">
          {phase === "student" ? "d/dx sin(x) ≈ sin(x) × 1.6  ✗" : "d/dx sin(x) = cos(x)  ✓"}
        </text>
      </svg>
      <PhaseToggle phase={phase} onToggle={toggle} />
    </div>
  );
}

function WaveSim() {
  const [t, setT] = useState(0);
  const [phase, setPhase] = useState<"student" | "correct">("student");
  useEffect(() => {
    let raf: number;
    const loop = () => { setT(p => p + 0.04); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const W = 420, H = 180, oy = 90;
  const path = (amp: number, freq: number, ps: number) => {
    let d = "";
    for (let x = 0; x <= W; x += 3) {
      const y = oy - amp * Math.sin((x / W) * Math.PI * 2 * freq + t + ps);
      d += x === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    }
    return d;
  };
  return (
    <div className="p-4">
      <svg width="100%" height="180" viewBox={`0 0 ${W} ${H}`}>
        <line x1={0} y1={oy} x2={W} y2={oy} stroke="#1E1E36" strokeWidth={1} />
        {phase === "student" ? (
          <>
            <path d={path(65, 1, 0)} fill="none" stroke="#FF3D57" strokeWidth={2} />
            <text x={10} y={20} fill="#FF3D57" fontSize={9} fontFamily="var(--font-dm-mono)">
              High frequency = high amplitude (✗)
            </text>
          </>
        ) : (
          <>
            <path d={path(30, 3, 0)} fill="none" stroke="#C8FF00" strokeWidth={2} />
            <path d={path(65, 1, 0)} fill="none" stroke="#00E5FF" strokeWidth={1.5} strokeDasharray="4 2" />
            <text x={10} y={20} fill="#C8FF00" fontSize={9} fontFamily="var(--font-dm-mono)">
              Frequency ≠ Amplitude — they are independent (✓)
            </text>
          </>
        )}
      </svg>
      <PhaseToggle phase={phase} onToggle={() => setPhase(p => p === "student" ? "correct" : "student")} />
    </div>
  );
}

function ForceSim() {
  const [phase, setPhase] = useState<"student" | "correct">("student");
  return (
    <div className="p-4">
      <svg width="100%" height="220" viewBox="0 0 420 220">
        <rect x={170} y={90} width={80} height={50} fill="#16162A" stroke="#2A2A4A" strokeWidth={1.5} rx={2} />
        <text x={210} y={120} textAnchor="middle" fill="#6B6A80" fontSize={10} fontFamily="var(--font-dm-mono)">object</text>
        <line x1={100} y1={140} x2={320} y2={140} stroke="#2A2A4A" strokeWidth={1.5} />
        <defs>
          <marker id="aRed" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#FF3D57" />
          </marker>
          <marker id="aGreen" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#C8FF00" />
          </marker>
        </defs>
        {phase === "student" ? (
          <>
            <line x1={210} y1={90} x2={210} y2={30} stroke="#FF3D57" strokeWidth={3} markerEnd="url(#aRed)" />
            <text x={225} y={55} fill="#FF3D57" fontSize={9} fontFamily="var(--font-dm-mono)">g ~ mass (✗)</text>
            <text x={125} y={175} fill="#FF3D57" fontSize={9} fontFamily="var(--font-dm-mono)">Heavier objects fall faster</text>
          </>
        ) : (
          <>
            {[190,210,230].map((x, i) => (
              <line key={x} x1={x} y1={90} x2={x} y2={30}
                stroke="#C8FF00" strokeWidth={i===1?2.5:1.5} strokeOpacity={i===1?1:0.4}
                markerEnd="url(#aGreen)" />
            ))}
            <text x={248} y={55} fill="#C8FF00" fontSize={9} fontFamily="var(--font-dm-mono)">g = 9.8 m/s² (✓)</text>
            <text x={115} y={175} fill="#C8FF00" fontSize={9} fontFamily="var(--font-dm-mono)">All objects fall at the same rate</text>
          </>
        )}
      </svg>
      <PhaseToggle phase={phase} onToggle={() => setPhase(p => p === "student" ? "correct" : "student")} />
    </div>
  );
}

function SortSim() {
  const init = [5, 2, 8, 1, 9, 3];
  const [arr, setArr] = useState([...init]);
  const [step, setStep] = useState(0);
  function nextStep() {
    const a = [...arr];
    for (let i = 0; i < a.length - 1 - step; i++) {
      if (a[i] > a[i + 1]) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; break; }
    }
    setArr(a); setStep(s => s + 1);
  }
  return (
    <div className="p-6">
      <div className="flex items-end justify-center gap-3 mb-6" style={{ height: 100 }}>
        {arr.map((val, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{val}</div>
            <div style={{ width: 36, height: val * 9,
              backgroundColor: i < step ? "#C8FF0030" : "#1E1E36",
              border: `1px solid ${i < step ? "#C8FF0060" : "#3A3A5C"}`,
              transition: "all 0.3s ease" }} />
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-3">
        <button onClick={nextStep} disabled={step >= arr.length}
          className="px-4 py-2 text-xs font-black disabled:opacity-30"
          style={{ backgroundColor: "#C8FF0020", color: "#C8FF00",
                   border: "1px solid #C8FF0050", fontFamily: "var(--font-dm-mono)" }}>
          Step →
        </button>
        <button onClick={() => { setArr([...init]); setStep(0); }}
          className="px-4 py-2 text-xs"
          style={{ border: "1px solid #1E1E36", color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
          Reset
        </button>
      </div>
      <p className="text-xs text-center mt-3" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
        Bubble sort — step through to see O(n²) comparison pattern
      </p>
    </div>
  );
}

function GenericSim({ subjectColor }: { subjectColor: string }) {
  const [phase, setPhase] = useState<"student" | "correct">("student");
  const sn = [{ x: 120, y: 100, label: "Concept A", color: "#FF3D57" },
              { x: 280, y: 100, label: "Concept B", color: "#FF3D57" },
              { x: 200, y: 180, label: "Concept C", color: "#FF3D57" }];
  const cn = [{ x: 200, y:  70, label: "Root",     color: "#C8FF00" },
              { x: 120, y: 155, label: "Branch A",  color: subjectColor },
              { x: 280, y: 155, label: "Branch B",  color: subjectColor }];
  const pts = phase === "student" ? sn : cn;
  return (
    <div className="p-4">
      <svg width="100%" height="230" viewBox="0 0 420 230">
        {phase === "correct" && (
          <>
            <line x1={200} y1={70} x2={120} y2={155} stroke={`${subjectColor}60`} strokeWidth={1.5} />
            <line x1={200} y1={70} x2={280} y2={155} stroke={`${subjectColor}60`} strokeWidth={1.5} />
          </>
        )}
        {phase === "student" && (
          <>
            <line x1={120} y1={100} x2={280} y2={100} stroke="#FF3D5760" strokeWidth={1.5} strokeDasharray="4 3" />
            <line x1={200} y1={100} x2={200} y2={180} stroke="#FF3D5760" strokeWidth={1.5} strokeDasharray="4 3" />
          </>
        )}
        {pts.map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r={26} fill={`${n.color}15`} stroke={n.color} strokeWidth={1.5} />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fill={n.color} fontSize={9}
              fontFamily="var(--font-dm-mono)">{n.label}</text>
          </g>
        ))}
        <text x={210} y={220} fill={phase === "student" ? "#FF3D57" : "#C8FF00"}
          fontSize={10} fontFamily="var(--font-dm-mono)">
          {phase === "student" ? "✗ Your model" : "✓ Expert model"}
        </text>
      </svg>
      <PhaseToggle phase={phase} onToggle={() => setPhase(p => p === "student" ? "correct" : "student")} />
    </div>
  );
}

// ── Analysis sub-components ────────────────────────────────────────

function TierBadge({ tier, tierScore }: { tier: Tier; tierScore?: number }) {
  if (!tier) return null;
  const cfg = TIER_CONFIG[tier];
  return (
    <div className="flex items-start gap-3 p-4"
      style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.color}30` }}>
      <div className="px-2 py-1 text-xs font-black flex-shrink-0"
        style={{ backgroundColor: `${cfg.color}20`, color: cfg.color,
                 fontFamily: "var(--font-dm-mono)", border: `1px solid ${cfg.color}50` }}>
        {tier}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-black" style={{ color: cfg.color, fontFamily: "var(--font-syne)" }}>
            {cfg.label}
          </div>
          {tierScore !== undefined && (
            <div className="text-xs" style={{ color: cfg.color, fontFamily: "var(--font-dm-mono)" }}>
              {(tierScore * 100).toFixed(0)}%
            </div>
          )}
        </div>
        <div className="text-xs leading-relaxed" style={{ color: "#6B6A80" }}>{cfg.desc}</div>
        {tierScore !== undefined && (
          <div className="mt-2 h-0.5 w-full" style={{ backgroundColor: "#1E1E36" }}>
            <div className="h-full transition-all duration-700"
              style={{ width: `${tierScore * 100}%`, backgroundColor: cfg.color }} />
          </div>
        )}
      </div>
    </div>
  );
}

function MetricsPanel({ metrics }: { metrics: ApiResponse["metrics"] }) {
  const items = [
    { label: "Node Coverage",  val: metrics.node_coverage,         invert: false },
    { label: "Edge Alignment", val: metrics.edge_alignment,        invert: false },
    { label: "Prereq Chain",   val: metrics.prereq_chain_coverage, invert: false },
    { label: "Contradiction",  val: metrics.contradiction_rate,    invert: true  },
  ];
  return (
    <div style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid #1E1E36" }}>
        <span className="text-xs tracking-widest uppercase"
          style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Graph Metrics</span>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {items.map(item => {
          const pct   = Math.round(item.val * 100);
          const color = item.invert
            ? item.val >= 0.2 ? "#FF3D57" : "#C8FF00"
            : item.val >= 0.6 ? "#C8FF00" : item.val >= 0.3 ? "#FFB800" : "#FF3D57";
          return (
            <div key={item.label}>
              <div className="flex justify-between mb-1">
                <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                  {item.label}
                </span>
                <span className="text-xs font-black" style={{ color, fontFamily: "var(--font-dm-mono)" }}>
                  {pct}%
                </span>
              </div>
              <div className="h-0.5 w-full" style={{ backgroundColor: "#1E1E36" }}>
                <div className="h-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AIExplanationPanel({ explanation, streaming }: { explanation: string; streaming: boolean }) {
  const [expanded, setExpanded] = useState(true);
  if (!explanation) return null;
  return (
    <div style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ borderBottom: expanded ? "1px solid #1E1E36" : "none" }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: "#7B5CFF", animation: streaming ? "pulse 1s infinite" : "none" }} />
          <span className="text-xs tracking-widest uppercase"
            style={{ color: "#7B5CFF", fontFamily: "var(--font-dm-mono)" }}>AI Analysis</span>
        </div>
        <span style={{ color: "#3A3A5C", fontSize: 10 }}>{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-4 py-3">
          <p className="text-xs leading-relaxed" style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)" }}>
            {explanation}
            {streaming && (
              <span className="inline-block w-0.5 h-3 ml-0.5 align-middle"
                style={{ backgroundColor: "#7B5CFF", animation: "blink 0.8s infinite" }} />
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function KnowledgeGapCard({ gaps, misconceptions }: { gaps: ApiGapItem[]; misconceptions: ApiMisconceptionItem[] }) {
  if (!gaps.length && !misconceptions.length) return null;
  return (
    <div style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid #1E1E36" }}>
        <span className="text-xs tracking-widest uppercase"
          style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Knowledge Gaps</span>
      </div>
      <div className="px-4 py-3 space-y-3">
        {misconceptions.map((m, i) => (
          <div key={`m-${m.concept}-${i}`} className="pb-3" style={{ borderBottom: "1px solid #1E1E3630" }}>
            <div className="flex items-center gap-2 mb-1">
              <span style={{ color: "#FF3D57", fontSize: 10, fontFamily: "var(--font-dm-mono)" }}>T3</span>
              <span className="text-xs flex-1 font-bold"
                style={{ color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}>{m.concept}</span>
              <span className="text-xs" style={{ color: "#3A3A5C" }}>→ Fix first</span>
            </div>
            {m.correct_understanding && (
              <p className="text-xs leading-relaxed mt-1"
                style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)", paddingLeft: 20 }}>
                {m.correct_understanding}
              </p>
            )}
          </div>
        ))}
        {gaps.map((g, i) => (
          <div key={`g-${g.concept}-${i}`} className="pb-3" style={{ borderBottom: "1px solid #1E1E3630" }}>
            <div className="flex items-center gap-2 mb-1">
              <span style={{ color: "#FFB800", fontSize: 10, fontFamily: "var(--font-dm-mono)" }}>
                {g.priority === "high" ? "T2↑" : "T2"}
              </span>
              <span className="text-xs flex-1 font-bold"
                style={{ color: "#FFB800", fontFamily: "var(--font-dm-mono)" }}>{g.concept}</span>
              <span className="text-xs" style={{ color: "#3A3A5C" }}>→ Explore</span>
            </div>
            {g.description && (
              <p className="text-xs leading-relaxed mt-1"
                style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)", paddingLeft: 20 }}>
                {g.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AdaptivePathCard({ items }: { items: ApiAdaptivePathItem[] }) {
  if (!items.length) return null;
  const pc = (p: string) => p === "high" ? "#FF3D57" : p === "medium" ? "#FFB800" : "#6B6A80";
  return (
    <div style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid #1E1E36" }}>
        <span className="text-xs tracking-widest uppercase"
          style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Adaptive Path</span>
      </div>
      <div className="px-4 py-3 space-y-3">
        {items.map((item, i) => (
          <div key={`p-${item.concept}-${i}`} className="flex gap-3">
            <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-xs font-black"
              style={{ backgroundColor: "#16162A", color: pc(item.priority),
                       border: `1px solid ${pc(item.priority)}40`, fontFamily: "var(--font-dm-mono)" }}>
              {i + 1}
            </div>
            <div>
              <div className="text-xs font-bold mb-0.5"
                style={{ color: "#F0F0FF", fontFamily: "var(--font-dm-mono)" }}>{item.concept}</div>
              <div className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)" }}>
                {item.reason}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TutorChat({ messages, onSend, isPro, disabled }: {
  messages: ChatMessage[]; onSend: (msg: string) => void; isPro: boolean; disabled: boolean;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  return (
    <div className="flex flex-col" style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A", minHeight: 180 }}>
      <div className="px-4 py-3 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: "1px solid #1E1E36" }}>
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#7B5CFF" }} />
        <span className="text-xs tracking-widest uppercase"
          style={{ color: "#7B5CFF", fontFamily: "var(--font-dm-mono)" }}>AI Tutor</span>
        {!isPro && (
          <span className="ml-auto text-xs px-2 py-0.5"
            style={{ color: "#FFB800", border: "1px solid #FFB80030",
                     backgroundColor: "#FFB80010", fontFamily: "var(--font-dm-mono)" }}>PRO</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-h-48">
        {messages.length === 0 && (
          <p className="text-xs text-center py-3"
            style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
            Ask a follow-up about your session
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] px-3 py-2 text-xs leading-relaxed"
              style={{ backgroundColor: msg.role === "user" ? "#7B5CFF20" : "#1E1E36",
                       color: "#F0F0FF",
                       border: `1px solid ${msg.role === "user" ? "#7B5CFF40" : "#1E1E36"}`,
                       fontFamily: "var(--font-instrument)" }}>
              {msg.content}
              {msg.streaming && (
                <span className="inline-block w-0.5 h-3 ml-0.5 align-middle"
                  style={{ backgroundColor: "#7B5CFF", animation: "blink 0.8s infinite" }} />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 px-4 py-3 flex-shrink-0" style={{ borderTop: "1px solid #1E1E36" }}>
        {isPro ? (
          <>
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && input.trim() && !disabled) { onSend(input.trim()); setInput(""); } }}
              placeholder="Ask a follow-up..." disabled={disabled}
              className="flex-1 bg-transparent outline-none text-xs"
              style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)" }} />
            <button onClick={() => { if (input.trim() && !disabled) { onSend(input.trim()); setInput(""); } }}
              disabled={disabled || !input.trim()} className="text-xs px-3 py-1.5 disabled:opacity-30"
              style={{ backgroundColor: "#7B5CFF", color: "#F0F0FF", fontFamily: "var(--font-dm-mono)" }}>
              →
            </button>
          </>
        ) : (
          <Link href="/settings" className="w-full text-center text-xs py-2"
            style={{ backgroundColor: "#FFB80015", color: "#FFB800",
                     border: "1px solid #FFB80030", fontFamily: "var(--font-dm-mono)" }}>
            Upgrade to Pro to unlock AI Tutor →
          </Link>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function SessionPage() {
  const { user }     = useAuthStore();
  const searchParams = useSearchParams();

  const preQuery   = searchParams.get("q") || searchParams.get("concept") || "";
  const preSubject = searchParams.get("subject") || user?.subjects?.[0] || "mathematics";

  const [query,          setQuery]          = useState(preQuery);
  const [subject,        setSubject]        = useState(preSubject);
  const [loading,        setLoading]        = useState(false);
  const [loadingStep,    setLoadingStep]    = useState("");
  const [result,         setResult]         = useState<SessionResult | null>(null);
  const [animateGraph,   setAnimateGraph]   = useState(false);
  const [streamedExp,    setStreamedExp]    = useState("");
  const [streaming,      setStreaming]      = useState(false);
  const [chatMessages,   setChatMessages]   = useState<ChatMessage[]>([]);
  const [chatLoading,    setChatLoading]    = useState(false);
  const [sessionTime,    setSessionTime]    = useState(0);
  const [sessionActive,  setSessionActive]  = useState(false);
  const [apiError,       setApiError]       = useState<string | null>(null);
  const [showSimulation, setShowSimulation] = useState(false);

  const sessionStartRef = useRef<number>(Date.now());
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (preQuery) handleSubmit(preQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (sessionActive) {
      timerRef.current = setInterval(() => setSessionTime(t => t + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sessionActive]);

  function formatTime(s: number) {
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  }

  async function handleSubmit(q?: string) {
    const queryText = (q || query).trim();
    if (!queryText || loading) return;

    setLoading(true); setAnimateGraph(false);
    setStreamedExp(""); setStreaming(false);
    setResult(null); setApiError(null); setShowSimulation(false);

    if (!sessionActive) { setSessionActive(true); sessionStartRef.current = Date.now(); }

    const steps = [
      "Extracting knowledge structure...",
      "Mapping your understanding...",
      "Comparing against expert model...",
      "Computing tier classification...",
    ];
    let stepIdx = 0;
    setLoadingStep(steps[0]);
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1);
      setLoadingStep(steps[stepIdx]);
    }, 1200);

    try {
      const response = await fetch(`${API_BASE}/api/session/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${user?.uid || "dev"}` },
        body: JSON.stringify({ query: queryText, subject, userId: user?.uid || "dev" }),
      });

      clearInterval(stepTimer); setLoadingStep("");

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        let detail = `API error ${response.status}`;
        try { const p = JSON.parse(text); detail = p.detail || p.message || JSON.stringify(p); } catch { detail = text || detail; }
        throw new Error(detail);
      }

      const data: ApiResponse = await response.json();
      console.log("[session/analyze]", data);

      const mappedResult = mapApiResponse(data);
      setResult(mappedResult);
      setLoading(false);
      setTimeout(() => setAnimateGraph(true), 100);

      if (mappedResult.explanation) {
        setStreaming(true);
        let streamed = "";
        for (const char of mappedResult.explanation) {
          streamed += char; setStreamedExp(streamed);
          await new Promise(r => setTimeout(r, 14));
        }
        setStreaming(false);
      }

      if (user?.uid) {
        const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
        saveSession(user.uid, user.classId, mappedResult.subject, queryText, mappedResult, duration, mappedResult.dkgVersion);
      }
    } catch (err) {
      clearInterval(stepTimer); setLoading(false); setLoadingStep("");
      setApiError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleTutorSend(message: string) {
    setChatMessages(prev => [...prev, { role: "user", content: message }]);
    setChatLoading(true);
    await new Promise(r => setTimeout(r, 700));
    const responses = [
      "What do you think the relationship is between the concepts you mentioned? Try to describe it in your own words first.",
      "That is an interesting approach. Before I respond — what would happen if you changed the key variable?",
      "You are close. Consider: what constraint are you missing that would make this fully correct?",
    ];
    const responseText = responses[chatMessages.length % responses.length];
    setChatMessages(prev => [...prev, { role: "ai", content: "", streaming: true }]);
    let streamed = "";
    for (const char of responseText) {
      streamed += char;
      setChatMessages(prev => [...prev.slice(0, -1), { role: "ai", content: streamed, streaming: true }]);
      await new Promise(r => setTimeout(r, 18));
    }
    setChatMessages(prev => [...prev.slice(0, -1), { role: "ai", content: streamed, streaming: false }]);
    setChatLoading(false);
  }

  const subjectColor = SUBJECT_COLORS[result?.subject || subject] || "#C8FF00";
  const tier         = result?.tier || null;
  const stageBg      = STAGE_BG[tier || "none"];
  const isPro        = user?.plan === "pro";

  return (
    <div className="flex flex-col"
      style={{ height: "100vh", backgroundColor: "#08080F",
               background: stageBg !== "none" ? `${stageBg}, #08080F` : "#08080F",
               transition: "background 0.8s ease", color: "#F0F0FF", overflow: "hidden" }}>

      {/* ── SIMULATION MODAL ── */}
      {showSimulation && result?.simulatable && result.simulationHint && (
        <SimulationModal hint={result.simulationHint} query={query} tier={tier}
          subject={result.subject} onClose={() => setShowSimulation(false)} />
      )}

      {/* ── TOP BAR ── */}
      <header className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid #1E1E36", backgroundColor: "#08080F" }}>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-xs transition-colors"
            style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#C8FF00")}
            onMouseLeave={e => (e.currentTarget.style.color = "#3A3A5C")}>Dashboard</Link>
          <span style={{ color: "#3A3A5C", fontSize: 10 }}>›</span>
          <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Session</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1 text-xs"
            style={{ backgroundColor: `${subjectColor}15`, border: `1px solid ${subjectColor}40`,
                     color: subjectColor, fontFamily: "var(--font-dm-mono)" }}>
            {SUBJECT_LABELS[result?.subject || subject]}
          </div>
          {tier && (
            <div className="px-2 py-1 text-xs font-black"
              style={{ backgroundColor: `${TIER_CONFIG[tier].color}15`,
                       border: `1px solid ${TIER_CONFIG[tier].color}40`,
                       color: TIER_CONFIG[tier].color, fontFamily: "var(--font-dm-mono)" }}>
              {tier} · {TIER_CONFIG[tier].label}
            </div>
          )}
          {result && (
            <div className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
              {result.processingTimeMs}ms
            </div>
          )}
          {/* SIMULATE button */}
          {result?.simulatable && result.simulationHint && (
            <button onClick={() => setShowSimulation(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-black tracking-widest"
              style={{ backgroundColor: "#7B5CFF20", color: "#7B5CFF",
                       border: "1px solid #7B5CFF50", fontFamily: "var(--font-dm-mono)",
                       animation: "simPulse 2s ease-in-out infinite" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#7B5CFF40"; e.currentTarget.style.borderColor = "#7B5CFF"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#7B5CFF20"; e.currentTarget.style.borderColor = "#7B5CFF50"; }}>
              ▶ SIMULATE
              <span style={{ color: "#7B5CFF80", fontFamily: "var(--font-dm-mono)", fontWeight: 400 }}>
                {SIMULATION_HINT_LABELS[result.simulationHint] || result.simulationHint}
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          {sessionActive && (
            <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
              {formatTime(sessionTime)}
            </span>
          )}
          <Link href="/dashboard" className="px-3 py-1.5 text-xs transition-all"
            style={{ border: "1px solid #1E1E36", color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#FF3D5750")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}>
            End Session
          </Link>
        </div>
      </header>

      {/* ── MAIN AREA ── */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT — Graphs */}
        <div className="flex flex-col flex-1 min-w-0 p-4 gap-3" style={{ borderRight: "1px solid #1E1E36" }}>
          <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
            <div className="flex flex-col gap-2 min-h-0">
              <span className="text-xs text-center flex-shrink-0"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Your understanding</span>
              <div className="flex-1 min-h-0">
                <GraphPanel title="SKG" nodes={result?.skgNodes || []} edges={result?.skgEdges || []}
                  subjectColor={subjectColor} animate={animateGraph}
                  emptyLabel={"Submit a query to\nmap your understanding"} />
              </div>
            </div>
            <div className="flex flex-col gap-2 min-h-0">
              <span className="text-xs text-center flex-shrink-0"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Expert model</span>
              <div className="flex-1 min-h-0">
                <GraphPanel title="DKG" nodes={result?.dkgNodes || []} edges={result?.dkgEdges || []}
                  subjectColor={subjectColor} animate={animateGraph}
                  emptyLabel={"DKG loads after\nyour first query"} />
              </div>
            </div>
          </div>

          {result && (
            <div className="flex flex-wrap gap-4 flex-shrink-0">
              {[
                { color: subjectColor, label: "Aligned"       },
                { color: "#FFB800",    label: "Gap"           },
                { color: "#FF3D57",    label: "Misconception" },
                { color: "#3A3A5C",    label: "Unvisited"     },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{l.label}</span>
                </div>
              ))}
              <div className="ml-auto text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                DKG v{result.dkgVersion}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Analysis panel */}
        <div className="flex-shrink-0 overflow-y-auto" style={{ width: 340 }}>
          <div className="flex flex-col gap-3 p-4">

            <TierBadge tier={tier} tierScore={result?.tierScore} />

            {result && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: result.aligned,              label: "Aligned",  color: "#C8FF00" },
                  { val: result.gaps.length,           label: "Gaps",     color: "#FFB800" },
                  { val: result.misconceptions.length, label: "T3 flags", color: "#FF3D57" },
                ].map(s => (
                  <div key={s.label} className="flex flex-col items-center py-3"
                    style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
                    <span className="text-xl font-black leading-none"
                      style={{ fontFamily: "var(--font-syne)", color: s.color }}>{s.val}</span>
                    <span className="text-xs mt-1"
                      style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{s.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Simulate CTA in panel */}
            {result?.simulatable && result.simulationHint && (
              <button onClick={() => setShowSimulation(true)}
                className="w-full py-3 flex items-center justify-center gap-2 text-xs font-black tracking-widest"
                style={{ backgroundColor: "#7B5CFF15", color: "#7B5CFF",
                         border: "1px solid #7B5CFF40", fontFamily: "var(--font-dm-mono)" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#7B5CFF30")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#7B5CFF15")}>
                ▶ VISUALISE THIS CONCEPT
                <span style={{ fontWeight: 400, opacity: 0.6 }}>
                  {SIMULATION_HINT_LABELS[result.simulationHint]}
                </span>
              </button>
            )}

            {apiError && (
              <div className="px-4 py-3 flex flex-col gap-2"
                style={{ border: "1px solid #FF3D5740", backgroundColor: "#FF3D5710" }}>
                <p className="text-xs" style={{ color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}>⚠ {apiError}</p>
                <p className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                  Is the backend running?{" "}
                  <a href={`${API_BASE}/api/health`} target="_blank" rel="noreferrer"
                    style={{ color: "#C8FF00" }}>{API_BASE}/api/health</a>
                </p>
              </div>
            )}

            <AIExplanationPanel explanation={streamedExp} streaming={streaming} />
            {result?.metrics && <MetricsPanel metrics={result.metrics} />}
            {result && <KnowledgeGapCard gaps={result.gaps} misconceptions={result.misconceptions} />}
            {result && result.adaptivePath.length > 0 && <AdaptivePathCard items={result.adaptivePath} />}
            <TutorChat messages={chatMessages} onSend={handleTutorSend} isPro={isPro} disabled={chatLoading || loading} />
          </div>
        </div>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div className="flex-shrink-0 px-4 py-4" style={{ borderTop: "1px solid #1E1E36", backgroundColor: "#08080F" }}>
        {loading && (
          <div className="text-xs mb-3 flex items-center gap-2"
            style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}>
            <div className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "#C8FF00", animation: "pulse 1s infinite" }} />
            {loadingStep}
          </div>
        )}
        <div className="flex gap-3">
          <select value={subject} onChange={e => setSubject(e.target.value)} disabled={loading}
            className="text-xs outline-none px-3 flex-shrink-0 disabled:opacity-50"
            style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36",
                     color: "#6B6A80", fontFamily: "var(--font-dm-mono)", width: 148, height: 48 }}>
            {SUBJECTS.map(s => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
          </select>

          <div className="flex-1 flex items-center gap-3 px-4"
            style={{ backgroundColor: "#0F0F1A",
                     border: `1px solid ${loading ? "#C8FF0040" : "#1E1E36"}`,
                     transition: "border-color 0.2s" }}>
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="Ask a STEM question — VEKTOR will map your understanding..."
              disabled={loading} className="flex-1 bg-transparent outline-none text-sm py-3"
              style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)" }} />
            <button className="flex-shrink-0 w-8 h-8 flex items-center justify-center"
              style={{ border: "1px solid #1E1E36", backgroundColor: "#16162A", color: "#3A3A5C" }}
              title="Voice input — Phase 2">🎙</button>
          </div>

          <button onClick={() => handleSubmit()} disabled={loading || !query.trim()}
            className="px-6 text-sm font-black tracking-widest transition-all disabled:opacity-30 flex-shrink-0"
            style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.backgroundColor = "#DAFF33"; }}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#C8FF00")}>
            {loading ? "..." : "ASK →"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0}   }
        @keyframes nodePulse{ 0%,100%{opacity:0.4} 50%{opacity:0.9} }
        @keyframes simPulse { 0%,100%{box-shadow:0 0 0px #7B5CFF00} 50%{box-shadow:0 0 12px #7B5CFF40} }
      `}</style>
    </div>
  );
}