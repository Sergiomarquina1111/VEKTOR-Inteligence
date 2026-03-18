"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/authstore";

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
const SUBJECT_SYMBOLS: Record<string, string> = {
  mathematics:      "∫",
  physics:          "∇",
  chemistry:        "⇌",
  biology:          "∂",
  computer_science: "λ",
};

const TIER_COLORS: Record<string, string> = {
  T1: "#C8FF00",
  T2: "#FFB800",
  T3: "#FF3D57",
  T4: "#7B5CFF",
};

// ── Mock data ──────────────────────────────────────────────────────
const MOCK_SUMMARY = {
  totalStudyDays:   12,
  totalAligned:     315,
  longestStreak:    7,
  currentStreak:    3,
  tierAverage:      "T2",
  totalSessions:    24,
};

// 7-day tier history per subject (T1=4, T2=3, T3=2, T4=1 for chart)
const MOCK_TIER_HISTORY = {
  mathematics:      [1, 2, 2, 2, 3, 3, 3, 4, 3, 4, 4, 4],
  physics:          [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 3, 4],
  computer_science: [2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4],
};

// DKG progress per subject
const MOCK_DKG_PROGRESS = [
  { subject: "mathematics",      total: 847, encountered: 124, aligned: 89,  gaps: 28, misconceptions: 7  },
  { subject: "physics",          total: 763, encountered: 67,  aligned: 48,  gaps: 14, misconceptions: 5  },
  { subject: "computer_science", total: 731, encountered: 203, aligned: 178, gaps: 19, misconceptions: 6  },
];

// Streak calendar — 52 weeks × 7 days
function generateStreakData() {
  const data: { date: string; count: number; subject: string }[] = [];
  const now = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    // Simulate activity on some days
    const rand = Math.random();
    const count = rand > 0.75 ? Math.floor(Math.random() * 4) + 1 : 0;
    const subjects = Object.keys(SUBJECT_COLORS);
    const subject  = subjects[Math.floor(Math.random() * subjects.length)];
    data.push({ date: dateStr, count, subject });
  }
  return data;
}
const STREAK_DATA = generateStreakData();

// Badges
const BADGES = [
  { id: "first_t1",    icon: "◈", label: "First Alignment",     desc: "Achieve T1 on any concept",          earned: true,  color: "#C8FF00" },
  { id: "streak_7",    icon: "◷", label: "Week Warrior",         desc: "7-day study streak",                 earned: true,  color: "#FFB800" },
  { id: "concepts_50", icon: "⬡", label: "Explorer",             desc: "50 concepts encountered",            earned: true,  color: "#00E5FF" },
  { id: "fix_t3",      icon: "◎", label: "Misconception Slayer", desc: "Correct a T3 misconception",         earned: true,  color: "#7B5CFF" },
  { id: "all_subjects",icon: "✦", label: "Polymath",             desc: "Active in all 5 subjects",           earned: false, color: "#FF6B6B" },
  { id: "streak_30",   icon: "◷", label: "Month Master",         desc: "30-day study streak",                earned: false, color: "#FFB800" },
  { id: "concepts_500",icon: "⬡", label: "Knowledge Seeker",     desc: "500 concepts encountered",           earned: false, color: "#00E5FF" },
  { id: "perfect_t1",  icon: "◈", label: "Perfect Session",      desc: "Full T1 alignment in one session",   earned: false, color: "#C8FF00" },
];

