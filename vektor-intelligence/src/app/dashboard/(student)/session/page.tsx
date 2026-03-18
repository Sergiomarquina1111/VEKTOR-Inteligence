"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/authstore";

// ── Types ──────────────────────────────────────────────────────────
type Tier = "T1" | "T2" | "T3" | "T4" | null;

interface GraphNode {
  id:     string;
  label:  string;
  x:      number;
  y:      number;
  status: "aligned" | "gap" | "misconception" | "unknown" | "shared";
}

interface GraphEdge {
  from:   string;
  to:     string;
  status: "correct" | "wrong" | "missing";
}

interface SessionResult {
  tier:           Tier;
  subject:        string;
  skgNodes:       GraphNode[];
  dkgNodes:       GraphNode[];
  edges:          GraphEdge[];
  explanation:    string;
  gaps:           string[];
  misconceptions: string[];
  aligned:        number;
}

interface ChatMessage {
  role:      "user" | "ai";
  content:   string;
  streaming?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────
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
  T1: { color: "#C8FF00", label: "Aligned",       bg: "#C8FF0010", desc: "Your understanding matches the expert model."                           },
  T2: { color: "#FFB800", label: "Gap",            bg: "#FFB80010", desc: "You understand the surface but are missing key connections."             },
  T3: { color: "#FF3D57", label: "Misconception",  bg: "#FF3D5710", desc: "Your mental model has a structural error blocking downstream concepts."  },
  T4: { color: "#7B5CFF", label: "Unknown",        bg: "#7B5CFF10", desc: "VEKTOR has no data on this concept yet."                                },
};

const STAGE_BG: Record<string, string> = {
  T1:   "radial-gradient(ellipse at 50% 100%, #C8FF0008 0%, #08080F 60%)",
  T2:   "radial-gradient(ellipse at 50% 100%, #FFB80008 0%, #08080F 60%)",
  T3:   "radial-gradient(ellipse at 50% 100%, #FF3D5712 0%, #08080F 60%)",
  T4:   "radial-gradient(ellipse at 50% 100%, #7B5CFF10 0%, #08080F 60%)",
  none: "none",
};

// ── Mock data builder ──────────────────────────────────────────────
function buildMockResult(subject: string): SessionResult {
  const tiers: Tier[] = ["T1", "T2", "T3", "T2"];
  const tier = tiers[Math.floor(Math.random() * tiers.length)];

  const skgNodes: GraphNode[] = [
    { id: "n1", label: "Eigenvalues",         x: 120, y: 80,  status: "aligned"       },
    { id: "n2", label: "Eigenvectors",        x: 280, y: 80,  status: "aligned"       },
    { id: "n3", label: "Matrix Transform",    x: 200, y: 200, status: tier === "T3" ? "misconception" : "aligned" },
    { id: "n4", label: "Linear Independence", x: 80,  y: 280, status: "gap"           },
  ];
  const dkgNodes: GraphNode[] = [
    { id: "n1", label: "Eigenvalues",         x: 120, y: 80,  status: "shared"  },
    { id: "n2", label: "Eigenvectors",        x: 280, y: 80,  status: "shared"  },
    { id: "n3", label: "Matrix Transform",    x: 200, y: 200, status: "shared"  },
    { id: "n4", label: "Linear Independence", x: 80,  y: 280, status: "gap"     },
    { id: "n5", label: "Diagonalization",     x: 320, y: 200, status: "unknown" },
    { id: "n6", label: "Spectral Theorem",    x: 200, y: 320, status: "unknown" },
  ];
  const edges: GraphEdge[] = [
    { from: "n1", to: "n3", status: "correct" },
    { from: "n2", to: "n3", status: "correct" },
    { from: "n3", to: "n5", status: "missing" },
    { from: "n4", to: "n2", status: "correct" },
    { from: "n1", to: "n6", status: "missing" },
  ];

  const explanations: Record<string, string> = {
    T1: "Your understanding of this concept aligns well with the expert model. The connections you have drawn between eigenvalues and matrix transformations are structurally correct.",
    T2: "You understand eigenvalues at a surface level but are missing the connection to diagonalization. This gap means you can solve basic eigenvalue problems but will struggle with advanced applications like the Spectral Theorem.",
    T3: "Your mental model contains a structural error: you are treating matrix transformation as a property of eigenvalues rather than as the operation that eigenvalues characterize. This misconception will block your understanding of diagonalization and spectral decomposition.",
    T4: "VEKTOR does not have enough data from this session to classify your understanding. Ask a more specific question about the concept.",
  };

  return {
    tier,
    subject,
    skgNodes,
    dkgNodes,
    edges,
    explanation:   explanations[tier || "T2"],
    gaps:          ["Diagonalization", "Spectral Theorem", "Jordan Normal Form"],
    misconceptions: tier === "T3" ? ["Matrix Transform directionality"] : [],
    aligned:        tier === "T1" ? 4 : tier === "T2" ? 2 : 1,
  };
}

