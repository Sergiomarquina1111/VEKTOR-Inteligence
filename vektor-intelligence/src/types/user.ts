// ── Role ──────────────────────────────────────────────────────────
export type UserRole = "student" | "teacher" | "researcher" | "admin";

// ── Core user type ────────────────────────────────────────────────
export interface VektorUser {
  // Core fields — all roles
  uid:                string;
  email:              string;
  displayName:        string;
  role:               UserRole;
  subjects:           string[];
  levels:             Record<string, number>; // 0–4 per subject
  goal:               string;
  onboardingComplete: boolean;
  createdAt:          string; // ISO timestamp
  plan:               "free" | "pro";

  // ── Student-specific ──────────────────────────────────────────
  classId?:         string;   // null = solo mode
  teacherId?:       string;   // null = solo mode
  streak?:          number;
  lastActiveDate?:  string;

  // ── Teacher-specific ──────────────────────────────────────────
  classIds?:        string[];
  researcherId?:    string;   // researcher they inherit DKGs from

  // ── Researcher-specific ───────────────────────────────────────
  publishedDKGs?:   string[]; // DKG IDs they own
  institution?:     string;
  domains?:         string[];
}