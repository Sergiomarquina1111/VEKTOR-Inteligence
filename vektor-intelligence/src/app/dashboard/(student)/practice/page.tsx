"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/authstore";

// ── Types ──────────────────────────────────────────────────────────
type QuestionType = "mcq" | "freetext";
type Difficulty   = 1 | 2 | 3 | 4 | 5;

interface Option {
  id:    string;
  text:  string;
}

interface Question {
  id:          string;
  subject:     string;
  concept:     string;
  difficulty:  Difficulty;
  type:        QuestionType;
  text:        string;
  options?:    Option[];   // MCQ only
  correct:     string;     // option id for MCQ, expected answer for freetext
  explanation: string;
}

interface AnswerResult {
  score:      number;   // 0–1
  verdict:    string;
  correction: string;
  correct:    boolean;
}

// ── Constants ──────────────────────────────────────────────────────
const SUBJECT_COLORS: Record<string, string> = {
  mathematics:      "#1A4D9F",
  physics:          "#5B3FCC",
  chemistry:        "#006677",
  biology:          "#3A6B00",
  computer_science: "#7A5200",
};
const SUBJECT_LABELS: Record<string, string> = {
  mathematics:      "Mathematics",
  physics:          "Physics",
  chemistry:        "Chemistry",
  biology:          "Biology",
  computer_science: "Computer Science",
};
const SUBJECT_SYMBOLS: Record<string, string> = {
  mathematics:      "∫",
  physics:          "∇",
  chemistry:        "⇌",
  biology:          "∂",
  computer_science: "λ",
};

