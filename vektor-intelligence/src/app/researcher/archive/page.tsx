"use client";
import { useEffect, useState } from "react";
import {
  collection, query, where, orderBy, limit, onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/store/authstore";

const ACCENT        = "#2BD9A0";
const ACCENT_DIM    = "#2BD9A015";
const ACCENT_BORDER = "#2BD9A035";

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

interface ArchiveSession {
  id:          string;
  subject:     string;
  tier:        string;
  createdAt:   string;
  dkgVersion:  string;
  conceptsAligned: number;
  gapsFound:   number;
  misconceptions: number;
  duration:    number;
}

// ── Mock archive data ──────────────────────────────────────────────
// REPLACE: query(collection(db,"sessions"), where("dkgVersion","in",user.publishedDKGs))
const MOCK_ARCHIVE: ArchiveSession[] = Array.from({ length: 60 }, (_, i) => {
  const subjects = ["Mathematics","Mathematics","Mathematics","Physics","Mathematics","Mathematics"];
  const tiers    = ["T1","T2","T3","T2","T1","T2","T4","T3"] as const;
  return {
    id:              `arch_${i}`,
    subject:         subjects[i % subjects.length],
    tier:            tiers[i % tiers.length],
    createdAt:       new Date(Date.now() - i * 2700000).toISOString(),
    dkgVersion:      i % 8 < 2 ? "2.3.0" : "2.4.1",
    conceptsAligned: Math.floor(Math.random() * 8) + 1,
    gapsFound:       Math.floor(Math.random() * 4),
    misconceptions:  tiers[i % tiers.length] === "T3" ? 1 : 0,
    duration:        Math.floor(Math.random() * 480) + 60,
  };
});

const PAGE_SIZE = 20;

export default function ResearcherArchivePage() {
  const { user }                    = useAuthStore();
  const [sessions,  setSessions]    = useState<ArchiveSession[]>(MOCK_ARCHIVE);
  const [filterTier, setFilterTier] = useState("all");
  const [filterSubj, setFilterSubj] = useState("all");
  const [filterVer,  setFilterVer]  = useState("all");
  const [page,       setPage]       = useState(1);

  // ── Firestore: archive query ───────────────────────────────────
  // REPLACE: query(collection(db,"sessions"),
  //   where("dkgVersion","in", user.publishedDKGs || []),
  //   orderBy("createdAt","desc"), limit(500))

  const versions = [...new Set(sessions.map((s) => s.dkgVersion))];

  const filtered = sessions.filter((s) => {
    const matchTier = filterTier === "all" || s.tier === filterTier;
    const matchSubj = filterSubj === "all" || s.subject === filterSubj;
    const matchVer  = filterVer  === "all" || s.dkgVersion === filterVer;
    return matchTier && matchSubj && matchVer;
  });

  const paginated  = filtered.slice(0, page * PAGE_SIZE);
  const hasMore    = paginated.length < filtered.length;

  // Aggregate stats
  const totalSessions = filtered.length;
  const t3Count       = filtered.filter((s) => s.tier === "T3").length;
  const t1Count       = filtered.filter((s) => s.tier === "T1").length;
  const t3Rate        = totalSessions > 0 ? Math.round((t3Count / totalSessions) * 100) : 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-6 h-px" style={{ backgroundColor: ACCENT }} />
          <span className="text-xs tracking-widest uppercase"
            style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}>Archive</span>
        </div>
        <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
          Session Archive
        </h1>
        <p className="text-xs mt-1" style={{ color: "#6B6A80" }}>
          Anonymous — all sessions against your published DKGs
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label:"Total Sessions",  val:totalSessions, color:ACCENT },
          { label:"T1 Aligned",      val:t1Count,       color:"#C8FF00" },
          { label:"T3 Rate",         val:`${t3Rate}%`,  color:"#FF3D57" },
          { label:"DKG Versions",    val:versions.length, color:"#FFB800" },
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
        <div className="flex gap-1">
          {["all","T1","T2","T3","T4"].map((t) => (
            <button key={t}
              onClick={() => { setFilterTier(t); setPage(1); }}
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
          value={filterSubj} onChange={(e) => { setFilterSubj(e.target.value); setPage(1); }}
          className="text-xs px-3 py-2 outline-none"
          style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36",
            color: "#F0F0FF", fontFamily: "var(--font-dm-mono)" }}
        >
          <option value="all">All Subjects</option>
          {["Mathematics","Physics","Chemistry","Biology","Computer Science"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={filterVer} onChange={(e) => { setFilterVer(e.target.value); setPage(1); }}
          className="text-xs px-3 py-2 outline-none"
          style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36",
            color: "#F0F0FF", fontFamily: "var(--font-dm-mono)" }}
        >
          <option value="all">All DKG versions</option>
          {versions.map((v) => <option key={v} value={v}>v{v}</option>)}
        </select>

        <span className="text-xs ml-auto" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
          {filtered.length} sessions
        </span>
      </div>

      {/* ── Session list ── */}
      <div style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
        <div className="grid px-5 py-2 border-b"
          style={{ borderColor: "#1E1E36",
            gridTemplateColumns: "16px 1fr 80px 60px 80px 80px" }}>
          {["","Subject","Tier","Aligned","DKG ver","Time"].map((h) => (
            <span key={h} className="text-xs tracking-widest uppercase"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{h}</span>
          ))}
        </div>

        <div className="divide-y" style={{ borderColor: "#1E1E3615" }}>
          {paginated.map((s) => (
            <div key={s.id}
              className="grid items-center px-5 py-3 transition-colors"
              style={{ gridTemplateColumns: "16px 1fr 80px 60px 80px 80px",
                borderBottom: "1px solid #1E1E3615" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#08080F")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <div className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: SUBJECT_COLOR[s.subject] || ACCENT }} />

              <div>
                <div className="text-xs font-bold"
                  style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}>{s.subject}</div>
                <div className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                  {Math.floor(s.duration / 60)}m {s.duration % 60}s session
                </div>
              </div>

              <span className="text-xs px-2 py-0.5 inline-block"
                style={{ backgroundColor: `${TIER_COLOR[s.tier]}18`, color: TIER_COLOR[s.tier],
                  fontFamily: "var(--font-dm-mono)" }}>{s.tier}</span>

              <span className="text-xs" style={{ color: "#C8FF0080", fontFamily: "var(--font-dm-mono)" }}>
                {s.conceptsAligned}
              </span>

              <span className="text-xs"
                style={{ color: ACCENT_DIM, fontFamily: "var(--font-dm-mono)",
                  backgroundColor: ACCENT_DIM, color: ACCENT }}>
                v{s.dkgVersion}
              </span>

              <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                {timeAgo(s.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {hasMore && (
        <button
          onClick={() => setPage((p) => p + 1)}
          className="w-full py-3 text-xs tracking-widest uppercase transition-all"
          style={{ border: "1px solid #1E1E36", color: "#6B6A80", fontFamily: "var(--font-dm-mono)",
            backgroundColor: "#0F0F1A" }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = ACCENT_BORDER)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1E1E36")}
        >
          Load more — {filtered.length - paginated.length} remaining
        </button>
      )}

      {paginated.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3"
          style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
          <span style={{ color: ACCENT, fontSize: 28 }}>◷</span>
          <p className="text-xs" style={{ color: "#6B6A80" }}>No sessions match your filters.</p>
        </div>
      )}
    </div>
  );
}