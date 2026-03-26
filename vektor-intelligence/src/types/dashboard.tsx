export type TierLevel = "T1" | "T2" | "T3" | "T4";

export interface Session {
  id: string;
  userId: string;
  classId?: string;
  subject: string;
  query: string;
  tier: TierLevel;
  conceptsAligned: number;
  gapsFound: number;
  misconceptions: number;
  duration: number;          // seconds
  createdAt: string;
  dkgVersion: string;
}

export interface DKGProgress {
  subject: string;
  color: string;
  totalNodes: number;
  encounteredNodes: number;
  alignedNodes: number;       // T1
  gapNodes: number;           // T2
  misconceptionNodes: number; // T3
  unknownNodes: number;       // T4
}

export interface AdaptivePathCard {
  id: string;
  subject: string;
  subjectColor: string;
  conceptName: string;
  reason: string;             // why VI recommends this
  blockedBy?: string;         // T3 misconception blocking this
  priority: "high" | "medium" | "low";
}

export interface TeacherTask {
  id: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  title: string;
  subject: string;
  dueDate: string;
  type: "practice" | "quiz" | "review";
  completed: boolean;
  createdAt: string;
}

export interface StreakData {
  current: number;
  longest: number;
  lastActiveDate: string;
}