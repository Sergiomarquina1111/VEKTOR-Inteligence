import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6"
      style={{ backgroundColor: "#08080F" }}>

      <div className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(#F0F0FF 1px, transparent 1px), linear-gradient(90deg, #F0F0FF 1px, transparent 1px)",
          backgroundSize: "48px 48px"
        }} />

      <div className="relative text-center">
        <h1 className="text-6xl font-black tracking-tighter mb-2"
          style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
          VEKTOR
        </h1>
        <p className="text-lg mb-1" style={{ color: "#6B6A80" }}>
          Direction for every mind.
        </p>
        <p className="text-xs font-mono mb-10" style={{ color: "#1E1E36", fontFamily: "var(--font-dm-mono)" }}>
          — Landing page coming in Phase 3 —
        </p>

        <div className="flex gap-4 justify-center">
          <Link href="/auth/signup"
            className="px-6 py-3 text-sm font-bold transition-all hover:opacity-90"
            style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}>
            Get started →
          </Link>
          <Link href="/auth/login"
            className="px-6 py-3 text-sm font-bold border transition-all hover:border-[#6B6A80]"
            style={{ borderColor: "#1E1E36", color: "#F0F0FF", fontFamily: "var(--font-syne)" }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}