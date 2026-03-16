"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
// import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signInWithEmail, signInWithGoogle } from "@/lib/auth";
import { useAuthStore } from "@/store/authstore";
import WebGLCanvas from "@/components/WebGLCanvas";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [firebaseError, setFirebaseError] = useState("");

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setFirebaseError("");
    try {
      const user = await signInWithEmail(data.email, data.password);
      setUser(user);
      router.push(user.onboardingComplete ? "/dashboard" : "/onboarding");
    } catch (err: unknown) {
      console.error("Login error:", err);
      const code = (err as { code?: string })?.code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setFirebaseError("Incorrect email or password.");
      } else if (code === "auth/too-many-requests") {
        setFirebaseError("Too many attempts. Please wait and try again.");
      } else {
        setFirebaseError(`Sign in failed: ${code || "unknown error"}`);
      }
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      const user = await signInWithGoogle();
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
          Welcome back
        </h2>
        <p className="text-sm mb-8" style={{ color: "#6B6A80" }}>
          Sign in to continue your journey.
        </p>

        {/* Google */}
        <button onClick={handleGoogle} disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 py-3 text-sm mb-6 transition-all hover:border-[#6B6A80] disabled:opacity-40"
          style={{ border: "1px solid #1E1E36", color: "#F0F0FF", backgroundColor: "#0F0F1A" }}>
          <svg width="16" height="16" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
          </svg>
          {googleLoading ? "Signing in..." : "Continue with Google"}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px" style={{ backgroundColor: "#1E1E36" }} />
          <span className="text-xs" style={{ color: "#6B6A80" }}>or</span>
          <div className="flex-1 h-px" style={{ backgroundColor: "#1E1E36" }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            <div className="flex justify-between mb-2">
              <span className="text-xs" style={{ color: "#6B6A80" }}>Password</span>
              <Link href="/auth/forgot" className="text-xs transition-colors hover:text-[#C8FF00]"
                style={{ color: "#7B5CFF" }}>Forgot password?</Link>
            </div>
            <input {...register("password")} type="password" placeholder="••••••••"
              className="w-full px-4 py-3 text-sm outline-none transition-all"
              style={{
                backgroundColor: "#0F0F1A", border: `1px solid ${errors.password ? "#FF3D57" : "#1E1E36"}`,
                color: "#F0F0FF",
              }} />
            {errors.password && <p className="text-xs mt-1" style={{ color: "#FF3D57" }}>{errors.password.message}</p>}
          </div>

          {firebaseError && (
            <div className="px-4 py-3 text-xs" style={{ border: "1px solid #FF3D57", color: "#FF3D57", backgroundColor: "#FF3D5710" }}>
              {firebaseError}
            </div>
          )}

          <button type="submit" disabled={isSubmitting}
            className="w-full py-3 text-sm font-black tracking-widest transition-all hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}>
            {isSubmitting ? "SIGNING IN..." : "SIGN IN →"}
          </button>
        </form>

        <p className="text-center text-xs mt-8" style={{ color: "#6B6A80" }}>
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="transition-colors hover:text-[#C8FF00]"
            style={{ color: "#F0F0FF" }}>Create one free</Link>
        </p>
      </div>

      {/* RIGHT — WebGL Panel */}
      <div className="hidden lg:flex flex-1 relative flex-col items-center justify-center overflow-hidden">
        <WebGLCanvas />
        <div className="relative z-10 text-center px-12">
          <div className="inline-block px-3 py-1 mb-6 text-xs tracking-widest uppercase"
            style={{ border: "1px solid #C8FF0040", color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}>
            Knowledge Graph Engine
          </div>
          <h3 className="text-4xl font-black mb-4 leading-tight"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
            Direction for<br />
            <span style={{ color: "#C8FF00" }}>every mind.</span>
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: "#6B6A80", maxWidth: "360px" }}>
            Your personal knowledge graph is waiting. Every session maps your understanding and shows you exactly where to go next.
          </p>
        </div>
      </div>

    </div>
  );
}