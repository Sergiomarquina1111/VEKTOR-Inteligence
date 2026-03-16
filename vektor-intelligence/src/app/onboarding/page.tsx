"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/store/authstore";

// ── Data ─────────────────────────────────────────────────────
const SUBJECTS = [
  {
    id: "mathematics",
    label: "Mathematics",
    symbol: "∫",
    example: "Eigenvalues · Calculus · Linear Algebra",
    color: "#1A4D9F",
    nodes: 847,
  },
  {
    id: "physics",
    label: "Physics",
    symbol: "∇",
    example: "Quantum Mechanics · Thermodynamics · Optics",
    color: "#5B3FCC",
    nodes: 763,
  },
  {
    id: "chemistry",
    label: "Chemistry",
    symbol: "⇌",
    example: "Organic Reactions · Entropy · Bonding",
    color: "#006677",
    nodes: 692,
  },
  {
    id: "biology",
    label: "Biology",
    symbol: "∂",
    example: "Mitosis · Genetics · Neural Systems",
    color: "#3A6B00",
    nodes: 814,
  },
  {
    id: "computer_science",
    label: "Computer Science",
    symbol: "λ",
    example: "Algorithms · Data Structures · ML",
    color: "#7A5200",
    nodes: 731,
  },
];

const LEVELS = ["Beginner", "Elementary", "Intermediate", "Advanced", "Expert"];

const GOALS = [
  { id: "school",      label: "School exams",         icon: "◈", desc: "Board exams and school curriculum"      },
  { id: "jee_neet",   label: "JEE / NEET prep",       icon: "◎", desc: "Competitive entrance exam preparation"  },
  { id: "university", label: "University coursework",  icon: "◇", desc: "Undergraduate or postgraduate study"    },
  { id: "research",   label: "Research",               icon: "◉", desc: "Academic or professional research"      },
  { id: "curiosity",  label: "Personal curiosity",     icon: "○", desc: "Learning for the love of it"            },
];

