/**
 * src/lib/firestore.ts
 * VEKTOR Intelligence — Firestore query helpers for student dashboard
 *
 * All functions match the exact types in src/types/dashboard.ts:
 *   - Session.gapsFound   → number  (count, not array)
 *   - Session.misconceptions → number (count, not array)
 *   - Subject keys use underscore: "computer_science" not "computer science"
 *
 * Adaptive path is derived from tier history until FastAPI is live (Session 8).
 * Replace deriveAdaptivePathCards() with GET /api/adaptive-path then.
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  Session,
  DKGProgress,
  AdaptivePathCard,
  StreakData,
} from "@/types/dashboard";

// ─────────────────────────────────────────────────────────────────
// STATIC SUBJECT META
// Total node counts match the product spec and DKG seeds in
// backend/dkg/*.json. Update when new DKG versions are published.
// ─────────────────────────────────────────────────────────────────

const SUBJECT_META: Record<string, { color: string; totalNodes: number }> = {
  mathematics:      { color: "#C8FF00", totalNodes: 847 },
  physics:          { color: "#5B3FCC", totalNodes: 763 },
  chemistry:        { color: "#006677", totalNodes: 620 },
  biology:          { color: "#3A6B00", totalNodes: 710 },
  computer_science: { color: "#7A5200", totalNodes: 731 },
};

const SUBJECT_LABELS: Record<string, string> = {
  mathematics:      "Mathematics",
  physics:          "Physics",
  chemistry:        "Chemistry",
  biology:          "Biology",
  computer_science: "Computer Science",
};

// ─────────────────────────────────────────────────────────────────
// 1. RECENT SESSIONS
// Requires Firestore composite index: sessions → userId ASC, createdAt DESC
// Add to firestore.indexes.json and run: firebase deploy --only firestore:indexes
// ─────────────────────────────────────────────────────────────────

export async function getRecentSessions(
  userId: string,
  count = 50
): Promise<Session[]> {
  const q = query(
    collection(db, "sessions"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(count)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id:              d.id,
      userId:          data.userId ?? userId,
      classId:         data.classId ?? undefined,
      subject:         data.subject ?? "mathematics",
      query:           data.query ?? "",
      tier:            data.tier ?? "T4",
      conceptsAligned: data.conceptsAligned ?? 0,
      gapsFound:       data.gapsFound ?? 0,       // number — count of gap concepts
      misconceptions:  data.misconceptions ?? 0,  // number — count of T3 concepts
      duration:        data.duration ?? 0,
      createdAt:       toISO(data.createdAt),
      dkgVersion:      data.dkgVersion ?? "1.0.0",
    } satisfies Session;
  });
}

// ─────────────────────────────────────────────────────────────────
// 2. DKG PROGRESS
// Aggregates session counts per subject into ring data.
// Once the backend writes alignedConcepts/gapConcepts arrays to
// session docs (Session 8), replace the reduce() calls here with
// Set-based deduplication on those arrays instead.
// ─────────────────────────────────────────────────────────────────

export async function getDKGProgress(
  userId: string,
  subjects: string[]
): Promise<DKGProgress[]> {
  if (!subjects.length) return [];

  const q = query(
    collection(db, "sessions"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(200)
  );

  const snap = await getDocs(q);
  const allSessions = snap.docs.map((d) => d.data());

  return subjects.map((subject) => {
    const meta = SUBJECT_META[subject] ?? { color: "#6B6A80", totalNodes: 500 };
    const ss   = allSessions.filter((s) => s.subject === subject);

    const alignedNodes       = ss.reduce((n, s) => n + (s.conceptsAligned ?? 0), 0);
    const gapNodes           = ss.reduce((n, s) => n + (s.gapsFound      ?? 0), 0);
    const misconceptionNodes = ss.reduce((n, s) => n + (s.misconceptions ?? 0), 0);
    const encounteredNodes   = alignedNodes + gapNodes + misconceptionNodes;
    const unknownNodes       = Math.max(0, meta.totalNodes - encounteredNodes);

    return {
      subject,
      color:               meta.color,
      totalNodes:          meta.totalNodes,
      encounteredNodes:    Math.min(encounteredNodes, meta.totalNodes),
      alignedNodes:        Math.min(alignedNodes, meta.totalNodes),
      gapNodes:            Math.min(gapNodes, meta.totalNodes),
      misconceptionNodes:  Math.min(misconceptionNodes, meta.totalNodes),
      unknownNodes,
    } satisfies DKGProgress;
  });
}

// ─────────────────────────────────────────────────────────────────
// 3. ADAPTIVE PATH CARDS (client-side, tier-signal based)
//
// gapsFound/misconceptions are counts not concept names, so we
// derive subject-level recommendations from tier patterns:
//   T3 sessions in a subject → high priority
//   T2 sessions              → medium priority
//   T1 only                  → low priority (advance)
//   No sessions yet          → low priority (start)
//
// Replace entirely with GET /api/adaptive-path after Railway (Session 8).
// ─────────────────────────────────────────────────────────────────

export function deriveAdaptivePathCards(
  sessions: Session[],
  userSubjects: string[],
  count = 3
): AdaptivePathCard[] {
  type Signal = {
    subject:        string;
    worstTierRank:  number;  // T3=3, T2=2, T1=1, T4=0, none=-1
    totalT3:        number;
    totalT2:        number;
    lastQuery:      string;
  };

  const tierRank: Record<string, number> = { T3: 3, T2: 2, T1: 1, T4: 0 };

  // Seed all user subjects
  const map = new Map<string, Signal>();
  for (const subject of userSubjects) {
    map.set(subject, {
      subject, worstTierRank: -1, totalT3: 0, totalT2: 0, lastQuery: "",
    });
  }

  // Accumulate session signals
  for (const s of sessions) {
    const prev = map.get(s.subject) ?? {
      subject: s.subject, worstTierRank: -1, totalT3: 0, totalT2: 0, lastQuery: "",
    };
    map.set(s.subject, {
      subject:       s.subject,
      worstTierRank: Math.max(prev.worstTierRank, tierRank[s.tier] ?? 0),
      totalT3:       prev.totalT3 + s.misconceptions,
      totalT2:       prev.totalT2 + s.gapsFound,
      lastQuery:     prev.lastQuery || s.query,
    });
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const cards: AdaptivePathCard[] = [];

  for (const sig of map.values()) {
    const color = SUBJECT_META[sig.subject]?.color ?? "#C8FF00";
    const label = SUBJECT_LABELS[sig.subject] ?? sig.subject;

    if (sig.worstTierRank === 3) {
      cards.push({
        id:           `ap-t3-${sig.subject}`,
        subject:      sig.subject,
        subjectColor: color,
        conceptName:  `${label} — misconception review`,
        reason:       `${sig.totalT3} misconception${sig.totalT3 !== 1 ? "s" : ""} detected across your ${label} sessions. Resolving these unblocks downstream concepts.`,
        blockedBy:    sig.lastQuery ? truncate(sig.lastQuery, 50) : undefined,
        priority:     "high",
      });
    } else if (sig.worstTierRank === 2) {
      cards.push({
        id:           `ap-t2-${sig.subject}`,
        subject:      sig.subject,
        subjectColor: color,
        conceptName:  `${label} — gap practice`,
        reason:       `${sig.totalT2} knowledge gap${sig.totalT2 !== 1 ? "s" : ""} found in your ${label} sessions. Targeted practice will improve your alignment score.`,
        priority:     "medium",
      });
    } else if (sig.worstTierRank === 1) {
      cards.push({
        id:           `ap-t1-${sig.subject}`,
        subject:      sig.subject,
        subjectColor: color,
        conceptName:  `${label} — advance further`,
        reason:       `Your ${label} understanding is well-aligned. Push into more advanced concepts to expand your knowledge graph.`,
        priority:     "low",
      });
    } else {
      // No sessions yet
      cards.push({
        id:           `ap-new-${sig.subject}`,
        subject:      sig.subject,
        subjectColor: color,
        conceptName:  `Start ${label}`,
        reason:       `You haven't explored ${label} yet. Ask your first question to begin mapping your understanding.`,
        priority:     "low",
      });
    }
  }

  cards.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  return cards.slice(0, count);
}

// ─────────────────────────────────────────────────────────────────
// 4. STREAK (no extra Firestore read — computed from session list)
// ─────────────────────────────────────────────────────────────────

export function computeStreakData(sessions: Session[]): StreakData {
  if (!sessions.length) {
    return { current: 0, longest: 0, lastActiveDate: "" };
  }

  const dates = [...new Set(sessions.map((s) => s.createdAt.slice(0, 10)))]
    .sort((a, b) => b.localeCompare(a)); // newest first

  // Current streak — consecutive days back from today
  const today = new Date().toISOString().slice(0, 10);
  let current = 0;
  let cursor  = today;
  for (const date of dates) {
    if (date === cursor) {
      current++;
      const d = new Date(cursor);
      d.setDate(d.getDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    } else if (date < cursor) {
      break; // gap in dates — streak over
    }
  }

  // Longest streak — walk all unique dates
  let longest = current;
  let run     = 1;
  for (let i = 1; i < dates.length; i++) {
    const dayDiff = Math.round(
      (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) /
        86400000
    );
    if (dayDiff === 1) {
      longest = Math.max(longest, ++run);
    } else {
      run = 1;
    }
  }

  return { current, longest, lastActiveDate: dates[0] ?? "" };
}

// ─────────────────────────────────────────────────────────────────
// 5. STAT CARDS
// ─────────────────────────────────────────────────────────────────

export function computeStatCards(sessions: Session[]) {
  return {
    totalSessions:   sessions.length,
    conceptsAligned: sessions.reduce((n, s) => n + (s.conceptsAligned ?? 0), 0),
    activeSubjects:  new Set(sessions.map((s) => s.subject)).size,
    openT3Flags:     sessions.filter((s) => s.tier === "T3").length,
  };
}

// ─────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────

function toISO(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "seconds" in value) {
    return new Date((value as { seconds: number }).seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n) + "…" : str;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}