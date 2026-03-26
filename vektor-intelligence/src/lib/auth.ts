import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { UserRole, VektorUser } from "@/types/user";

const googleProvider = new GoogleAuthProvider();

// ── Helpers ──────────────────────────────────────────────────────

// Exported so AuthProvider can use it as a fallback when Firestore
// is blocked by ERR_BLOCKED_BY_CLIENT (ad blockers, extensions, etc.)
export function buildFallbackUser(
  uid: string,
  email: string,
  displayName: string,
  role: UserRole = "student"
): VektorUser {
  return {
    uid,
    email,
    displayName: displayName || email.split("@")[0],
    role,
    subjects: [],
    levels: {},
    goal: "",
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
    plan: "free",
  };
}

async function safeGetUser(uid: string): Promise<VektorUser | null> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? (snap.data() as VektorUser) : null;
  } catch (err) {
    console.warn("Firestore read blocked or failed:", err);
    return null;
  }
}

async function safeSaveUser(user: VektorUser): Promise<void> {
  try {
    await setDoc(doc(db, "users", user.uid), user);
  } catch (err) {
    console.warn("Firestore write blocked or failed:", err);
  }
}

// ── Sign up with email ───────────────────────────────────────────
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
  role: UserRole
): Promise<VektorUser> {
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );
  await updateProfile(credential.user, { displayName });

  const userData = buildFallbackUser(
    credential.user.uid,
    email,
    displayName,
    role
  );

  await safeSaveUser(userData);
  return userData;
}

// ── Sign in with email ───────────────────────────────────────────
export async function signInWithEmail(
  email: string,
  password: string
): Promise<VektorUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);

  // Try Firestore up to 3 times
  for (let i = 0; i < 3; i++) {
    const userData = await safeGetUser(credential.user.uid);
    if (userData) return userData;
    await new Promise((r) => setTimeout(r, 500));
  }

  // Firestore unavailable — return fallback so navigation still works
  console.warn("Firestore unavailable — using fallback user object");
  const fallback = buildFallbackUser(
    credential.user.uid,
    credential.user.email!,
    credential.user.displayName || email.split("@")[0],
    "student"
  );

  // Save in background — do not block navigation
  safeSaveUser(fallback);
  return fallback;
}

// ── Sign in with Google ──────────────────────────────────────────
export async function signInWithGoogle(role?: UserRole): Promise<VektorUser> {
  const credential = await signInWithPopup(auth, googleProvider);
  const uid = credential.user.uid;

  const existing = await safeGetUser(uid);
  if (existing) return existing;

  // New Google user — create their document
  const userData = buildFallbackUser(
    uid,
    credential.user.email!,
    credential.user.displayName ||
      credential.user.email!.split("@")[0],
    role || "student"
  );

  await safeSaveUser(userData);
  return userData;
}

// ── Sign out ─────────────────────────────────────────────────────
export async function logOut(): Promise<void> {
  await signOut(auth);
}

// ── Reset password ───────────────────────────────────────────────
export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// ── Get user from Firestore ──────────────────────────────────────
export async function getUserFromFirestore(
  uid: string
): Promise<VektorUser | null> {
  return safeGetUser(uid);
}