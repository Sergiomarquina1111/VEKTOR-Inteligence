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

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
  role: UserRole
) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });

  const userData: VektorUser = {
    uid: credential.user.uid,
    email,
    displayName,
    role,
    subjects: [],
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
    plan: "free",
  };

  await setDoc(doc(db, "users", credential.user.uid), userData);
  return userData;
}

export async function signInWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  
  // Retry up to 3 times in case Firestore is slow
  for (let i = 0; i < 3; i++) {
    const snap = await getDoc(doc(db, "users", credential.user.uid));
    if (snap.exists()) {
      return snap.data() as VektorUser;
    }
    // Wait 500ms before retrying
    await new Promise((r) => setTimeout(r, 500));
  }

  // Firestore doc missing — create a fallback from Firebase Auth data
  const fallback: VektorUser = {
    uid: credential.user.uid,
    email: credential.user.email!,
    displayName: credential.user.displayName || email.split("@")[0],
    role: "student",
    subjects: [],
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
    plan: "free",
  };

  // Write the missing doc so it exists next time
  await setDoc(doc(db, "users", credential.user.uid), fallback);
  return fallback;
}

export async function signInWithGoogle(role?: UserRole) {
  const credential = await signInWithPopup(auth, googleProvider);
  const userRef = doc(db, "users", credential.user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    const userData: VektorUser = {
      uid: credential.user.uid,
      email: credential.user.email!,
      displayName: credential.user.displayName!,
      role: role || "student",
      subjects: [],
      onboardingComplete: false,
      createdAt: new Date().toISOString(),
      plan: "free",
    };
    await setDoc(userRef, userData);
    return userData;
  }

  return snap.data() as VektorUser;
}

export async function logOut() {
  await signOut(auth);
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export async function getUserFromFirestore(uid: string): Promise<VektorUser | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as VektorUser) : null;
}