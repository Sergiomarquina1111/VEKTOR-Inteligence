"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection, query, where, orderBy, limit,
  onSnapshot, doc, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/store/authstore";

const ACCENT        = "#7B5CFF";
const ACCENT_DIM    = "#7B5CFF15";
const ACCENT_BORDER = "#7B5CFF35";

// ── Types ──────────────────────────────────────────────────────────
interface ClassDoc {
  id:           string;
  name:         string;
  subject:      string;
  studentIds:   string[];
  tasks:        Task[];
  heatmapCache: Record<string, { t1Count: number; t2Count: number; t3Count: number; lastUpdated: string }>;
}

interface Task {
  id:        string;
  title:     string;
  subject:   string;
  dueDate:   string;
  type:      "practice" | "quiz" | "review";
  completed: boolean;
}

interface RecentSession {
  id:              string;
  userId:          string;
  studentName?:    string;
  subject:         string;
  query:           string;
  tier:            "T1" | "T2" | "T3" | "T4";
  conceptsAligned: number;
  gapsFound:       number;
  misconceptions:  number;
  createdAt:       string;
}

// ── Helpers ────────────────────────────────────────────────────────
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

// ── Stat Card ─────────────────────────────────────────────────────
function StatCard({
  label, value, sub, color = ACCENT,
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div
      className="p-5 flex flex-col gap-2"
      style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
    >
      <span
        className="text-xs tracking-widest uppercase"
        style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
      >{label}</span>
      <span
        className="text-3xl font-black leading-none"
        style={{ fontFamily: "var(--font-syne)", color }}
      >{value}</span>
      {sub && (
        <span className="text-xs" style={{ color: "#6B6A80" }}>{sub}</span>
      )}
    </div>
  );
}

