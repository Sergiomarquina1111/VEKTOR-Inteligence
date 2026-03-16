"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signUpWithEmail, signInWithGoogle } from "@/lib/auth";
import { useAuthStore } from "@/store/authstore";
import { UserRole } from "@/types/user";
import WebGLCanvas from "@/components/WebGLCanvas";

const schema = z.object({
  displayName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type FormData = z.infer<typeof schema>;

const ROLES: { value: UserRole; label: string; icon: string }[] = [
  { value: "student", label: "Student", icon: "◈" },
  { value: "teacher", label: "Teacher", icon: "◇" },
  { value: "researcher", label: "Researcher", icon: "◉" },
];

export default function SignupPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [role, setRole] = useState<UserRole>("student");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [firebaseError, setFirebaseError] = useState("");

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setFirebaseError("");
    try {
      const user = await signUpWithEmail(data.email, data.password, data.displayName, role);
      setUser(user);
      router.push("/onboarding");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/email-already-in-use") {
        setFirebaseError("This email is already registered.");
      } else {
        setFirebaseError("Something went wrong. Please try again.");
      }
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      const user = await signInWithGoogle(role);
      setUser(user);
      router.push(user.onboardingComplete ? "/dashboard" : "/onboarding");
    } catch {
      setFirebaseError("Google sign-in failed.");
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#08080F" }}>

      {/* LEFT — Form Panel */}
      <div className="relative w-full lg:w-[480px] flex flex-col justify-center px-10 py-12 z-10"
        style={{ backgroundColor: "#08080F", borderRight: "1px solid #1E1E36" }}>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          {/* VI emblem */}
          <div className="relative flex items-center justify-center"
            style={{ width: 40, height: 40, border: "1px solid #C8FF0040", backgroundColor: "#0F0F1A" }}>
            <span className="font-black text-lg leading-none"
              style={{ fontFamily: "var(--font-syne)", color: "#C8FF00" }}>VI</span>
          </div>
          <div>
            <div className="text-sm font-black tracking-widest"
              style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>VEKTOR</div>
            <div className="text-xs tracking-widest" style={{ color: "#6B6A80" }}>INTELLIGENCE</div>
          </div>
        </div>

        <h2 className="text-2xl font-black mb-1"
          style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
          Create account
        </h2>
        <p className="text-sm mb-8" style={{ color: "#6B6A80" }}>
          Join VEKTOR — direction for every mind.
        </p>

        {/* Role selector */}
        <div className="mb-6">
          <p className="text-xs mb-3 tracking-widest uppercase"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>I am a</p>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button key={r.value} type="button" onClick={() => setRole(r.value)}
                className="flex flex-col items-center gap-1.5 py-3 text-center transition-all duration-200"
                style={{
                  border: `1px solid ${role === r.value ? "#C8FF00" : "#1E1E36"}`,
                  backgroundColor: role === r.value ? "#C8FF0010" : "#0F0F1A",
                  color: role === r.value ? "#C8FF00" : "#6B6A80",
                }}>
                <span className="text-base">{r.icon}</span>
                <span className="text-xs font-medium" style={{ fontFamily: "var(--font-syne)" }}>
                  {r.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mb-4">
          <div>
            <input {...register("displayName")} type="text" placeholder="Full name"
              className="w-full px-4 py-3 text-sm outline-none transition-all"
              style={{
                backgroundColor: "#0F0F1A", border: `1px solid ${errors.displayName ? "#FF3D57" : "#1E1E36"}`,
                color: "#F0F0FF",
              }} />
            {errors.displayName && <p className="text-xs mt-1" style={{ color: "#FF3D57" }}>{errors.displayName.message}</p>}
          </div>
          <div>
            <input {...register("email")} type="email" placeholder="Email address"
              className="w-full px-4 py-3 text-sm outline-none transition-all"
              style={{
                backgroundColor: "#0F0F1A", border: `1px solid ${errors.email ? "#FF3D57" : "#1E1E36"}`,
                color: "#F0F0FF",
              }} />
            {errors.email && <p className="text-xs mt-1" style={{ color: "#FF3D57" }}>{errors.email.message}</p>}
          </div>
          <div>
            <input {...register("password")} type="password" placeholder="Password (min. 6 chars)"
              className="w-full px-4 py-3 text-sm outline-none transition-all"
              style={{
                backgroundColor: "#0F0F1A", border: `1px solid ${errors.password ? "#FF3D57" : "#1E1E36"}`,
                color: "#F0F0FF",
              }} />
            {errors.password && <p className="text-xs mt-1" style={{ color: "#FF3D57" }}>{errors.password.message}</p>}
          </div>

          {firebaseError && (
            <div className="px-4 py-3 text-xs" style={{ border: "1px solid #FF3D57", color: "#FF3D57", backgroundColor: "#FF3D5710" }}>
              {firebaseError}{" "}
              {firebaseError.includes("already registered") && (
                <Link href="/auth/login" style={{ color: "#C8FF00" }}>Sign in →</Link>
              )}
            </div>
          )}

          <button type="submit" disabled={isSubmitting}
            className="w-full py-3 text-sm font-black tracking-widest transition-all hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}>
            {isSubmitting ? "CREATING..." : "CREATE ACCOUNT →"}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px" style={{ backgroundColor: "#1E1E36" }} />
          <span className="text-xs" style={{ color: "#6B6A80" }}>or</span>
          <div className="flex-1 h-px" style={{ backgroundColor: "#1E1E36" }} />
        </div>

        {/* Google */}
        <button onClick={handleGoogle} disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 py-3 text-sm transition-all hover:border-[#6B6A80] disabled:opacity-40"
          style={{ border: "1px solid #1E1E36", color: "#F0F0FF", backgroundColor: "#0F0F1A" }}>
          <svg width="16" height="16" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
          </svg>
          {googleLoading ? "Signing up..." : "Continue with Google"}
        </button>

        <p className="text-center text-xs mt-6" style={{ color: "#6B6A80" }}>
          Already have an account?{" "}
          <Link href="/auth/login" className="transition-colors hover:text-[#C8FF00]"
            style={{ color: "#F0F0FF" }}>Sign in</Link>
        </p>
      </div>

      {/* RIGHT — WebGL Animation Panel */}
      <div className="hidden lg:flex flex-1 relative flex-col items-center justify-center overflow-hidden">
        <WebGLCanvas />

        {/* Overlay content */}
        <div className="relative z-10 text-center px-12">
          <div className="inline-block px-3 py-1 mb-6 text-xs tracking-widest uppercase"
            style={{ border: "1px solid #C8FF0040", color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}>
            Live Knowledge Graph
          </div>
          <h3 className="text-4xl font-black mb-4 leading-tight"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
            See the shape of<br />
            <span style={{ color: "#C8FF00" }}>your understanding.</span>
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: "#6B6A80", maxWidth: "360px" }}>
            VEKTOR maps what you believe against what is correct — and gives you the exact direction to close the gap.
          </p>

          {/* Stat pills */}
          <div className="flex gap-4 justify-center mt-10">
            {[
              { val: "5", label: "STEM subjects" },
              { val: "T1–T4", label: "Knowledge tiers" },
              { val: "AI", label: "Powered tutor" },
            ].map((s) => (
              <div key={s.label} className="px-4 py-2 text-center"
                style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A80" }}>
                <div className="text-lg font-black" style={{ fontFamily: "var(--font-syne)", color: "#C8FF00" }}>
                  {s.val}
                </div>
                <div className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}