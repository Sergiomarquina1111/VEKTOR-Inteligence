"use client";
import { useEffect, useState } from "react";
import {
  collection, query, where, orderBy, limit,
  onSnapshot, doc, getDoc,
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

// ── Types ──────────────────────────────────────────────────────────
interface Student {
  uid:            string;
  displayName:    string;
  subjects:       string[];
  currentTier?:   "T1" | "T2" | "T3" | "T4";
  lastSession?:   string;
  totalSessions?: number;
  misconceptions?:string[];
  gaps?:          string[];
  streak?:        number;
}

interface StudentSession {
  id:              string;
  subject:         string;
  query:           string;
  tier:            string;
  conceptsAligned: number;
  gapsFound:       number;
  misconceptions:  number;
  createdAt:       string;
}

// ── Mock students ──────────────────────────────────────────────────
// REPLACE: pulled from classes/{classId}.studentIds → users/{uid} docs
const MOCK_STUDENTS: Student[] = [
  { uid: "s1", displayName: "Rahul Kumar",   subjects: ["Mathematics"], currentTier: "T3", lastSession: new Date(Date.now() - 2*60000).toISOString(),   totalSessions: 14, misconceptions: ["Eigenvalue decomposition"], gaps: ["Matrix rank", "Null space"],     streak: 4 },
  { uid: "s2", displayName: "Priya Desai",   subjects: ["Mathematics"], currentTier: "T1", lastSession: new Date(Date.now() - 18*60000).toISOString(),  totalSessions: 21, misconceptions: [],                         gaps: ["Diagonalization"],               streak: 9 },
  { uid: "s3", displayName: "Arjun Mehta",   subjects: ["Mathematics"], currentTier: "T2", lastSession: new Date(Date.now() - 34*60000).toISOString(),  totalSessions: 8,  misconceptions: [],                         gaps: ["Char. Poly.", "Trace"],           streak: 2 },
  { uid: "s4", displayName: "Sneha Patil",   subjects: ["Mathematics"], currentTier: "T3", lastSession: new Date(Date.now() - 60*60000).toISOString(),  totalSessions: 17, misconceptions: ["Linear independence"],     gaps: ["Basis vectors", "Span"],          streak: 0 },
  { uid: "s5", displayName: "Karan Joshi",   subjects: ["Mathematics"], currentTier: "T2", lastSession: new Date(Date.now() - 2*3600000).toISOString(), totalSessions: 11, misconceptions: [],                         gaps: ["Determinant expansion"],          streak: 3 },
  { uid: "s6", displayName: "Meera Nair",    subjects: ["Mathematics"], currentTier: "T1", lastSession: new Date(Date.now() - 3*3600000).toISOString(), totalSessions: 30, misconceptions: [],                         gaps: [],                                 streak: 14 },
  { uid: "s7", displayName: "Vikram Singh",  subjects: ["Mathematics"], currentTier: "T3", lastSession: new Date(Date.now() - 4*3600000).toISOString(), totalSessions: 6,  misconceptions: ["Orthogonality"],           gaps: ["Dot product", "Projection"],      streak: 0 },
  { uid: "s8", displayName: "Anita Roy",     subjects: ["Mathematics"], currentTier: "T2", lastSession: new Date(Date.now() - 5*3600000).toISOString(), totalSessions: 9,  misconceptions: [],                         gaps: ["Transpose", "Symmetric matrices"],streak: 1 },
];

const MOCK_SESSIONS: StudentSession[] = [
  { id: "ss1", subject: "Mathematics", query: "What is eigenvalue decomposition?", tier: "T3", conceptsAligned: 3, gapsFound: 2, misconceptions: 1, createdAt: new Date(Date.now()-2*60000).toISOString() },
  { id: "ss2", subject: "Mathematics", query: "How does matrix multiplication work?", tier: "T2", conceptsAligned: 5, gapsFound: 2, misconceptions: 0, createdAt: new Date(Date.now()-1*3600000).toISOString() },
  { id: "ss3", subject: "Mathematics", query: "Explain the rank-nullity theorem", tier: "T2", conceptsAligned: 4, gapsFound: 3, misconceptions: 0, createdAt: new Date(Date.now()-2*3600000).toISOString() },
];

// ── Student row ───────────────────────────────────────────────────
function StudentRow({ student, onClick }: { student: Student; onClick: () => void }) {
  const isActive = student.lastSession
    && Date.now() - new Date(student.lastSession).getTime() < 30 * 60000;

  return (
    <tr
      className="transition-colors cursor-pointer"
      style={{ borderBottom: "1px solid #1E1E3620" }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#0F0F1A")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      <td className="py-3 pl-5">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center text-xs font-black flex-shrink-0"
            style={{
              width: 28, height: 28,
              backgroundColor: ACCENT_DIM,
              border: `1px solid ${ACCENT_BORDER}`,
              color: ACCENT,
              fontFamily: "var(--font-syne)",
            }}
          >{student.displayName[0]}</div>
          <div>
            <div className="flex items-center gap-2">
              {isActive && (
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#C8FF00", animation: "pulse 2s infinite" }} />
              )}
              <span className="text-sm font-bold" style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}>
                {student.displayName}
              </span>
            </div>
            <div className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
              {student.subjects.join(", ")}
            </div>
          </div>
        </div>
      </td>

      <td className="py-3 px-4">
        <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
          {student.lastSession ? timeAgo(student.lastSession) : "—"}
        </span>
      </td>

      <td className="py-3 px-4">
        <span
          className="text-xs px-2 py-0.5"
          style={{
            backgroundColor: student.currentTier ? `${TIER_COLOR[student.currentTier]}18` : "transparent",
            color: student.currentTier ? TIER_COLOR[student.currentTier] : "#6B6A80",
            fontFamily: "var(--font-dm-mono)",
          }}
        >{student.currentTier || "—"}</span>
      </td>

      <td className="py-3 px-4">
        <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
          {student.totalSessions ?? 0}
        </span>
      </td>

      <td className="py-3 pr-5">
        {student.misconceptions && student.misconceptions.length > 0 ? (
          <span
            className="text-xs truncate block max-w-xs"
            style={{ color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}
          >{student.misconceptions[0]}</span>
        ) : (
          <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
            None detected
          </span>
        )}
      </td>
    </tr>
  );
}

// ══════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════
export default function TeacherStudentsPage() {
  const { user } = useAuthStore();
  const [students,       setStudents]       = useState<Student[]>(MOCK_STUDENTS);
  const [selected,       setSelected]       = useState<Student | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<StudentSession[]>(MOCK_SESSIONS);
  const [search,         setSearch]         = useState("");
  const [sortCol,        setSortCol]        = useState<"name"|"tier"|"session"|"t3">("t3");
  const [sortAsc,        setSortAsc]        = useState(false);
  const [panelOpen,      setPanelOpen]      = useState(false);

  // ── Firestore: live student list via class doc ─────────────────
  // REPLACE: onSnapshot(doc(db, "classes", classId)) → fetch studentIds → fetch users
  // onSnapshot would fire every time a student session updates the heatmapCache,
  // keeping the roster tier data current in real time.

  const filtered = students
    .filter((s) => s.displayName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (sortCol === "name")    cmp = a.displayName.localeCompare(b.displayName);
      if (sortCol === "tier")    cmp = (a.currentTier || "T4").localeCompare(b.currentTier || "T4");
      if (sortCol === "session") cmp = (b.lastSession || "").localeCompare(a.lastSession || "");
      if (sortCol === "t3")      cmp = (b.misconceptions?.length || 0) - (a.misconceptions?.length || 0);
      return sortAsc ? -cmp : cmp;
    });

  function openPanel(student: Student) {
    setSelected(student);
    setPanelOpen(true);
    // REPLACE: fetch sessions for this student from Firestore:
    // query(collection(db,"sessions"), where("userId","==",student.uid), orderBy("createdAt","desc"), limit(10))
    setSelectedSessions(MOCK_SESSIONS);
  }

  function SortTh({ col, label }: { col: typeof sortCol; label: string }) {
    const active = sortCol === col;
    return (
      <th
        className="py-2 px-4 text-left cursor-pointer select-none"
        style={{
          fontFamily: "var(--font-dm-mono)", fontSize: 10,
          letterSpacing: "0.12em", textTransform: "uppercase",
          color: active ? ACCENT : "#3A3A5C",
        }}
        onClick={() => { if (active) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(false); } }}
      >
        {label} {active ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-6 h-px" style={{ backgroundColor: ACCENT }} />
            <span className="text-xs tracking-widest uppercase"
              style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}>Students</span>
          </div>
          <h1 className="text-2xl font-black"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
            Student Roster
          </h1>
        </div>
        <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
          {students.length} enrolled
        </span>
      </div>

      {/* ── Search ── */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search students..."
        className="outline-none text-sm w-72"
        style={{
          backgroundColor: "#0F0F1A",
          border: "1px solid #1E1E36",
          padding: "8px 14px",
          color: "#F0F0FF",
          fontFamily: "var(--font-dm-mono)",
        }}
        onFocus={(e) => (e.target.style.borderColor = ACCENT_BORDER)}
        onBlur={(e) => (e.target.style.borderColor = "#1E1E36")}
      />

      {/* ── Table ── */}
      <div style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead style={{ backgroundColor: "#08080F", borderBottom: "1px solid #1E1E36" }}>
            <tr>
              <th className="py-2 pl-5 text-left"
                style={{ fontFamily: "var(--font-dm-mono)", fontSize: 10, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: "#3A3A5C" }}>Student</th>
              <SortTh col="session" label="Last Session" />
              <SortTh col="tier"    label="Tier" />
              <SortTh col="name"    label="Sessions" />
              <SortTh col="t3"      label="Critical Misconception" />
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((s) => (
                <StudentRow key={s.uid} student={s} onClick={() => openPanel(s)} />
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-12 text-center"
                  style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)", fontSize: 12 }}>
                  No students match "{search}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Student detail panel overlay ── */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          style={{ backgroundColor: "#08080F99" }}
          onClick={(e) => { if (e.target === e.currentTarget) setPanelOpen(false); }}
        >
          <div
            className="h-full flex flex-col overflow-y-auto"
            style={{
              width: 440,
              backgroundColor: "#08080F",
              borderLeft: "1px solid #1E1E36",
            }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between p-6"
              style={{ borderBottom: "1px solid #1E1E36" }}>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center font-black text-base"
                  style={{
                    width: 40, height: 40,
                    backgroundColor: ACCENT_DIM,
                    border: `1px solid ${ACCENT_BORDER}`,
                    color: ACCENT,
                    fontFamily: "var(--font-syne)",
                  }}
                >{selected?.displayName[0]}</div>
                <div>
                  <div className="font-black text-base"
                    style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
                    {selected?.displayName}
                  </div>
                  <div className="text-xs"
                    style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                    {selected?.subjects.join(" · ")} · {selected?.currentTier} · {selected?.streak} day streak
                  </div>
                </div>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="text-xs px-3 py-1.5 transition-all"
                style={{ border: "1px solid #1E1E36", color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#F0F0FF")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#6B6A80")}
              >✕</button>
            </div>

            <div className="p-6 space-y-6">
              {/* T3 Misconceptions */}
              <div>
                <div className="text-xs tracking-widest uppercase mb-3"
                  style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                  T3 Misconceptions — Needs Intervention
                </div>
                {selected?.misconceptions && selected.misconceptions.length > 0 ? (
                  selected.misconceptions.map((m) => (
                    <div key={m} className="p-3 mb-2"
                      style={{ backgroundColor: "#FF3D5710", border: "1px solid #FF3D5730" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold" style={{ color: "#FF3D57", fontFamily: "var(--font-syne)" }}>{m}</span>
                        <span className="text-xs px-2 py-0.5"
                          style={{ backgroundColor: "#FF3D5718", color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}>T3</span>
                      </div>
                      <div className="text-xs mt-1"
                        style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                        Structural error blocking downstream concepts
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                    No T3 misconceptions detected.
                  </p>
                )}
              </div>

              {/* T2 Gaps */}
              <div>
                <div className="text-xs tracking-widest uppercase mb-3"
                  style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                  T2 Gaps — Surface Understanding
                </div>
                {selected?.gaps && selected.gaps.length > 0 ? (
                  selected.gaps.map((g) => (
                    <div key={g} className="p-3 mb-2"
                      style={{ backgroundColor: "#FFB80010", border: "1px solid #FFB80030" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold" style={{ color: "#FFB800", fontFamily: "var(--font-syne)" }}>{g}</span>
                        <span className="text-xs px-2 py-0.5"
                          style={{ backgroundColor: "#FFB80018", color: "#FFB800", fontFamily: "var(--font-dm-mono)" }}>T2</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                    No T2 gaps detected.
                  </p>
                )}
              </div>

              {/* Recent sessions */}
              <div>
                <div className="text-xs tracking-widest uppercase mb-3"
                  style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                  Recent Sessions
                </div>
                <div className="space-y-2">
                  {selectedSessions.map((s) => (
                    <div key={s.id} className="p-3"
                      style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: SUBJECT_COLOR[s.subject] || ACCENT }} />
                        <span className="text-xs font-bold"
                          style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}>{s.subject}</span>
                        <span className="text-xs px-1.5 py-0.5 ml-auto"
                          style={{
                            backgroundColor: `${TIER_COLOR[s.tier]}18`,
                            color: TIER_COLOR[s.tier],
                            fontFamily: "var(--font-dm-mono)",
                          }}>{s.tier}</span>
                      </div>
                      <p className="text-xs truncate mb-1" style={{ color: "#6B6A80" }}>{s.query}</p>
                      <div className="flex gap-3">
                        <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                          {timeAgo(s.createdAt)}
                        </span>
                        <span className="text-xs" style={{ color: "#C8FF0080" }}>{s.conceptsAligned} T1</span>
                        {s.misconceptions > 0 && (
                          <span className="text-xs" style={{ color: "#FF3D5780" }}>{s.misconceptions} T3</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Assign task CTA */}
              <div className="pt-2" style={{ borderTop: "1px solid #1E1E36" }}>
                <button
                  className="w-full py-3 text-xs font-black tracking-widest transition-all"
                  style={{ backgroundColor: ACCENT, color: "#08080F", fontFamily: "var(--font-syne)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  onClick={() => alert(`Opening assignment form for ${selected?.displayName}`)}
                >
                  + ASSIGN PRACTICE TASK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}