"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection, query, where, orderBy, limit,
  onSnapshot, doc, getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/store/authstore";

const ACCENT        = "#2BD9A0";
const ACCENT_DIM    = "#2BD9A015";
const ACCENT_BORDER = "#2BD9A035";

// ── Types ──────────────────────────────────────────────────────────
interface DKGDoc {
  subject:     string;
  version:     string;
  publishedAt: string;
  nodeCount:   number;
  nodes:       { id: string; label: string; tier: string }[];
}

interface SessionAggregate {
  subject:      string;
  totalSessions:number;
  t1Count:      number;
  t2Count:      number;
  t3Count:      number;
  t4Count:      number;
  dkgVersion:   string;
  lastActivity: string;
}

// ── Helpers ────────────────────────────────────────────────────────
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

// ── Tier Distribution Bar ─────────────────────────────────────────
function TierBar({
  t1, t2, t3, t4,
}: { t1: number; t2: number; t3: number; t4: number }) {
  const total = t1 + t2 + t3 + t4 || 1;
  return (
    <div className="flex h-2 w-full overflow-hidden" style={{ backgroundColor: "#1E1E36" }}>
      <div style={{ width: `${(t1/total)*100}%`, backgroundColor: "#C8FF00" }} />
      <div style={{ width: `${(t2/total)*100}%`, backgroundColor: "#FFB800" }} />
      <div style={{ width: `${(t3/total)*100}%`, backgroundColor: "#FF3D57" }} />
      <div style={{ width: `${(t4/total)*100}%`, backgroundColor: "#3A3A5C" }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════
export default function ResearcherDashboardPage() {
  const { user } = useAuthStore();

  const [dkgs,       setDkgs]       = useState<(DKGDoc & { id: string })[]>([]);
  const [aggregates, setAggregates] = useState<SessionAggregate[]>([]);
  const [recentSessions, setRecentSessions] = useState<{
    id: string; subject: string; tier: string; createdAt: string; dkgVersion: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Firestore: listen to researcher's published DKGs ────────────
  useEffect(() => {
    if (!user?.uid) return;

    const publishedIds: string[] = user.publishedDKGs || [];
    if (publishedIds.length === 0) { setLoading(false); return; }

    const unsubs = publishedIds.map((dkgId) =>
      onSnapshot(doc(db, "dkg", dkgId), (snap) => {
        if (!snap.exists()) return;
        setDkgs((prev) => {
          const filtered = prev.filter((d) => d.id !== dkgId);
          return [...filtered, { id: dkgId, ...(snap.data() as DKGDoc) }];
        });
        setLoading(false);
      }, (err) => {
        console.warn("DKG listener error:", err);
        setLoading(false);
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [user?.uid, user?.publishedDKGs]);

  // ── Firestore: aggregate session data per DKG version ──────────
  useEffect(() => {
    if (!user?.uid || !user.publishedDKGs?.length) return;

    // Sessions that used any DKG this researcher published
    const q = query(
      collection(db, "sessions"),
      where("dkgVersion", "in", user.publishedDKGs),
      orderBy("createdAt", "desc"),
      limit(500) // cap for aggregation
    );

    const unsub = onSnapshot(q, (snap) => {
      const sessions = snap.docs.map((d) => ({
        id: d.id, ...(d.data() as {
          subject: string; tier: string; createdAt: string; dkgVersion: string;
        }),
      }));

      // Store recent 10 for activity feed
      setRecentSessions(sessions.slice(0, 10));

      // Aggregate by subject + dkgVersion
      const agg: Record<string, SessionAggregate> = {};
      sessions.forEach((s) => {
        const key = `${s.subject}__${s.dkgVersion}`;
        if (!agg[key]) {
          agg[key] = {
            subject: s.subject, totalSessions: 0,
            t1Count: 0, t2Count: 0, t3Count: 0, t4Count: 0,
            dkgVersion: s.dkgVersion, lastActivity: s.createdAt,
          };
        }
        agg[key].totalSessions++;
        if (s.tier === "T1") agg[key].t1Count++;
        else if (s.tier === "T2") agg[key].t2Count++;
        else if (s.tier === "T3") agg[key].t3Count++;
        else if (s.tier === "T4") agg[key].t4Count++;
        if (s.createdAt > agg[key].lastActivity) agg[key].lastActivity = s.createdAt;
      });

      setAggregates(Object.values(agg).sort((a, b) => b.totalSessions - a.totalSessions));
    }, (err) => console.warn("Sessions aggregate error:", err));

    return () => unsub();
  }, [user?.uid, user?.publishedDKGs]);

  // ── Derived stats ───────────────────────────────────────────────
  const totalSessions  = aggregates.reduce((s, a) => s + a.totalSessions, 0);
  const totalT3        = aggregates.reduce((s, a) => s + a.t3Count, 0);
  const totalNodes     = dkgs.reduce((s, d) => s + d.nodeCount, 0);
  const t3Rate = totalSessions > 0
    ? Math.round((totalT3 / totalSessions) * 100)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span
          className="text-xs tracking-widest"
          style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
        >LOADING RESEARCH DATA...</span>
      </div>
    );
  }

  if (dkgs.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-64 gap-4"
        style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
      >
        <span style={{ color: ACCENT, fontSize: 32 }}>◎</span>
        <p style={{ color: "#6B6A80" }}>No published DKGs yet.</p>
        <Link
          href="/dashboard/researcher/dkg"
          className="text-xs px-4 py-2 transition-all"
          style={{
            backgroundColor: ACCENT,
            color: "#08080F",
            fontFamily: "var(--font-dm-mono)",
          }}
        >PUBLISH FIRST DKG →</Link>
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
            >Researcher Dashboard</span>
          </div>
          <h1
            className="text-2xl font-black"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
          >Research Overview</h1>
        </div>
        <Link
          href="/dashboard/researcher/export"
          className="px-4 py-2 text-xs font-black tracking-widest transition-all"
          style={{
            backgroundColor: ACCENT,
            color: "#08080F",
            fontFamily: "var(--font-syne)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >↗ EXPORT DATA</Link>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Published DKGs"   value={dkgs.length}      sub="active knowledge graphs" />
        <StatCard label="Total DKG Nodes"  value={totalNodes}        sub="mapped concepts"          color="#C8FF00" />
        <StatCard label="Sessions on DKGs" value={totalSessions}     sub="students engaged"         color={ACCENT} />
        <StatCard label="T3 Misconception Rate" value={`${t3Rate}%`} sub="of all sessions"          color="#FF3D57" />
      </div>

      {/* ── Two column: DKG health + activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* DKG Performance */}
        <div
          className="p-5"
          style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2
                className="text-sm font-black"
                style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
              >DKG Performance</h2>
              <p className="text-xs mt-0.5" style={{ color: "#6B6A80" }}>
                Tier distribution across all sessions per DKG
              </p>
            </div>
            <Link
              href="/dashboard/researcher/dkg"
              className="text-xs"
              style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}
            >Explorer →</Link>
          </div>

          {/* Tier legend */}
          <div className="flex gap-4 mb-4">
            {[
              { label: "T1", color: "#C8FF00" },
              { label: "T2", color: "#FFB800" },
              { label: "T3", color: "#FF3D57" },
              { label: "T4", color: "#3A3A5C" },
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

          <div className="space-y-4">
            {aggregates.length > 0 ? aggregates.map((agg) => (
              <div key={`${agg.subject}-${agg.dkgVersion}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: SUBJECT_COLOR[agg.subject] || ACCENT }}
                    />
                    <span
                      className="text-xs"
                      style={{ color: "#F0F0FF", fontFamily: "var(--font-dm-mono)" }}
                    >{agg.subject}</span>
                    <span
                      className="text-xs px-1.5 py-0.5"
                      style={{
                        backgroundColor: ACCENT_DIM,
                        color: ACCENT,
                        border: `1px solid ${ACCENT_BORDER}`,
                        fontFamily: "var(--font-dm-mono)",
                        fontSize: 10,
                      }}
                    >v{agg.dkgVersion}</span>
                  </div>
                  <span
                    className="text-xs"
                    style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
                  >{agg.totalSessions} sessions</span>
                </div>
                <TierBar
                  t1={agg.t1Count} t2={agg.t2Count}
                  t3={agg.t3Count} t4={agg.t4Count}
                />
                <div className="flex gap-4 mt-1">
                  {[
                    { label: "T1", val: agg.t1Count, color: "#C8FF00" },
                    { label: "T2", val: agg.t2Count, color: "#FFB800" },
                    { label: "T3", val: agg.t3Count, color: "#FF3D57" },
                    { label: "T4", val: agg.t4Count, color: "#3A3A5C" },
                  ].map((t) => (
                    <span
                      key={t.label}
                      className="text-xs"
                      style={{ color: t.color, fontFamily: "var(--font-dm-mono)" }}
                    >{t.label}: {t.val}</span>
                  ))}
                </div>
              </div>
            )) : (
              <p className="text-xs py-6 text-center" style={{ color: "#3A3A5C" }}>
                No session data yet — data appears as students use your DKGs.
              </p>
            )}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div
          className="p-5"
          style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2
                className="text-sm font-black"
                style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
              >Activity Feed</h2>
              <p className="text-xs mt-0.5" style={{ color: "#6B6A80" }}>
                Anonymous — sessions using your DKGs · live
              </p>
            </div>
            <Link
              href="/dashboard/researcher/archive"
              className="text-xs"
              style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}
            >Archive →</Link>
          </div>

          <div className="space-y-3">
            {recentSessions.length > 0 ? recentSessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 py-2"
                style={{ borderBottom: "1px solid #1E1E3620" }}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: SUBJECT_COLOR[s.subject] || ACCENT }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs"
                      style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)" }}
                    >Anonymous session · {s.subject}</span>
                    <span
                      className="text-xs px-1.5 py-0.5"
                      style={{
                        backgroundColor: s.tier === "T3" ? "#FF3D5718" : ACCENT_DIM,
                        color: s.tier === "T3" ? "#FF3D57" : ACCENT,
                        fontFamily: "var(--font-dm-mono)",
                      }}
                    >{s.tier}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span
                      className="text-xs"
                      style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
                    >{timeAgo(s.createdAt)}</span>
                    <span
                      className="text-xs"
                      style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
                    >DKG v{s.dkgVersion}</span>
                  </div>
                </div>
              </div>
            )) : (
              <p className="text-xs py-6 text-center" style={{ color: "#3A3A5C" }}>
                No activity yet — sessions appear here anonymously in real time.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Published DKGs ── */}
      <div>
        <h2
          className="text-sm font-black mb-4"
          style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
        >Published Knowledge Graphs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dkgs.map((dkg) => {
            const agg = aggregates.find(
              (a) => a.subject === dkg.subject && a.dkgVersion === dkg.version
            );
            return (
              <Link
                key={dkg.id}
                href="/dashboard/researcher/dkg"
                className="p-4 block transition-all duration-150"
                style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
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
                    style={{ backgroundColor: SUBJECT_COLOR[dkg.subject] || ACCENT }}
                  />
                  <span
                    className="text-xs px-2 py-0.5"
                    style={{
                      backgroundColor: ACCENT_DIM,
                      color: ACCENT,
                      border: `1px solid ${ACCENT_BORDER}`,
                      fontFamily: "var(--font-dm-mono)",
                    }}
                  >v{dkg.version}</span>
                </div>
                <h3
                  className="text-sm font-black mb-1"
                  style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
                >{dkg.subject}</h3>
                <p
                  className="text-xs mb-3"
                  style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
                >Published {timeAgo(dkg.publishedAt)}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#6B6A80" }}>
                    {dkg.nodeCount} nodes
                  </span>
                  <span className="text-xs" style={{ color: "#6B6A80" }}>
                    {agg?.totalSessions || 0} sessions
                  </span>
                </div>
                {agg && (
                  <div className="mt-3">
                    <TierBar
                      t1={agg.t1Count} t2={agg.t2Count}
                      t3={agg.t3Count} t4={agg.t4Count}
                    />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

    </div>
  );
}