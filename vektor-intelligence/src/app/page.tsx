"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const HeroGraph = dynamic(() => import("@/components/webgl/HeroGraph"), { ssr: false });

const SUBJECTS = [
  { id: "math",    label: "Mathematics",      color: "#1A4D9F", nodes: 847, example: "Eigenvalues · Calculus · Linear Algebra" },
  { id: "physics", label: "Physics",           color: "#5B3FCC", nodes: 763, example: "Quantum Mechanics · Thermodynamics · Optics" },
  { id: "chem",    label: "Chemistry",         color: "#006677", nodes: 692, example: "Organic Reactions · Entropy · Bonding" },
  { id: "bio",     label: "Biology",           color: "#3A6B00", nodes: 814, example: "Mitosis · Genetics · Neural Systems" },
  { id: "cs",      label: "Computer Science",  color: "#7A5200", nodes: 731, example: "Algorithms · Data Structures · ML" },
];

const ROLES = [
  {
    id: "student",
    label: "For Students",
    headline: "See exactly where your understanding breaks.",
    description: "Every question you ask reveals a map of what you know and what you only think you know. VEKTOR shows you the gaps — and the shortest path to fill them.",
    points: ["Visual knowledge graph after every question", "T1–T4 tier system that diagnoses your exact misconception", "Adaptive practice that targets your weakest nodes"],
    cta: "Start learning free",
    color: "#C8FF00",
  },
  {
    id: "teacher",
    label: "For Teachers",
    headline: "See every misconception across your entire class. Live.",
    description: "A real-time heatmap of your students' knowledge gaps. Not test scores after the fact — the actual structural errors in their thinking, right now.",
    points: ["Live class misconception heatmap", "Individual student knowledge graph drill-down", "AI-generated practice sets targeted to specific gaps"],
    cta: "Try the teacher portal",
    color: "#00E5FF",
  },
  {
    id: "researcher",
    label: "For Researchers",
    headline: "The largest structured STEM knowledge graph, open to explore.",
    description: "Compare learning patterns across cohorts, explore concept relationships in the DKG, and export anonymized session data for your research.",
    points: ["Full DKG explorer with 3,847 concept nodes", "Cross-cohort misconception pattern analysis", "Citation system + related works AI assistant"],
    cta: "Explore the portal",
    color: "#7B5CFF",
  },
];

const TIERS = [
  { id: "T1", label: "Aligned",       color: "#C8FF00", desc: "Your understanding matches the domain knowledge graph." },
  { id: "T2", label: "Gap",           color: "#00E5FF", desc: "You understand the concept but are missing key connections." },
  { id: "T3", label: "Misconception", color: "#7B5CFF", desc: "Your mental model has a structural error that blocks progress." },
  { id: "T4", label: "Unknown",       color: "#FF3D57", desc: "This concept hasn't been mapped yet in your sessions." },
];

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const handler = () => setY(window.scrollY);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);
  return y;
}

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{
      transition: `opacity 0.8s ease ${delay}ms, transform 0.8s ease ${delay}ms`,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(32px)",
    }}>
      {children}
    </div>
  );
}

