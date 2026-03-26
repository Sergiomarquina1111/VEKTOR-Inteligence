"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { resetPassword } from "@/lib/auth";
import AuthSymbols from "@/components/webgl/AuthSymbols";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
});
type FormData = z.infer<typeof schema>;

export default function ForgotPage() {
  const [sent, setSent]                   = useState(false);
  const [firebaseError, setFirebaseError] = useState("");
  const [focusedField, setFocusedField]   = useState(false);
  const [sentEmail, setSentEmail]         = useState("");

  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setFirebaseError("");
    try {
      await resetPassword(data.email);
      setSentEmail(data.email);
      setSent(true);
    } catch {
      setFirebaseError("Could not send reset email. Check the address and try again.");
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
        </div>

        {/* ── Main Content ── */}
        <div className="flex-1 flex flex-col justify-center py-10">

          {!sent ? (
            <>
              {/* Eyebrow */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-px" style={{ backgroundColor: "#C8FF00" }} />
                <span
                  className="text-xs tracking-widest uppercase"
                  style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
                >Reset password</span>
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
                Forgot your<br />
                <span style={{ color: "#C8FF00" }}>password?</span>
              </h1>
              <p
                className="text-sm mb-10"
                style={{ color: "#6B6A80", lineHeight: 1.7, maxWidth: "320px" }}
              >
                No problem. Enter your email and we will send you a reset link instantly.
              </p>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label
                    className="block text-xs mb-2 tracking-widest uppercase"
                    style={{
                      color: focusedField ? "#C8FF00" : "#6B6A80",
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
                        focusedField ? "#C8FF0060" : "#1E1E36"
                      }`,
                      color: "#F0F0FF",
                    }}
                    onFocus={() => setFocusedField(true)}
                    onBlur={() => setFocusedField(false)}
                  />
                  {errors.email && (
                    <p
                      className="text-xs mt-1.5 flex items-center gap-1.5"
                      style={{ color: "#FF3D57" }}
                    >
                      <span>⚠</span>{errors.email.message}
                    </p>
                  )}
                </div>

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
                  {isSubmitting ? "SENDING..." : "SEND RESET LINK →"}
                </button>
              </form>
            </>
          ) : (
            <>
              {/* ── Success State ── */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-px" style={{ backgroundColor: "#C8FF00" }} />
                <span
                  className="text-xs tracking-widest uppercase"
                  style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
                >Email sent</span>
              </div>

              {/* Big checkmark */}
              <div
                className="flex items-center justify-center mb-8"
                style={{
                  width: 64, height: 64,
                  border: "1px solid #C8FF0040",
                  backgroundColor: "#C8FF000D",
                }}
              >
                <span
                  className="text-2xl font-black"
                  style={{ color: "#C8FF00" }}
                >✓</span>
              </div>

              <h1
                className="font-black leading-none mb-2"
                style={{
                  fontFamily: "var(--font-syne)",
                  color: "#F0F0FF",
                  fontSize: "clamp(28px, 3.5vw, 44px)",
                }}
              >
                Check your<br />
                <span style={{ color: "#C8FF00" }}>inbox.</span>
              </h1>

              <p
                className="text-sm mt-4 mb-2"
                style={{ color: "#6B6A80", lineHeight: 1.7 }}
              >
                We sent a reset link to
              </p>
              <p
                className="text-sm mb-8 font-mono"
                style={{
                  color: "#F0F0FF",
                  fontFamily: "var(--font-dm-mono)",
                  wordBreak: "break-all",
                }}
              >
                {sentEmail}
              </p>

              {/* Info box */}
              <div
                className="p-4 mb-8 text-xs space-y-2"
                style={{
                  border: "1px solid #1E1E36",
                  backgroundColor: "#0F0F1A",
                }}
              >
                {[
                  "Check your spam folder if you don't see it.",
                  "The link expires in 1 hour.",
                  "You can request another link after 60 seconds.",
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span style={{ color: "#C8FF00", flexShrink: 0 }}>→</span>
                    <span style={{ color: "#6B6A80" }}>{tip}</span>
                  </div>
                ))}
              </div>

              {/* Try again */}
              <button
                onClick={() => { setSent(false); setFirebaseError(""); }}
                className="w-full py-3.5 text-sm font-bold transition-all duration-200"
                style={{
                  border: "1px solid #1E1E36",
                  color: "#6B6A80",
                  backgroundColor: "#0F0F1A",
                  fontFamily: "var(--font-syne)",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "#C8FF0050";
                  e.currentTarget.style.color = "#F0F0FF";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "#1E1E36";
                  e.currentTarget.style.color = "#6B6A80";
                }}
              >
                Try a different email
              </button>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-between pt-4"
          style={{ borderTop: "1px solid #1E1E36" }}
        >
          <Link
            href="/auth/login"
            className="text-xs flex items-center gap-2 transition-colors duration-200"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#C8FF00")}
            onMouseLeave={e => (e.currentTarget.style.color = "#6B6A80")}
          >
            ← Back to sign in
          </Link>
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
              linear-gradient(to top,   #08080F 0%, transparent 20%)
            `,
          }}
        />

        {/* Bottom-left content */}
        <div className="absolute bottom-12 left-14 right-14 z-10">

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

          <h2
            className="font-black leading-none mb-4"
            style={{
              fontFamily: "var(--font-syne)",
              color: "#F0F0FF",
              fontSize: "clamp(28px, 3.5vw, 44px)",
            }}
          >
            Your graph is<br />
            <span style={{ color: "#C8FF00" }}>still waiting.</span>
          </h2>

          <p
            className="text-sm mb-8"
            style={{ color: "#6B6A80", maxWidth: "380px", lineHeight: 1.8 }}
          >
            Reset your password and get back to mapping your understanding. Your sessions and progress are safe.
          </p>

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

        {/* Top-right badge */}
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