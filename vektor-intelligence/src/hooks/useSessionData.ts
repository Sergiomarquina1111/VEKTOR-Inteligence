"use client";

/**
 * src/hooks/useSessionData.ts
 * VEKTOR Intelligence — Student dashboard data hook
 *
 * Takes NO arguments. Reads user from authStore internally.
 * Call as: const { sessions, dkgProgress, ... } = useSessionData();
 */

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/store/authstore";
import type { Session, DKGProgress, AdaptivePathCard, StreakData } from "@/types/dashboard";
import {
  getRecentSessions,
  getDKGProgress,
  deriveAdaptivePathCards,
  computeStreakData,
  computeStatCards,
} from "@/lib/firestore";

// ── Return types ───────────────────────────────────────────────────

export interface StatCards {
  totalSessions:   number;
  conceptsAligned: number;
  activeSubjects:  number;
  openT3Flags:     number;
}

export interface DashboardData {
  sessions:     Session[];
  dkgProgress:  DKGProgress[];
  adaptivePath: AdaptivePathCard[];
  streak:       StreakData;
  stats:        StatCards;
  loading:      boolean;
  error:        string | null;
  refresh:      () => void;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useSessionData(): DashboardData {
  // Reads user from Zustand store — no argument needed
  const { user } = useAuthStore();

  const [sessions,     setSessions]     = useState<Session[]>([]);
  const [dkgProgress,  setDkgProgress]  = useState<DKGProgress[]>([]);
  const [adaptivePath, setAdaptivePath] = useState<AdaptivePathCard[]>([]);
  const [streak,       setStreak]       = useState<StreakData>({ current: 0, longest: 0, lastActiveDate: "" });
  const [stats,        setStats]        = useState<StatCards>({ totalSessions: 0, conceptsAligned: 0, activeSubjects: 0, openT3Flags: 0 });
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  const subjectsKey = user?.subjects?.join(",") ?? "";

  const load = useCallback(async () => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const subjects = user.subjects ?? [];

      const fetchedSessions = await getRecentSessions(user.uid, 50);
      setSessions(fetchedSessions);

      const progress = await getDKGProgress(user.uid, subjects);
      setDkgProgress(progress);

    setAdaptivePath(deriveAdaptivePathCards(fetchedSessions, subjects, 3));
    setStreak(computeStreakData(fetchedSessions));
    setStats(computeStatCards(fetchedSessions));
    } catch (err) {
      console.error("[useSessionData]", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load your data. Please refresh."
      );
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, subjectsKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { sessions, dkgProgress, adaptivePath, streak, stats, loading, error, refresh: load };
}