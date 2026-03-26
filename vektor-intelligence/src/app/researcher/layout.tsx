"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { logOut } from "@/lib/auth";
import { useAuthStore } from "@/store/authstore";

const ACCENT        = "#2BD9A0";
const ACCENT_DIM    = "#2BD9A015";
const ACCENT_BORDER = "#2BD9A035";

const NAV = [
  { href: "/researcher",          label: "Overview",       sym: "◎" },
  { href: "/researcher/dkg",      label: "DKG Explorer",   sym: "⬡" },
  { href: "/researcher/compare",  label: "Compare Groups", sym: "⇌" },
  { href: "/researcher/trends",   label: "Trends",         sym: "∿" },
  { href: "/researcher/export",   label: "Export Tools",   sym: "↗" },
  { href: "/researcher/archive",  label: "Session Archive",sym: "◷" },
];

// Map raw Firestore subject IDs → display labels + colors
const SUBJECT_META: Record<string, { label: string; color: string }> = {
  mathematics:      { label: "Mathematics",      color: "#C8FF00" },
  physics:          { label: "Physics",          color: "#00E5FF" },
  chemistry:        { label: "Chemistry",        color: "#2BD9A0" },
  biology:          { label: "Biology",          color: "#FF6B6B" },
  computer_science: { label: "Computer Science", color: "#FFB800" },
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function ResearcherDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.refresh(); router.push("/auth/login"); return; }
    if (!user.onboardingComplete) { router.refresh(); router.push("/onboarding"); return; }
    if (user.role !== "researcher") {
      router.refresh();
      switch (user.role) {
        case "teacher": router.push("/teacher"); break;
        case "admin":   router.push("/dashboard/admin"); break;
        default:        router.push("/dashboard"); break;
      }
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#08080F" }}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="flex items-center justify-center"
            style={{
              width: 48, height: 48,
              border: `1px solid ${ACCENT_BORDER}`,
              backgroundColor: "#0F0F1A",
            }}
          >
            <span
              className="font-black text-lg"
              style={{ fontFamily: "var(--font-syne)", color: ACCENT }}
            >VI</span>
          </div>
          <span
            className="text-xs tracking-widest"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
          >LOADING...</span>
        </div>
      </div>
    );
  }

  async function handleSignOut() {
    await logOut();
    router.refresh();
    router.push("/auth/login");
  }

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: "#08080F", color: "#F0F0FF" }}
    >
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 lg:hidden"
          style={{ backgroundColor: "#08080FCC" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ══════════════════════════════════════════
          SIDEBAR
      ══════════════════════════════════════════ */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-30 flex flex-col
          transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static lg:z-auto
        `}
        style={{
          width: 240,
          backgroundColor: "#08080F",
          borderRight: "1px solid #1E1E36",
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-6 py-5"
          style={{ borderBottom: "1px solid #1E1E36" }}
        >
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 32, height: 32,
              border: `1px solid ${ACCENT_BORDER}`,
              backgroundColor: "#0F0F1A",
            }}
          >
            <span
              className="font-black text-xs"
              style={{ fontFamily: "var(--font-syne)", color: ACCENT }}
            >VI</span>
          </div>
          <div>
            <div
              className="text-xs font-black tracking-widest"
              style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
            >VEKTOR</div>
            <div
              className="text-xs tracking-widest"
              style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)", fontSize: 9 }}
            >RESEARCHER</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {/* Role badge */}
          <div
            className="flex items-center gap-2 px-3 py-2 mb-3"
            style={{
              backgroundColor: ACCENT_DIM,
              border: `1px solid ${ACCENT_BORDER}`,
            }}
          >
            <span style={{ color: ACCENT, fontSize: 12 }}>◎</span>
            <span
              className="text-xs tracking-widest"
              style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}
            >RESEARCH PORTAL</span>
          </div>

          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-150"
                style={{
                  backgroundColor: active ? ACCENT_DIM : "transparent",
                  borderLeft: active ? `2px solid ${ACCENT}` : "2px solid transparent",
                  color: active ? ACCENT : "#6B6A80",
                  fontFamily: "var(--font-instrument)",
                }}
              >
                <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>
                  {item.sym}
                </span>
                {item.label}
                {active && (
                  <div
                    className="ml-auto w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: ACCENT }}
                  />
                )}
              </Link>
            );
          })}

          {/* Published DKG subjects */}
          {(user.subjects || []).length > 0 && (
            <>
              <div className="pt-4 pb-2 px-3">
                <span
                  className="text-xs tracking-widest uppercase"
                  style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
                >Published DKGs</span>
              </div>
              {(user.subjects || []).map((subjectId) => {
                const meta = SUBJECT_META[subjectId];
                return (
                  <div
                    key={subjectId}
                    className="flex items-center gap-3 px-3 py-2 text-xs"
                    style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: meta?.color || "#6B6A80" }}
                    />
                    {meta?.label || subjectId}
                  </div>
                );
              })}
            </>
          )}
        </nav>

        {/* User + sign out */}
        <div className="px-4 py-4" style={{ borderTop: "1px solid #1E1E36" }}>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="flex items-center justify-center flex-shrink-0 text-xs font-black"
              style={{
                width: 28, height: 28,
                backgroundColor: ACCENT_DIM,
                border: `1px solid ${ACCENT_BORDER}`,
                color: ACCENT,
                fontFamily: "var(--font-syne)",
              }}
            >
              {(user.displayName || "R")[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div
                className="text-xs font-bold truncate"
                style={{ color: "#F0F0FF", fontFamily: "var(--font-syne)" }}
              >{user.displayName}</div>
              <div
                className="text-xs truncate"
                style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)", fontSize: 10 }}
              >Researcher</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full text-xs py-2 transition-colors duration-150 tracking-widest"
            style={{
              color: "#3A3A5C",
              border: "1px solid #1E1E36",
              fontFamily: "var(--font-dm-mono)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#FF3D57")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#3A3A5C")}
          >
            SIGN OUT
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid #1E1E36", backgroundColor: "#08080F" }}
        >
          <button
            className="lg:hidden flex flex-col gap-1.5 p-1"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-5 h-px" style={{ backgroundColor: "#6B6A80" }} />
            ))}
          </button>

          <div className="hidden lg:block">
            <span
              className="text-sm"
              style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)" }}
            >
              {getGreeting()},{" "}
              <span style={{ color: "#F0F0FF" }}>{user.displayName?.split(" ")[0]}</span>
            </span>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <span
              className="text-xs"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
            >{dateStr}</span>
            <div className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: ACCENT, animation: "pulse 2s infinite" }}
              />
              <span
                className="text-xs tracking-widest hidden sm:block"
                style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}
              >LIVE</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}