"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/authstore";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── WebGL2 simulation engine ──────────────────────────────────────
import { SimulationModal } from "@/simulation";
import type { SimulationData, SimParams } from "@/simulation";
import { SUBJECT_DEFAULT_HINT } from "@/simulation";

// ══════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════
type Tier = "T1" | "T2" | "T3" | "T4" | null;

interface GraphNode {
  id:          string;
  label:       string;
  x:           number;
  y:           number;
  status:      "aligned" | "gap" | "misconception" | "unvisited" | "unknown";
  // enriched from DKG
  tier?:        string;
  description?: string;
  prerequisites?: string[];
  is_matched?:  boolean;
  similarity_score?: number;
  matched_dkg_id?:   string;
}
interface GraphEdge {
  from:   string;
  to:     string;
  status: "correct" | "wrong" | "missing";
  relation?: string;
}

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
interface ApiSimulationDelta {
  key:          string;
  label:        string;
  studentValue: string;
  expertValue:  string;
}
interface ApiSimulation {
  simulatable:     boolean;
  simulationHint?: string;
  label?:          string;
  studentParams:   Record<string, unknown>;
  expertParams:    Record<string, unknown>;
  deltas:          ApiSimulationDelta[];
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
  simulation:       ApiSimulation;
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
  simulationData:   SimulationData | null;
  dkgVersion:       string;
  processingTimeMs: number;
}
interface ChatMessage {
  role:       "user" | "ai";
  content:    string;
  streaming?: boolean;
}

// ══════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════
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
  T1: { color: "#C8FF00", label: "Aligned",       bg: "#C8FF0010", desc: "Your understanding matches the expert model."                                        },
  T2: { color: "#FFB800", label: "Gap",            bg: "#FFB80010", desc: "You understand the surface but are missing key connections."                         },
  T3: { color: "#FF3D57", label: "Misconception",  bg: "#FF3D5710", desc: "Your mental model has a structural difference from the expert model."                },
  T4: { color: "#7B5CFF", label: "Fragmented",     bg: "#7B5CFF10", desc: "Not enough conceptual structure to map your understanding."                          },
};
const STAGE_BG: Record<string, string> = {
  T1:   "radial-gradient(ellipse at 50% 100%, #C8FF0008 0%, #08080F 60%)",
  T2:   "radial-gradient(ellipse at 50% 100%, #FFB80008 0%, #08080F 60%)",
  T3:   "radial-gradient(ellipse at 50% 100%, #FF3D5712 0%, #08080F 60%)",
  T4:   "radial-gradient(ellipse at 50% 100%, #7B5CFF10 0%, #08080F 60%)",
  none: "none",
};

const NODE_STATUS_COLOR = (status: GraphNode["status"], subjectColor: string) => {
  switch (status) {
    case "aligned":       return subjectColor;
    case "gap":           return "#FFB800";
    case "misconception": return "#FF3D57";
    case "unknown":       return "#6B6A80";
    default:              return "#3A3A5C";
  }
};

const TIER_NODE_LABEL: Record<string, string> = {
  foundational:  "Foundational",
  intermediate:  "Intermediate",
  advanced:      "Advanced",
  expert:        "Expert",
};

// ══════════════════════════════════════════════════════════════════
// LAYOUT HELPERS
// ══════════════════════════════════════════════════════════════════
function layoutNodes(nodes: GraphNode[]): GraphNode[] {
  const cols = Math.max(2, Math.ceil(Math.sqrt(nodes.length)));
  const padX = 80, padY = 70, spacingX = 110, spacingY = 95;
  return nodes.map((n, i) => ({
    ...n,
    x: padX + (i % cols) * spacingX,
    y: padY + Math.floor(i / cols) * spacingY,
  }));
}

