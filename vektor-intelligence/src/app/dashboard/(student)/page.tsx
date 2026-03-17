"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/authstore";

// ── Static data — will be replaced with Firestore in Session 4 ──
const SUBJECT_COLORS: Record<string, string> = {
  mathematics:      "#1A4D9F",
  physics:          "#5B3FCC",
  chemistry:        "#006677",
  biology:          "#3A6B00",
  computer_science: "#7A5200",
};
const SUBJECT_SYMBOLS: Record<string, string> = {
  mathematics:      "∫",
  physics:          "∇",
  chemistry:        "⇌",
  biology:          "∂",
  computer_science: "λ",
};
const SUBJECT_LABELS: Record<string, string> = {
  mathematics:      "Mathematics",
  physics:          "Physics",
  chemistry:        "Chemistry",
  biology:          "Biology",
  computer_science: "Computer Science",
};

const TIER_COLORS: Record<string, string> = {
  T1: "#C8FF00",
  T2: "#00E5FF",
  T3: "#7B5CFF",
  T4: "#FF3D57",
};
const TIER_LABELS: Record<string, string> = {
  T1: "Aligned",
  T2: "Gap",
  T3: "Misconception",
  T4: "Unknown",
};

// Mock recent sessions — replace with Firestore in Session 4
const MOCK_SESSIONS = [
  {
    id: "s1",
    subject: "mathematics",
    query: "What is the relationship between eigenvalues and matrix transformations?",
    tier: "T3",
    conceptsAligned: 4,
    gapsFound: 2,
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "s2",
    subject: "physics",
    query: "Explain how quantum entanglement works and its implications",
    tier: "T2",
    conceptsAligned: 6,
    gapsFound: 3,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: "s3",
    subject: "computer_science",
    query: "How does gradient descent actually find the minimum?",
    tier: "T1",
    conceptsAligned: 8,
    gapsFound: 1,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
];

// Mock adaptive path — replace with FastAPI in Session 4
const MOCK_ADAPTIVE_PATH = [
  {
    id: "ap1",
    subject: "mathematics",
    conceptName: "Jordan Normal Form",
    reason: "You have a T3 misconception on eigenvalues that blocks this topic",
    blockedBy: "Eigenvalue decomposition",
    priority: "high" as const,
  },
  {
    id: "ap2",
    subject: "physics",
    conceptName: "Bell's Theorem",
    reason: "T2 gap in quantum entanglement foundations detected in your last session",
    priority: "medium" as const,
  },
  {
    id: "ap3",
    subject: "computer_science",
    conceptName: "Backpropagation through time",
    reason: "Natural next step after your aligned session on gradient descent",
    priority: "low" as const,
  },
];

// Mock DKG progress — replace with Firestore in Session 4
const MOCK_DKG_PROGRESS = [
  { subject: "mathematics",      total: 847, encountered: 124, aligned: 89,  gaps: 28,  misconceptions: 7  },
  { subject: "physics",          total: 763, encountered: 67,  aligned: 48,  gaps: 14,  misconceptions: 5  },
  { subject: "computer_science", total: 731, encountered: 203, aligned: 178, gaps: 19,  misconceptions: 6  },
];

// ── Helpers ──────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0)  return `${d}d ago`;
  if (h > 0)  return `${h}h ago`;
  if (m > 0)  return `${m}m ago`;
  return "just now";
}

function truncate(str: string, n: number) {
  return str.length > n ? str.slice(0, n) + "..." : str;
}