export default function LandingPage() {
  const scrollY = useScrollY();
  const [activeRole, setActiveRole] = useState(0);
  const [hoveredSubject, setHoveredSubject] = useState<string | null>(null);

  return (
    <div style={{ backgroundColor: "#08080F", color: "#F0F0FF", fontFamily: "var(--font-instrument)" }}>

      {/* ── NAV ───────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 transition-all duration-300"
        style={{
          borderBottom: scrollY > 40 ? "1px solid #1E1E36" : "1px solid transparent",
          backgroundColor: scrollY > 40 ? "#08080FEE" : "transparent",
          backdropFilter: scrollY > 40 ? "blur(12px)" : "none",
        }}>
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center"
            style={{ width: 34, height: 34, border: "1px solid #C8FF0050", backgroundColor: "#0F0F1A" }}>
            <span className="font-black text-sm" style={{ fontFamily: "var(--font-syne)", color: "#C8FF00" }}>VI</span>
          </div>
          <span className="font-black tracking-widest text-sm hidden sm:block"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>VEKTOR</span>
        </div>

        {/* Links */}
        <div className="hidden md:flex items-center gap-8">
          {["Features", "Subjects", "Pricing"].map((l) => (
            <a key={l} href={`#${l.toLowerCase()}`}
              className="text-sm transition-colors hover:text-[#C8FF00]"
              style={{ color: "#6B6A80" }}>{l}</a>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <Link href="/auth/login"
            className="text-sm px-4 py-2 transition-all hover:text-[#F0F0FF]"
            style={{ color: "#6B6A80" }}>Sign in</Link>
          <Link href="/auth/signup"
            className="text-sm px-5 py-2 font-bold transition-all hover:opacity-90"
            style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* Full-bleed WebGL */}
        <div className="absolute inset-0">
          <HeroGraph />
        </div>

        {/* Dark vignette overlay — keeps text readable */}
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at center, transparent 5%, #08080F55 45%, #08080FAA 80%)" }} />

        {/* Hero text */}
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-8 text-xs tracking-widest uppercase"
            style={{ border: "1px solid #C8FF0030", backgroundColor: "#C8FF0008", color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#C8FF00" }} />
            Knowledge Graph Engine — Live
          </div>

          <h1 className="font-black leading-none mb-6"
            style={{ fontFamily: "var(--font-syne)", fontSize: "clamp(48px, 8vw, 96px)" }}>
            <span style={{ color: "#F0F0FF" }}>Direction</span>
            <br />
            <span style={{ color: "#C8FF00" }}>for every mind.</span>
          </h1>

          <p className="text-lg mb-10 mx-auto leading-relaxed"
            style={{ color: "#6B6A80", maxWidth: "520px" }}>
            VEKTOR maps what you believe against what is correct — then shows you the exact shape of your misunderstanding and how to fix it.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/signup"
              className="px-8 py-4 text-sm font-black tracking-widest transition-all hover:opacity-90"
              style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}>
              START FREE →
            </Link>
            <a href="#features"
              className="px-8 py-4 text-sm font-bold tracking-wide transition-all hover:border-[#6B6A80]"
              style={{ border: "1px solid #1E1E36", color: "#F0F0FF" }}>
              See how it works ↓
            </a>
          </div>

          {/* Tier legend */}
          <div className="flex flex-wrap gap-4 justify-center mt-16">
            {TIERS.map((tier) => (
              <div key={tier.id} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tier.color }} />
                <span className="text-xs font-mono" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                  {tier.id} — {tier.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          style={{ opacity: scrollY > 50 ? 0 : 1, transition: "opacity 0.3s" }}>
          <span className="text-xs tracking-widest" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>SCROLL</span>
          <div className="w-px h-12 relative overflow-hidden" style={{ backgroundColor: "#1E1E36" }}>
            <div className="absolute top-0 w-full"
              style={{ height: "40%", backgroundColor: "#C8FF00", animation: "scrollLine 1.5s ease-in-out infinite" }} />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────── */}
      <section id="features" className="relative py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <p className="text-xs tracking-widest uppercase mb-4 text-center"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>How it works</p>
            <h2 className="text-4xl md:text-5xl font-black text-center mb-4"
              style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
              Three steps.<br />
              <span style={{ color: "#C8FF00" }}>Infinite direction.</span>
            </h2>
            <p className="text-center text-sm mb-20" style={{ color: "#6B6A80", maxWidth: "420px", margin: "0 auto 80px" }}>
              From a single question to a full map of your understanding — in seconds.
            </p>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            {[
              {
                step: "01",
                title: "Ask a question",
                body: "Type any STEM concept or question. VEKTOR extracts your mental model from how you phrase it.",
                color: "#C8FF00",
                detail: "QueryInput → subject auto-detect → concept extraction",
              },
              {
                step: "02",
                title: "See your mental model",
                body: "Your Student Knowledge Graph appears alongside the Domain Knowledge Graph. Differences light up instantly.",
                color: "#00E5FF",
                detail: "SKG vs DKG comparison → gap detection → tier assignment",
              },
              {
                step: "03",
                title: "Get your direction",
                body: "A tier badge (T1–T4) tells you exactly what kind of gap you have. AI explains what went wrong and what to do next.",
                color: "#7B5CFF",
                detail: "AI explanation → adaptive path → practice generation",
              },
            ].map((s, i) => (
              <FadeIn key={s.step} delay={i * 120}>
                <div className="relative p-8 h-full"
                  style={{ borderLeft: i === 0 ? `2px solid ${s.color}` : "none", borderTop: i > 0 ? `1px solid #1E1E36` : "none" }}>
                  {i > 0 && <div className="absolute top-8 -left-px w-px h-16" style={{ backgroundColor: s.color }} />}
                  <div className="text-6xl font-black mb-6 leading-none"
                    style={{ fontFamily: "var(--font-syne)", color: "#1E1E36" }}>{s.step}</div>
                  <h3 className="text-xl font-black mb-3" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>{s.title}</h3>
                  <p className="text-sm leading-relaxed mb-6" style={{ color: "#6B6A80" }}>{s.body}</p>
                  <p className="text-xs font-mono" style={{ color: s.color, fontFamily: "var(--font-dm-mono)" }}>{s.detail}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── TIER SYSTEM ───────────────────────────────────── */}
      <section className="py-24 px-6" style={{ backgroundColor: "#0F0F1A" }}>
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <p className="text-xs tracking-widest uppercase mb-4 text-center"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>The Intelligence Layer</p>
            <h2 className="text-4xl font-black text-center mb-16"
              style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
              Not just right or wrong.<br />
              <span style={{ color: "#C8FF00" }}>A precise diagnosis.</span>
            </h2>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TIERS.map((tier, i) => (
              <FadeIn key={tier.id} delay={i * 80}>
                <div className="p-6 transition-all duration-300 group cursor-default"
                  style={{ border: `1px solid #1E1E36`, backgroundColor: "#08080F" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = tier.color + "60")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 flex items-center justify-center font-black text-xs"
                      style={{ backgroundColor: tier.color + "20", color: tier.color, fontFamily: "var(--font-dm-mono)", border: `1px solid ${tier.color}40` }}>
                      {tier.id}
                    </div>
                    <span className="font-bold text-sm" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>{tier.label}</span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "#6B6A80" }}>{tier.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOR EVERYONE ──────────────────────────────────── */}
      <section id="features" className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <p className="text-xs tracking-widest uppercase mb-4 text-center"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Built for everyone</p>
            <h2 className="text-4xl font-black text-center mb-16"
              style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
              One platform.<br />
              <span style={{ color: "#C8FF00" }}>Three perspectives.</span>
            </h2>
          </FadeIn>

          {/* Role tabs */}
          <div className="flex gap-1 mb-12 p-1 w-fit mx-auto"
            style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
            {ROLES.map((r, i) => (
              <button key={r.id} onClick={() => setActiveRole(i)}
                className="px-5 py-2.5 text-sm font-bold transition-all duration-200"
                style={{
                  fontFamily: "var(--font-syne)",
                  backgroundColor: activeRole === i ? ROLES[i].color : "transparent",
                  color: activeRole === i ? "#08080F" : "#6B6A80",
                }}>
                {r.label}
              </button>
            ))}
          </div>

          {/* Role content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <FadeIn key={activeRole}>
              <div>
                <h3 className="text-3xl font-black mb-4 leading-tight"
                  style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
                  {ROLES[activeRole].headline}
                </h3>
                <p className="text-sm leading-relaxed mb-8" style={{ color: "#6B6A80" }}>
                  {ROLES[activeRole].description}
                </p>
                <div className="space-y-3 mb-8">
                  {ROLES[activeRole].points.map((p) => (
                    <div key={p} className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                        style={{ backgroundColor: ROLES[activeRole].color }} />
                      <span className="text-sm" style={{ color: "#F0F0FF" }}>{p}</span>
                    </div>
                  ))}
                </div>
                <Link href="/auth/signup"
                  className="inline-block px-6 py-3 text-sm font-black tracking-wide transition-all hover:opacity-90"
                  style={{ backgroundColor: ROLES[activeRole].color, color: "#08080F", fontFamily: "var(--font-syne)" }}>
                  {ROLES[activeRole].cta} →
                </Link>
              </div>
            </FadeIn>

            {/* Visual panel */}
            <div className="relative h-80 overflow-hidden"
              style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="grid grid-cols-3 gap-3 p-6 w-full">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="h-12 transition-all duration-500"
                      style={{
                        backgroundColor: i % 3 === activeRole ? ROLES[activeRole].color + "30" : "#16162A",
                        border: `1px solid ${i % 3 === activeRole ? ROLES[activeRole].color + "60" : "#1E1E36"}`,
                        transform: i % 3 === activeRole ? "scale(1.05)" : "scale(1)",
                      }} />
                  ))}
                </div>
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <div className="text-xs font-mono" style={{ color: ROLES[activeRole].color, fontFamily: "var(--font-dm-mono)" }}>
                  {ROLES[activeRole].id.toUpperCase()} PORTAL — ACTIVE
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SUBJECTS ──────────────────────────────────────── */}
      <section id="subjects" className="py-24 px-6" style={{ backgroundColor: "#0F0F1A" }}>
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <p className="text-xs tracking-widest uppercase mb-4 text-center"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Domain Knowledge Graph</p>
            <h2 className="text-4xl font-black text-center mb-4"
              style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
              5 subjects.<br />
              <span style={{ color: "#C8FF00" }}>3,847 concept nodes.</span>
            </h2>
            <p className="text-center text-sm mb-16" style={{ color: "#6B6A80", maxWidth: "400px", margin: "0 auto 64px" }}>
              Every STEM concept mapped, connected, and ready to diagnose your understanding.
            </p>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {SUBJECTS.map((s, i) => (
              <FadeIn key={s.id} delay={i * 60}>
                <div
                  className="p-5 cursor-default transition-all duration-300"
                  style={{
                    border: `1px solid ${hoveredSubject === s.id ? s.color : "#1E1E36"}`,
                    backgroundColor: hoveredSubject === s.id ? s.color + "10" : "#08080F",
                  }}
                  onMouseEnter={() => setHoveredSubject(s.id)}
                  onMouseLeave={() => setHoveredSubject(null)}>
                  <div className="w-3 h-3 rounded-full mb-4" style={{ backgroundColor: s.color }} />
                  <div className="text-sm font-black mb-1" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
                    {s.label}
                  </div>
                  <div className="text-xs mb-3 font-mono" style={{ color: s.color, fontFamily: "var(--font-dm-mono)" }}>
                    {s.nodes} nodes
                  </div>
                  <div className="text-xs leading-relaxed" style={{ color: "#6B6A80" }}>{s.example}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────── */}
      <section id="pricing" className="py-32 px-6">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <p className="text-xs tracking-widest uppercase mb-4 text-center"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Pricing</p>
            <h2 className="text-4xl font-black text-center mb-4"
              style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
              Start free.<br />
              <span style={{ color: "#C8FF00" }}>Go further with Pro.</span>
            </h2>
            <p className="text-center text-sm mb-16" style={{ color: "#6B6A80" }}>
              No credit card required to start.
            </p>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Free */}
            <FadeIn delay={0}>
              <div className="p-8 h-full" style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}>
                <div className="text-xs tracking-widest uppercase mb-6" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Free</div>
                <div className="text-5xl font-black mb-1" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>₹0</div>
                <div className="text-xs mb-8" style={{ color: "#6B6A80" }}>forever</div>
                <div className="space-y-3 mb-8">
                  {["20 sessions / month", "All 5 STEM subjects", "SKG + DKG comparison", "T1–T4 tier system", "Basic progress tracking"].map(f => (
                    <div key={f} className="flex items-center gap-3">
                      <span style={{ color: "#C8FF00" }}>✓</span>
                      <span className="text-sm" style={{ color: "#6B6A80" }}>{f}</span>
                    </div>
                  ))}
                  {["AI Tutor Chat", "Voice input", "Export data"].map(f => (
                    <div key={f} className="flex items-center gap-3">
                      <span style={{ color: "#1E1E36" }}>✕</span>
                      <span className="text-sm" style={{ color: "#1E1E36" }}>{f}</span>
                    </div>
                  ))}
                </div>
                <Link href="/auth/signup"
                  className="block w-full py-3 text-center text-sm font-black tracking-wide transition-all hover:border-[#6B6A80]"
                  style={{ border: "1px solid #1E1E36", color: "#F0F0FF", fontFamily: "var(--font-syne)" }}>
                  GET STARTED FREE
                </Link>
              </div>
            </FadeIn>

            {/* Pro */}
            <FadeIn delay={120}>
              <div className="p-8 h-full relative" style={{ border: "2px solid #C8FF00", backgroundColor: "#0F0F1A" }}>
                <div className="absolute -top-3 left-6 px-3 py-1 text-xs font-black"
                  style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}>
                  MOST POPULAR
                </div>
                <div className="text-xs tracking-widest uppercase mb-6" style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}>Pro</div>
                <div className="text-5xl font-black mb-1" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>₹299</div>
                <div className="text-xs mb-8" style={{ color: "#6B6A80" }}>per month</div>
                <div className="space-y-3 mb-8">
                  {["Unlimited sessions", "Everything in Free", "AI Tutor Chat (streamed)", "Voice input", "Export data (CSV / JSON)", "Advanced progress analytics", "Priority support"].map(f => (
                    <div key={f} className="flex items-center gap-3">
                      <span style={{ color: "#C8FF00" }}>✓</span>
                      <span className="text-sm" style={{ color: "#F0F0FF" }}>{f}</span>
                    </div>
                  ))}
                </div>
                <Link href="/auth/signup"
                  className="block w-full py-3 text-center text-sm font-black tracking-wide transition-all hover:opacity-90"
                  style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}>
                  START PRO →
                </Link>
              </div>
            </FadeIn>
          </div>

          <FadeIn delay={200}>
            <p className="text-center text-sm mt-8" style={{ color: "#6B6A80" }}>
              Need VEKTOR for your school or institution?{" "}
              <a href="mailto:contact@vektor.ai" style={{ color: "#7B5CFF" }} className="hover:text-[#C8FF00] transition-colors">
                Contact us for institutional pricing →
              </a>
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────── */}
      <footer className="py-16 px-6" style={{ borderTop: "1px solid #1E1E36" }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between gap-8 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center"
                  style={{ width: 34, height: 34, border: "1px solid #C8FF0050", backgroundColor: "#0F0F1A" }}>
                  <span className="font-black text-sm" style={{ fontFamily: "var(--font-syne)", color: "#C8FF00" }}>VI</span>
                </div>
                <div>
                  <div className="text-sm font-black tracking-widest" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>VEKTOR</div>
                  <div className="text-xs tracking-widest" style={{ color: "#6B6A80" }}>INTELLIGENCE</div>
                </div>
              </div>
              <p className="text-sm" style={{ color: "#6B6A80", maxWidth: "240px" }}>
                Direction for every mind. Built at VIT Pune.
              </p>
            </div>
            <div className="flex gap-16">
              <div>
                <p className="text-xs font-bold mb-4 tracking-widest uppercase" style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}>Product</p>
                {["Features", "Subjects", "Pricing", "Changelog"].map(l => (
                  <p key={l} className="text-sm mb-2"><a href="#" className="transition-colors hover:text-[#C8FF00]" style={{ color: "#6B6A80" }}>{l}</a></p>
                ))}
              </div>
              <div>
                <p className="text-xs font-bold mb-4 tracking-widest uppercase" style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}>Company</p>
                {["About", "Contact", "Privacy", "Terms"].map(l => (
                  <p key={l} className="text-sm mb-2"><a href="#" className="transition-colors hover:text-[#C8FF00]" style={{ color: "#6B6A80" }}>{l}</a></p>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center pt-8"
            style={{ borderTop: "1px solid #1E1E36" }}>
            <p className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
              © 2026 VEKTOR Intelligence · SIG Reality Spectra · VIT Pune
            </p>
            <p className="text-xs mt-2 md:mt-0" style={{ color: "#1E1E36", fontFamily: "var(--font-dm-mono)" }}>
              v0.1.0-alpha
            </p>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes scrollLine {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(400%); }
        }
        html { scroll-behavior: smooth; }
      `}</style>
    </div>
  );
}