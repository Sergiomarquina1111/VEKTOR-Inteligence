"use client";
import { useEffect, useState } from "react";
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/store/authstore";

const ACCENT        = "#7B5CFF";
const ACCENT_DIM    = "#7B5CFF15";
const ACCENT_BORDER = "#7B5CFF35";

type TaskType = "practice" | "quiz" | "review";

interface Task {
  id:          string;
  title:       string;
  subject:     string;
  dueDate:     string;
  type:        TaskType;
  conceptIds:  string[];
  createdAt:   string;
  completedBy: string[];  // student UIDs
  assignedTo:  string[];  // student UIDs or "all"
  totalStudents: number;
}

// ── Mock tasks ─────────────────────────────────────────────────────
// REPLACE: query(collection(db,"classes/{classId}"), tasks subcollection)
const MOCK_TASKS: Task[] = [
  {
    id: "t1", title: "Eigenvalue Drills", subject: "Mathematics", type: "practice",
    dueDate: "2026-03-22", conceptIds: ["Eigenvalues","Eigenvectors"],
    createdAt: new Date(Date.now()-2*86400000).toISOString(),
    completedBy: ["s1","s2","s3","s6","s7","s8","s4","s5","s9","s10"],
    assignedTo: ["all"], totalStudents: 28,
  },
  {
    id: "t2", title: "Matrix Operations Quiz", subject: "Mathematics", type: "quiz",
    dueDate: "2026-03-20", conceptIds: ["Matrix Mult.","Determinants","Inverse"],
    createdAt: new Date(Date.now()-3*86400000).toISOString(),
    completedBy: Array.from({length:22}, (_,i) => `s${i+1}`),
    assignedTo: ["all"], totalStudents: 28,
  },
  {
    id: "t3", title: "Linear Independence Review", subject: "Mathematics", type: "review",
    dueDate: "2026-03-25", conceptIds: ["Linear Indep.","Basis","Span"],
    createdAt: new Date(Date.now()-86400000).toISOString(),
    completedBy: ["s2","s3","s6"],
    assignedTo: ["all"], totalStudents: 28,
  },
  {
    id: "t4", title: "Orthogonality Set", subject: "Mathematics", type: "practice",
    dueDate: "2026-03-28", conceptIds: ["Orthogonality","Projections"],
    createdAt: new Date(Date.now()-1800000).toISOString(),
    completedBy: [],
    assignedTo: ["all"], totalStudents: 28,
  },
];

const CONCEPT_OPTIONS = [
  "Vectors","Dot Product","Matrix Mult.","Determinants","Eigenvalues","Eigenvectors",
  "Linear Indep.","Basis","Rank","Null Space","Orthogonality","Projections",
  "Diagonalization","SVD","Trace","Inverse","Transpose","Row Echelon",
];

const TYPE_COLOR: Record<TaskType, string> = {
  practice: "#00E5FF",
  quiz:     "#C8FF00",
  review:   "#FFB800",
};