// ── Heatmap Bar ───────────────────────────────────────────────────
function HeatmapBar({
  concept, t1, t2, t3, total,
}: { concept: string; t1: number; t2: number; t3: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-xs w-36 truncate flex-shrink-0"
        style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
      >{concept}</span>
      <div className="flex-1 h-2 flex overflow-hidden" style={{ backgroundColor: "#1E1E36" }}>
        <div style={{ width: `${(t1/total)*100}%`, backgroundColor: "#C8FF00" }} />
        <div style={{ width: `${(t2/total)*100}%`, backgroundColor: "#FFB800" }} />
        <div style={{ width: `${(t3/total)*100}%`, backgroundColor: "#FF3D57" }} />
      </div>
      {t3 > 0 && (
        <span
          className="text-xs flex-shrink-0"
          style={{ color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}
        >{t3} T3</span>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════

export default function TeacherDashboardPage() {
  const { user } = useAuthStore();

  const [classes,        setClasses]        = useState<ClassDoc[]>([]);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [loading,        setLoading]        = useState(true);

  // ── Firestore: live class listener ─────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;

    const classIds: string[] = user.classIds || [];
    if (classIds.length === 0) { setLoading(false); return; }

    // Listen to each class doc (teacher usually has 1–5 classes)
    const unsubs = classIds.map((classId) =>
      onSnapshot(doc(db, "classes", classId), (snap) => {
        if (!snap.exists()) return;
        setClasses((prev) => {
          const filtered = prev.filter((c) => c.id !== classId);
          return [...filtered, { id: classId, ...(snap.data() as Omit<ClassDoc, "id">) }];
        });
        setLoading(false);
      }, (err) => {
        console.warn("Class listener error:", err);
        setLoading(false);
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [user?.uid, user?.classIds]);

  // ── Firestore: recent sessions across all classes ───────────────
  useEffect(() => {
    if (!user?.uid || !user.classIds?.length) return;

    // Query sessions for all teacher's classes — last 20
    const q = query(
      collection(db, "sessions"),
      where("classId", "in", user.classIds),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const sessions: RecentSession[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RecentSession, "id">),
      }));

      // Batch-fetch student names (only unique UIDs)
      const uids = [...new Set(sessions.map((s) => s.userId))];
      const nameMap: Record<string, string> = {};
      await Promise.all(
        uids.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "users", uid));
            if (snap.exists()) nameMap[uid] = snap.data().displayName || uid;
          } catch { nameMap[uid] = uid; }
        })
      );

      setRecentSessions(
        sessions.map((s) => ({ ...s, studentName: nameMap[s.userId] || s.userId }))
      );
    }, (err) => console.warn("Sessions listener error:", err));

    return () => unsub();
  }, [user?.uid, user?.classIds]);

  // ── Derived stats ───────────────────────────────────────────────
  const totalStudents = [...new Set(classes.flatMap((c) => c.studentIds))].length;
  const totalT3 = classes.reduce((sum, c) => {
    return sum + Object.values(c.heatmapCache || {}).reduce(
      (s, v) => s + (v.t3Count || 0), 0
    );
  }, 0);
  const activeThisWeek = recentSessions.filter((s) => {
    const diff = Date.now() - new Date(s.createdAt).getTime();
    return diff < 7 * 24 * 60 * 60 * 1000;
  }).length;

  // Top T3 misconceptions across all classes for heatmap preview
  const allConcepts: Record<string, { t1: number; t2: number; t3: number }> = {};
  classes.forEach((c) => {
    Object.entries(c.heatmapCache || {}).forEach(([concept, counts]) => {
      if (!allConcepts[concept]) allConcepts[concept] = { t1: 0, t2: 0, t3: 0 };
      allConcepts[concept].t1 += counts.t1Count;
      allConcepts[concept].t2 += counts.t2Count;
      allConcepts[concept].t3 += counts.t3Count;
    });
  });
  const topMisconceptions = Object.entries(allConcepts)
    .sort((a, b) => b[1].t3 - a[1].t3)
    .slice(0, 6);

  const totalStudentsForHeatmap = totalStudents || 1;

  // ── Loading state ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span
          className="text-xs tracking-widest"
          style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
        >LOADING CLASS DATA...</span>
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────
  if (classes.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-64 gap-4"
        style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
      >
        <span style={{ color: ACCENT, fontSize: 32 }}>◈</span>
        <p style={{ color: "#6B6A80" }}>No classes yet.</p>
        <p className="text-sm" style={{ color: "#3A3A5C" }}>
          Contact your admin to be assigned a class.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-6 h-px" style={{ backgroundColor: ACCENT }} />
            <span
              className="text-xs tracking-widest uppercase"
              style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}
            >Teacher Dashboard</span>
          </div>
          <h1
            className="text-2xl font-black"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
          >Class Overview</h1>
        </div>
        <Link
          href="/dashboard/teacher/assignments"
          className="px-4 py-2 text-xs font-black tracking-widest transition-all"
          style={{
            backgroundColor: ACCENT,
            color: "#08080F",
            fontFamily: "var(--font-syne)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >+ ASSIGN TASK</Link>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Students"  value={totalStudents}   sub="across all classes" />
        <StatCard label="Active This Week" value={activeThisWeek}  sub="sessions submitted" color="#C8FF00" />
        <StatCard label="Open T3 Flags"    value={totalT3}         sub="need intervention"  color="#FF3D57" />
        <StatCard label="Classes"          value={classes.length}  sub="you are teaching" />
      </div>

      {/* ── Two column: heatmap + recent sessions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Misconception Heatmap */}
        <div
          className="p-5"
          style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2
                className="text-sm font-black"
                style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
              >Misconception Heatmap</h2>
              <p className="text-xs mt-0.5" style={{ color: "#6B6A80" }}>
                Top concepts by T3 count — live
              </p>
            </div>
            <Link
              href="/dashboard/teacher/heatmap"
              className="text-xs transition-colors"
              style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}
            >Full map →</Link>
          </div>

          {/* Legend */}
          <div className="flex gap-4 mb-4">
            {[
              { label: "T1 Aligned",     color: "#C8FF00" },
              { label: "T2 Gap",         color: "#FFB800" },
              { label: "T3 Misconception", color: "#FF3D57" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                <span
                  className="text-xs"
                  style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                >{l.label}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {topMisconceptions.length > 0 ? (
              topMisconceptions.map(([concept, counts]) => (
                <HeatmapBar
                  key={concept}
                  concept={concept}
                  t1={counts.t1} t2={counts.t2} t3={counts.t3}
                  total={totalStudentsForHeatmap}
                />
              ))
            ) : (
              <p className="text-xs py-6 text-center" style={{ color: "#3A3A5C" }}>
                No session data yet — heatmap updates live as students submit sessions.
              </p>
            )}
          </div>
        </div>

        {/* Recent Sessions */}
        <div
          className="p-5"
          style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2
                className="text-sm font-black"
                style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
              >Recent Sessions</h2>
              <p className="text-xs mt-0.5" style={{ color: "#6B6A80" }}>
                All students · live updates
              </p>
            </div>
            <Link
              href="/dashboard/teacher/history"
              className="text-xs transition-colors"
              style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}
            >Full history →</Link>
          </div>

          <div className="space-y-3">
            {recentSessions.length > 0 ? (
              recentSessions.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className="flex items-start gap-3 py-2"
                  style={{ borderBottom: "1px solid #1E1E3620" }}
                >
                  {/* Subject dot */}
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: SUBJECT_COLOR[s.subject] || "#6B6A80" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-xs font-bold truncate"
                        style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)" }}
                      >{s.studentName}</span>
                      <span
                        className="text-xs px-1.5 py-0.5 flex-shrink-0"
                        style={{
                          backgroundColor: `${TIER_COLOR[s.tier]}18`,
                          color: TIER_COLOR[s.tier],
                          fontFamily: "var(--font-dm-mono)",
                        }}
                      >{s.tier}</span>
                    </div>
                    <p
                      className="text-xs truncate"
                      style={{ color: "#6B6A80" }}
                    >{s.query}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span
                        className="text-xs"
                        style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
                      >{timeAgo(s.createdAt)}</span>
                      <span className="text-xs" style={{ color: "#C8FF0080" }}>
                        {s.conceptsAligned} aligned
                      </span>
                      {s.misconceptions > 0 && (
                        <span className="text-xs" style={{ color: "#FF3D5780" }}>
                          {s.misconceptions} T3
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs py-6 text-center" style={{ color: "#3A3A5C" }}>
                No sessions yet — sessions appear here in real time as students work.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Classes summary ── */}
      <div>
        <h2
          className="text-sm font-black mb-4"
          style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
        >Your Classes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls) => {
            const t3Total = Object.values(cls.heatmapCache || {})
              .reduce((s, v) => s + v.t3Count, 0);
            return (
              <Link
                key={cls.id}
                href="/dashboard/teacher/students"
                className="p-4 block transition-all duration-150"
                style={{
                  backgroundColor: "#0F0F1A",
                  border: "1px solid #1E1E36",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = ACCENT_BORDER)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = "#1E1E36")
                }
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: SUBJECT_COLOR[cls.subject] || ACCENT }}
                  />
                  <span
                    className="text-xs"
                    style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
                  >{cls.subject}</span>
                </div>
                <h3
                  className="text-sm font-black mb-3"
                  style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
                >{cls.name}</h3>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#6B6A80" }}>
                    {cls.studentIds?.length || 0} students
                  </span>
                  {t3Total > 0 && (
                    <span
                      className="text-xs px-2 py-0.5"
                      style={{
                        backgroundColor: "#FF3D5715",
                        color: "#FF3D57",
                        fontFamily: "var(--font-dm-mono)",
                        border: "1px solid #FF3D5730",
                      }}
                    >{t3Total} T3 flags</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

    </div>
  );
}