// ── DKG Progress Ring ──────────────────────────────────────────────
function DKGRing({
  subject, total, encountered, aligned, gaps, misconceptions,
}: {
  subject: string; total: number; encountered: number;
  aligned: number; gaps: number; misconceptions: number;
}) {
  const color  = SUBJECT_COLORS[subject]  || "#6B6A80";
  const symbol = SUBJECT_SYMBOLS[subject] || "○";
  const label  = SUBJECT_LABELS[subject]  || subject;
  const pct    = Math.round((encountered / total) * 100);
  const R = 36; const C = 2 * Math.PI * R;
  const enc = (encountered / total) * C;
  const ali = (aligned / total) * C;

  return (
    <div
      className="flex flex-col items-center gap-3 p-4 transition-all duration-200"
      style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}50`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}
    >
      <div className="relative flex items-center justify-center">
        <svg width="88" height="88" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={R} fill="none" stroke="#1E1E36" strokeWidth="6" />
          <circle cx="44" cy="44" r={R} fill="none" stroke={`${color}40`} strokeWidth="6"
            strokeDasharray={`${enc} ${C - enc}`} strokeDashoffset={C / 4} strokeLinecap="butt"
            style={{ transition: "stroke-dasharray 0.6s ease" }} />
          <circle cx="44" cy="44" r={R} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${ali} ${C - ali}`} strokeDashoffset={C / 4} strokeLinecap="butt"
            style={{ transition: "stroke-dasharray 0.6s ease" }} />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="font-black text-lg leading-none" style={{ color, fontFamily: "var(--font-dm-mono)" }}>{symbol}</span>
          <span className="text-xs font-black leading-none mt-0.5" style={{ color: "#F0F0FF", fontFamily: "var(--font-dm-mono)" }}>{pct}%</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-black mb-0.5" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>{label}</div>
        <div className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{encountered} / {total}</div>
      </div>
      <div className="flex gap-1.5 w-full">
        {[
          { label: "T1", val: aligned,        color: "#C8FF00" },
          { label: "T2", val: gaps,           color: "#FFB800" },
          { label: "T3", val: misconceptions, color: "#FF3D57" },
        ].map(s => (
          <div key={s.label} className="flex-1 flex flex-col items-center py-1"
            style={{ border: `1px solid ${s.color}20`, backgroundColor: `${s.color}08` }}>
            <span className="text-xs font-black leading-none" style={{ color: s.color, fontFamily: "var(--font-dm-mono)" }}>{s.val}</span>
            <span className="leading-none mt-0.5" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)", fontSize: "9px" }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tier History Chart (SVG line chart) ────────────────────────────
function TierHistoryChart({ subjects }: { subjects: string[] }) {
  const W = 600; const H = 140;
  const PAD = { top: 16, right: 16, bottom: 32, left: 32 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allData = subjects
    .filter(s => MOCK_TIER_HISTORY[s as keyof typeof MOCK_TIER_HISTORY])
    .map(s => ({ subject: s, data: MOCK_TIER_HISTORY[s as keyof typeof MOCK_TIER_HISTORY] }));

  if (!allData.length) return null;
  const maxLen = Math.max(...allData.map(d => d.data.length));

  function toPath(data: number[]) {
    return data.map((v, i) => {
      const x = PAD.left + (i / (maxLen - 1)) * chartW;
      const y = PAD.top + chartH - ((v - 1) / 3) * chartH;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
  }

  return (
    <div style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid #1E1E36" }}>
        <h2 className="text-sm font-black" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>Tier Progression</h2>
        <p className="text-xs mt-0.5" style={{ color: "#6B6A80" }}>Session-over-session improvement trajectory</p>
      </div>
      <div className="px-5 py-4">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
          {/* Y axis labels */}
          {["T4", "T3", "T2", "T1"].map((t, i) => (
            <text key={t} x={PAD.left - 6} y={PAD.top + (i / 3) * chartH + 4}
              textAnchor="end" fill="#3A3A5C" fontSize={9} fontFamily="var(--font-dm-mono)">{t}</text>
          ))}
          {/* Horizontal grid lines */}
          {[0, 1, 2, 3].map(i => (
            <line key={i}
              x1={PAD.left} y1={PAD.top + (i / 3) * chartH}
              x2={PAD.left + chartW} y2={PAD.top + (i / 3) * chartH}
              stroke="#1E1E36" strokeWidth={1} />
          ))}
          {/* Lines per subject */}
          {allData.map(({ subject, data }) => (
            <g key={subject}>
              <path
                d={toPath(data)}
                fill="none"
                stroke={SUBJECT_COLORS[subject]}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
              />
              {/* Last point dot */}
              {(() => {
                const last = data[data.length - 1];
                const x = PAD.left + chartW;
                const y = PAD.top + chartH - ((last - 1) / 3) * chartH;
                return <circle cx={x} cy={y} r={3} fill={SUBJECT_COLORS[subject]} />;
              })()}
            </g>
          ))}
        </svg>
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-2">
          {allData.map(({ subject }) => (
            <div key={subject} className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: SUBJECT_COLORS[subject] }} />
              <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                {SUBJECT_LABELS[subject]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Streak Calendar ────────────────────────────────────────────────
function StreakCalendar() {
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const weeks: typeof STREAK_DATA[] = [];
  for (let i = 0; i < STREAK_DATA.length; i += 7) {
    weeks.push(STREAK_DATA.slice(i, i + 7));
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid #1E1E36" }}>
        <h2 className="text-sm font-black" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>Study Calendar</h2>
        <p className="text-xs mt-0.5" style={{ color: "#6B6A80" }}>Past 52 weeks of activity</p>
      </div>
      <div className="px-5 py-4 overflow-x-auto">
        <div className="flex gap-1" style={{ minWidth: "max-content" }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((day, di) => {
                const intensity = day.count === 0 ? 0 :
                  day.count === 1 ? 0.3 :
                  day.count === 2 ? 0.5 :
                  day.count === 3 ? 0.75 : 1;
                const color = SUBJECT_COLORS[day.subject] || "#C8FF00";
                const isHovered = hoveredDay === day.date;
                return (
                  <div
                    key={di}
                    className="relative cursor-pointer transition-all duration-150"
                    style={{
                      width: 11, height: 11,
                      backgroundColor: day.count === 0
                        ? "#1E1E36"
                        : `${color}${Math.round(intensity * 255).toString(16).padStart(2, "0")}`,
                      transform: isHovered ? "scale(1.4)" : "scale(1)",
                    }}
                    onMouseEnter={() => setHoveredDay(day.date)}
                    onMouseLeave={() => setHoveredDay(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {/* Month labels */}
        <div className="flex mt-2" style={{ minWidth: "max-content" }}>
          {months.map((m, i) => (
            <span
              key={m}
              className="text-xs"
              style={{
                width: `${(weeks.length / 12) * 12}px`,
                color: "#3A3A5C",
                fontFamily: "var(--font-dm-mono)",
                fontSize: 9,
              }}
            >{m}</span>
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Less</span>
          {[0, 0.3, 0.55, 0.75, 1].map((op, i) => (
            <div key={i} className="w-3 h-3"
              style={{ backgroundColor: op === 0 ? "#1E1E36" : `#C8FF00${Math.round(op * 255).toString(16).padStart(2, "0")}` }}
            />
          ))}
          <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>More</span>
        </div>
      </div>

      {/* Hovered day info */}
      {hoveredDay && (() => {
        const day = STREAK_DATA.find(d => d.date === hoveredDay);
        if (!day) return null;
        return (
          <div className="px-5 pb-3">
            <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
              {hoveredDay} · {day.count > 0 ? `${day.count} session${day.count > 1 ? "s" : ""}` : "No sessions"}
            </span>
          </div>
        );
      })()}
    </div>
  );
}

// ── Achievement Badge ──────────────────────────────────────────────
function AchievementBadge({ badge }: { badge: typeof BADGES[0] }) {
  return (
    <div
      className="flex flex-col items-center gap-2 p-4 text-center transition-all duration-200"
      style={{
        border: `1px solid ${badge.earned ? `${badge.color}40` : "#1E1E36"}`,
        backgroundColor: badge.earned ? `${badge.color}08` : "#0F0F1A",
        opacity: badge.earned ? 1 : 0.45,
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 40, height: 40,
          border: `1px solid ${badge.earned ? `${badge.color}60` : "#1E1E36"}`,
          backgroundColor: badge.earned ? `${badge.color}15` : "#16162A",
          color: badge.earned ? badge.color : "#3A3A5C",
          fontSize: 18,
        }}
      >{badge.icon}</div>
      <div>
        <div
          className="text-xs font-black leading-none mb-1"
          style={{ fontFamily: "var(--font-syne)", color: badge.earned ? "#F0F0FF" : "#3A3A5C" }}
        >{badge.label}</div>
        <div
          className="text-xs leading-snug"
          style={{ color: badge.earned ? "#6B6A80" : "#3A3A5C", fontFamily: "var(--font-dm-mono)", fontSize: 9 }}
        >{badge.desc}</div>
      </div>
      {badge.earned && (
        <div
          className="px-2 py-0.5 text-xs"
          style={{ backgroundColor: `${badge.color}20`, color: badge.color, fontFamily: "var(--font-dm-mono)", fontSize: 9 }}
        >EARNED</div>
      )}
    </div>
  );
}

// ── Sub-tabs ───────────────────────────────────────────────────────
const TABS = [
  { id: "overview",  label: "Overview"  },
  { id: "subjects",  label: "Subjects"  },
  { id: "badges",    label: "Badges"    },
];

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function ProgressPage() {
  const { user }  = useAuthStore();
  const [tab, setTab] = useState("overview");

  const userSubjects = user?.subjects || Object.keys(SUBJECT_COLORS).slice(0, 3);
  const userProgress = MOCK_DKG_PROGRESS.filter(p => userSubjects.includes(p.subject));

  const tierColor = TIER_COLORS[MOCK_SUMMARY.tierAverage] || "#FFB800";

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-6 h-px" style={{ backgroundColor: "#C8FF00" }} />
            <span className="text-xs tracking-widest uppercase" style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}>
              Progress
            </span>
          </div>
          <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
            How far have you come?
          </h1>
        </div>
        <Link
          href="/dashboard/session"
          className="px-4 py-2 text-xs font-black tracking-widest transition-all"
          style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >+ NEW SESSION</Link>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { val: MOCK_SUMMARY.totalStudyDays,  label: "Study days",        color: "#C8FF00"  },
          { val: MOCK_SUMMARY.totalAligned,    label: "Concepts aligned",   color: "#00E5FF"  },
          { val: `${MOCK_SUMMARY.longestStreak}d`, label: "Longest streak", color: "#FFB800"  },
          { val: MOCK_SUMMARY.tierAverage,     label: "Avg tier",           color: tierColor  },
        ].map(s => (
          <div
            key={s.label}
            className="p-4"
            style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
          >
            <div className="text-3xl font-black leading-none mb-1"
              style={{ fontFamily: "var(--font-syne)", color: s.color }}>{s.val}</div>
            <div className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Streak widget ── */}
      <div
        className="flex items-center gap-4 px-5 py-4"
        style={{ border: "1px solid #FFB80030", backgroundColor: "#FFB80008" }}
      >
        <span style={{ color: "#FFB800", fontSize: 22 }}>◷</span>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-black" style={{ fontFamily: "var(--font-syne)", color: "#FFB800" }}>
              {MOCK_SUMMARY.currentStreak} day streak
            </span>
            {MOCK_SUMMARY.currentStreak > 0 && (
              <span className="text-xs px-2 py-0.5" style={{ backgroundColor: "#FFB80020", color: "#FFB800", fontFamily: "var(--font-dm-mono)", border: "1px solid #FFB80040" }}>
                ACTIVE
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: "#6B6A80" }}>
            Best: {MOCK_SUMMARY.longestStreak} days · Keep it going — study today to maintain your streak.
          </p>
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex gap-1" style={{ borderBottom: "1px solid #1E1E36" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-5 py-3 text-xs font-black tracking-widest transition-all duration-150"
            style={{
              fontFamily:   "var(--font-syne)",
              color:        tab === t.id ? "#C8FF00" : "#6B6A80",
              borderBottom: tab === t.id ? "2px solid #C8FF00" : "2px solid transparent",
              marginBottom: -1,
            }}
          >{t.label.toUpperCase()}</button>
        ))}
      </div>

      {/* ══ OVERVIEW TAB ══ */}
      {tab === "overview" && (
        <div className="space-y-6">

          {/* DKG progress rings */}
          <div>
            <h2 className="text-sm font-black mb-4" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
              Knowledge State
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {userProgress.map(p => <DKGRing key={p.subject} {...p} />)}
            </div>
            <div className="flex flex-wrap gap-4 mt-3">
              {[
                { color: "#C8FF00", label: "T1 Aligned"       },
                { color: "#FFB800", label: "T2 Gap"           },
                { color: "#FF3D57", label: "T3 Misconception" },
                { color: "#1E1E36", label: "T4 Unexplored"    },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tier history chart */}
          <TierHistoryChart subjects={userSubjects} />

          {/* Streak calendar */}
          <StreakCalendar />

        </div>
      )}

      {/* ══ SUBJECTS TAB ══ */}
      {tab === "subjects" && (
        <div className="space-y-4">
          {userProgress.map(p => {
            const color    = SUBJECT_COLORS[p.subject] || "#C8FF00";
            const label    = SUBJECT_LABELS[p.subject] || p.subject;
            const symbol   = SUBJECT_SYMBOLS[p.subject] || "○";
            const coverage = Math.round((p.encountered / p.total) * 100);
            const aligned  = Math.round((p.aligned / p.total) * 100);
            const gapPct   = Math.round((p.gaps / p.total) * 100);
            const miscPct  = Math.round((p.misconceptions / p.total) * 100);

            return (
              <div
                key={p.subject}
                className="p-5"
                style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
              >
                {/* Subject header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center justify-center flex-shrink-0"
                      style={{
                        width: 36, height: 36,
                        border: `1px solid ${color}40`,
                        backgroundColor: `${color}10`,
                        color,
                        fontFamily: "var(--font-dm-mono)",
                        fontSize: 16,
                      }}
                    >{symbol}</div>
                    <div>
                      <div className="text-sm font-black" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>{label}</div>
                      <div className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                        {p.encountered} / {p.total} nodes encountered
                      </div>
                    </div>
                  </div>
                  <div
                    className="text-2xl font-black"
                    style={{ fontFamily: "var(--font-syne)", color }}
                  >{coverage}%</div>
                </div>

                {/* Stacked tier bar */}
                <div className="mb-2">
                  <div className="flex h-3 w-full overflow-hidden mb-1.5" style={{ backgroundColor: "#1E1E36" }}>
                    <div style={{ width: `${aligned}%`,  backgroundColor: "#C8FF00", transition: "width 0.6s ease" }} />
                    <div style={{ width: `${gapPct}%`,   backgroundColor: "#FFB800", transition: "width 0.6s ease" }} />
                    <div style={{ width: `${miscPct}%`,  backgroundColor: "#FF3D57", transition: "width 0.6s ease" }} />
                  </div>
                  <div className="flex items-center gap-4">
                    {[
                      { label: `T1 Aligned`,      val: p.aligned,        pct: aligned,  color: "#C8FF00" },
                      { label: `T2 Gaps`,         val: p.gaps,           pct: gapPct,   color: "#FFB800" },
                      { label: `T3 Misconceptions`,val: p.misconceptions, pct: miscPct,  color: "#FF3D57" },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                          {s.label}: <span style={{ color: s.color }}>{s.val}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Individual metric bars */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {[
                    { label: "Coverage",       val: coverage, color },
                    { label: "Alignment rate", val: aligned,  color: "#C8FF00" },
                  ].map(m => (
                    <div key={m.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{m.label}</span>
                        <span className="text-xs font-black" style={{ color: m.color, fontFamily: "var(--font-dm-mono)" }}>{m.val}%</span>
                      </div>
                      <div className="h-1.5 w-full" style={{ backgroundColor: "#1E1E36" }}>
                        <div
                          className="h-full transition-all duration-700"
                          style={{ width: `${m.val}%`, backgroundColor: m.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ BADGES TAB ══ */}
      {tab === "badges" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "#6B6A80" }}>
              {BADGES.filter(b => b.earned).length} of {BADGES.length} badges earned
            </p>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-32 overflow-hidden" style={{ backgroundColor: "#1E1E36" }}>
                <div
                  className="h-full"
                  style={{
                    width: `${(BADGES.filter(b => b.earned).length / BADGES.length) * 100}%`,
                    backgroundColor: "#C8FF00",
                    transition: "width 0.6s ease",
                  }}
                />
              </div>
              <span className="text-xs" style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}>
                {Math.round((BADGES.filter(b => b.earned).length / BADGES.length) * 100)}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {BADGES.map(badge => <AchievementBadge key={badge.id} badge={badge} />)}
          </div>
        </div>
      )}

    </div>
  );
}