function mapSimulationData(sim: ApiSimulation, subject: string): SimulationData | null {
  if (!sim?.simulatable) return null;
  const hint = (sim.simulationHint ?? SUBJECT_DEFAULT_HINT[subject] ?? "generic") as SimulationData["hint"];
  return {
    hint,
    subject,
    label:         sim.label ?? hint,
    studentParams: sim.studentParams as Record<string, SimParams[string]> ?? {},
    expertParams:  sim.expertParams  as Record<string, SimParams[string]> ?? {},
    deltas: (sim.deltas ?? []).map(d => ({
      key:          d.key,
      label:        d.label,
      studentValue: d.studentValue,
      expertValue:  d.expertValue,
    })),
  };
}

function mapApiResponse(data: ApiResponse): SessionResult {
  const contradictingSources = new Set(
    (data.skg?.edges || []).filter(e => e.contradicts_dkg).map(e => e.source)
  );

  // Build DKG lookup for enriching SKG nodes
  const dkgNodeMap: Record<string, ApiDKGNode> = {};
  (data.dkg?.nodes || []).forEach(n => { dkgNodeMap[n.id] = n; });

  const skgNodes = layoutNodes(
    (data.skg?.nodes || []).map(n => {
      const dkgNode = n.matched_dkg_id ? dkgNodeMap[n.matched_dkg_id] : null;
      return {
        id:              n.id,
        label:           n.label,
        x: 0, y: 0,
        status: (contradictingSources.has(n.id)
          ? "misconception"
          : n.matched_dkg_id
            ? (n.similarity_score && n.similarity_score >= 0.45 ? "aligned" : "gap")
            : "unknown") as GraphNode["status"],
        tier:             dkgNode?.tier,
        description:      dkgNode?.description,
        prerequisites:    dkgNode?.prerequisites,
        similarity_score: n.similarity_score,
        matched_dkg_id:   n.matched_dkg_id,
        is_matched:       !!n.matched_dkg_id,
      };
    })
  );

  const skgEdges: GraphEdge[] = (data.skg?.edges || []).map(e => ({
    from:     e.source,
    to:       e.target,
    status:   e.contradicts_dkg ? "wrong" : "correct",
    relation: e.relation,
  }));

  const dkgNodes = layoutNodes(
    (data.dkg?.nodes || []).map(n => ({
      id:            n.id,
      label:         n.label,
      x: 0, y: 0,
      status: (n.match_status === "aligned"       ? "aligned"
             : n.match_status === "misconception" ? "misconception"
             : n.match_status === "gap"           ? "gap"
             : "unvisited") as GraphNode["status"],
      tier:          n.tier,
      description:   n.description,
      prerequisites: n.prerequisites,
      is_matched:    n.is_matched,
    }))
  );

  const dkgEdges: GraphEdge[] = (data.dkg?.edges || []).map(e => ({
    from:     e.source,
    to:       e.target,
    status:   "correct" as const,
    relation: e.relation,
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
    simulationData:   mapSimulationData(data.simulation, data.subject),
    dkgVersion:       data.dkgVersion || "1.0.0",
    processingTimeMs: data.processingTimeMs || 0,
  };
}

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
// NODE DETAIL DRAWER
// ══════════════════════════════════════════════════════════════════
function NodeDetailDrawer({
  node,
  panelTitle,
  subjectColor,
  onClose,
  allNodes,
}: {
  node: GraphNode;
  panelTitle: string;
  subjectColor: string;
  onClose: () => void;
  allNodes: GraphNode[];
}) {
  const statusColor = NODE_STATUS_COLOR(node.status, subjectColor);
  const statusLabel = {
    aligned:       "Aligned with expert model",
    gap:           "Gap — needs strengthening",
    misconception: "Misconception — structural error",
    unvisited:     "Not yet covered",
    unknown:       "No DKG match found",
  }[node.status];

  // Resolve prerequisite labels from allNodes
  const prereqNodes = (node.prerequisites || [])
    .map(id => allNodes.find(n => n.id === id))
    .filter(Boolean) as GraphNode[];

  return (
    <div
      className="absolute inset-y-0 right-0 z-20 flex flex-col"
      style={{
        width: 280,
        backgroundColor: "#0A0A14",
        borderLeft: `1px solid ${statusColor}30`,
        boxShadow: `-8px 0 32px ${statusColor}10`,
        animation: "slideInRight 0.2s ease",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 flex-shrink-0"
        style={{ borderBottom: `1px solid ${statusColor}20` }}>
        <div className="flex-1 min-w-0 mr-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: statusColor }} />
            <span className="text-xs tracking-widest uppercase"
              style={{ color: statusColor, fontFamily: "var(--font-dm-mono)" }}>
              {panelTitle}
            </span>
          </div>
          <h3 className="text-sm font-black leading-tight"
            style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)", wordBreak: "break-word" }}>
            {node.label}
          </h3>
        </div>
        <button onClick={onClose}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-xs"
          style={{ color: "#3A3A5C", border: "1px solid #1E1E36" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#FF3D57")}
          onMouseLeave={e => (e.currentTarget.style.color = "#3A3A5C")}>✕</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Status badge */}
        <div className="flex items-center gap-2 px-3 py-2"
          style={{ backgroundColor: `${statusColor}10`, border: `1px solid ${statusColor}25` }}>
          <span className="text-xs" style={{ color: statusColor, fontFamily: "var(--font-dm-mono)" }}>
            {statusLabel}
          </span>
        </div>

        {/* Tier */}
        {node.tier && (
          <div>
            <div className="text-xs tracking-widest uppercase mb-1.5"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Depth Level</div>
            <div className="flex items-center gap-2">
              <div className="px-2 py-0.5 text-xs"
                style={{
                  backgroundColor: "#16162A",
                  border: "1px solid #1E1E36",
                  color: "#6B6A80",
                  fontFamily: "var(--font-dm-mono)",
                }}>
                {TIER_NODE_LABEL[node.tier] ?? node.tier}
              </div>
            </div>
          </div>
        )}

        {/* Similarity score (SKG nodes) */}
        {node.similarity_score !== undefined && (
          <div>
            <div className="text-xs tracking-widest uppercase mb-1.5"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Match Score</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1" style={{ backgroundColor: "#1E1E36" }}>
                <div className="h-full transition-all"
                  style={{ width: `${Math.round(node.similarity_score * 100)}%`, backgroundColor: statusColor }} />
              </div>
              <span className="text-xs font-black"
                style={{ color: statusColor, fontFamily: "var(--font-dm-mono)" }}>
                {Math.round(node.similarity_score * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Description */}
        {node.description ? (
          <div>
            <div className="text-xs tracking-widest uppercase mb-1.5"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>About</div>
            <p className="text-xs leading-relaxed"
              style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)" }}>
              {node.description}
            </p>
          </div>
        ) : (
          <div>
            <div className="text-xs tracking-widest uppercase mb-1.5"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Concept</div>
            <p className="text-xs leading-relaxed italic"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-instrument)" }}>
              No description available in current DKG version.
            </p>
          </div>
        )}

        {/* Prerequisites */}
        {(node.prerequisites || []).length > 0 && (
          <div>
            <div className="text-xs tracking-widest uppercase mb-2"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
              Prerequisites ({node.prerequisites!.length})
            </div>
            <div className="flex flex-col gap-1.5">
              {node.prerequisites!.map(prereqId => {
                const prereq = prereqNodes.find(n => n.id === prereqId);
                const pColor = prereq ? NODE_STATUS_COLOR(prereq.status, subjectColor) : "#3A3A5C";
                return (
                  <div key={prereqId} className="flex items-center gap-2 px-2 py-1.5"
                    style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: pColor }} />
                    <span className="text-xs truncate"
                      style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                      {prereq?.label ?? prereqId}
                    </span>
                    {prereq && (
                      <span className="ml-auto text-xs flex-shrink-0"
                        style={{ color: pColor, fontFamily: "var(--font-dm-mono)" }}>
                        {prereq.status}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* DKG link */}
        {node.matched_dkg_id && (
          <div>
            <div className="text-xs tracking-widest uppercase mb-1.5"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Mapped To</div>
            <div className="px-2 py-1.5"
              style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
              <span className="text-xs"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                {node.matched_dkg_id}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// INTERACTIVE GRAPH PANEL
// ══════════════════════════════════════════════════════════════════
function GraphPanel({
  title,
  nodes,
  edges,
  subjectColor,
  animate,
  emptyLabel,
  onNodeClick,
  selectedNodeId,
}: {
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  subjectColor: string;
  animate: boolean;
  emptyLabel?: string;
  onNodeClick: (node: GraphNode) => void;
  selectedNodeId?: string | null;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

  const nodeColor = (n: GraphNode) => NODE_STATUS_COLOR(n.status, subjectColor);
  const edgeColor = (s: GraphEdge["status"]) =>
    s === "wrong" ? "#FF3D57" : `${subjectColor}50`;

  // viewBox auto-sizes to node spread
  const maxX = Math.max(...nodes.map(n => n.x), 300) + 60;
  const maxY = Math.max(...nodes.map(n => n.y), 200) + 60;

  return (
    <div className="flex flex-col h-full relative"
      style={{ border: "1px solid #1E1E36", backgroundColor: "#0A0A14" }}>
      <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid #1E1E36" }}>
        <span className="text-xs tracking-widest uppercase"
          style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{title}</span>
        <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
          {nodes.length} nodes
          {nodes.length > 0 && <span style={{ color: "#1E1E36" }}> · click to explore</span>}
        </span>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-center px-4 whitespace-pre-line"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)", lineHeight: 1.9 }}>
              {emptyLabel || "No data yet"}
            </span>
          </div>
        ) : (
          <svg
            width="100%" height="100%"
            viewBox={`0 0 ${maxX} ${maxY}`}
            style={{ cursor: "default" }}
          >
            <defs>
              <marker id={`arr-${title}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#2A2A44" />
              </marker>
            </defs>

            {/* Grid dots for depth */}
            <pattern id={`grid-${title}`} x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.5" fill="#1E1E36" />
            </pattern>
            <rect width="100%" height="100%" fill={`url(#grid-${title})`} />

            {/* Edges */}
            {edges.map((edge, i) => {
              const from = nodeMap[edge.from];
              const to   = nodeMap[edge.to];
              if (!from || !to) return null;
              const isHighlighted = hoveredId === edge.from || hoveredId === edge.to
                || selectedNodeId === edge.from || selectedNodeId === edge.to;
              return (
                <g key={`e-${i}`}>
                  <line
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={isHighlighted ? edgeColor(edge.status) : "#1E1E36"}
                    strokeWidth={edge.status === "wrong" ? 2 : 1.5}
                    strokeDasharray={edge.status === "missing" ? "4 4" : "none"}
                    markerEnd={`url(#arr-${title})`}
                    style={{
                      opacity: animate ? (isHighlighted ? 1 : 0.4) : 0,
                      transition: `opacity 0.3s ease ${i * 40}ms`,
                    }}
                  />
                  {/* Edge relation label on hover */}
                  {isHighlighted && edge.relation && (
                    <text
                      x={(from.x + to.x) / 2}
                      y={(from.y + to.y) / 2 - 5}
                      textAnchor="middle"
                      fill="#3A3A5C"
                      fontSize={6}
                      fontFamily="var(--font-dm-mono)"
                    >
                      {edge.relation}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((node, i) => {
              const color     = nodeColor(node);
              const isHovered = hoveredId === node.id;
              const isSelected = selectedNodeId === node.id;
              const r = node.status === "unvisited" ? 8 : 13;
              return (
                <g
                  key={node.id}
                  style={{
                    opacity:    animate ? 1 : 0,
                    transition: `opacity 0.3s ease ${i * 40}ms`,
                    cursor:     "pointer",
                  }}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onNodeClick(node)}
                >
                  {/* Selection glow ring */}
                  {isSelected && (
                    <circle cx={node.x} cy={node.y} r={r + 8}
                      fill="none" stroke={color} strokeWidth={1} opacity={0.25} />
                  )}
                  {/* Misconception pulse ring */}
                  {node.status === "misconception" && (
                    <circle cx={node.x} cy={node.y} r={r + 5}
                      fill="none" stroke="#FF3D57" strokeWidth={1} opacity={0.3}
                      style={{ animation: "nodePulse 1.5s ease-in-out infinite" }} />
                  )}
                  {/* Hover ring */}
                  {isHovered && !isSelected && (
                    <circle cx={node.x} cy={node.y} r={r + 5}
                      fill="none" stroke={color} strokeWidth={1} opacity={0.35} />
                  )}
                  {/* Main circle */}
                  <circle
                    cx={node.x} cy={node.y} r={isHovered || isSelected ? r + 2 : r}
                    fill={isSelected ? `${color}25` : `${color}12`}
                    stroke={color}
                    strokeWidth={isSelected ? 2 : node.status === "unvisited" ? 1 : 1.5}
                    strokeDasharray={node.status === "unvisited" ? "3 3" : "none"}
                    style={{ transition: "all 0.15s ease" }}
                  />
                  {/* Label */}
                  <text
                    x={node.x} y={node.y + r + 11}
                    textAnchor="middle"
                    fill={isHovered || isSelected ? color : "#3A3A5C"}
                    fontSize={7}
                    fontFamily="var(--font-dm-mono)"
                    style={{ transition: "fill 0.15s ease", userSelect: "none" }}
                  >
                    {node.label.length > 16 ? node.label.slice(0, 15) + "…" : node.label}
                  </text>
                  {/* Hover tooltip */}
                  {isHovered && !isSelected && (
                    <g>
                      <rect
                        x={node.x - 45} y={node.y - r - 28}
                        width={90} height={18}
                        rx={2} fill="#0F0F1A"
                        stroke={color} strokeWidth={0.5} strokeOpacity={0.5}
                      />
                      <text
                        x={node.x} y={node.y - r - 16}
                        textAnchor="middle"
                        fill={color} fontSize={7}
                        fontFamily="var(--font-dm-mono)"
                      >
                        {node.label.length > 18 ? node.label.slice(0, 17) + "…" : node.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ANALYSIS SUBCOMPONENTS
// ══════════════════════════════════════════════════════════════════
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
                <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{item.label}</span>
                <span className="text-xs font-black" style={{ color, fontFamily: "var(--font-dm-mono)" }}>{pct}%</span>
              </div>
              <div className="h-0.5 w-full" style={{ backgroundColor: "#1E1E36" }}>
                <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
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
// SIMULATE BUTTON — requests simulation from backend if not present
// ══════════════════════════════════════════════════════════════════
function SimulateButton({
  result,
  query,
  subject,
  uid,
  onSimData,
  onOpen,
}: {
  result: SessionResult | null;
  query: string;
  subject: string;
  uid: string;
  onSimData: (data: SimulationData) => void;
  onOpen: () => void;
}) {
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const hasSimData = !!result?.simulationData;

  const handleClick = useCallback(async () => {
    if (hasSimData) { onOpen(); return; }
    if (!result) return;
    setFetching(true); setFetchError(null);
    try {
      // Hit the same analyze endpoint — simulation is embedded in response
      // If the session already ran and returned simulatable=false, we re-request
      // via a lightweight /api/simulation/generate endpoint (Phase 2).
      // For now, use the main endpoint with a short query focused on simulation.
      const response = await fetch(`${API_BASE}/api/session/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${uid}` },
        body: JSON.stringify({ query, subject, userId: uid }),
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data: ApiResponse = await response.json();
      const simData = mapSimulationData(data.simulation, data.subject);
      if (simData) { onSimData(simData); onOpen(); }
      else setFetchError("This concept cannot be simulated yet.");
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Simulation unavailable");
    } finally { setFetching(false); }
  }, [hasSimData, result, query, subject, uid, onSimData, onOpen]);

  if (!result) return null;

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={fetching}
        className="w-full py-3 flex items-center justify-center gap-2 text-xs font-black tracking-widest transition-all disabled:opacity-50"
        style={{
          backgroundColor: hasSimData ? "#7B5CFF15" : "#16162A",
          color: "#7B5CFF",
          border: `1px solid ${hasSimData ? "#7B5CFF40" : "#1E1E36"}`,
          fontFamily: "var(--font-dm-mono)",
          cursor: "pointer",
          animation: hasSimData ? "simPulse 2.5s ease-in-out infinite" : "none",
        }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#7B5CFF25")}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = hasSimData ? "#7B5CFF15" : "#16162A")}
      >
        {fetching ? (
          <>
            <span style={{ animation: "pulse 1s infinite", display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: "#7B5CFF" }} />
            Generating simulation...
          </>
        ) : (
          <>
            ▶{" "}
            {hasSimData ? `VISUALISE · ${result.simulationData?.label}` : "SIMULATE THIS CONCEPT"}
          </>
        )}
      </button>
      {fetchError && (
        <p className="text-xs text-center" style={{ color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}>
          {fetchError}
        </p>
      )}
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

  const [query,         setQuery]         = useState(preQuery);
  const [subject,       setSubject]       = useState(preSubject);
  const [loading,       setLoading]       = useState(false);
  const [loadingStep,   setLoadingStep]   = useState("");
  const [result,        setResult]        = useState<SessionResult | null>(null);
  const [animateGraph,  setAnimateGraph]  = useState(false);
  const [streamedExp,   setStreamedExp]   = useState("");
  const [streaming,     setStreaming]     = useState(false);
  const [chatMessages,  setChatMessages]  = useState<ChatMessage[]>([]);
  const [chatLoading,   setChatLoading]   = useState(false);
  const [sessionTime,   setSessionTime]   = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [apiError,      setApiError]      = useState<string | null>(null);
  const [showSim,       setShowSim]       = useState(false);

  // Node detail drawer state
  const [selectedNode,      setSelectedNode]      = useState<GraphNode | null>(null);
  const [selectedNodePanel, setSelectedNodePanel] = useState<"SKG" | "DKG" | null>(null);

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

  // Close drawer on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedNode) { setSelectedNode(null); setSelectedNodePanel(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNode]);

  function formatTime(s: number) {
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  }

  const handleNodeClick = useCallback((node: GraphNode, panel: "SKG" | "DKG") => {
    if (selectedNode?.id === node.id && selectedNodePanel === panel) {
      setSelectedNode(null); setSelectedNodePanel(null);
    } else {
      setSelectedNode(node); setSelectedNodePanel(panel);
    }
  }, [selectedNode, selectedNodePanel]);

  // Inject extra simulation data from SimulateButton re-fetch
  const handleInjectSimData = useCallback((simData: SimulationData) => {
    setResult(prev => prev ? { ...prev, simulationData: simData } : prev);
  }, []);

  async function handleSubmit(q?: string) {
    const queryText = (q || query).trim();
    if (!queryText || loading) return;

    setLoading(true); setAnimateGraph(false);
    setStreamedExp(""); setStreaming(false);
    setResult(null); setApiError(null); setShowSim(false);
    setSelectedNode(null); setSelectedNodePanel(null);

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

  // All nodes for prerequisite resolution in drawer
  const allNodes = [...(result?.skgNodes || []), ...(result?.dkgNodes || [])];

  return (
    <div className="flex flex-col"
      style={{ height: "100vh", backgroundColor: "#08080F",
               background: stageBg !== "none" ? `${stageBg}, #08080F` : "#08080F",
               transition: "background 0.8s ease", color: "#F0F0FF", overflow: "hidden" }}>

      {/* WebGL2 Simulation Modal */}
      <SimulationModal
        data={result?.simulationData ?? null}
        isOpen={showSim}
        onClose={() => setShowSim(false)}
      />

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
          {/* Top bar SIMULATE button */}
          {result && (
            <button
              onClick={() => result.simulationData ? setShowSim(true) : undefined}
              disabled={!result.simulationData}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-black tracking-widest disabled:opacity-30"
              style={{
                backgroundColor: result.simulationData ? "#7B5CFF20" : "#16162A",
                color: "#7B5CFF",
                border: `1px solid ${result.simulationData ? "#7B5CFF50" : "#1E1E36"}`,
                fontFamily: "var(--font-dm-mono)",
                animation: result.simulationData ? "simPulse 2s ease-in-out infinite" : "none",
                cursor: result.simulationData ? "pointer" : "default",
              }}
              onMouseEnter={e => { if (result.simulationData) e.currentTarget.style.backgroundColor = "#7B5CFF40"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = result.simulationData ? "#7B5CFF20" : "#16162A"; }}
            >
              ▶ SIMULATE
              {result.simulationData && (
                <span style={{ color: "#7B5CFF80", fontWeight: 400 }}>
                  {result.simulationData.label}
                </span>
              )}
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

            {/* SKG */}
            <div className="flex flex-col gap-2 min-h-0">
              <span className="text-xs text-center flex-shrink-0"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Your understanding</span>
              <div className="flex-1 min-h-0 relative">
                <GraphPanel
                  title="SKG"
                  nodes={result?.skgNodes || []}
                  edges={result?.skgEdges || []}
                  subjectColor={subjectColor}
                  animate={animateGraph}
                  emptyLabel={"Submit a query to\nmap your understanding"}
                  onNodeClick={node => handleNodeClick(node, "SKG")}
                  selectedNodeId={selectedNodePanel === "SKG" ? selectedNode?.id : null}
                />
                {/* Node drawer — anchored inside SKG panel */}
                {selectedNode && selectedNodePanel === "SKG" && (
                  <NodeDetailDrawer
                    node={selectedNode}
                    panelTitle="Your Concept"
                    subjectColor={subjectColor}
                    onClose={() => { setSelectedNode(null); setSelectedNodePanel(null); }}
                    allNodes={allNodes}
                  />
                )}
              </div>
            </div>

            {/* DKG */}
            <div className="flex flex-col gap-2 min-h-0">
              <span className="text-xs text-center flex-shrink-0"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Expert model</span>
              <div className="flex-1 min-h-0 relative">
                <GraphPanel
                  title="DKG"
                  nodes={result?.dkgNodes || []}
                  edges={result?.dkgEdges || []}
                  subjectColor={subjectColor}
                  animate={animateGraph}
                  emptyLabel={"DKG loads after\nyour first query"}
                  onNodeClick={node => handleNodeClick(node, "DKG")}
                  selectedNodeId={selectedNodePanel === "DKG" ? selectedNode?.id : null}
                />
                {selectedNode && selectedNodePanel === "DKG" && (
                  <NodeDetailDrawer
                    node={selectedNode}
                    panelTitle="Expert Concept"
                    subjectColor={subjectColor}
                    onClose={() => { setSelectedNode(null); setSelectedNodePanel(null); }}
                    allNodes={allNodes}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Legend */}
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
              <span className="text-xs ml-2" style={{ color: "#1E1E36", fontFamily: "var(--font-dm-mono)" }}>
                · click any node to explore
              </span>
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

            {/* Simulate CTA — connected to backend */}
            <SimulateButton
              result={result}
              query={query}
              subject={subject}
              uid={user?.uid || "dev"}
              onSimData={handleInjectSimData}
              onOpen={() => setShowSim(true)}
            />

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
        @keyframes pulse       { 0%,100%{opacity:1}   50%{opacity:0.3} }
        @keyframes blink       { 0%,100%{opacity:1}   50%{opacity:0}   }
        @keyframes nodePulse   { 0%,100%{opacity:0.3} 50%{opacity:0.8} }
        @keyframes simPulse    { 0%,100%{box-shadow:0 0 0px #7B5CFF00} 50%{box-shadow:0 0 14px #7B5CFF40} }
        @keyframes slideInRight{ from{transform:translateX(20px);opacity:0} to{transform:translateX(0);opacity:1} }
      `}</style>
    </div>
  );
}