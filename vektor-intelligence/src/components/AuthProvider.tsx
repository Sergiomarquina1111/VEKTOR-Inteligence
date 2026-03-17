"use client";
import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/store/authstore";
import { getUserFromFirestore } from "@/lib/auth";
import { buildFallbackUser } from "@/lib/auth";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Try Firestore first — fall back to Firebase Auth data if blocked
        const userData = await getUserFromFirestore(firebaseUser.uid);

        if (userData) {
          setUser(userData);
        } else {
          // Firestore blocked (ERR_BLOCKED_BY_CLIENT or network issue)
          // Build a minimal valid user from Firebase Auth so the app
          // still navigates correctly and doesn't get stuck on loading
          const fallback = buildFallbackUser(
            firebaseUser.uid,
            firebaseUser.email ?? "",
            firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "User"
          );
          setUser(fallback);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  return <>{children}</>;
}