// ── Mock question bank ────────────────────────────────────────────
const MOCK_QUESTIONS: Question[] = [
  {
    id: "q1", subject: "mathematics", concept: "Eigenvalues",
    difficulty: 2, type: "mcq",
    text: "If λ is an eigenvalue of matrix A, which of the following is always true?",
    options: [
      { id: "a", text: "det(A - λI) = 0" },
      { id: "b", text: "det(A + λI) = 0" },
      { id: "c", text: "Av = 0 for all vectors v" },
      { id: "d", text: "A - λI is invertible" },
    ],
    correct: "a",
    explanation: "By definition, λ is an eigenvalue of A if and only if the matrix (A − λI) is singular, meaning det(A − λI) = 0. This is the characteristic equation.",
  },
  {
    id: "q2", subject: "mathematics", concept: "Matrix Transformation",
    difficulty: 3, type: "mcq",
    text: "A linear transformation T: ℝⁿ → ℝⁿ has eigenvalue 0. What does this imply?",
    options: [
      { id: "a", text: "T is the identity transformation" },
      { id: "b", text: "T is not invertible" },
      { id: "c", text: "T maps all vectors to zero" },
      { id: "d", text: "T has no other eigenvalues" },
    ],
    correct: "b",
    explanation: "If 0 is an eigenvalue, then det(A − 0·I) = det(A) = 0, so A is singular and therefore not invertible. The transformation collapses some non-zero vector to the zero vector.",
  },
  {
    id: "q3", subject: "mathematics", concept: "Diagonalization",
    difficulty: 4, type: "freetext",
    text: "Explain in your own words why a matrix with n linearly independent eigenvectors is diagonalizable. What role do the eigenvectors play in this process?",
    correct: "A matrix is diagonalizable when its eigenvectors form a basis for the space. The eigenvectors form the columns of matrix P, and the diagonal matrix D contains the corresponding eigenvalues. The change of basis P transforms A into a diagonal form D = P⁻¹AP.",
    explanation: "Diagonalization requires n linearly independent eigenvectors to form a complete basis. P is the matrix of eigenvectors, D is diagonal with eigenvalues, and A = PDP⁻¹.",
  },
  {
    id: "q4", subject: "mathematics", concept: "Eigenvalues",
    difficulty: 1, type: "mcq",
    text: "What is an eigenvector of a matrix A?",
    options: [
      { id: "a", text: "A vector that is rotated 90° by A" },
      { id: "b", text: "A non-zero vector v where Av = λv for some scalar λ" },
      { id: "c", text: "The zero vector" },
      { id: "d", text: "A vector perpendicular to all rows of A" },
    ],
    correct: "b",
    explanation: "An eigenvector is a non-zero vector v such that applying the matrix A only scales it by a scalar λ (the eigenvalue), without changing its direction: Av = λv.",
  },
  {
    id: "q5", subject: "mathematics", concept: "Spectral Theorem",
    difficulty: 5, type: "freetext",
    text: "The Spectral Theorem states that every real symmetric matrix is orthogonally diagonalizable. Why does symmetry guarantee real eigenvalues and orthogonal eigenvectors?",
    correct: "For a real symmetric matrix A = Aᵀ, eigenvalues are real because the inner product ⟨Av,v⟩ = ⟨v,Av⟩ forces λ||v||² to be real. Eigenvectors corresponding to distinct eigenvalues are orthogonal because if Av₁=λ₁v₁ and Av₂=λ₂v₂, then (λ₁-λ₂)⟨v₁,v₂⟩=0.",
    explanation: "Symmetry ensures Aᵀ = A, which forces all eigenvalues to be real (provable via complex inner products) and guarantees eigenvectors for distinct eigenvalues are orthogonal.",
  },
  {
    id: "q6", subject: "physics", concept: "Quantum Entanglement",
    difficulty: 2, type: "mcq",
    text: "Two particles are quantum entangled. When you measure one particle's spin, what happens to the other?",
    options: [
      { id: "a", text: "Nothing — they are independent after creation" },
      { id: "b", text: "The other particle's state becomes determined instantly" },
      { id: "c", text: "The other particle is destroyed" },
      { id: "d", text: "The other particle gains the same spin" },
    ],
    correct: "b",
    explanation: "Entangled particles share a quantum state. Measuring one instantly determines the correlated state of the other, regardless of distance. This does not allow faster-than-light communication because the outcome is random.",
  },
  {
    id: "q7", subject: "computer_science", concept: "Gradient Descent",
    difficulty: 3, type: "mcq",
    text: "In gradient descent, why do we move in the direction of the negative gradient?",
    options: [
      { id: "a", text: "Because the gradient points toward the maximum" },
      { id: "b", text: "Because the gradient is always positive" },
      { id: "c", text: "Because the negative gradient points toward the minimum" },
      { id: "d", text: "To avoid local minima" },
    ],
    correct: "c",
    explanation: "The gradient points in the direction of steepest ascent. To minimize a loss function, we move opposite to the gradient — in the direction of steepest descent — taking us toward the minimum.",
  },
  {
    id: "q8", subject: "mathematics", concept: "Linear Independence",
    difficulty: 2, type: "mcq",
    text: "A set of vectors {v₁, v₂, v₃} is linearly dependent if:",
    options: [
      { id: "a", text: "At least one vector is the zero vector" },
      { id: "b", text: "One vector can be written as a linear combination of the others" },
      { id: "c", text: "The vectors are all orthogonal" },
      { id: "d", text: "The vectors span ℝ³" },
    ],
    correct: "b",
    explanation: "Linear dependence means at least one vector in the set can be expressed as a linear combination of the others. This means c₁v₁ + c₂v₂ + c₃v₃ = 0 has a non-trivial solution.",
  },
];

// ── Mock AI scoring for free-text ─────────────────────────────────
async function mockScore(answer: string, question: Question): Promise<AnswerResult> {
  await new Promise(r => setTimeout(r, 1200));
  const wordCount  = answer.trim().split(/\s+/).length;
  const hasKeyword = question.correct.split(" ").some(w =>
    w.length > 4 && answer.toLowerCase().includes(w.toLowerCase())
  );
  const score = wordCount < 5 ? 0.2 : hasKeyword ? 0.85 : 0.5;
  return {
    score,
    correct: score >= 0.7,
    verdict: score >= 0.7
      ? "Good understanding demonstrated."
      : score >= 0.4
      ? "Partially correct — key concepts missing."
      : "The core idea is not yet captured.",
    correction: score < 0.7 ? question.explanation : "",
  };
}

