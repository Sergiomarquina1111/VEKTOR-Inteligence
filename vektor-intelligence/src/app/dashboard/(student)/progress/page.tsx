"use client";
import { useState } from "react";
import { useAuthStore } from "@/store/authstore";

// ── Constants ────────────────────────────────────────────────────
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

const TIER_COLORS = {
  T1: "#C8FF00",
  T2: "#00E5FF",
  T3: "#7B5CFF",
  T4: "#FF3D57",
};

// ── Mock Data — replaced with Firestore in Session 4 ─────────────
const MOCK_DKG = [
  { subject: "mathematics",      total: 847, encountered: 124, aligned: 89,  gaps: 28,  misconceptions: 7,  unknown: 703 },
  { subject: "physics",          total: 763, encountered: 67,  aligned: 48,  gaps: 14,  misconceptions: 5,  unknown: 696 },
  { subject: "computer_science", total: 731, encountered: 203, aligned: 178, gaps: 19,  misconceptions: 6,  unknown: 528 },
];

const MOCK_TIMELINE = [
  { date: "Mar 16", sessions: 4, tier: "T1", subject: "computer_science", delta: +12 },
  { date: "Mar 15", sessions: 3, tier: "T2", subject: "mathematics",      delta: +8  },
  { date: "Mar 14", sessions: 2, tier: "T3", subject: "physics",          delta: -3  },
  { date: "Mar 13", sessions: 5, tier: "T1", subject: "mathematics",      delta: +19 },
  { date: "Mar 12", sessions: 1, tier: "T2", subject: "chemistry",        delta: +4  },
  { date: "Mar 11", sessions: 3, tier: "T1", subject: "computer_science", delta: +11 },
  { date: "Mar 10", sessions: 2, tier: "T2", subject: "physics",          delta: +6  },
];

const MOCK_BADGES = [
  { id: "b1", icon: "∫", label: "First Session",     desc: "Completed your first VEKTOR session",   earned: true,  color: "#C8FF00" },
  { id: "b2", icon: "◆", label: "3-Day Streak",      desc: "Studied 3 days in a row",               earned: true,  color: "#C8FF00" },
  { id: "b3", icon: "T1", label: "First Alignment",  desc: "Reached T1 on a concept",               earned: true,  color: "#C8FF00" },
  { id: "b4", icon: "∇", label: "Multi-Subject",     desc: "Studied 3 different subjects",          earned: true,  color: "#7B5CFF" },
  { id: "b5", icon: "◈", label: "Gap Hunter",        desc: "Found 10 knowledge gaps",               earned: false, color: "#00E5FF" },
  { id: "b6", icon: "Ψ", label: "Quantum Mind",      desc: "Aligned 5 Quantum Mechanics concepts",  earned: false, color: "#5B3FCC" },
  { id: "b7", icon: "7", label: "7-Day Streak",      desc: "Studied 7 days in a row",               earned: false, color: "#FFB800" },
  { id: "b8", icon: "∞", label: "Century",           desc: "100 concepts aligned across all subjects", earned: false, color: "#FF3D57" },
];

const MOCK_MISCONCEPTIONS = [
  { id: "m1", subject: "mathematics",      concept: "Eigenvalue decomposition", sessions: 3, firstSeen: "Mar 14" },
  { id: "m2", subject: "physics",          concept: "Wave function collapse",    sessions: 2, firstSeen: "Mar 15" },
  { id: "m3", subject: "computer_science", concept: "Gradient vanishing",        sessions: 1, firstSeen: "Mar 16" },
];

// ── Helpers ───────────────────────────────────────────────────────
function ProgressBar({
  value, total, color, height = 4,
}: { value: number; total: number; color: string; height?: number }) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  return (
    <div
      className="w-full rounded-none overflow-hidden"
      style={{ height, backgroundColor: "#1E1E36" }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          backgroundColor: color,
          transition: "width 0.6s ease",
        }}
      />
    </div>
  );
}