// ── Component ─────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();

  const [step,             setStep]             = useState(1);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [levels,           setLevels]           = useState<Record<string, number>>({});
  const [goal,             setGoal]             = useState("");
  const [saving,           setSaving]           = useState(false);
  const [welcomeVisible,   setWelcomeVisible]   = useState(false);

  // ── Helpers ──────────────────────────────────────────────────
  function toggleSubject(id: string) {
    setSelectedSubjects(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }

  function setLevel(subjectId: string, value: number) {
    setLevels(prev => ({ ...prev, [subjectId]: value }));
  }

  const canProceed =
    (step === 1 && selectedSubjects.length > 0) ||
    (step === 2 && selectedSubjects.every(s => levels[s] !== undefined)) ||
    (step === 3 && goal !== "");

  async function handleFinish() {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        subjects: selectedSubjects,
        levels,
        goal,
        onboardingComplete: true,
      });
      setUser({ ...user, subjects: selectedSubjects, onboardingComplete: true });
      setStep(4);
      setTimeout(() => setWelcomeVisible(true), 150);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function goNext() {
    if (step === 3) { handleFinish(); return; }
    setStep(s => s + 1);
  }

  // ── Step 4 — Welcome ─────────────────────────────────────────
  if (step === 4) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center text-center px-6"
        style={{ backgroundColor: "#08080F" }}
      >
        {/* Grid background */}
        <div
          className="fixed inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(#F0F0FF 1px, transparent 1px), linear-gradient(90deg, #F0F0FF 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Orb */}
        <div
          className="relative mb-10"
          style={{
            transition: "opacity 1s ease, transform 1s ease",
            opacity: welcomeVisible ? 1 : 0,
            transform: welcomeVisible ? "scale(1)" : "scale(0.7)",
          }}
        >
          {/* Outer ring pulse */}
          <div
            className="absolute inset-0"
            style={{
              border: "1px solid #C8FF0030",
              borderRadius: "50%",
              width: 120,
              height: 120,
              animation: "orbPulse 2.5s ease-in-out infinite",
            }}
          />
          {/* Inner container */}
          <div
            className="relative flex items-center justify-center"
            style={{
              width: 120,
              height: 120,
              border: "1px solid #C8FF0050",
              backgroundColor: "#0F0F1A",
              borderRadius: "50%",
            }}
          >
            <span
              className="font-black text-3xl"
              style={{ fontFamily: "var(--font-syne)", color: "#C8FF00" }}
            >VI</span>
          </div>
        </div>

        {/* Text */}
        <div
          style={{
            transition: "opacity 1.2s ease 0.4s, transform 1.2s ease 0.4s",
            opacity: welcomeVisible ? 1 : 0,
            transform: welcomeVisible ? "translateY(0)" : "translateY(24px)",
          }}
        >
          <p
            className="text-xs tracking-widest uppercase mb-4"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
          >
            Your knowledge graph is ready
          </p>

          <h1
            className="font-black leading-none mb-4"
            style={{
              fontFamily: "var(--font-syne)",
              color: "#F0F0FF",
              fontSize: "clamp(32px, 5vw, 56px)",
            }}
          >
            VEKTOR Intelligence<br />
            <span style={{ color: "#C8FF00" }}>knows your direction.</span>
          </h1>

          <p
            className="text-sm mb-12 mx-auto"
            style={{ color: "#6B6A80", maxWidth: "440px", lineHeight: 1.9 }}
          >
            Every question you ask will map your understanding. Every gap becomes a direction. Every session brings you closer to mastery.
          </p>

          {/* Selected subjects preview */}
          <div className="flex flex-wrap gap-2 justify-center mb-12">
            {selectedSubjects.map(sid => {
              const s = SUBJECTS.find(x => x.id === sid)!;
              return (
                <div
                  key={sid}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs"
                  style={{
                    border: `1px solid ${s.color}50`,
                    backgroundColor: `${s.color}10`,
                    color: s.color,
                    fontFamily: "var(--font-dm-mono)",
                  }}
                >
                  <span>{s.symbol}</span>
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="px-12 py-4 text-sm font-black tracking-widest transition-all duration-200"
            style={{
              backgroundColor: "#C8FF00",
              color: "#08080F",
              fontFamily: "var(--font-syne)",
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#DAFF33")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#C8FF00")}
          >
            BEGIN FIRST SESSION →
          </button>
        </div>

        <style>{`
          @keyframes orbPulse {
            0%, 100% { transform: scale(1);    opacity: 0.5; }
            50%       { transform: scale(1.18); opacity: 1;   }
          }
        `}</style>
      </div>
    );
  }

  // ── Steps 1–3 ────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#08080F" }}
    >
      {/* Grid background */}
      <div
        className="fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(#F0F0FF 1px, transparent 1px), linear-gradient(90deg, #F0F0FF 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* ── Top bar ── */}
      <div
        className="relative z-10 flex items-center justify-between px-8 py-5"
        style={{ borderBottom: "1px solid #1E1E36" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center"
            style={{
              width: 32, height: 32,
              border: "1px solid #C8FF0050",
              backgroundColor: "#0F0F1A",
            }}
          >
            <span
              className="font-black text-xs"
              style={{ fontFamily: "var(--font-syne)", color: "#C8FF00" }}
            >VI</span>
          </div>
          <span
            className="text-sm font-black tracking-widest hidden sm:block"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
          >VEKTOR</span>
        </div>

        {/* Step progress pills */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className="transition-all duration-300 flex items-center justify-center"
              style={{
                width: s === step ? 32 : 8,
                height: 8,
                backgroundColor:
                  s === step   ? "#C8FF00" :
                  s < step     ? "#C8FF0050" : "#1E1E36",
                borderRadius: 4,
              }}
            >
              {s === step && (
                <span
                  style={{
                    fontSize: "8px",
                    fontFamily: "var(--font-dm-mono)",
                    color: "#08080F",
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >{s}</span>
              )}
            </div>
          ))}
        </div>

        {/* Step counter */}
        <span
          className="text-xs"
          style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
        >{step} / 3</span>
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">

          {/* ── STEP 1 — Subject Selection ── */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-px" style={{ backgroundColor: "#C8FF00" }} />
                <span
                  className="text-xs tracking-widest uppercase"
                  style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
                >Step 1 of 3</span>
              </div>

              <h2
                className="font-black leading-none mb-2"
                style={{
                  fontFamily: "var(--font-syne)",
                  color: "#F0F0FF",
                  fontSize: "clamp(28px, 4vw, 44px)",
                }}
              >
                Which subjects do you<br />
                <span style={{ color: "#C8FF00" }}>want to master?</span>
              </h2>
              <p
                className="text-sm mb-10"
                style={{ color: "#6B6A80", lineHeight: 1.7 }}
              >
                Select all that apply. You can always change this later.
              </p>

              <div className="space-y-3">
                {SUBJECTS.map(s => {
                  const active = selectedSubjects.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSubject(s.id)}
                      className="w-full flex items-center gap-5 px-5 py-4 text-left transition-all duration-200"
                      style={{
                        border: `1px solid ${active ? s.color : "#1E1E36"}`,
                        backgroundColor: active ? `${s.color}0D` : "#0F0F1A",
                      }}
                      onMouseEnter={e => {
                        if (!active) e.currentTarget.style.borderColor = `${s.color}50`;
                      }}
                      onMouseLeave={e => {
                        if (!active) e.currentTarget.style.borderColor = "#1E1E36";
                      }}
                    >
                      {/* Symbol */}
                      <div
                        className="flex items-center justify-center flex-shrink-0 font-black text-lg"
                        style={{
                          width: 40, height: 40,
                          border: `1px solid ${active ? s.color : "#1E1E36"}`,
                          backgroundColor: active ? `${s.color}15` : "#16162A",
                          color: active ? s.color : "#6B6A80",
                          fontFamily: "var(--font-dm-mono)",
                          transition: "all 0.2s",
                        }}
                      >{s.symbol}</div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm font-black mb-0.5"
                          style={{
                            fontFamily: "var(--font-syne)",
                            color: active ? "#F0F0FF" : "#6B6A80",
                            transition: "color 0.2s",
                          }}
                        >{s.label}</div>
                        <div
                          className="text-xs truncate"
                          style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                        >{s.example}</div>
                      </div>

                      {/* Node count */}
                      <div
                        className="text-xs flex-shrink-0 hidden sm:block"
                        style={{ color: active ? s.color : "#1E1E36", fontFamily: "var(--font-dm-mono)" }}
                      >{s.nodes} nodes</div>

                      {/* Checkmark */}
                      <div
                        className="flex items-center justify-center flex-shrink-0 transition-all duration-200"
                        style={{
                          width: 22, height: 22,
                          border: `1px solid ${active ? s.color : "#1E1E36"}`,
                          backgroundColor: active ? s.color : "transparent",
                        }}
                      >
                        {active && (
                          <span
                            className="text-xs font-black"
                            style={{ color: "#08080F" }}
                          >✓</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STEP 2 — Level Calibration ── */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-px" style={{ backgroundColor: "#C8FF00" }} />
                <span
                  className="text-xs tracking-widest uppercase"
                  style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
                >Step 2 of 3</span>
              </div>

              <h2
                className="font-black leading-none mb-2"
                style={{
                  fontFamily: "var(--font-syne)",
                  color: "#F0F0FF",
                  fontSize: "clamp(28px, 4vw, 44px)",
                }}
              >
                What is your current<br />
                <span style={{ color: "#C8FF00" }}>level in each?</span>
              </h2>
              <p
                className="text-sm mb-10"
                style={{ color: "#6B6A80", lineHeight: 1.7 }}
              >
                This calibrates your AI difficulty from day one. Be honest — it helps.
              </p>

              <div className="space-y-8">
                {selectedSubjects.map(sid => {
                  const s     = SUBJECTS.find(x => x.id === sid)!;
                  const level = levels[sid] ?? 0;
                  return (
                    <div key={sid}>
                      {/* Subject header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex items-center justify-center font-black text-sm flex-shrink-0"
                            style={{
                              width: 32, height: 32,
                              border: `1px solid ${s.color}50`,
                              backgroundColor: `${s.color}10`,
                              color: s.color,
                              fontFamily: "var(--font-dm-mono)",
                            }}
                          >{s.symbol}</div>
                          <span
                            className="text-sm font-black"
                            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
                          >{s.label}</span>
                        </div>

                        {/* Level badge */}
                        <div
                          className="px-3 py-1 text-xs font-black"
                          style={{
                            border: `1px solid ${s.color}50`,
                            backgroundColor: `${s.color}10`,
                            color: s.color,
                            fontFamily: "var(--font-dm-mono)",
                            minWidth: 96,
                            textAlign: "center",
                            transition: "all 0.2s",
                          }}
                        >{LEVELS[level]}</div>
                      </div>

                      {/* Slider */}
                      <div className="relative">
                        <input
                          type="range"
                          min={0}
                          max={4}
                          value={level}
                          onChange={e => setLevel(sid, parseInt(e.target.value))}
                          className="w-full cursor-pointer"
                          style={{
                            appearance: "none",
                            height: 3,
                            outline: "none",
                            background: `linear-gradient(to right,
                              ${s.color} ${level * 25}%,
                              #1E1E36 ${level * 25}%
                            )`,
                          }}
                        />
                        {/* Level labels */}
                        <div className="flex justify-between mt-2">
                          {LEVELS.map((l, i) => (
                            <span
                              key={l}
                              className="text-xs"
                              style={{
                                color: i <= level ? s.color : "#1E1E36",
                                fontFamily: "var(--font-dm-mono)",
                                transition: "color 0.2s",
                                fontSize: "10px",
                              }}
                            >{l.slice(0, 3)}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STEP 3 — Goal Selection ── */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-px" style={{ backgroundColor: "#C8FF00" }} />
                <span
                  className="text-xs tracking-widest uppercase"
                  style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
                >Step 3 of 3</span>
              </div>

              <h2
                className="font-black leading-none mb-2"
                style={{
                  fontFamily: "var(--font-syne)",
                  color: "#F0F0FF",
                  fontSize: "clamp(28px, 4vw, 44px)",
                }}
              >
                What are you<br />
                <span style={{ color: "#C8FF00" }}>working toward?</span>
              </h2>
              <p
                className="text-sm mb-10"
                style={{ color: "#6B6A80", lineHeight: 1.7 }}
              >
                This shapes your adaptive path and recommended practice sets.
              </p>

              <div className="space-y-3">
                {GOALS.map(g => {
                  const active = goal === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setGoal(g.id)}
                      className="w-full flex items-center gap-5 px-5 py-4 text-left transition-all duration-200"
                      style={{
                        border: `1px solid ${active ? "#C8FF00" : "#1E1E36"}`,
                        backgroundColor: active ? "#C8FF000D" : "#0F0F1A",
                      }}
                      onMouseEnter={e => {
                        if (!active) e.currentTarget.style.borderColor = "#C8FF0030";
                      }}
                      onMouseLeave={e => {
                        if (!active) e.currentTarget.style.borderColor = "#1E1E36";
                      }}
                    >
                      {/* Icon */}
                      <span
                        className="text-xl flex-shrink-0 transition-colors duration-200"
                        style={{ color: active ? "#C8FF00" : "#6B6A80" }}
                      >{g.icon}</span>

                      {/* Text */}
                      <div className="flex-1">
                        <div
                          className="text-sm font-black mb-0.5 transition-colors duration-200"
                          style={{
                            fontFamily: "var(--font-syne)",
                            color: active ? "#F0F0FF" : "#6B6A80",
                          }}
                        >{g.label}</div>
                        <div
                          className="text-xs"
                          style={{
                            color: active ? "#C8FF0080" : "#1E1E36",
                            fontFamily: "var(--font-dm-mono)",
                            transition: "color 0.2s",
                          }}
                        >{g.desc}</div>
                      </div>

                      {/* Checkmark */}
                      <div
                        className="flex items-center justify-center flex-shrink-0 transition-all duration-200"
                        style={{
                          width: 22, height: 22,
                          border: `1px solid ${active ? "#C8FF00" : "#1E1E36"}`,
                          backgroundColor: active ? "#C8FF00" : "transparent",
                        }}
                      >
                        {active && (
                          <span
                            className="text-xs font-black"
                            style={{ color: "#08080F" }}
                          >✓</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Navigation ── */}
          <div className="flex items-center justify-between mt-12">
            {step > 1 ? (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-2 px-6 py-3 text-sm font-bold transition-all duration-200"
                style={{
                  border: "1px solid #1E1E36",
                  color: "#6B6A80",
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
                ← Back
              </button>
            ) : (
              <div />
            )}

            <button
              onClick={goNext}
              disabled={!canProceed || saving}
              className="flex items-center gap-2 px-10 py-3 text-sm font-black tracking-widest transition-all duration-200 disabled:opacity-30"
              style={{
                backgroundColor: "#C8FF00",
                color: "#08080F",
                fontFamily: "var(--font-syne)",
              }}
              onMouseEnter={e => {
                if (canProceed) e.currentTarget.style.backgroundColor = "#DAFF33";
              }}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#C8FF00")}
            >
              {saving ? "SAVING..." : step === 3 ? "FINISH →" : "NEXT →"}
            </button>
          </div>

        </div>
      </div>

      {/* Slider thumb styles */}
      <style>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          background: #C8FF00;
          border: 2px solid #08080F;
          border-radius: 0;
          cursor: pointer;
          transition: transform 0.15s;
        }
        input[type='range']::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        input[type='range']::-moz-range-thumb {
          width: 18px;
          height: 18px;
          background: #C8FF00;
          border: 2px solid #08080F;
          border-radius: 0;
          cursor: pointer;
        }
        @keyframes orbPulse {
          0%, 100% { transform: scale(1);    opacity: 0.4; }
          50%       { transform: scale(1.2); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}