function TaskCard({ task, onDelete }: { task: Task; onDelete: (id: string) => void }) {
  const pct        = Math.round((task.completedBy.length / task.totalStudents) * 100);
  const isPast     = new Date(task.dueDate) < new Date();
  const daysLeft   = Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / 86400000);

  return (
    <div className="p-5" style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs px-2 py-0.5 tracking-widest uppercase"
            style={{
              backgroundColor: `${TYPE_COLOR[task.type]}15`,
              color: TYPE_COLOR[task.type],
              fontFamily: "var(--font-dm-mono)",
              border: `1px solid ${TYPE_COLOR[task.type]}30`,
            }}
          >{task.type}</span>
          <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
            {task.subject}
          </span>
        </div>
        <button
          onClick={() => onDelete(task.id)}
          className="text-xs transition-colors"
          style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#FF3D57")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#3A3A5C")}
        >✕</button>
      </div>

      <h3 className="font-black text-base mb-2"
        style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>{task.title}</h3>

      {/* Concepts */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {task.conceptIds.map((c) => (
          <span key={c} className="text-xs px-2 py-0.5"
            style={{ backgroundColor: ACCENT_DIM, color: ACCENT, border: `1px solid ${ACCENT_BORDER}`,
              fontFamily: "var(--font-dm-mono)", fontSize: 10 }}
          >{c}</span>
        ))}
      </div>

      {/* Completion bar */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-1.5 overflow-hidden" style={{ backgroundColor: "#1E1E36" }}>
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: pct === 100 ? "#C8FF00" : ACCENT }}
          />
        </div>
        <span className="text-xs flex-shrink-0"
          style={{ color: pct === 100 ? "#C8FF00" : "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
          {task.completedBy.length}/{task.totalStudents}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
          Due {new Date(task.dueDate).toLocaleDateString("en-US", { month:"short", day:"numeric" })}
        </span>
        <span className="text-xs"
          style={{ color: isPast ? "#FF3D57" : daysLeft <= 2 ? "#FFB800" : "#3A3A5C",
            fontFamily: "var(--font-dm-mono)" }}>
          {isPast ? "Overdue" : `${daysLeft}d left`}
        </span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════
export default function TeacherAssignmentsPage() {
  const { user }                          = useAuthStore();
  const [tasks, setTasks]                 = useState<Task[]>(MOCK_TASKS);
  const [showForm, setShowForm]           = useState(false);
  const [filterType, setFilterType]       = useState<TaskType|"all">("all");

  // New task form state
  const [newTitle,     setNewTitle]       = useState("");
  const [newSubject,   setNewSubject]     = useState("Mathematics");
  const [newType,      setNewType]        = useState<TaskType>("practice");
  const [newDue,       setNewDue]         = useState("");
  const [newConcepts,  setNewConcepts]    = useState<string[]>([]);
  const [saving,       setSaving]         = useState(false);

  // ── Firestore: live tasks listener ────────────────────────────
  // REPLACE: onSnapshot on classes/{classId} to watch tasks array
  // or a subcollection tasks/ under the class doc

  function toggleConcept(c: string) {
    setNewConcepts((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  async function handleCreate() {
    if (!newTitle.trim() || !newDue || newConcepts.length === 0) return;
    setSaving(true);

    const task: Task = {
      id:            `t${Date.now()}`,
      title:         newTitle,
      subject:       newSubject,
      type:          newType,
      dueDate:       newDue,
      conceptIds:    newConcepts,
      createdAt:     new Date().toISOString(),
      completedBy:   [],
      assignedTo:    ["all"],
      totalStudents: 28, // REPLACE: from class doc
    };

    // REPLACE: addDoc(collection(db,"classes/{classId}/tasks"), {...task})
    setTasks((prev) => [task, ...prev]);
    setNewTitle(""); setNewDue(""); setNewConcepts([]); setShowForm(false);
    setSaving(false);
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    // REPLACE: deleteDoc(doc(db,"classes/{classId}/tasks",id))
  }

  const filtered = tasks.filter((t) => filterType === "all" || t.type === filterType);
  const active   = tasks.filter((t) => new Date(t.dueDate) >= new Date());
  const past     = tasks.filter((t) => new Date(t.dueDate) < new Date());

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-6 h-px" style={{ backgroundColor: ACCENT }} />
            <span className="text-xs tracking-widest uppercase"
              style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}>Assignments</span>
          </div>
          <h1 className="text-2xl font-black"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>Assignments</h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 text-xs font-black tracking-widest transition-all"
          style={{ backgroundColor: ACCENT, color: "#08080F", fontFamily: "var(--font-syne)" }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >+ NEW ASSIGNMENT</button>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-1">
        {(["all","practice","quiz","review"] as const).map((t) => (
          <button key={t}
            onClick={() => setFilterType(t)}
            className="px-3 py-1.5 text-xs tracking-widest uppercase transition-all"
            style={{
              backgroundColor: filterType === t ? ACCENT_DIM : "transparent",
              border: filterType === t ? `1px solid ${ACCENT_BORDER}` : "1px solid #1E1E36",
              color: filterType === t ? ACCENT : "#6B6A80",
              fontFamily: "var(--font-dm-mono)",
            }}
          >{t}</button>
        ))}
      </div>

      {/* ── Create form ── */}
      {showForm && (
        <div className="p-6 space-y-5"
          style={{ backgroundColor: "#0F0F1A", border: `1px solid ${ACCENT_BORDER}` }}>
          <div className="flex items-center justify-between">
            <h2 className="font-black text-sm"
              style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>New Assignment</h2>
            <button onClick={() => setShowForm(false)}
              className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>✕</button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs tracking-widest uppercase mb-2"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Title</div>
              <input
                value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Assignment title..."
                className="w-full outline-none text-sm px-3 py-2"
                style={{ backgroundColor: "#08080F", border: "1px solid #1E1E36", color: "#F0F0FF",
                  fontFamily: "var(--font-syne)" }}
                onFocus={(e) => (e.target.style.borderColor = ACCENT_BORDER)}
                onBlur={(e) => (e.target.style.borderColor = "#1E1E36")}
              />
            </div>
            <div>
              <div className="text-xs tracking-widest uppercase mb-2"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Due Date</div>
              <input
                type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)}
                className="w-full outline-none text-sm px-3 py-2"
                style={{ backgroundColor: "#08080F", border: "1px solid #1E1E36", color: "#F0F0FF",
                  fontFamily: "var(--font-dm-mono)", colorScheme: "dark" }}
                onFocus={(e) => (e.target.style.borderColor = ACCENT_BORDER)}
                onBlur={(e) => (e.target.style.borderColor = "#1E1E36")}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs tracking-widest uppercase mb-2"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Type</div>
              <div className="flex gap-2">
                {(["practice","quiz","review"] as const).map((t) => (
                  <button key={t}
                    onClick={() => setNewType(t)}
                    className="px-3 py-1.5 text-xs tracking-widest uppercase flex-1 transition-all"
                    style={{
                      backgroundColor: newType === t ? `${TYPE_COLOR[t]}15` : "transparent",
                      border: newType === t ? `1px solid ${TYPE_COLOR[t]}50` : "1px solid #1E1E36",
                      color: newType === t ? TYPE_COLOR[t] : "#6B6A80",
                      fontFamily: "var(--font-dm-mono)",
                    }}
                  >{t}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs tracking-widest uppercase mb-2"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Subject</div>
              <select value={newSubject} onChange={(e) => setNewSubject(e.target.value)}
                className="w-full text-sm px-3 py-2 outline-none"
                style={{ backgroundColor: "#08080F", border: "1px solid #1E1E36", color: "#F0F0FF",
                  fontFamily: "var(--font-dm-mono)" }}>
                {["Mathematics","Physics","Chemistry","Biology","Computer Science"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="text-xs tracking-widest uppercase mb-2"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
              Target Concept Nodes ({newConcepts.length} selected)
            </div>
            <div className="flex flex-wrap gap-2">
              {CONCEPT_OPTIONS.map((c) => (
                <button key={c}
                  onClick={() => toggleConcept(c)}
                  className="text-xs px-2 py-1 transition-all"
                  style={{
                    backgroundColor: newConcepts.includes(c) ? ACCENT_DIM : "transparent",
                    border: newConcepts.includes(c) ? `1px solid ${ACCENT_BORDER}` : "1px solid #1E1E36",
                    color: newConcepts.includes(c) ? ACCENT : "#6B6A80",
                    fontFamily: "var(--font-dm-mono)",
                  }}
                >{c}</button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 text-xs tracking-widest uppercase transition-all"
              style={{ border: "1px solid #1E1E36", color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#F0F0FF")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#6B6A80")}
            >Cancel</button>
            <button
              onClick={handleCreate} disabled={saving}
              className="flex-1 py-2.5 text-xs font-black tracking-widest uppercase transition-all"
              style={{ backgroundColor: ACCENT, color: "#08080F", fontFamily: "var(--font-syne)",
                opacity: saving ? 0.6 : 1 }}
            >{saving ? "Saving..." : "Create Assignment"}</button>
          </div>
        </div>
      )}

      {/* ── Active assignments ── */}
      {filtered.filter((t) => new Date(t.dueDate) >= new Date()).length > 0 && (
        <div>
          <div className="text-xs tracking-widest uppercase mb-3"
            style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
            Active — {active.length} assignments
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered
              .filter((t) => new Date(t.dueDate) >= new Date())
              .map((t) => <TaskCard key={t.id} task={t} onDelete={handleDelete} />)
            }
          </div>
        </div>
      )}

      {/* ── Past assignments ── */}
      {filtered.filter((t) => new Date(t.dueDate) < new Date()).length > 0 && (
        <div>
          <div className="text-xs tracking-widest uppercase mb-3"
            style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
            Past — {past.length} assignments
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ opacity: 0.6 }}>
            {filtered
              .filter((t) => new Date(t.dueDate) < new Date())
              .map((t) => <TaskCard key={t.id} task={t} onDelete={handleDelete} />)
            }
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3"
          style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
          <span style={{ color: ACCENT, fontSize: 28 }}>✦</span>
          <p className="text-xs" style={{ color: "#6B6A80" }}>No assignments yet.</p>
          <button onClick={() => setShowForm(true)}
            className="text-xs px-4 py-2 transition-all"
            style={{ backgroundColor: ACCENT, color: "#08080F", fontFamily: "var(--font-dm-mono)" }}>
            Create first assignment →
          </button>
        </div>
      )}
    </div>
  );
}