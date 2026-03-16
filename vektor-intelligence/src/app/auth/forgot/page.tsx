"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { resetPassword } from "@/lib/auth";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPage() {
  const [sent, setSent] = useState(false);
  const [firebaseError, setFirebaseError] = useState("");

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setFirebaseError("");
    try {
      await resetPassword(data.email);
      setSent(true);
    } catch {
      setFirebaseError("Could not send reset email. Check the address and try again.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#08080F" }}>

      <div className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(#F0F0FF 1px, transparent 1px), linear-gradient(90deg, #F0F0FF 1px, transparent 1px)",
          backgroundSize: "48px 48px"
        }} />

      <div className="relative w-full max-w-md">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
            VEKTOR
          </h1>
        </div>

        <div className="border p-8"
          style={{ backgroundColor: "#0F0F1A", borderColor: "#1E1E36" }}>

          {sent ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">✓</div>
              <h2 className="text-xl font-bold mb-2"
                style={{ fontFamily: "var(--font-syne)", color: "#C8FF00" }}>
                Check your inbox
              </h2>
              <p className="text-sm mb-6" style={{ color: "#6B6A80" }}>
                We sent a reset link to{" "}
                <span style={{ color: "#F0F0FF" }}>{getValues("email")}</span>
              </p>
              <Link href="/auth/login"
                className="text-sm transition-colors hover:text-[#C8FF00]"
                style={{ color: "#7B5CFF" }}>
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-2"
                style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
                Reset password
              </h2>
              <p className="text-sm mb-6" style={{ color: "#6B6A80" }}>
                Enter your email and we&apos;ll send you a reset link.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm mb-2" style={{ color: "#6B6A80" }}>Email</label>
                  <input
                    {...register("email")}
                    type="email"
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 text-sm border outline-none transition-all focus:border-[#7B5CFF]"
                    style={{
                      backgroundColor: "#16162A",
                      borderColor: errors.email ? "#FF3D57" : "#1E1E36",
                      color: "#F0F0FF",
                    }}
                  />
                  {errors.email && (
                    <p className="text-xs mt-1" style={{ color: "#FF3D57" }}>{errors.email.message}</p>
                  )}
                </div>

                {firebaseError && (
                  <div className="px-4 py-3 border text-sm"
                    style={{ borderColor: "#FF3D57", color: "#FF3D57", backgroundColor: "#FF3D5710" }}>
                    {firebaseError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 text-sm font-bold tracking-wide transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}>
                  {isSubmitting ? "Sending..." : "Send reset link →"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-sm mt-6" style={{ color: "#6B6A80" }}>
          <Link href="/auth/login"
            className="transition-colors hover:text-[#C8FF00]"
            style={{ color: "#F0F0FF" }}>
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}