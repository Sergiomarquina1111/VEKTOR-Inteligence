export type UserRole = "student" | "teacher" | "researcher" | "admin";

export interface VektorUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  subjects: string[];
  onboardingComplete: boolean;
  createdAt: string;
  plan: "free" | "pro";
}