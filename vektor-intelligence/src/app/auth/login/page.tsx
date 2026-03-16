"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signInWithEmail, signInWithGoogle } from "@/lib/auth";
import { useAuthStore } from "@/store/authstore";
import AuthSymbols from "@/components/webgl/AuthSymbols";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "At least 6 characters"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [firebaseError, setFirebaseError] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setFirebaseError("");
    try {
      const user = await signInWithEmail(data.email, data.password);
      setUser(user);
      router.push(user.onboardingComplete ? "/dashboard" : "/onboarding");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password"    ||
        code === "auth/user-not-found"
      ) setFirebaseError("Incorrect email or password.");
      else if (code === "auth/too-many-requests")
        setFirebaseError("Too many attempts. Please wait.");
      else setFirebaseError(`Sign in failed: ${code || "unknown error"}`);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setFirebaseError("");
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

      {/* ── LEFT — Form Panel ─────────────────────────────── */}
      <div
        className="relative w-full lg:w-[500px] flex-shrink-0 flex flex-col justify-between px-12 py-10 z-10"
        style={{ backgroundColor: "#08080F", borderRight: "1px solid #1E1E36" }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 36, height: 36,
                border: "1px solid #C8FF0050",
                backgroundColor: "#0F0F1A",
              }}
            >
              <span
                className="font-black text-sm leading-none"
                style={{ fontFamily: "var(--font-syne)", color: "#C8FF00" }}
              >VI</span>
            </div>
            <div>
              <div
                className="text-sm font-black tracking-widest leading-none"
                style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
              >VEKTOR</div>
              <div
                className="text-xs tracking-widest"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
              >INTELLIGENCE</div>
            </div>
          </div>

          {/* Live indicator */}
          <div className="hidden sm:flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "#C8FF00", animation: "pulse 2s infinite" }}
            />
            <span
              className="text-xs tracking-widest"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            >LIVE</span>
          </div>
        </div>

        {/* ── Main Form ── */}
        <div className="flex-1 flex flex-col justify-center py-10">

          {/* Eyebrow */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-px" style={{ backgroundColor: "#C8FF00" }} />
            <span
              className="text-xs tracking-widest uppercase"
              style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
            >Sign in</span>
          </div>

          {/* Headline */}
          <h1
            className="font-black leading-none mb-2"
            style={{
              fontFamily: "var(--font-syne)",
              color: "#F0F0FF",
              fontSize: "clamp(32px, 4vw, 48px)",
            }}
          >
            Welcome<br />
            <span style={{ color: "#C8FF00" }}>back.</span>
          </h1>
          <p className="text-sm mb-10" style={{ color: "#6B6A80", lineHeight: 1.7 }}>
            Your knowledge graph is waiting for you.
          </p>

          {/* Google button */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 text-sm mb-7 transition-all duration-200 disabled:opacity-40"
            style={{
              border: "1px solid #1E1E36",
              color: "#F0F0FF",
              backgroundColor: "#0F0F1A",
              fontFamily: "var(--font-instrument)",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#C8FF0050")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}
          >
            {googleLoading ? (
              <span style={{ color: "#6B6A80" }}>Connecting...</span>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
                  <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                  <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
                  <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
                  <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
                </svg>
                Continue with Google
              </>
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-7">
            <div className="flex-1 h-px" style={{ backgroundColor: "#1E1E36" }} />
            <span
              className="text-xs"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            >or continue with email</span>
            <div className="flex-1 h-px" style={{ backgroundColor: "#1E1E36" }} />
          </div>

          {/* Form fields */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {/* Email */}
            <div>
              <label
                className="block text-xs mb-2 tracking-widest uppercase"
                style={{
                  color: focusedField === "email" ? "#C8FF00" : "#6B6A80",
                  fontFamily: "var(--font-dm-mono)",
                  transition: "color 0.2s",
                }}
              >Email address</label>
              <input
                {...register("email")}
                type="email"
                placeholder="you@example.com"
                className="w-full px-4 py-3.5 text-sm outline-none transition-all duration-200"
                style={{
                  backgroundColor: "#0F0F1A",
                  border: `1px solid ${
                    errors.email ? "#FF3D57" :
                    focusedField === "email" ? "#C8FF0060" : "#1E1E36"
                  }`,
                  color: "#F0F0FF",
                }}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
              />
              {errors.email && (
                <p className="text-xs mt-1.5 flex items-center gap-1.5"
                  style={{ color: "#FF3D57" }}>
                  <span>⚠</span>{errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  className="text-xs tracking-widest uppercase"
                  style={{
                    color: focusedField === "password" ? "#C8FF00" : "#6B6A80",
                    fontFamily: "var(--font-dm-mono)",
                    transition: "color 0.2s",
                  }}
                >Password</label>
                <Link
                  href="/auth/forgot"
                  className="text-xs transition-colors duration-200"
                  style={{ color: "#7B5CFF", fontFamily: "var(--font-dm-mono)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#C8FF00")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#7B5CFF")}
                >Forgot?</Link>
              </div>
              <input
                {...register("password")}
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-3.5 text-sm outline-none transition-all duration-200"
                style={{
                  backgroundColor: "#0F0F1A",
                  border: `1px solid ${
                    errors.password ? "#FF3D57" :
                    focusedField === "password" ? "#C8FF0060" : "#1E1E36"
                  }`,
                  color: "#F0F0FF",
                }}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
              />
              {errors.password && (
                <p className="text-xs mt-1.5 flex items-center gap-1.5"
                  style={{ color: "#FF3D57" }}>
                  <span>⚠</span>{errors.password.message}
                </p>
              )}
            </div>

            {/* Firebase error */}
            {firebaseError && (
              <div
                className="px-4 py-3 text-xs flex items-center gap-2"
                style={{
                  border: "1px solid #FF3D5750",
                  color: "#FF3D57",
                  backgroundColor: "#FF3D570A",
                }}
              >
                <span>⚠</span>{firebaseError}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 text-sm font-black tracking-widest transition-all duration-200 disabled:opacity-40"
              style={{
                backgroundColor: "#C8FF00",
                color: "#08080F",
                fontFamily: "var(--font-syne)",
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#DAFF33")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#C8FF00")}
            >
              {isSubmitting ? "SIGNING IN..." : "SIGN IN →"}
            </button>
          </form>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between pt-4"
          style={{ borderTop: "1px solid #1E1E36" }}>
          <p className="text-xs" style={{ color: "#6B6A80" }}>
            No account?{" "}
            <Link
              href="/auth/signup"
              className="transition-colors duration-200"
              style={{ color: "#F0F0FF" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#C8FF00")}
              onMouseLeave={e => (e.currentTarget.style.color = "#F0F0FF")}
            >Create one free →</Link>
          </p>
          <span
            className="text-xs"
            style={{ color: "#1E1E36", fontFamily: "var(--font-dm-mono)" }}
          >v0.1.0-α</span>
        </div>
      </div>

      {/* ── RIGHT — WebGL Panel ────────────────────────────── */}
      <div className="hidden lg:block flex-1 relative overflow-hidden">

        {/* WebGL symbols fill entire panel */}
        <AuthSymbols />

        {/* Vignette — darkens edges, symbols visible in center */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse at 55% 45%, transparent 20%, #08080F88 75%, #08080FCC 100%),
              linear-gradient(to right, #08080F 0%, transparent 12%),
              linear-gradient(to top, #08080F 0%, transparent 18%)
            `,
          }}
        />

        {/* Bottom-left content — below the symbol cloud */}
        <div className="absolute bottom-12 left-14 right-14 z-10">

          {/* Domain pill tags */}
          <div className="flex flex-wrap gap-2 mb-7">
            {[
              { sym: "∫",  label: "Mathematics", color: "#C8FF00" },
              { sym: "ψ",  label: "Quantum",     color: "#7B5CFF" },
              { sym: "∇",  label: "Physics",     color: "#00E5FF" },
              { sym: "λ",  label: "CS",          color: "#FFB800" },
              { sym: "⇌",  label: "Chemistry",   color: "#2BD9A0" },
            ].map(tag => (
              <div
                key={tag.label}
                className="flex items-center gap-1.5 px-3 py-1 text-xs"
                style={{
                  border: `1px solid ${tag.color}35`,
                  backgroundColor: `${tag.color}0A`,
                  color: tag.color,
                  fontFamily: "var(--font-dm-mono)",
                }}
              >
                <span>{tag.sym}</span>
                <span>{tag.label}</span>
              </div>
            ))}
          </div>

          {/* Headline */}
          <h2
            className="font-black leading-none mb-4"
            style={{
              fontFamily: "var(--font-syne)",
              color: "#F0F0FF",
              fontSize: "clamp(30px, 3.5vw, 46px)",
            }}
          >
            Direction for<br />
            <span style={{ color: "#C8FF00" }}>every mind.</span>
          </h2>

          <p
            className="text-sm mb-8"
            style={{ color: "#6B6A80", maxWidth: "400px", lineHeight: 1.8 }}
          >
            Every question you ask maps your understanding. Every session shows you exactly where to go next.
          </p>

          {/* Stats */}
          <div className="flex gap-10">
            {[
              { val: "5",     label: "STEM subjects",   color: "#C8FF00" },
              { val: "T1–T4", label: "Knowledge tiers", color: "#7B5CFF" },
              { val: "AI",    label: "Powered tutor",   color: "#00E5FF" },
            ].map(s => (
              <div key={s.label}>
                <div
                  className="text-2xl font-black leading-none mb-1"
                  style={{ fontFamily: "var(--font-syne)", color: s.color }}
                >{s.val}</div>
                <div
                  className="text-xs"
                  style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                >{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top-right live badge */}
        <div className="absolute top-10 right-10 z-10 flex items-center gap-2 px-3 py-1.5"
          style={{ border: "1px solid #C8FF0030", backgroundColor: "#C8FF0008" }}>
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: "#C8FF00", animation: "pulse 2s infinite" }}
          />
          <span
            className="text-xs tracking-widest uppercase"
            style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
          >Knowledge Engine · Live</span>
        </div>

      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}