// ── Difficulty Indicator ──────────────────────────────────────────
function DifficultyPips({ level, color }: { level: Difficulty; color: string }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="w-2 h-2 rounded-full transition-all duration-300"
          style={{ backgroundColor: i <= level ? color : "#1E1E36" }}
        />
      ))}
    </div>
  );
}

// ── Question Card ─────────────────────────────────────────────────
function QuestionCard({
  question, onAnswer, isPro, questionNumber, total,
}: {
  question:      Question;
  onAnswer:      (result: AnswerResult) => void;
  isPro:         boolean;
  questionNumber:number;
  total:         number;
}) {
  const [selected,    setSelected]    = useState<string>("");
  const [freeText,    setFreeText]    = useState("");
  const [submitted,   setSubmitted]   = useState(false);
  const [result,      setResult]      = useState<AnswerResult | null>(null);
  const [flipped,     setFlipped]     = useState(false);
  const [scoring,     setScoring]     = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const color   = SUBJECT_COLORS[question.subject] || "#C8FF00";
  const symbol  = SUBJECT_SYMBOLS[question.subject] || "○";
  const label   = SUBJECT_LABELS[question.subject]  || question.subject;
  const isFree  = question.type === "freetext";
  const locked  = isFree && !isPro && question.difficulty >= 3;

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function formatTime(s: number) {
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  }

  async function handleSubmit() {
    if (submitted) return;
    if (!isFree && !selected) return;
    if (isFree && !freeText.trim()) return;

    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitted(true);

    let res: AnswerResult;
    if (!isFree) {
      const correct = selected === question.correct;
      res = {
        score:      correct ? 1 : 0,
        correct,
        verdict:    correct ? "Correct!" : "Incorrect.",
        correction: correct ? "" : question.explanation,
      };
    } else {
      setScoring(true);
      res = await mockScore(freeText, question);
      setScoring(false);
    }

    setResult(res);
    setTimeout(() => {
      setFlipped(true);
      setTimeout(() => onAnswer(res), 600);
    }, res.correct ? 400 : 800);
  }

  return (
    <div
      className="relative"
      style={{ perspective: "1200px" }}
    >
      <div
        className="transition-all duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* ── FRONT: Question ── */}
        <div
          className="p-6 flex flex-col gap-5"
          style={{
            backgroundColor: "#0F0F1A",
            border: `1px solid ${submitted && result ? (result.correct ? "#C8FF0040" : "#FF3D5740") : "#1E1E36"}`,
            backfaceVisibility: "hidden",
            transition: "border-color 0.3s",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0 text-sm font-mono"
                style={{
                  width: 32, height: 32,
                  border: `1px solid ${color}40`,
                  backgroundColor: `${color}10`,
                  color,
                  fontFamily: "var(--font-dm-mono)",
                }}
              >{symbol}</div>
              <div>
                <div
                  className="text-xs font-black"
                  style={{ color, fontFamily: "var(--font-syne)" }}
                >{label}</div>
                <div
                  className="text-xs"
                  style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
                >{question.concept}</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <DifficultyPips level={question.difficulty} color={color} />
              <span
                className="text-xs"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
              >{formatTime(elapsed)}</span>
              <span
                className="text-xs"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
              >{questionNumber}/{total}</span>
            </div>
          </div>

          {/* Question text */}
          <p
            className="text-sm leading-relaxed"
            style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)", lineHeight: 1.8 }}
          >{question.text}</p>

          {/* Answer area */}
          {locked ? (
            <div
              className="flex flex-col items-center gap-3 py-6"
              style={{ border: "1px solid #FFB80030", backgroundColor: "#FFB80008" }}
            >
              <span style={{ color: "#FFB800", fontSize: 20 }}>✦</span>
              <p className="text-xs text-center" style={{ color: "#FFB800", fontFamily: "var(--font-dm-mono)" }}>
                Free-text questions at level 3+ require Pro
              </p>
              <Link
                href="/settings"
                className="px-4 py-2 text-xs font-black"
                style={{ backgroundColor: "#FFB800", color: "#08080F", fontFamily: "var(--font-syne)" }}
              >UPGRADE TO PRO →</Link>
            </div>
          ) : !isFree ? (
            // MCQ options
            <div className="space-y-2">
              {question.options?.map(opt => {
                const isSelected = selected === opt.id;
                const isCorrect  = submitted && opt.id === question.correct;
                const isWrong    = submitted && isSelected && !isCorrect;
                return (
                  <button
                    key={opt.id}
                    onClick={() => !submitted && setSelected(opt.id)}
                    disabled={submitted}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-all duration-150 disabled:cursor-default"
                    style={{
                      border: `1px solid ${
                        isCorrect ? "#C8FF0060" :
                        isWrong   ? "#FF3D5760" :
                        isSelected ? `${color}60` : "#1E1E36"
                      }`,
                      backgroundColor: isCorrect ? "#C8FF0010" : isWrong ? "#FF3D5710" : isSelected ? `${color}10` : "#16162A",
                      color: isCorrect ? "#C8FF00" : isWrong ? "#FF3D57" : isSelected ? color : "#6B6A80",
                    }}
                  >
                    <span
                      className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-xs font-black"
                      style={{
                        border: `1px solid ${isCorrect ? "#C8FF0060" : isWrong ? "#FF3D5760" : "#1E1E36"}`,
                        color: isCorrect ? "#C8FF00" : isWrong ? "#FF3D57" : "#3A3A5C",
                        fontFamily: "var(--font-dm-mono)",
                      }}
                    >{opt.id.toUpperCase()}</span>
                    <span style={{ fontFamily: "var(--font-instrument)" }}>{opt.text}</span>
                    {isCorrect && <span className="ml-auto">✓</span>}
                    {isWrong   && <span className="ml-auto">✗</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            // Free-text
            <div>
              <textarea
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
                disabled={submitted}
                placeholder="Write your explanation here..."
                rows={5}
                className="w-full p-4 text-sm outline-none resize-none transition-all duration-200 disabled:opacity-70"
                style={{
                  backgroundColor: "#16162A",
                  border: `1px solid ${freeText ? `${color}40` : "#1E1E36"}`,
                  color: "#F0F0FF",
                  fontFamily: "var(--font-instrument)",
                  lineHeight: 1.7,
                }}
              />
              <div
                className="flex items-center justify-between mt-2"
              >
                <span
                  className="text-xs"
                  style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
                >{freeText.trim().split(/\s+/).filter(Boolean).length} words</span>
                <span
                  className="text-xs"
                  style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
                >AI scored · Level {question.difficulty}</span>
              </div>
            </div>
          )}

          {/* Scoring indicator */}
          {scoring && (
            <div className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "#7B5CFF", animation: "pulse 1s infinite" }}
              />
              <span
                className="text-xs"
                style={{ color: "#7B5CFF", fontFamily: "var(--font-dm-mono)" }}
              >AI scoring your answer...</span>
            </div>
          )}

          {/* Submit button */}
          {!submitted && !locked && (
            <button
              onClick={handleSubmit}
              disabled={(!isFree && !selected) || (isFree && !freeText.trim())}
              className="w-full py-3.5 text-sm font-black tracking-widest transition-all duration-150 disabled:opacity-30"
              style={{
                backgroundColor: color,
                color: "#08080F",
                fontFamily: "var(--font-syne)",
              }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              SUBMIT ANSWER →
            </button>
          )}

          {/* Inline verdict for MCQ (before flip) */}
          {submitted && result && !flipped && (
            <div
              className="px-4 py-3 flex items-center gap-3"
              style={{
                backgroundColor: result.correct ? "#C8FF0010" : "#FF3D5710",
                border: `1px solid ${result.correct ? "#C8FF0030" : "#FF3D5730"}`,
              }}
            >
              <span style={{ color: result.correct ? "#C8FF00" : "#FF3D57", fontSize: 16 }}>
                {result.correct ? "✓" : "✗"}
              </span>
              <span
                className="text-xs"
                style={{
                  color: result.correct ? "#C8FF00" : "#FF3D57",
                  fontFamily: "var(--font-instrument)",
                }}
              >{result.verdict}</span>
            </div>
          )}
        </div>

        {/* ── BACK: Explanation (shown after flip) ── */}
        <div
          className="absolute inset-0 p-6 flex flex-col gap-4"
          style={{
            backgroundColor: "#0F0F1A",
            border: `1px solid ${result?.correct ? "#C8FF0040" : "#FF3D5740"}`,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="flex items-center gap-3">
            <span
              style={{
                color: result?.correct ? "#C8FF00" : "#FF3D57",
                fontSize: 20,
              }}
            >{result?.correct ? "✓" : "✗"}</span>
            <span
              className="text-sm font-black"
              style={{
                fontFamily: "var(--font-syne)",
                color: result?.correct ? "#C8FF00" : "#FF3D57",
              }}
            >{result?.verdict}</span>
            {result && !result.correct && (
              <div
                className="ml-auto px-2 py-1 text-xs"
                style={{
                  backgroundColor: "#FF3D5715",
                  color: "#FF3D57",
                  border: "1px solid #FF3D5730",
                  fontFamily: "var(--font-dm-mono)",
                }}
              >Score: {Math.round((result.score || 0) * 100)}%</div>
            )}
          </div>

          <div
            className="p-4"
            style={{ backgroundColor: "#16162A", border: "1px solid #1E1E36" }}
          >
            <p
              className="text-xs mb-2 tracking-widest uppercase"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
            >Explanation</p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)", lineHeight: 1.8 }}
            >{question.explanation}</p>
          </div>

          {result && !result.correct && result.correction && (
            <div
              className="p-4"
              style={{ backgroundColor: "#7B5CFF10", border: "1px solid #7B5CFF30" }}
            >
              <p
                className="text-xs mb-2 tracking-widest uppercase"
                style={{ color: "#7B5CFF", fontFamily: "var(--font-dm-mono)" }}
              >Correct answer</p>
              <p
                className="text-xs leading-relaxed"
                style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)", lineHeight: 1.7 }}
              >{result.correction}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function PracticePage() {
  const { user } = useAuthStore();
  const isPro    = user?.plan === "pro";

  const [subject,       setSubject]       = useState(user?.subjects?.[0] || "mathematics");
  const [difficulty,    setDifficulty]    = useState<Difficulty>(1);
  const [started,       setStarted]       = useState(false);
  const [questions,     setQuestions]     = useState<Question[]>([]);
  const [currentIndex,  setCurrentIndex]  = useState(0);
  const [results,       setResults]       = useState<AnswerResult[]>([]);
  const [consecutiveRight, setConsecutiveRight] = useState(0);
  const [consecutiveWrong, setConsecutiveWrong] = useState(0);
  const [finished,      setFinished]      = useState(false);

  const FREE_DAILY_LIMIT = 10;
  const usedToday        = 0; // Will be wired to Firestore in Phase 2

  // Build question queue filtered by subject
  function buildQueue(subj: string, diff: Difficulty): Question[] {
    const filtered = MOCK_QUESTIONS.filter(q => q.subject === subj);
    // Sort by difficulty proximity to current level
    return [...filtered].sort((a, b) =>
      Math.abs(a.difficulty - diff) - Math.abs(b.difficulty - diff)
    );
  }

  function handleStart() {
    const queue = buildQueue(subject, difficulty);
    setQuestions(queue);
    setCurrentIndex(0);
    setResults([]);
    setConsecutiveRight(0);
    setConsecutiveWrong(0);
    setFinished(false);
    setStarted(true);
  }

  function handleAnswer(result: AnswerResult) {
    const newResults = [...results, result];
    setResults(newResults);

    // Adaptive difficulty
    let newDiff = difficulty;
    if (result.correct) {
      const streak = consecutiveRight + 1;
      setConsecutiveRight(streak);
      setConsecutiveWrong(0);
      if (streak >= 2 && difficulty < 5) {
        newDiff = (difficulty + 1) as Difficulty;
        setDifficulty(newDiff);
        setConsecutiveRight(0);
      }
    } else {
      const streak = consecutiveWrong + 1;
      setConsecutiveWrong(streak);
      setConsecutiveRight(0);
      if (streak >= 2 && difficulty > 1) {
        newDiff = (difficulty - 1) as Difficulty;
        setDifficulty(newDiff);
        setConsecutiveWrong(0);
      }
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex >= questions.length || (!isPro && newResults.length >= FREE_DAILY_LIMIT)) {
      setTimeout(() => setFinished(true), 700);
    } else {
      setTimeout(() => setCurrentIndex(nextIndex), 700);
    }
  }

  const subjectColor  = SUBJECT_COLORS[subject] || "#C8FF00";
  const correctCount  = results.filter(r => r.correct).length;
  const accuracy      = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;
  const avgScore      = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length * 100)
    : 0;

  // ── Pre-start screen ──────────────────────────────────────────
  if (!started) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-6 h-px" style={{ backgroundColor: "#C8FF00" }} />
            <span
              className="text-xs tracking-widest uppercase"
              style={{ color: "#C8FF00", fontFamily: "var(--font-dm-mono)" }}
            >Practice Mode</span>
          </div>
          <h1
            className="text-2xl font-black"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
          >Sharpen your understanding</h1>
          <p className="text-sm mt-2" style={{ color: "#6B6A80", lineHeight: 1.7 }}>
            AI-generated questions targeted at your misconceptions. The harder you perform, the harder it gets.
          </p>
        </div>

        {/* Subject selector */}
        <div
          className="p-5"
          style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
        >
          <p
            className="text-xs mb-4 tracking-widest uppercase"
            style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
          >Choose subject</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(user?.subjects || Object.keys(SUBJECT_COLORS)).map(subj => {
              const active = subject === subj;
              const color  = SUBJECT_COLORS[subj] || "#C8FF00";
              return (
                <button
                  key={subj}
                  onClick={() => setSubject(subj)}
                  className="flex items-center gap-2 px-3 py-2.5 text-left transition-all duration-150"
                  style={{
                    border: `1px solid ${active ? color : "#1E1E36"}`,
                    backgroundColor: active ? `${color}10` : "#16162A",
                  }}
                >
                  <span
                    style={{
                      color: active ? color : "#3A3A5C",
                      fontFamily: "var(--font-dm-mono)",
                      fontSize: 14,
                    }}
                  >{SUBJECT_SYMBOLS[subj]}</span>
                  <span
                    className="text-xs font-black"
                    style={{
                      color: active ? "#F0F0FF" : "#6B6A80",
                      fontFamily: "var(--font-syne)",
                    }}
                  >{SUBJECT_LABELS[subj]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Starting difficulty */}
        <div
          className="p-5"
          style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
        >
          <div className="flex items-center justify-between mb-4">
            <p
              className="text-xs tracking-widest uppercase"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
            >Starting difficulty</p>
            <span
              className="text-xs px-2 py-1"
              style={{
                backgroundColor: `${subjectColor}15`,
                color: subjectColor,
                border: `1px solid ${subjectColor}30`,
                fontFamily: "var(--font-dm-mono)",
              }}
            >Level {difficulty}</span>
          </div>
          <div className="flex items-center gap-3">
            <DifficultyPips level={difficulty} color={subjectColor} />
            <input
              type="range" min={1} max={5} value={difficulty}
              onChange={e => setDifficulty(parseInt(e.target.value) as Difficulty)}
              className="flex-1 cursor-pointer"
              style={{
                appearance: "none", height: 3, outline: "none",
                background: `linear-gradient(to right, ${subjectColor} ${(difficulty - 1) * 25}%, #1E1E36 ${(difficulty - 1) * 25}%)`,
              }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {["Beginner", "Elementary", "Intermediate", "Advanced", "Expert"].map((l, i) => (
              <span
                key={l}
                className="text-xs"
                style={{
                  color: i + 1 <= difficulty ? subjectColor : "#1E1E36",
                  fontFamily: "var(--font-dm-mono)",
                  fontSize: 9,
                }}
              >{l.slice(0, 3)}</span>
            ))}
          </div>
        </div>

        {/* Free tier notice */}
        {!isPro && (
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: "#FFB80008", border: "1px solid #FFB80025" }}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: "#FFB800", fontSize: 12 }}>✦</span>
              <span
                className="text-xs"
                style={{ color: "#FFB800", fontFamily: "var(--font-dm-mono)" }}
              >Free: {FREE_DAILY_LIMIT - usedToday} questions remaining today</span>
            </div>
            <Link
              href="/settings"
              className="text-xs transition-colors"
              style={{ color: "#FFB800", fontFamily: "var(--font-dm-mono)" }}
            >Upgrade →</Link>
          </div>
        )}

        {/* Start button */}
        <button
          onClick={handleStart}
          className="w-full py-4 text-sm font-black tracking-widest transition-all duration-150"
          style={{ backgroundColor: subjectColor, color: "#08080F", fontFamily: "var(--font-syne)" }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          START PRACTICE →
        </button>

        <style>{`
          input[type='range']::-webkit-slider-thumb {
            -webkit-appearance: none; width: 16px; height: 16px;
            background: ${subjectColor}; border: 2px solid #08080F;
            border-radius: 0; cursor: pointer;
          }
        `}</style>
      </div>
    );
  }

  // ── Finished screen ───────────────────────────────────────────
  if (finished) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center py-8">
          <div
            className="inline-flex items-center justify-center mb-6"
            style={{
              width: 72, height: 72,
              border: `1px solid ${accuracy >= 70 ? "#C8FF0050" : "#FF3D5750"}`,
              backgroundColor: accuracy >= 70 ? "#C8FF0010" : "#FF3D5710",
            }}
          >
            <span
              className="text-2xl font-black"
              style={{ fontFamily: "var(--font-syne)", color: accuracy >= 70 ? "#C8FF00" : "#FF3D57" }}
            >{accuracy >= 70 ? "✓" : "✗"}</span>
          </div>
          <h1
            className="text-2xl font-black mb-2"
            style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
          >{accuracy >= 80 ? "Excellent session!" : accuracy >= 60 ? "Good progress." : "Keep practicing."}</h1>
          <p className="text-sm" style={{ color: "#6B6A80" }}>
            {results.length} questions · {SUBJECT_LABELS[subject]} · Level {difficulty}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Correct",  val: `${correctCount}/${results.length}`, color: "#C8FF00" },
            { label: "Accuracy", val: `${accuracy}%`,                      color: subjectColor },
            { label: "Avg Score",val: `${avgScore}%`,                      color: "#7B5CFF" },
          ].map(s => (
            <div
              key={s.label}
              className="flex flex-col items-center py-5"
              style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
            >
              <span
                className="text-2xl font-black leading-none mb-1"
                style={{ fontFamily: "var(--font-syne)", color: s.color }}
              >{s.val}</span>
              <span
                className="text-xs"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
              >{s.label}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleStart}
            className="flex-1 py-3.5 text-sm font-black tracking-widest transition-all"
            style={{ backgroundColor: subjectColor, color: "#08080F", fontFamily: "var(--font-syne)" }}
          >PRACTICE AGAIN →</button>
          <Link
            href="/dashboard"
            className="flex-1 py-3.5 text-sm font-black tracking-widest text-center transition-all"
            style={{ border: "1px solid #1E1E36", color: "#6B6A80", fontFamily: "var(--font-syne)" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#C8FF0040")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}
          >BACK TO DASHBOARD</Link>
        </div>
      </div>
    );
  }

  // ── Active practice ───────────────────────────────────────────
  const currentQ = questions[currentIndex];
  if (!currentQ) return null;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT — Question card (2/3 width) */}
        <div className="lg:col-span-2">
          {/* Progress bar */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex-1 h-1 overflow-hidden"
              style={{ backgroundColor: "#1E1E36" }}
            >
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${(currentIndex / questions.length) * 100}%`,
                  backgroundColor: subjectColor,
                }}
              />
            </div>
            <span
              className="text-xs flex-shrink-0"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
            >{currentIndex}/{questions.length}</span>
          </div>

          <QuestionCard
            key={currentQ.id + currentIndex}
            question={currentQ}
            onAnswer={handleAnswer}
            isPro={isPro}
            questionNumber={currentIndex + 1}
            total={questions.length}
          />
        </div>

        {/* RIGHT — Session stats (1/3 width) */}
        <div className="flex flex-col gap-4">

          {/* Current difficulty */}
          <div
            className="p-4"
            style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
          >
            <p
              className="text-xs mb-3 tracking-widest uppercase"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
            >Difficulty</p>
            <div className="flex items-center gap-3">
              <DifficultyPips level={difficulty} color={subjectColor} />
              <span
                className="text-xs"
                style={{ color: subjectColor, fontFamily: "var(--font-dm-mono)" }}
              >Level {difficulty}</span>
            </div>
            <p
              className="text-xs mt-2"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
            >
              {consecutiveRight > 0 ? `${consecutiveRight} correct streak` :
               consecutiveWrong > 0 ? `${consecutiveWrong} wrong streak` :
               "Adaptive — adjusts to your performance"}
            </p>
          </div>

          {/* Score */}
          <div
            className="p-4"
            style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
          >
            <p
              className="text-xs mb-3 tracking-widest uppercase"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
            >Session Score</p>
            <div
              className="text-3xl font-black leading-none mb-1"
              style={{ fontFamily: "var(--font-syne)", color: accuracy >= 70 ? "#C8FF00" : "#FF3D57" }}
            >{results.length > 0 ? `${accuracy}%` : "—"}</div>
            <p
              className="text-xs"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
            >{correctCount}/{results.length} correct</p>
          </div>

          {/* Answer history */}
          {results.length > 0 && (
            <div
              className="p-4"
              style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
            >
              <p
                className="text-xs mb-3 tracking-widest uppercase"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
              >History</p>
              <div className="flex flex-wrap gap-1.5">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className="w-6 h-6 flex items-center justify-center text-xs"
                    style={{
                      backgroundColor: r.correct ? "#C8FF0015" : "#FF3D5715",
                      border: `1px solid ${r.correct ? "#C8FF0040" : "#FF3D5740"}`,
                      color: r.correct ? "#C8FF00" : "#FF3D57",
                    }}
                  >{r.correct ? "✓" : "✗"}</div>
                ))}
              </div>
            </div>
          )}

          {/* Free tier limit */}
          {!isPro && (
            <div
              className="p-3"
              style={{ backgroundColor: "#FFB80008", border: "1px solid #FFB80025" }}
            >
              <p
                className="text-xs"
                style={{ color: "#FFB800", fontFamily: "var(--font-dm-mono)" }}
              >
                {results.length}/{FREE_DAILY_LIMIT} free questions used
              </p>
            </div>
          )}

          {/* End session */}
          <button
            onClick={() => setFinished(true)}
            className="w-full py-2.5 text-xs tracking-widest transition-all"
            style={{
              border: "1px solid #1E1E36",
              color: "#3A3A5C",
              fontFamily: "var(--font-dm-mono)",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#FF3D5740")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}
          >END SESSION</button>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}