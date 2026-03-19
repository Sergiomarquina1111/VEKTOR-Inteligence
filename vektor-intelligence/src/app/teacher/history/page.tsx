"use client";
import { useEffect, useState } from "react";
import {
  collection, query, where, orderBy, limit,
  onSnapshot, startAfter, getDocs, QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/store/authstore";

const ACCENT        = "#7B5CFF";
const ACCENT_DIM    = "#7B5CFF15";
const ACCENT_BORDER = "#7B5CFF35";

const TIER_COLOR: Record<string, string> = {
  T1: "#C8FF00", T2: "#FFB800", T3: "#FF3D57", T4: "#6B6A80",
};
const SUBJECT_COLOR: Record<string, string> = {
  Mathematics: "#C8FF00", Physics: "#00E5FF", Chemistry: "#2BD9A0",
  Biology: "#FF6B6B", "Computer Science": "#FFB800",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface HistorySession {
  id:              string;
  studentName:     string;
  userId:          string;
  subject:         string;
  query:           string;
  tier:            string;
  conceptsAligned: number;
  gapsFound:       number;
  misconceptions:  number;
  duration:        number;
  createdAt:       string;
  dkgVersion:      string;
}

// ── Mock data ──────────────────────────────────────────────────────
// REPLACE: query(collection(db,"sessions"), where("classId","in",user.classIds))
const MOCK_HISTORY: HistorySession[] = Array.from({ length: 40 }, (_, i) => {
  const names = ["Rahul Kumar","Priya Desai","Arjun Mehta","Sneha Patil","Karan Joshi","Meera Nair","Vikram Singh","Anita Roy"];
  const subjects = ["Mathematics","Mathematics","Mathematics","Physics","Mathematics"];
  const tiers = ["T1","T2","T3","T2","T1","T3","T2","T4"] as const;
  const queries = [
    "What is eigenvalue decomposition?",
    "Explain matrix multiplication rules",
    "How does linear independence work?",
    "Describe Newton's second law in depth",
    "What is the determinant of a 3x3 matrix?",
    "Explain the rank-nullity theorem",
    "How do projections work in linear algebra?",
  ];
  return {
    id:              `sess_${i}`,
    studentName:     names[i % names.length],
    userId:          `u${i % 8}`,
    subject:         subjects[i % subjects.length],
    query:           queries[i % queries.length],
    tier:            tiers[i % tiers.length],
    conceptsAligned: Math.floor(Math.random() * 8) + 1,
    gapsFound:       Math.floor(Math.random() * 4),
    misconceptions:  tiers[i % tiers.length] === "T3" ? 1 : 0,
    duration:        Math.floor(Math.random() * 600) + 60,
    createdAt:       new Date(Date.now() - i * 3600000 * (0.5 + Math.random())).toISOString(),
    dkgVersion:      "2.4.1",
  };
});

// ══════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════
export default function TeacherHistoryPage() {
  const { user }                    = useAuthStore();
  const [sessions, setSessions]     = useState<HistorySession[]>(MOCK_HISTORY);
  const [search,   setSearch]       = useState("");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterSubj, setFilterSubj] = useState<string>("all");
  const [expanded,   setExpanded]   = useState<string | null>(null);

  // ── Firestore: live sessions across all classes ─────────────────
  // REPLACE: onSnapshot with classId filter, batch-fetch student names
  // Real pattern from teacher dashboard page.tsx is already correct

  const filtered = sessions.filter((s) => {
    const matchSearch = !search ||
      s.studentName.toLowerCase().includes(search.toLowerCase()) ||
      s.query.toLowerCase().includes(search.toLowerCase());
    const matchTier = filterTier === "all" || s.tier === filterTier;
    const matchSubj = filterSubj === "all" || s.subject === filterSubj;
    return matchSearch && matchTier && matchSubj;
  });

  // Daily grouping
  const grouped: Record<string, HistorySession[]> = {};
  filtered.forEach((s) => {
    const day = new Date(s.createdAt).toLocaleDateString("en-US",
      { weekday: "short", month: "short", day: "numeric" });
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(s);
  });

  // Stats
  const t3Count = sessions.filter((s) => s.tier === "T3").length;
  const avgConceptsAligned = sessions.length > 0
    ? Math.round(sessions.reduce((s, sess) => s + sess.conceptsAligned, 0) / sessions.length)
    : 0;

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-6 h-px" style={{ backgroundColor: ACCENT }} />
          <span className="text-xs tracking-widest uppercase"
            style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}>Class History</span>
        </div>
        <h1 className="text-2xl font-black"
          style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>Session History</h1>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Sessions",     val: sessions.length,         color: ACCENT },
          { label: "T3 Sessions",        val: t3Count,                 color: "#FF3D57" },
          { label: "Avg Concepts Aligned",val: avgConceptsAligned,     color: "#C8FF00" },
          { label: "Students Active",    val: new Set(sessions.map(s => s.userId)).size, color: "#FFB800" },
        ].map((s) => (
          <div key={s.label} className="p-4"
            style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
            <div className="text-xs tracking-widest uppercase mb-2"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{s.label}</div>
            <div className="text-3xl font-black leading-none"
              style={{ fontFamily: "var(--font-syne)", color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by student or query..."
          className="outline-none text-sm px-3 py-2 flex-1"
          style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36",
            color: "#F0F0FF", fontFamily: "var(--font-dm-mono)", minWidth: 220 }}
          onFocus={(e) => (e.target.style.borderColor = ACCENT_BORDER)}
          onBlur={(e) => (e.target.style.borderColor = "#1E1E36")}
        />

        <div className="flex gap-1">
          {["all","T1","T2","T3","T4"].map((t) => (
            <button key={t}
              onClick={() => setFilterTier(t)}
              className="px-2.5 py-1.5 text-xs transition-all"
              style={{
                backgroundColor: filterTier === t ? `${TIER_COLOR[t] || ACCENT}20` : "transparent",
                border: filterTier === t ? `1px solid ${TIER_COLOR[t] || ACCENT}40` : "1px solid #1E1E36",
                color: filterTier === t ? (TIER_COLOR[t] || ACCENT) : "#6B6A80",
                fontFamily: "var(--font-dm-mono)",
              }}
            >{t === "all" ? "ALL" : t}</button>
          ))}
        </div>

        <select
          value={filterSubj} onChange={(e) => setFilterSubj(e.target.value)}
          className="text-xs px-3 py-2 outline-none"
          style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36",
            color: "#F0F0FF", fontFamily: "var(--font-dm-mono)" }}
        >
          <option value="all">All Subjects</option>
          {["Mathematics","Physics","Chemistry","Biology","Computer Science"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <span className="text-xs ml-auto" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
          {filtered.length} sessions
        </span>
      </div>

      {/* ── Grouped sessions ── */}
      {Object.entries(grouped).length > 0 ? (
        Object.entries(grouped).map(([day, daySessions]) => (
          <div key={day}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs tracking-widest"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{day}</span>
              <div className="flex-1 h-px" style={{ backgroundColor: "#1E1E36" }} />
              <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                {daySessions.length} sessions
              </span>
            </div>

            <div className="space-y-2">
              {daySessions.map((s) => (
                <div key={s.id}
                  className="transition-all"
                  style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
                >
                  {/* Row */}
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer"
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: SUBJECT_COLOR[s.subject] || ACCENT }} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold"
                          style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}>{s.studentName}</span>
                        <span className="text-xs px-1.5 py-0.5"
                          style={{ backgroundColor: `${TIER_COLOR[s.tier]}18`, color: TIER_COLOR[s.tier],
                            fontFamily: "var(--font-dm-mono)" }}>{s.tier}</span>
                      </div>
                      <p className="text-xs truncate" style={{ color: "#6B6A80" }}>{s.query}</p>
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-xs hidden sm:block"
                        style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                        {s.subject}
                      </span>
                      <span className="text-xs"
                        style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                        {timeAgo(s.createdAt)}
                      </span>
                      <span style={{ color: "#3A3A5C", fontSize: 10 }}>
                        {expanded === s.id ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded === s.id && (
                    <div className="px-4 pb-4 pt-0 border-t"
                      style={{ borderColor: "#1E1E36" }}>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                        {[
                          { label: "Concepts Aligned", val: s.conceptsAligned, color: "#C8FF00" },
                          { label: "Gaps Found",       val: s.gapsFound,       color: "#FFB800" },
                          { label: "T3 Misconceptions",val: s.misconceptions,  color: "#FF3D57" },
                          { label: "Duration",         val: `${Math.floor(s.duration/60)}m ${s.duration%60}s`, color: ACCENT },
                        ].map((stat) => (
                          <div key={stat.label} className="p-3"
                            style={{ backgroundColor: "#08080F", border: "1px solid #1E1E36" }}>
                            <div className="text-xs mb-1"
                              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{stat.label}</div>
                            <div className="text-lg font-black"
                              style={{ color: stat.color, fontFamily: "var(--font-syne)" }}>{stat.val}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center gap-4">
                        <span className="text-xs"
                          style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                          {formatDate(s.createdAt)} · DKG v{s.dkgVersion}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="flex flex-col items-center justify-center py-16 gap-3"
          style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
          <span style={{ color: ACCENT, fontSize: 28 }}>◷</span>
          <p className="text-xs" style={{ color: "#6B6A80" }}>No sessions match your filters.</p>
        </div>
      )}
    </div>
  );
}