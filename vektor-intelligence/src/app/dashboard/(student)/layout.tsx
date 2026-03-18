"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/authstore";
import { logOut } from "@/lib/auth";

const NAV = [
  { href: "/dashboard",          label: "Session",  icon: "◈", desc: "Ask · Explore · Learn"  },
  { href: "/dashboard/practice", label: "Practice", icon: "◇", desc: "Tasks · Drills · Quiz"   },
  { href: "/dashboard/progress", label: "Progress", icon: "◉", desc: "Growth · Rings · Streak" },
];

const SUBJECT_COLORS: Record<string, string> = {
  mathematics:      "#1A4D9F",
  physics:          "#5B3FCC",
  chemistry:        "#006677",
  biology:          "#3A6B00",
  computer_science: "#7A5200",
};
const SUBJECT_SYMBOLS: Record<string, string> = {
  mathematics:      "∫",
  physics:          "∇",
  chemistry:        "⇌",
  biology:          "∂",
  computer_science: "λ",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, loading, setUser } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut,  setSigningOut]  = useState(false);

  useEffect(() => {
    if (!loading && !user) window.location.href = "/auth/login";
    if (!loading && user && !user.onboardingComplete)
      window.location.href = "/onboarding";
  }, [user, loading, router]);

  async function handleSignOut() {
    setSigningOut(true);
    await logOut();
    setUser(null);
    window.location.href = "/";
  }

  if (loading || !user) return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "#08080F" }}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="flex items-center justify-center"
          style={{
            width: 48, height: 48,
            border: "1px solid #C8FF0050",
            backgroundColor: "#0F0F1A",
          }}
        >
          <span
            className="font-black"
            style={{ fontFamily: "var(--font-syne)", color: "#C8FF00" }}
          >VI</span>
        </div>
        <p
          className="text-xs tracking-widest uppercase"
          style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
        >Loading...</p>
      </div>
    </div>
  );

  const initials = user.displayName
    ? user.displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "VI";

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: "#08080F" }}
    >
      {/* ── SIDEBAR ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 lg:hidden"
          style={{ backgroundColor: "#08080FCC" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className="fixed top-0 left-0 h-full z-30 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto"
        style={{
          width: 240,
          backgroundColor: "#08080F",
          borderRight: "1px solid #1E1E36",
          transform: sidebarOpen ? "translateX(0)" : undefined,
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5 flex-shrink-0"
          style={{ borderBottom: "1px solid #1E1E36" }}
        >
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 32, height: 32,
              border: "1px solid #C8FF0050",
              backgroundColor: "#0F0F1A",
            }}
          >
            <span
              className="font-black text-xs leading-none"
              style={{ fontFamily: "var(--font-syne)", color: "#C8FF00" }}
            >VI</span>
          </div>
          <div>
            <div
              className="text-xs font-black tracking-widest leading-none"
              style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
            >VEKTOR</div>
            <div
              className="text-xs tracking-widest leading-none mt-0.5"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)", fontSize: "10px" }}
            >INTELLIGENCE</div>
          </div>
          <button
            className="ml-auto lg:hidden"
            onClick={() => setSidebarOpen(false)}
            style={{ color: "#6B6A80" }}
          >✕</button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <p
            className="text-xs tracking-widest uppercase px-2 mb-3"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)", fontSize: "10px" }}
          >Learn</p>

          {NAV.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-3 mb-1 transition-all duration-150"
                style={{
                  backgroundColor: active ? "#C8FF0010" : "transparent",
                  border: `1px solid ${active ? "#C8FF0030" : "transparent"}`,
                }}
                onMouseEnter={e => {
                  if (!active) e.currentTarget.style.backgroundColor = "#0F0F1A";
                }}
                onMouseLeave={e => {
                  if (!active) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span
                  style={{
                    color: active ? "#C8FF00" : "#6B6A80",
                    fontSize: 16,
                    transition: "color 0.15s",
                  }}
                >{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-bold leading-none"
                    style={{
                      fontFamily: "var(--font-syne)",
                      color: active ? "#F0F0FF" : "#6B6A80",
                      transition: "color 0.15s",
                    }}
                  >{item.label}</div>
                  <div
                    className="leading-none mt-1"
                    style={{
                      color: active ? "#C8FF0070" : "#1E1E36",
                      fontFamily: "var(--font-dm-mono)",
                      fontSize: "10px",
                      transition: "color 0.15s",
                    }}
                  >{item.desc}</div>
                </div>
                {active && (
                  <div
                    className="w-1 h-1 rounded-full flex-shrink-0"
                    style={{ backgroundColor: "#C8FF00" }}
                  />
                )}
              </Link>
            );
          })}

          {/* Subjects */}
          <p
            className="text-xs tracking-widest uppercase px-2 mb-3 mt-6"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)", fontSize: "10px" }}
          >Your subjects</p>

          {user.subjects && user.subjects.length > 0 ? (
            user.subjects.map((sid: string) => {
              const color  = SUBJECT_COLORS[sid]  || "#6B6A80";
              const symbol = SUBJECT_SYMBOLS[sid] || "○";
              const label  = sid.replace("_", " ");
              return (
                <div key={sid} className="flex items-center gap-2 px-3 py-2 mb-1">
                  <div
                    className="flex items-center justify-center flex-shrink-0 font-mono text-xs"
                    style={{
                      width: 22, height: 22,
                      border: `1px solid ${color}40`,
                      backgroundColor: `${color}10`,
                      color,
                      fontFamily: "var(--font-dm-mono)",
                    }}
                  >{symbol}</div>
                  <span
                    className="text-xs capitalize"
                    style={{ color: "#6B6A80", fontFamily: "var(--font-instrument)" }}
                  >{label}</span>
                </div>
              );
            })
          ) : (
            <p className="text-xs px-3" style={{ color: "#1E1E36", fontFamily: "var(--font-dm-mono)" }}>
              No subjects selected
            </p>
          )}

          {/* Teacher info */}
          {user.teacherId && (
            <>
              <p
                className="text-xs tracking-widest uppercase px-2 mb-3 mt-6"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)", fontSize: "10px" }}
              >Your teacher</p>
              <div
                className="flex items-center gap-2 px-3 py-2"
                style={{ border: "1px solid #00E5FF20", backgroundColor: "#00E5FF08" }}
              >
                <div
                  className="flex items-center justify-center flex-shrink-0 text-xs font-black"
                  style={{ width: 28, height: 28, backgroundColor: "#00E5FF20", color: "#00E5FF", fontFamily: "var(--font-syne)" }}
                >T</div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: "#00E5FF", fontFamily: "var(--font-syne)" }}>Enrolled</div>
                  <div className="truncate" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)", fontSize: "10px" }}>Class active</div>
                </div>
              </div>
            </>
          )}

          {/* Solo mode */}
          {!user.teacherId && (
            <>
              <p
                className="text-xs tracking-widest uppercase px-2 mb-3 mt-6"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)", fontSize: "10px" }}
              >Mode</p>
              <div
                className="flex items-center gap-2 px-3 py-2"
                style={{ border: "1px solid #1E1E36" }}
              >
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#C8FF00" }} />
                <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Solo mode</span>
              </div>
            </>
          )}
        </nav>

        {/* Bottom — Settings + user info + sign out */}
        <div className="flex-shrink-0 p-4" style={{ borderTop: "1px solid #1E1E36" }}>

          {/* ── Settings link ── */}
          <Link
            href="/settings"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 mb-3 transition-all duration-150"
            style={{
              border: `1px solid ${pathname === "/settings" ? "#C8FF0030" : "#1E1E36"}`,
              backgroundColor: pathname === "/settings" ? "#C8FF0010" : "transparent",
              color: pathname === "/settings" ? "#C8FF00" : "#6B6A80",
            }}
            onMouseEnter={e => {
              if (pathname !== "/settings") e.currentTarget.style.backgroundColor = "#0F0F1A";
            }}
            onMouseLeave={e => {
              if (pathname !== "/settings") e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <span style={{ fontSize: 13 }}>⚙</span>
            <span
              className="text-xs font-bold"
              style={{ fontFamily: "var(--font-instrument)" }}
            >Settings</span>
          </Link>

          {/* Plan badge + email */}
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs truncate" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
              {user.email}
            </span>
            <div
              className="px-2 py-0.5 text-xs font-black ml-2 flex-shrink-0"
              style={{
                backgroundColor: user.plan === "pro" ? "#7B5CFF20" : "#1E1E36",
                color: user.plan === "pro" ? "#7B5CFF" : "#6B6A80",
                fontFamily: "var(--font-dm-mono)",
                fontSize: "10px",
              }}
            >{user.plan === "pro" ? "PRO" : "FREE"}</div>
          </div>

          {/* User row */}
          <div className="flex items-center gap-3 mb-3">
            <div
              className="flex items-center justify-center flex-shrink-0 font-black text-xs"
              style={{
                width: 32, height: 32,
                backgroundColor: "#C8FF0020",
                color: "#C8FF00",
                fontFamily: "var(--font-syne)",
              }}
            >{initials}</div>
            <div className="flex-1 min-w-0">
              <div
                className="text-xs font-bold truncate"
                style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
              >{user.displayName}</div>
              <div
                className="capitalize truncate"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)", fontSize: "10px" }}
              >{user.role}</div>
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full py-2 text-xs transition-all duration-150 disabled:opacity-40"
            style={{
              border: "1px solid #1E1E36",
              color: "#6B6A80",
              fontFamily: "var(--font-dm-mono)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "#FF3D5750";
              e.currentTarget.style.color = "#FF3D57";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "#1E1E36";
              e.currentTarget.style.color = "#6B6A80";
            }}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <header
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid #1E1E36", backgroundColor: "#08080F" }}
        >
          {/* Mobile hamburger */}
          <button
            className="lg:hidden flex flex-col gap-1.5 mr-4"
            onClick={() => setSidebarOpen(true)}
          >
            <div className="w-5 h-px" style={{ backgroundColor: "#6B6A80" }} />
            <div className="w-5 h-px" style={{ backgroundColor: "#6B6A80" }} />
            <div className="w-5 h-px" style={{ backgroundColor: "#6B6A80" }} />
          </button>

          {/* Greeting */}
          <div className="flex-1">
            <h1
              className="font-black leading-none"
              style={{
                fontFamily: "var(--font-syne)",
                color: "#F0F0FF",
                fontSize: "clamp(16px, 2vw, 22px)",
              }}
            >
              {getGreeting()},{" "}
              <span style={{ color: "#C8FF00" }}>
                {user.displayName?.split(" ")[0] || "there"}.
              </span>
            </h1>
            <p
              className="text-xs mt-0.5"
              style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
            >{formatDate()}</p>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Streak */}
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5"
              style={{ border: "1px solid #1E1E36", backgroundColor: "#0F0F1A" }}
            >
              <span style={{ color: "#C8FF00", fontSize: 14 }}>◆</span>
              <span className="text-xs font-black" style={{ fontFamily: "var(--font-dm-mono)", color: "#F0F0FF" }}>
                {user.streak ?? 0}
              </span>
              <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                day streak
              </span>
            </div>

            {/* Settings icon — top bar shortcut */}
            <Link
              href="/settings"
              className="flex items-center justify-center transition-all duration-150"
              style={{
                width: 34, height: 34,
                border: `1px solid ${pathname === "/settings" ? "#C8FF0040" : "#1E1E36"}`,
                backgroundColor: pathname === "/settings" ? "#C8FF0010" : "#0F0F1A",
                color: pathname === "/settings" ? "#C8FF00" : "#6B6A80",
                fontSize: 15,
              }}
              title="Settings"
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "#C8FF0040";
                e.currentTarget.style.color = "#C8FF00";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = pathname === "/settings" ? "#C8FF0040" : "#1E1E36";
                e.currentTarget.style.color = pathname === "/settings" ? "#C8FF00" : "#6B6A80";
              }}
            >⚙</Link>

            {/* Live dot */}
            <div className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "#C8FF00", animation: "pulse 2s infinite" }}
              />
              <span
                className="text-xs tracking-widest hidden md:block"
                style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
              >LIVE</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate() {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}