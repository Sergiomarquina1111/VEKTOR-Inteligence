"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signUpWithEmail, signInWithGoogle } from "@/lib/auth";
import { useAuthStore } from "@/store/authstore";
import { UserRole } from "@/types/user";
import AuthSymbols from "@/components/webgl/AuthSymbols";

const schema = z.object({
  displayName: z.string().min(2, "At least 2 characters"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "At least 6 characters"),
});
type FormData = z.infer<typeof schema>;

const ROLES: {
  value: UserRole;
  label: string;
  icon: string;
  desc: string;
  color: string;
}[] = [
  { value: "student",    label: "Student",    icon: "◈", desc: "Learn & close gaps",   color: "#C8FF00" },
  { value: "teacher",    label: "Teacher",    icon: "◇", desc: "Guide your class",     color: "#00E5FF" },
  { value: "researcher", label: "Researcher", icon: "◉", desc: "Analyse patterns",     color: "#7B5CFF" },
];

export default function SignupPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [role, setRole]               = useState<UserRole>("student");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [firebaseError, setFirebaseError] = useState("");
  const [focusedField, setFocusedField]   = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  const activeRole = ROLES.find(r => r.value === role)!;

  async function onSubmit(data: FormData) {
    setFirebaseError("");
    try {
      const user = await signUpWithEmail(
        data.email, data.password, data.displayName, role
      );
      setUser(user);
      router.push("/onboarding");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/email-already-in-use")
        setFirebaseError("This email is already registered.");
      else
        setFirebaseError("Something went wrong. Please try again.");
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setFirebaseError("");
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

          <div className="hidden sm:flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "#C8FF00", animation: "pulse 2s infinite" }}
            />
            <span
              className="text-xs tracking-widest"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            >FREE</span>
          </div>
        </div>

        {/* ── Main Form ── */}
        <div className="flex-1 flex flex-col justify-center py-8">

          {/* Eyebrow */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-px" style={{ backgroundColor: "#C8FF00" }} />
            <span
              className="text-xs tracking-widest uppercase"
              style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
            >Create account</span>
          </div>

          {/* Headline */}
          <h1
            className="font-black leading-none mb-2"
            style={{
              fontFamily: "var(--font-syne)",
              color: "#F0F0FF",
              fontSize: "clamp(28px, 3.5vw, 44px)",
            }}
          >
            Join the<br />
            <span style={{ color: "#C8FF00" }}>knowledge graph.</span>
          </h1>
          <p className="text-sm mb-8" style={{ color: "#6B6A80", lineHeight: 1.7 }}>
            Free forever. No credit card required.
          </p>

          {/* ── Role Selector ── */}
          <div className="mb-7">
            <p
              className="text-xs mb-3 tracking-widest uppercase"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            >I am a</p>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map(r => {
                const active = role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className="flex flex-col items-start gap-1.5 p-3.5 text-left transition-all duration-200"
                    style={{
                      border: `1px solid ${active ? r.color : "#1E1E36"}`,
                      backgroundColor: active ? `${r.color}0D` : "#0F0F1A",
                    }}
                    onMouseEnter={e => {
                      if (!active) e.currentTarget.style.borderColor = `${r.color}50`;
                    }}
                    onMouseLeave={e => {
                      if (!active) e.currentTarget.style.borderColor = "#1E1E36";
                    }}
                  >
                    <span
                      className="text-base leading-none"
                      style={{ color: active ? r.color : "#6B6A80" }}
                    >{r.icon}</span>
                    <span
                      className="text-xs font-black leading-none"
                      style={{
                        fontFamily: "var(--font-syne)",
                        color: active ? "#F0F0FF" : "#6B6A80",
                      }}
                    >{r.label}</span>
                    <span
                      className="leading-none"
                      style={{
                        fontSize: "10px",
                        fontFamily: "var(--font-dm-mono)",
                        color: active ? r.color : "#1E1E36",
                      }}
                    >{r.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Form Fields ── */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mb-4">

            {/* Name */}
            <div>
              <label
                className="block text-xs mb-2 tracking-widest uppercase"
                style={{
                  color: focusedField === "name" ? activeRole.color : "#6B6A80",
                  fontFamily: "var(--font-dm-mono)",
                  transition: "color 0.2s",
                }}
              >Full name</label>
              <input
                {...register("displayName")}
                type="text"
                placeholder="Your name"
                className="w-full px-4 py-3.5 text-sm outline-none transition-all duration-200"
                style={{
                  backgroundColor: "#0F0F1A",
                  border: `1px solid ${
                    errors.displayName ? "#FF3D57" :
                    focusedField === "name" ? `${activeRole.color}60` : "#1E1E36"
                  }`,
                  color: "#F0F0FF",
                }}
                onFocus={() => setFocusedField("name")}
                onBlur={() => setFocusedField(null)}
              />
              {errors.displayName && (
                <p className="text-xs mt-1.5 flex items-center gap-1.5"
                  style={{ color: "#FF3D57" }}>
                  <span>⚠</span>{errors.displayName.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label
                className="block text-xs mb-2 tracking-widest uppercase"
                style={{
                  color: focusedField === "email" ? activeRole.color : "#6B6A80",
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
                    focusedField === "email" ? `${activeRole.color}60` : "#1E1E36"
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
              <label
                className="block text-xs mb-2 tracking-widest uppercase"
                style={{
                  color: focusedField === "password" ? activeRole.color : "#6B6A80",
                  fontFamily: "var(--font-dm-mono)",
                  transition: "color 0.2s",
                }}
              >Password</label>
              <input
                {...register("password")}
                type="password"
                placeholder="Min. 6 characters"
                className="w-full px-4 py-3.5 text-sm outline-none transition-all duration-200"
                style={{
                  backgroundColor: "#0F0F1A",
                  border: `1px solid ${
                    errors.password ? "#FF3D57" :
                    focusedField === "password" ? `${activeRole.color}60` : "#1E1E36"
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
                <span>⚠</span>{firebaseError}{" "}
                {firebaseError.includes("already registered") && (
                  <Link href="/auth/login" style={{ color: "#C8FF00" }}>
                    Sign in →
                  </Link>
                )}
              </div>
            )}

            {/* Submit — color follows selected role */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 text-sm font-black tracking-widest transition-all duration-200 disabled:opacity-40"
              style={{
                backgroundColor: activeRole.color,
                color: "#08080F",
                fontFamily: "var(--font-syne)",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              {isSubmitting
                ? "CREATING..."
                : `JOIN AS ${role.toUpperCase()} →`}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 h-px" style={{ backgroundColor: "#1E1E36" }} />
            <span
              className="text-xs"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            >or</span>
            <div className="flex-1 h-px" style={{ backgroundColor: "#1E1E36" }} />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 text-sm transition-all duration-200 disabled:opacity-40"
            style={{
              border: "1px solid #1E1E36",
              color: "#F0F0FF",
              backgroundColor: "#0F0F1A",
              fontFamily: "var(--font-instrument)",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = `${activeRole.color}50`)}
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
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-between pt-4"
          style={{ borderTop: "1px solid #1E1E36" }}
        >
          <p className="text-xs" style={{ color: "#6B6A80" }}>
            Have an account?{" "}
            <Link
              href="/auth/login"
              className="transition-colors duration-200"
              style={{ color: "#F0F0FF" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#C8FF00")}
              onMouseLeave={e => (e.currentTarget.style.color = "#F0F0FF")}
            >Sign in →</Link>
          </p>
          <span
            className="text-xs"
            style={{ color: "#1E1E36", fontFamily: "var(--font-dm-mono)" }}
          >v0.1.0-α</span>
        </div>
      </div>

      {/* ── RIGHT — WebGL Panel ────────────────────────────── */}
      <div className="hidden lg:block flex-1 relative overflow-hidden">

        <AuthSymbols />

        {/* Layered vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse at 55% 40%, transparent 20%, #08080F88 75%, #08080FCC 100%),
              linear-gradient(to right, #08080F 0%, transparent 12%),
              linear-gradient(to top, #08080F 0%, transparent 20%)
            `,
          }}
        />

        {/* Bottom-left content */}
        <div className="absolute bottom-12 left-14 right-14 z-10">

          {/* Domain tags */}
          <div className="flex flex-wrap gap-2 mb-7">
            {[
              { sym: "∫", label: "Mathematics", color: "#C8FF00" },
              { sym: "ψ", label: "Quantum",     color: "#7B5CFF" },
              { sym: "∇", label: "Physics",     color: "#00E5FF" },
              { sym: "λ", label: "CS",          color: "#FFB800" },
              { sym: "⇌", label: "Chemistry",   color: "#2BD9A0" },
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

          {/* Headline — second line color follows selected role */}
          <h2
            className="font-black leading-none mb-4"
            style={{
              fontFamily: "var(--font-syne)",
              color: "#F0F0FF",
              fontSize: "clamp(28px, 3.5vw, 44px)",
            }}
          >
            See the shape of<br />
            <span style={{ color: activeRole.color, transition: "color 0.3s" }}>
              your understanding.
            </span>
          </h2>

          <p
            className="text-sm mb-8"
            style={{ color: "#6B6A80", maxWidth: "400px", lineHeight: 1.8 }}
          >
            VEKTOR maps what you believe against what is correct — and gives you the exact direction to close the gap.
          </p>

          {/* Stats — middle stat follows role color */}
          <div className="flex gap-10">
            {[
              { val: "5",     label: "STEM subjects",   color: "#C8FF00"         },
              { val: "T1–T4", label: "Knowledge tiers", color: activeRole.color  },
              { val: "AI",    label: "Powered tutor",   color: "#00E5FF"         },
            ].map(s => (
              <div key={s.label}>
                <div
                  className="text-2xl font-black leading-none mb-1"
                  style={{
                    fontFamily: "var(--font-syne)",
                    color: s.color,
                    transition: "color 0.3s",
                  }}
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
        <div
          className="absolute top-10 right-10 z-10 flex items-center gap-2 px-3 py-1.5"
          style={{ border: "1px solid #C8FF0030", backgroundColor: "#C8FF0008" }}
        >
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
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}