// ── DKG Progress Ring ────────────────────────────────────────────
function DKGRing({
  subject, total, encountered, aligned, gaps, misconceptions,
}: {
  subject: string; total: number; encountered: number;
  aligned: number; gaps: number; misconceptions: number;
}) {
  const color    = SUBJECT_COLORS[subject]  || "#6B6A80";
  const symbol   = SUBJECT_SYMBOLS[subject] || "○";
  const label    = SUBJECT_LABELS[subject]  || subject;
  const pct      = Math.round((encountered / total) * 100);
  const alignPct = Math.round((aligned / total) * 100);

  // SVG ring params
  const R   = 32;
  const C   = 2 * Math.PI * R;
  const enc = (encountered / total) * C;
  const ali = (aligned / total) * C;

  return (
    <div
      className="flex flex-col items-center gap-3 p-4 transition-all duration-200 cursor-default"
      style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}50`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}
    >
      {/* Ring */}
      <div className="relative flex items-center justify-center">
        <svg width="80" height="80" viewBox="0 0 80 80">
          {/* Background track */}
          <circle
            cx="40" cy="40" r={R}
            fill="none"
            stroke="#1E1E36"
            strokeWidth="6"
          />
          {/* Encountered arc */}
          <circle
            cx="40" cy="40" r={R}
            fill="none"
            stroke={`${color}40`}
            strokeWidth="6"
            strokeDasharray={`${enc} ${C - enc}`}
            strokeDashoffset={C / 4}
            strokeLinecap="butt"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
          {/* Aligned arc */}
          <circle
            cx="40" cy="40" r={R}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={`${ali} ${C - ali}`}
            strokeDashoffset={C / 4}
            strokeLinecap="butt"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        {/* Center symbol */}
        <div className="absolute flex flex-col items-center">
          <span
            className="font-mono font-black text-lg leading-none"
            style={{ color, fontFamily: "var(--font-dm-mono)" }}
          >{symbol}</span>
          <span
            className="text-xs font-black leading-none mt-0.5"
            style={{ color: "#F0F0FF", fontFamily: "var(--font-dm-mono)" }}
          >{pct}%</span>
        </div>
      </div>

      {/* Label */}
      <div className="text-center">
        <div
          className="text-xs font-black mb-1"
          style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
        >{label}</div>
        <div
          className="text-xs"
          style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
        >{encountered} / {total}</div>
      </div>

      {/* Mini stats */}
      <div className="flex gap-2 w-full">
        {[
          { label: "T1", val: aligned,       color: "#C8FF00" },
          { label: "T2", val: gaps,          color: "#00E5FF" },
          { label: "T3", val: misconceptions,color: "#7B5CFF" },
        ].map(s => (
          <div
            key={s.label}
            className="flex-1 flex flex-col items-center py-1"
            style={{ border: `1px solid ${s.color}20`, backgroundColor: `${s.color}08` }}
          >
            <span
              className="text-xs font-black leading-none"
              style={{ color: s.color, fontFamily: "var(--font-dm-mono)" }}
            >{s.val}</span>
            <span
              className="leading-none mt-0.5"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)", fontSize: "9px" }}
            >{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Adaptive Path Card ───────────────────────────────────────────
function PathCard({
  item,
}: {
  item: typeof MOCK_ADAPTIVE_PATH[0];
}) {
  const color   = SUBJECT_COLORS[item.subject]  || "#6B6A80";
  const symbol  = SUBJECT_SYMBOLS[item.subject] || "○";
  const subject = SUBJECT_LABELS[item.subject]  || item.subject;

  const priorityColor =
    item.priority === "high"   ? "#FF3D57" :
    item.priority === "medium" ? "#FFB800" : "#C8FF00";

  return (
    <div
      className="p-4 transition-all duration-200 flex flex-col gap-3"
      style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}50`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center text-xs font-mono flex-shrink-0"
            style={{
              width: 24, height: 24,
              border: `1px solid ${color}40`,
              backgroundColor: `${color}10`,
              color,
              fontFamily: "var(--font-dm-mono)",
            }}
          >{symbol}</div>
          <span
            className="text-xs capitalize"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
          >{subject}</span>
        </div>
        <div
          className="px-2 py-0.5 text-xs font-black"
          style={{
            backgroundColor: `${priorityColor}15`,
            color: priorityColor,
            fontFamily: "var(--font-dm-mono)",
            fontSize: "10px",
          }}
        >{item.priority.toUpperCase()}</div>
      </div>

      {/* Concept name */}
      <div>
        <div
          className="text-sm font-black mb-1"
          style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
        >{item.conceptName}</div>
        <div
          className="text-xs leading-relaxed"
          style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)" }}
        >{item.reason}</div>
      </div>

      {/* Blocked by */}
      {item.blockedBy && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-xs"
          style={{ border: "1px solid #7B5CFF30", backgroundColor: "#7B5CFF08" }}
        >
          <span style={{ color: "#7B5CFF" }}>T3</span>
          <span style={{ color: "#6B6A80" }}>blocked by</span>
          <span style={{ color: "#F0F0FF" }}>{item.blockedBy}</span>
        </div>
      )}

      {/* CTA */}
      <Link
        href={`/dashboard/session?concept=${encodeURIComponent(item.conceptName)}&subject=${item.subject}`}
        className="flex items-center justify-between px-3 py-2.5 text-xs font-black transition-all duration-150"
        style={{
          backgroundColor: `${color}15`,
          border: `1px solid ${color}30`,
          color,
          fontFamily: "var(--font-syne)",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = `${color}25`;
          e.currentTarget.style.borderColor     = `${color}60`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = `${color}15`;
          e.currentTarget.style.borderColor     = `${color}30`;
        }}
      >
        <span>START SESSION</span>
        <span>→</span>
      </Link>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuthStore();
  const [query,   setQuery]   = useState("");
  const [focused, setFocused] = useState(false);

  // Filter DKG progress to user's subjects only
  const userProgress = MOCK_DKG_PROGRESS.filter(p =>
    user?.subjects?.includes(p.subject)
  );

  // Stats
  const totalSessions     = MOCK_SESSIONS.length;
  const totalAligned      = MOCK_DKG_PROGRESS.reduce((a, p) => a + p.aligned, 0);
  const activeSubjects    = user?.subjects?.length ?? 0;
  const activeMisconceptions = MOCK_DKG_PROGRESS.reduce((a, p) => a + p.misconceptions, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-8">

      {/* ── STAT CARDS ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { val: totalSessions,        label: "Total sessions",    color: "#C8FF00" },
          { val: totalAligned,         label: "Concepts aligned",  color: "#00E5FF" },
          { val: activeSubjects,       label: "Active subjects",   color: "#7B5CFF" },
          { val: activeMisconceptions, label: "Open T3 flags",     color: "#FF3D57" },
        ].map(s => (
          <div
            key={s.label}
            className="p-4"
            style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
          >
            <div
              className="text-3xl font-black leading-none mb-1"
              style={{ fontFamily: "var(--font-syne)", color: s.color }}
            >{s.val}</div>
            <div
              className="text-xs"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            >{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── QUICK QUERY ────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-6 h-px" style={{ backgroundColor: "#C8FF00" }} />
          <span
            className="text-xs tracking-widest uppercase"
            style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
          >Start a session</span>
        </div>

        <div
          className="flex gap-3 p-4"
          style={{
            border: `1px solid ${focused ? "#C8FF0060" : "#1E1E36"}`,
            backgroundColor: "#0F0F1A",
            transition: "border-color 0.2s",
          }}
        >
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Ask any STEM question — VEKTOR will map your understanding..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{
              color: "#F0F0FF",
              fontFamily: "var(--font-instrument)",
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && query.trim()) {
                window.location.href = `/dashboard/session?q=${encodeURIComponent(query)}`;
              }
            }}
          />
          <Link
            href={query.trim() ? `/dashboard/session?q=${encodeURIComponent(query)}` : "/dashboard/session"}
            className="flex items-center gap-2 px-4 py-2 text-xs font-black transition-all duration-150 flex-shrink-0"
            style={{
              backgroundColor: "#C8FF00",
              color: "#08080F",
              fontFamily: "var(--font-syne)",
              opacity: query.trim() ? 1 : 0.5,
            }}
          >
            <span className="hidden sm:block">ASK</span>
            <span>→</span>
          </Link>
        </div>
        <p
          className="text-xs mt-2"
          style={{ color: "#1E1E36", fontFamily: "var(--font-dm-mono)" }}
        >Press Enter or click → to open the full session page</p>
      </div>

      {/* ── DKG PROGRESS RINGS ─────────────────────────── */}
      {userProgress.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-6 h-px" style={{ backgroundColor: "#C8FF00" }} />
              <span
                className="text-xs tracking-widest uppercase"
                style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
              >Knowledge state</span>
            </div>
            <Link
              href="/dashboard/progress"
              className="text-xs transition-colors"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#C8FF00")}
              onMouseLeave={e => (e.currentTarget.style.color = "#6B6A80")}
            >See full progress →</Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {userProgress.map(p => (
              <DKGRing key={p.subject} {...p} />
            ))}
          </div>

          {/* Tier legend */}
          <div className="flex flex-wrap gap-4 mt-3">
            {Object.entries(TIER_COLORS).map(([tier, color]) => (
              <div key={tier} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span
                  className="text-xs"
                  style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                >{tier} — {TIER_LABELS[tier]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ADAPTIVE PATH ──────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-px" style={{ backgroundColor: "#C8FF00" }} />
            <span
              className="text-xs tracking-widest uppercase"
              style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
            >What to study next</span>
          </div>
          <div
            className="flex items-center gap-1.5 px-2 py-1"
            style={{ border: "1px solid #7B5CFF30", backgroundColor: "#7B5CFF08" }}
          >
            <div
              className="w-1 h-1 rounded-full"
              style={{ backgroundColor: "#7B5CFF", animation: "pulse 2s infinite" }}
            />
            <span
              className="text-xs"
              style={{ color: "#7B5CFF", fontFamily: "var(--font-dm-mono)", fontSize: "10px" }}
            >AI · adaptive</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MOCK_ADAPTIVE_PATH.map(item => (
            <PathCard key={item.id} item={item} />
          ))}
        </div>
      </div>

      {/* ── RECENT SESSIONS ────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-px" style={{ backgroundColor: "#C8FF00" }} />
            <span
              className="text-xs tracking-widest uppercase"
              style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
            >Recent sessions</span>
          </div>
          <Link
            href="/dashboard/history"
            className="text-xs transition-colors"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#C8FF00")}
            onMouseLeave={e => (e.currentTarget.style.color = "#6B6A80")}
          >See all →</Link>
        </div>

        <div className="space-y-2">
          {MOCK_SESSIONS.map((s, i) => {
            const color  = SUBJECT_COLORS[s.subject]  || "#6B6A80";
            const symbol = SUBJECT_SYMBOLS[s.subject] || "○";
            const tier   = s.tier as keyof typeof TIER_COLORS;
            return (
              <div
                key={s.id}
                className="flex items-center gap-4 px-4 py-3 transition-all duration-150"
                style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}40`)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}
              >
                {/* Index */}
                <span
                  className="text-xs flex-shrink-0 w-5 text-center"
                  style={{ color: "#1E1E36", fontFamily: "var(--font-dm-mono)" }}
                >{String(i + 1).padStart(2, "0")}</span>

                {/* Subject symbol */}
                <div
                  className="flex items-center justify-center flex-shrink-0 font-mono text-xs"
                  style={{
                    width: 28, height: 28,
                    border: `1px solid ${color}40`,
                    backgroundColor: `${color}10`,
                    color,
                    fontFamily: "var(--font-dm-mono)",
                  }}
                >{symbol}</div>

                {/* Query */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm truncate"
                    style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)" }}
                  >{truncate(s.query, 72)}</p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                  >{timeAgo(s.createdAt)} · {s.conceptsAligned} aligned · {s.gapsFound} gaps</p>
                </div>

                {/* Tier badge */}
                <div
                  className="flex-shrink-0 px-2 py-1 text-xs font-black"
                  style={{
                    border: `1px solid ${TIER_COLORS[tier]}40`,
                    backgroundColor: `${TIER_COLORS[tier]}10`,
                    color: TIER_COLORS[tier],
                    fontFamily: "var(--font-dm-mono)",
                  }}
                >{s.tier}</div>

                {/* Review link */}
                <Link
                  href={`/dashboard/session/${s.id}`}
                  className="flex-shrink-0 text-xs transition-colors"
                  style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#C8FF00")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#6B6A80")}
                >Review →</Link>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── TEACHER TASKS — only if enrolled ───────────── */}
      {user?.teacherId && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-6 h-px" style={{ backgroundColor: "#00E5FF" }} />
            <span
              className="text-xs tracking-widest uppercase"
              style={{ color: "#00E5FF", fontFamily: "var(--font-dm-mono)" }}
            >Assigned by teacher</span>
          </div>
          <div
            className="p-6 text-center"
            style={{ border: "1px solid #00E5FF20", backgroundColor: "#00E5FF08" }}
          >
            <p
              className="text-sm"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            >No tasks assigned yet.</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}