// ── Graph Panel (SVG — WebGL2 in Phase 2) ─────────────────────────
function GraphPanel({
  title, nodes, edges, subjectColor, animate,
}: {
  title:        string;
  nodes:        GraphNode[];
  edges:        GraphEdge[];
  subjectColor: string;
  animate:      boolean;
}) {
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

  const nodeColor = (s: GraphNode["status"]) => {
    switch (s) {
      case "aligned":       return subjectColor;
      case "shared":        return "#F0F0FF";
      case "gap":           return "#FFB800";
      case "misconception": return "#FF3D57";
      case "unknown":       return "#3A3A5C";
    }
  };
  const edgeColor = (s: GraphEdge["status"]) => {
    switch (s) {
      case "correct": return `${subjectColor}80`;
      case "wrong":   return "#FF3D57";
      case "missing": return "#FF6B6B40";
    }
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid #1E1E36" }}
      >
        <span
          className="text-xs tracking-widest uppercase"
          style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
        >{title}</span>
        <span
          className="text-xs"
          style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
        >{nodes.length} nodes</span>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-xs text-center px-4"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)", lineHeight: 1.8 }}
            >Submit a query to<br />map your understanding</span>
          </div>
        ) : (
          <svg width="100%" height="100%" viewBox="0 0 400 400" className="absolute inset-0">
            {edges.map((edge, i) => {
              const from = nodeMap[edge.from];
              const to   = nodeMap[edge.to];
              if (!from || !to) return null;
              return (
                <line
                  key={i}
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={edgeColor(edge.status)}
                  strokeWidth={edge.status === "missing" ? 1 : 1.5}
                  strokeDasharray={edge.status === "missing" ? "4 4" : "none"}
                  style={{ opacity: animate ? 1 : 0, transition: `opacity 0.4s ease ${i * 80}ms` }}
                />
              );
            })}
            {nodes.map((node, i) => (
              <g
                key={node.id}
                style={{ opacity: animate ? 1 : 0, transition: `opacity 0.3s ease ${i * 60}ms` }}
              >
                {node.status === "misconception" && (
                  <circle cx={node.x} cy={node.y} r={18}
                    fill="none" stroke="#FF3D57" strokeWidth={1} opacity={0.4}
                    style={{ animation: "nodePulse 1.5s ease-in-out infinite" }}
                  />
                )}
                <circle
                  cx={node.x} cy={node.y} r={12}
                  fill={`${nodeColor(node.status)}18`}
                  stroke={nodeColor(node.status)}
                  strokeWidth={1.5}
                />
                <text
                  x={node.x} y={node.y + 26}
                  textAnchor="middle"
                  fill={nodeColor(node.status)}
                  fontSize={8}
                  fontFamily="var(--font-dm-mono)"
                >{node.label}</text>
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

// ── Tier Badge ─────────────────────────────────────────────────────
function TierBadge({ tier }: { tier: Tier }) {
  if (!tier) return null;
  const cfg = TIER_CONFIG[tier];
  return (
    <div
      className="flex items-start gap-3 p-4"
      style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.color}30` }}
    >
      <div
        className="px-2 py-1 text-xs font-black flex-shrink-0"
        style={{
          backgroundColor: `${cfg.color}20`, color: cfg.color,
          fontFamily: "var(--font-dm-mono)", border: `1px solid ${cfg.color}50`,
        }}
      >{tier}</div>
      <div>
        <div className="text-xs font-black mb-1" style={{ color: cfg.color, fontFamily: "var(--font-syne)" }}>{cfg.label}</div>
        <div className="text-xs leading-relaxed" style={{ color: "#6B6A80" }}>{cfg.desc}</div>
      </div>
    </div>
  );
}

// ── AI Explanation Panel ───────────────────────────────────────────
function AIExplanationPanel({ explanation, streaming }: { explanation: string; streaming: boolean }) {
  const [expanded, setExpanded] = useState(true);
  if (!explanation) return null;
  return (
    <div style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ borderBottom: expanded ? "1px solid #1E1E36" : "none" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: "#7B5CFF", animation: streaming ? "pulse 1s infinite" : "none" }}
          />
          <span className="text-xs tracking-widest uppercase" style={{ color: "#7B5CFF", fontFamily: "var(--font-dm-mono)" }}>AI Analysis</span>
        </div>
        <span style={{ color: "#3A3A5C", fontSize: 10 }}>{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-4 py-3">
          <p className="text-xs leading-relaxed" style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)" }}>
            {explanation}
            {streaming && (
              <span
                className="inline-block w-0.5 h-3 ml-0.5 align-middle"
                style={{ backgroundColor: "#7B5CFF", animation: "blink 0.8s infinite" }}
              />
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Knowledge Gap Card ─────────────────────────────────────────────
function KnowledgeGapCard({ gaps, misconceptions }: { gaps: string[]; misconceptions: string[] }) {
  if (!gaps.length && !misconceptions.length) return null;
  return (
    <div style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid #1E1E36" }}>
        <span className="text-xs tracking-widest uppercase" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Knowledge Gaps</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {misconceptions.map(m => (
          <div key={m} className="flex items-center gap-2">
            <span style={{ color: "#FF3D57", fontSize: 10, fontFamily: "var(--font-dm-mono)" }}>T3</span>
            <span className="text-xs flex-1" style={{ color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}>{m}</span>
            <span className="text-xs" style={{ color: "#3A3A5C" }}>→ Fix first</span>
          </div>
        ))}
        {gaps.map(g => (
          <div key={g} className="flex items-center gap-2">
            <span style={{ color: "#FFB800", fontSize: 10, fontFamily: "var(--font-dm-mono)" }}>T2</span>
            <span className="text-xs flex-1" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{g}</span>
            <span className="text-xs" style={{ color: "#3A3A5C" }}>→ Explore</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tutor Chat ─────────────────────────────────────────────────────
function TutorChat({ messages, onSend, isPro, disabled }: {
  messages:  ChatMessage[];
  onSend:    (msg: string) => void;
  isPro:     boolean;
  disabled:  boolean;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  return (
    <div className="flex flex-col" style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A", minHeight: 180 }}>
      <div className="px-4 py-3 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: "1px solid #1E1E36" }}>
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#7B5CFF" }} />
        <span className="text-xs tracking-widest uppercase" style={{ color: "#7B5CFF", fontFamily: "var(--font-dm-mono)" }}>AI Tutor</span>
        {!isPro && (
          <span className="ml-auto text-xs px-2 py-0.5" style={{ color: "#FFB800", border: "1px solid #FFB80030", backgroundColor: "#FFB80010", fontFamily: "var(--font-dm-mono)" }}>PRO</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-h-48">
        {messages.length === 0 && (
          <p className="text-xs text-center py-3" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
            Ask a follow-up about your session
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] px-3 py-2 text-xs leading-relaxed"
              style={{
                backgroundColor: msg.role === "user" ? "#7B5CFF20" : "#1E1E36",
                color: "#F0F0FF",
                border: `1px solid ${msg.role === "user" ? "#7B5CFF40" : "#1E1E36"}`,
                fontFamily: "var(--font-instrument)",
              }}
            >
              {msg.content}
              {msg.streaming && (
                <span className="inline-block w-0.5 h-3 ml-0.5 align-middle" style={{ backgroundColor: "#7B5CFF", animation: "blink 0.8s infinite" }} />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 px-4 py-3 flex-shrink-0" style={{ borderTop: "1px solid #1E1E36" }}>
        {isPro ? (
          <>
            <input
              type="text" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && input.trim() && !disabled) { onSend(input.trim()); setInput(""); } }}
              placeholder="Ask a follow-up..."
              disabled={disabled}
              className="flex-1 bg-transparent outline-none text-xs"
              style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)" }}
            />
            <button
              onClick={() => { if (input.trim() && !disabled) { onSend(input.trim()); setInput(""); } }}
              disabled={disabled || !input.trim()}
              className="text-xs px-3 py-1.5 disabled:opacity-30"
              style={{ backgroundColor: "#7B5CFF", color: "#F0F0FF", fontFamily: "var(--font-dm-mono)" }}
            >→</button>
          </>
        ) : (
          <Link
            href="/settings"
            className="w-full text-center text-xs py-2"
            style={{ backgroundColor: "#FFB80015", color: "#FFB800", border: "1px solid #FFB80030", fontFamily: "var(--font-dm-mono)" }}
          >Upgrade to Pro to unlock AI Tutor →</Link>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function SessionPage() {
  const { user }       = useAuthStore();
  const searchParams   = useSearchParams();

  const preQuery   = searchParams.get("q") || searchParams.get("concept") || "";
  const preSubject = searchParams.get("subject") || user?.subjects?.[0] || "mathematics";

  const [query,        setQuery]        = useState(preQuery);
  const [subject,      setSubject]      = useState(preSubject);
  const [loading,      setLoading]      = useState(false);
  const [loadingStep,  setLoadingStep]  = useState("");
  const [result,       setResult]       = useState<SessionResult | null>(null);
  const [animateGraph, setAnimateGraph] = useState(false);
  const [streamedExp,  setStreamedExp]  = useState("");
  const [streaming,    setStreaming]    = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading,  setChatLoading]  = useState(false);
  const [sessionTime,  setSessionTime]  = useState(0);
  const [sessionActive,setSessionActive]= useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-submit if query pre-filled from URL
  useEffect(() => {
    if (preQuery) handleSubmit(preQuery);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Session timer
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

    setLoading(true);
    setAnimateGraph(false);
    setStreamedExp("");
    setStreaming(false);
    setResult(null);
    if (!sessionActive) setSessionActive(true);

    const steps = [
      "Extracting knowledge structure...",
      "Mapping your understanding...",
      "Comparing against expert model...",
      "Computing tier classification...",
    ];
    for (const step of steps) {
      setLoadingStep(step);
      await new Promise(r => setTimeout(r, 550));
    }

    const mockResult = buildMockResult(subject);
    setResult(mockResult);
    setLoading(false);
    setLoadingStep("");
    setTimeout(() => setAnimateGraph(true), 100);

    // Stream explanation for T2/T3/T4
    if (mockResult.tier !== "T1") {
      setStreaming(true);
      let streamed = "";
      for (const char of mockResult.explanation) {
        streamed += char;
        setStreamedExp(streamed);
        await new Promise(r => setTimeout(r, 16));
      }
      setStreaming(false);
    } else {
      setStreamedExp(mockResult.explanation);
    }
  }

  async function handleTutorSend(message: string) {
    setChatMessages(prev => [...prev, { role: "user", content: message }]);
    setChatLoading(true);
    await new Promise(r => setTimeout(r, 700));

    const responses = [
      "What do you think the relationship is between eigenvalues and the concept you mentioned? Try to describe it in your own words first.",
      "That is an interesting approach. Before I respond — what would happen to the transformation if the eigenvalue were zero?",
      "You are close. Consider: if a vector only gets scaled (not rotated) under a transformation, what does that tell you about its direction?",
    ];
    const response = responses[chatMessages.length % responses.length];

    setChatMessages(prev => [...prev, { role: "ai", content: "", streaming: true }]);
    let streamed = "";
    for (const char of response) {
      streamed += char;
      setChatMessages(prev => [...prev.slice(0, -1), { role: "ai", content: streamed, streaming: true }]);
      await new Promise(r => setTimeout(r, 18));
    }
    setChatMessages(prev => [...prev.slice(0, -1), { role: "ai", content: streamed, streaming: false }]);
    setChatLoading(false);
  }

  const subjectColor = SUBJECT_COLORS[subject] || "#C8FF00";
  const tier         = result?.tier || null;
  const stageBg      = STAGE_BG[tier || "none"];
  const isPro        = user?.plan === "pro";

  return (
    <div
      className="flex flex-col"
      style={{
        height: "100vh",
        backgroundColor: "#08080F",
        background: stageBg !== "none" ? `${stageBg}, #08080F` : "#08080F",
        transition: "background 0.8s ease",
        color: "#F0F0FF",
        overflow: "hidden",
      }}
    >
      {/* ══ TOP BAR ══ */}
      <header
        className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid #1E1E36", backgroundColor: "#08080F" }}
      >
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="text-xs transition-colors"
            style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#C8FF00")}
            onMouseLeave={e => (e.currentTarget.style.color = "#3A3A5C")}
          >Dashboard</Link>
          <span style={{ color: "#3A3A5C", fontSize: 10 }}>›</span>
          <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Session</span>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="px-3 py-1 text-xs"
            style={{ backgroundColor: `${subjectColor}15`, border: `1px solid ${subjectColor}40`, color: subjectColor, fontFamily: "var(--font-dm-mono)" }}
          >{SUBJECT_LABELS[subject]}</div>
          {tier && (
            <div
              className="px-2 py-1 text-xs font-black"
              style={{ backgroundColor: `${TIER_CONFIG[tier].color}15`, border: `1px solid ${TIER_CONFIG[tier].color}40`, color: TIER_CONFIG[tier].color, fontFamily: "var(--font-dm-mono)" }}
            >{tier} · {TIER_CONFIG[tier].label}</div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {sessionActive && (
            <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
              {formatTime(sessionTime)}
            </span>
          )}
          <Link
            href="/dashboard"
            className="px-3 py-1.5 text-xs transition-all"
            style={{ border: "1px solid #1E1E36", color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#FF3D5750")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}
          >End Session</Link>
        </div>
      </header>

      {/* ══ MAIN AREA ══ */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT — Graph canvas 60% */}
        <div
          className="flex flex-col flex-1 min-w-0 p-4 gap-3"
          style={{ borderRight: "1px solid #1E1E36" }}
        >
          {/* Graph panels */}
          <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
            <div className="flex flex-col gap-2 min-h-0">
              <span className="text-xs text-center flex-shrink-0" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Your understanding</span>
              <div className="flex-1 min-h-0">
                <GraphPanel
                  title="SKG"
                  nodes={result?.skgNodes || []}
                  edges={result?.edges.filter(e => e.status !== "missing") || []}
                  subjectColor={subjectColor}
                  animate={animateGraph}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 min-h-0">
              <span className="text-xs text-center flex-shrink-0" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Expert model</span>
              <div className="flex-1 min-h-0">
                <GraphPanel
                  title="DKG"
                  nodes={result?.dkgNodes || []}
                  edges={result?.edges || []}
                  subjectColor={subjectColor}
                  animate={animateGraph}
                />
              </div>
            </div>
          </div>

          {/* Legend */}
          {result && (
            <div className="flex flex-wrap gap-4 flex-shrink-0">
              {[
                { color: subjectColor, label: "Aligned"      },
                { color: "#FFB800",    label: "Gap"          },
                { color: "#FF3D57",    label: "Misconception"},
                { color: "#3A3A5C",    label: "Unknown"      },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{l.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <div className="w-5" style={{ borderTop: "1px dashed #FF6B6B60" }} />
                <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Missing edge</span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Analysis panel ~320px */}
        <div
          className="flex-shrink-0 overflow-y-auto"
          style={{ width: 320 }}
        >
          <div className="flex flex-col gap-3 p-4">
            <TierBadge tier={tier} />

            {result && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: result.aligned,              label: "Aligned",  color: "#C8FF00" },
                  { val: result.gaps.length,           label: "Gaps",     color: "#FFB800" },
                  { val: result.misconceptions.length, label: "T3 flags", color: "#FF3D57" },
                ].map(s => (
                  <div key={s.label} className="flex flex-col items-center py-3" style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
                    <span className="text-xl font-black leading-none" style={{ fontFamily: "var(--font-syne)", color: s.color }}>{s.val}</span>
                    <span className="text-xs mt-1" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{s.label}</span>
                  </div>
                ))}
              </div>
            )}

            <AIExplanationPanel explanation={streamedExp} streaming={streaming} />

            {result && <KnowledgeGapCard gaps={result.gaps} misconceptions={result.misconceptions} />}

            <TutorChat
              messages={chatMessages}
              onSend={handleTutorSend}
              isPro={isPro}
              disabled={chatLoading || loading}
            />
          </div>
        </div>
      </div>

      {/* ══ BOTTOM BAR — Query Input ══ */}
      <div
        className="flex-shrink-0 px-4 py-4"
        style={{ borderTop: "1px solid #1E1E36", backgroundColor: "#08080F" }}
      >
        {loading && (
          <div className="text-xs mb-3 flex items-center gap-2" style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#C8FF00", animation: "pulse 1s infinite" }} />
            {loadingStep}
          </div>
        )}
        <div className="flex gap-3">
          <select
            value={subject}
            onChange={e => setSubject(e.target.value)}
            disabled={loading}
            className="text-xs outline-none px-3 flex-shrink-0 disabled:opacity-50"
            style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36", color: "#6B6A80", fontFamily: "var(--font-dm-mono)", width: 148, height: 48 }}
          >
            {SUBJECTS.map(s => (
              <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>
            ))}
          </select>

          <div
            className="flex-1 flex items-center gap-3 px-4"
            style={{ backgroundColor: "#0F0F1A", border: `1px solid ${loading ? "#C8FF0040" : "#1E1E36"}`, transition: "border-color 0.2s" }}
          >
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="Ask a STEM question — VEKTOR will map your understanding..."
              disabled={loading}
              className="flex-1 bg-transparent outline-none text-sm py-3"
              style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)" }}
            />
            <button
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center"
              style={{ border: "1px solid #1E1E36", backgroundColor: "#16162A", color: "#3A3A5C" }}
              title="Voice input — Phase 2"
            >🎙</button>
          </div>

          <button
            onClick={() => handleSubmit()}
            disabled={loading || !query.trim()}
            className="px-6 text-sm font-black tracking-widest transition-all disabled:opacity-30 flex-shrink-0"
            style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.backgroundColor = "#DAFF33"; }}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#C8FF00")}
          >
            {loading ? "..." : "ASK →"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0}   }
        @keyframes nodePulse{ 0%,100%{opacity:0.4} 50%{opacity:0.9} }
      `}</style>
    </div>
  );
}