// ── Subject deep-dive card ────────────────────────────────────────
function SubjectDeepDive({ data }: { data: typeof MOCK_DKG[0] }) {
  const color  = SUBJECT_COLORS[data.subject]  || "#6B6A80";
  const symbol = SUBJECT_SYMBOLS[data.subject] || "○";
  const label  = SUBJECT_LABELS[data.subject]  || data.subject;
  const encPct = Math.round((data.encountered / data.total) * 100);
  const aliPct = Math.round((data.aligned / data.total) * 100);

  const bars = [
    { label: "T1 Aligned",       val: data.aligned,        color: TIER_COLORS.T1 },
    { label: "T2 Gap",           val: data.gaps,            color: TIER_COLORS.T2 },
    { label: "T3 Misconception", val: data.misconceptions,  color: TIER_COLORS.T3 },
    { label: "T4 Unknown",       val: data.unknown,         color: TIER_COLORS.T4 },
  ];

  return (
    <div
      className="p-5 transition-all duration-200"
      style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}50`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center font-mono text-lg font-black flex-shrink-0"
            style={{
              width: 40, height: 40,
              border: `1px solid ${color}50`,
              backgroundColor: `${color}10`,
              color,
              fontFamily: "var(--font-dm-mono)",
            }}
          >{symbol}</div>
          <div>
            <div
              className="text-sm font-black"
              style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
            >{label}</div>
            <div
              className="text-xs"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            >{data.encountered} / {data.total} nodes encountered</div>
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-2xl font-black leading-none"
            style={{ fontFamily: "var(--font-syne)", color }}
          >{encPct}%</div>
          <div
            className="text-xs"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
          >covered</div>
        </div>
      </div>

      {/* Overall progress */}
      <div className="mb-4">
        <div className="flex justify-between mb-1.5">
          <span
            className="text-xs"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
          >Overall coverage</span>
          <span
            className="text-xs font-black"
            style={{ color, fontFamily: "var(--font-dm-mono)" }}
          >{encPct}%</span>
        </div>
        <ProgressBar value={data.encountered} total={data.total} color={color} height={6} />
      </div>

      {/* Tier breakdown bars */}
      <div className="space-y-3">
        {bars.map(b => (
          <div key={b.label}>
            <div className="flex justify-between mb-1">
              <span
                className="text-xs"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
              >{b.label}</span>
              <span
                className="text-xs font-black"
                style={{ color: b.color, fontFamily: "var(--font-dm-mono)" }}
              >{b.val}</span>
            </div>
            <ProgressBar value={b.val} total={data.total} color={b.color} />
          </div>
        ))}
      </div>

      {/* Alignment score */}
      <div
        className="mt-4 flex items-center justify-between px-3 py-2"
        style={{ border: `1px solid ${TIER_COLORS.T1}30`, backgroundColor: `${TIER_COLORS.T1}08` }}
      >
        <span
          className="text-xs"
          style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
        >Alignment score</span>
        <span
          className="text-sm font-black"
          style={{ color: TIER_COLORS.T1, fontFamily: "var(--font-syne)" }}
        >{aliPct}%</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ProgressPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"overview" | "subjects" | "badges">("overview");

  const userDKG = MOCK_DKG.filter(d => user?.subjects?.includes(d.subject));

  const totalAligned      = userDKG.reduce((a, d) => a + d.aligned,        0);
  const totalEncountered  = userDKG.reduce((a, d) => a + d.encountered,     0);
  const totalMisconceptions = userDKG.reduce((a, d) => a + d.misconceptions, 0);
  const totalNodes        = userDKG.reduce((a, d) => a + d.total,           0);
  const overallPct        = totalNodes > 0
    ? Math.round((totalEncountered / totalNodes) * 100) : 0;

  const earnedBadges = MOCK_BADGES.filter(b => b.earned).length;

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* ── HERO STATS ──────────────────────────────────── */}
      <div
        className="p-6"
        style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-6 h-px" style={{ backgroundColor: "#C8FF00" }} />
          <span
            className="text-xs tracking-widest uppercase"
            style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
          >Your knowledge state</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { val: `${overallPct}%`,       label: "DKG coverage",        color: "#C8FF00" },
            { val: totalAligned,            label: "Concepts aligned",    color: "#C8FF00" },
            { val: totalMisconceptions,     label: "Open T3 flags",       color: "#7B5CFF" },
            { val: `${user?.streak ?? 0}d`, label: "Current streak",      color: "#FFB800" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div
                className="text-4xl font-black leading-none mb-1"
                style={{ fontFamily: "var(--font-syne)", color: s.color }}
              >{s.val}</div>
              <div
                className="text-xs"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
              >{s.label}</div>
            </div>
          ))}
        </div>

        {/* Overall progress bar */}
        <div>
          <div className="flex justify-between mb-2">
            <span
              className="text-xs"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            >Overall DKG coverage across {userDKG.length} subject{userDKG.length !== 1 ? "s" : ""}</span>
            <span
              className="text-xs font-black"
              style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
            >{totalEncountered} / {totalNodes} nodes</span>
          </div>
          <ProgressBar value={totalEncountered} total={totalNodes} color="#C8FF00" height={8} />
        </div>
      </div>

      {/* ── TABS ────────────────────────────────────────── */}
      <div>
        <div
          className="flex gap-1 p-1 w-fit mb-6"
          style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
        >
          {(["overview", "subjects", "badges"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-2 text-xs font-black capitalize transition-all duration-150"
              style={{
                fontFamily: "var(--font-syne)",
                backgroundColor: activeTab === tab ? "#C8FF00"   : "transparent",
                color:           activeTab === tab ? "#08080F"   : "#6B6A80",
              }}
            >{tab}</button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ──────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6">

            {/* Growth timeline */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-6 h-px" style={{ backgroundColor: "#C8FF00" }} />
                <span
                  className="text-xs tracking-widest uppercase"
                  style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
                >Growth timeline</span>
              </div>

              <div className="space-y-2">
                {MOCK_TIMELINE.map((day, i) => {
                  const color  = SUBJECT_COLORS[day.subject]  || "#6B6A80";
                  const symbol = SUBJECT_SYMBOLS[day.subject] || "○";
                  const tier   = day.tier as keyof typeof TIER_COLORS;
                  const positive = day.delta > 0;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-4 px-4 py-3 transition-all duration-150"
                      style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}40`)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}
                    >
                      {/* Date */}
                      <span
                        className="text-xs flex-shrink-0 w-12"
                        style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                      >{day.date}</span>

                      {/* Subject symbol */}
                      <div
                        className="flex items-center justify-center flex-shrink-0 text-xs"
                        style={{
                          width: 26, height: 26,
                          border: `1px solid ${color}40`,
                          backgroundColor: `${color}10`,
                          color,
                          fontFamily: "var(--font-dm-mono)",
                        }}
                      >{symbol}</div>

                      {/* Session count bar */}
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex gap-1">
                          {Array.from({ length: day.sessions }).map((_, j) => (
                            <div
                              key={j}
                              style={{
                                width: 6, height: 20,
                                backgroundColor: `${color}60`,
                              }}
                            />
                          ))}
                        </div>
                        <span
                          className="text-xs"
                          style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                        >{day.sessions} session{day.sessions !== 1 ? "s" : ""}</span>
                      </div>

                      {/* Tier */}
                      <div
                        className="flex-shrink-0 px-2 py-0.5 text-xs font-black"
                        style={{
                          border: `1px solid ${TIER_COLORS[tier]}40`,
                          backgroundColor: `${TIER_COLORS[tier]}10`,
                          color: TIER_COLORS[tier],
                          fontFamily: "var(--font-dm-mono)",
                        }}
                      >{day.tier}</div>

                      {/* Delta */}
                      <div
                        className="flex-shrink-0 text-xs font-black w-12 text-right"
                        style={{
                          color: positive ? "#C8FF00" : "#FF3D57",
                          fontFamily: "var(--font-dm-mono)",
                        }}
                      >{positive ? "+" : ""}{day.delta}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Open misconceptions */}
            {MOCK_MISCONCEPTIONS.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-6 h-px" style={{ backgroundColor: "#7B5CFF" }} />
                  <span
                    className="text-xs tracking-widest uppercase"
                    style={{ color: "#7B5CFF", fontFamily: "var(--font-dm-mono)" }}
                  >Open T3 misconceptions</span>
                </div>

                <div className="space-y-2">
                  {MOCK_MISCONCEPTIONS.map(m => {
                    const color  = SUBJECT_COLORS[m.subject]  || "#6B6A80";
                    const symbol = SUBJECT_SYMBOLS[m.subject] || "○";
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-4 px-4 py-3"
                        style={{ border: "1px solid #7B5CFF30", backgroundColor: "#7B5CFF08" }}
                      >
                        <div
                          className="flex items-center justify-center flex-shrink-0 text-xs"
                          style={{
                            width: 26, height: 26,
                            border: `1px solid ${color}40`,
                            backgroundColor: `${color}10`,
                            color,
                            fontFamily: "var(--font-dm-mono)",
                          }}
                        >{symbol}</div>

                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm font-bold"
                            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
                          >{m.concept}</div>
                          <div
                            className="text-xs"
                            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                          >First seen {m.firstSeen} · appeared in {m.sessions} session{m.sessions !== 1 ? "s" : ""}</div>
                        </div>

                        <div
                          className="flex-shrink-0 px-2 py-0.5 text-xs font-black"
                          style={{
                            border: "1px solid #7B5CFF40",
                            backgroundColor: "#7B5CFF10",
                            color: "#7B5CFF",
                            fontFamily: "var(--font-dm-mono)",
                          }}
                        >T3</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Streak widget */}
            <div
              className="p-5 flex items-center justify-between"
              style={{ border: "1px solid #FFB80030", backgroundColor: "#FFB80008" }}
            >
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-4 h-px" style={{ backgroundColor: "#FFB800" }} />
                  <span
                    className="text-xs tracking-widest uppercase"
                    style={{ color: "#FFB800", fontFamily: "var(--font-dm-mono)" }}
                  >Study streak</span>
                </div>
                <p
                  className="text-xs"
                  style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)" }}
                >Keep studying daily to grow your streak and unlock badges.</p>
              </div>
              <div className="text-center flex-shrink-0 ml-6">
                <div
                  className="text-5xl font-black leading-none"
                  style={{ fontFamily: "var(--font-syne)", color: "#FFB800" }}
                >{user?.streak ?? 0}</div>
                <div
                  className="text-xs mt-1"
                  style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                >days</div>
              </div>
            </div>
          </div>
        )}

        {/* ── SUBJECTS TAB ──────────────────────────────── */}
        {activeTab === "subjects" && (
          <div>
            {userDKG.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {userDKG.map(d => (
                  <SubjectDeepDive key={d.subject} data={d} />
                ))}
              </div>
            ) : (
              <div
                className="p-10 text-center"
                style={{ border: "1px solid #1E1E36" }}
              >
                <p
                  className="text-sm"
                  style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                >No subjects selected. Update your subjects in Settings.</p>
              </div>
            )}
          </div>
        )}

        {/* ── BADGES TAB ────────────────────────────────── */}
        {activeTab === "badges" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span
                className="text-xs"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
              >{earnedBadges} of {MOCK_BADGES.length} badges earned</span>
              <div
                className="px-3 py-1"
                style={{ border: "1px solid #C8FF0030", backgroundColor: "#C8FF0008" }}
              >
                <span
                  className="text-xs font-black"
                  style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
                >{Math.round((earnedBadges / MOCK_BADGES.length) * 100)}% complete</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {MOCK_BADGES.map(b => (
                <div
                  key={b.id}
                  className="flex flex-col items-center gap-3 p-4 text-center transition-all duration-200"
                  style={{
                    border: `1px solid ${b.earned ? `${b.color}40` : "#1E1E36"}`,
                    backgroundColor: b.earned ? `${b.color}08` : "#0F0F1A",
                    opacity: b.earned ? 1 : 0.45,
                  }}
                >
                  {/* Badge icon */}
                  <div
                    className="flex items-center justify-center font-black text-xl"
                    style={{
                      width: 52, height: 52,
                      border: `1px solid ${b.earned ? `${b.color}50` : "#1E1E36"}`,
                      backgroundColor: b.earned ? `${b.color}15` : "#16162A",
                      color: b.earned ? b.color : "#6B6A80",
                      fontFamily: "var(--font-dm-mono)",
                    }}
                  >{b.icon}</div>

                  {/* Label */}
                  <div>
                    <div
                      className="text-xs font-black mb-1"
                      style={{
                        fontFamily: "var(--font-syne)",
                        color: b.earned ? "#F0F0FF" : "#6B6A80",
                      }}
                    >{b.label}</div>
                    <div
                      className="text-xs leading-relaxed"
                      style={{
                        color: "#6B6A80",
                        fontFamily: "var(--font-instrument)",
                        fontSize: "11px",
                      }}
                    >{b.desc}</div>
                  </div>

                  {/* Earned indicator */}
                  {b.earned && (
                    <div
                      className="px-2 py-0.5 text-xs font-black"
                      style={{
                        backgroundColor: `${b.color}20`,
                        color: b.color,
                        fontFamily: "var(--font-dm-mono)",
                        fontSize: "10px",
                      }}
                    >EARNED</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}