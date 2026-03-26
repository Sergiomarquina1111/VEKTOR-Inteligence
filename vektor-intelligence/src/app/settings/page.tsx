"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/authstore";
import { logOut } from "@/lib/auth";

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
const ROLE_COLORS: Record<string, string> = {
  student:    "#C8FF00",
  teacher:    "#7B5CFF",
  researcher: "#2BD9A0",
  admin:      "#FF3D57",
};
const ALL_SUBJECTS = Object.keys(SUBJECT_COLORS);

const SECTIONS = [
  { id: "profile",       label: "Profile",       sym: "◈" },
  { id: "appearance",    label: "Appearance",    sym: "◎" },
  { id: "notifications", label: "Notifications", sym: "◇" },
  { id: "accessibility", label: "Accessibility", sym: "⬡" },
  { id: "subjects",      label: "Subjects",      sym: "∫" },
  { id: "account",       label: "Account",       sym: "✦" },
];

// ── Toggle component ───────────────────────────────────────────────
function Toggle({
  checked, onChange, color = "#C8FF00",
}: { checked: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 transition-all duration-200"
      style={{
        width: 44, height: 24,
        backgroundColor: checked ? color : "#1E1E36",
        border: `1px solid ${checked ? color : "#3A3A5C"}`,
      }}
    >
      <div
        className="absolute top-1 transition-all duration-200"
        style={{
          width: 14, height: 14,
          backgroundColor: checked ? "#08080F" : "#3A3A5C",
          left: checked ? 26 : 4,
        }}
      />
    </button>
  );
}

// ── Setting row ────────────────────────────────────────────────────
function SettingRow({
  label, desc, children,
}: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-6 py-4"
      style={{ borderBottom: "1px solid #1E1E3620" }}
    >
      <div className="min-w-0">
        <div
          className="text-sm font-bold"
          style={{ color: "#F0F0FF", fontFamily: "var(--font-instrument)" }}
        >{label}</div>
        {desc && (
          <div
            className="text-xs mt-0.5"
            style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
          >{desc}</div>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// ── Section card ───────────────────────────────────────────────────
function SectionCard({
  id, title, children, activeSection,
}: { id: string; title: string; children: React.ReactNode; activeSection: string }) {
  if (activeSection !== id) return null;
  return (
    <div
      className="p-6"
      style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}
    >
      <h2
        className="text-sm font-black mb-5"
        style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
      >{title}</h2>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();

  const [activeSection, setActiveSection] = useState("profile");

  // Profile
  const [displayName, setDisplayName]   = useState(user?.displayName || "");
  const [institution, setInstitution]   = useState((user as any)?.institution || "");
  const [profileSaved, setProfileSaved] = useState(false);

  // Appearance
  const [darkMode,    setDarkMode]    = useState(true);
  const [themeSaving, setThemeSaving] = useState(false);

  // Notifications
  const [notifSession,   setNotifSession]   = useState(true);
  const [notifAssignment,setNotifAssignment] = useState(true);
  const [notifStreak,    setNotifStreak]    = useState(true);
  const [notifInApp,     setNotifInApp]     = useState(true);
  const [emailFreq,      setEmailFreq]      = useState<"daily" | "weekly" | "never">("weekly");

  // Accessibility
  const [fontSize,       setFontSize]       = useState<100 | 125 | 150>(100);
  const [reduceMotion,   setReduceMotion]   = useState(false);
  const [highContrast,   setHighContrast]   = useState(false);
  const [screenReader,   setScreenReader]   = useState(false);

  // Subjects
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(user?.subjects || []);
  const [subjectsSaved,    setSubjectsSaved]    = useState(false);

  // Account
  const [deleteConfirm,   setDeleteConfirm]   = useState("");
  const [deleteStep,      setDeleteStep]      = useState<1 | 2>(1);
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNew,     setPasswordNew]     = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordMsg,     setPasswordMsg]     = useState("");

  const roleColor = ROLE_COLORS[user?.role || "student"] || "#C8FF00";

  // ── Handlers ───────────────────────────────────────────────────
  async function saveProfile() {
    if (!user) return;
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      await updateDoc(doc(db, "users", user.uid), { displayName, institution });
      setUser({ ...user, displayName });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
  }

  async function saveTheme(dark: boolean) {
    setDarkMode(dark);
    setThemeSaving(true);
    // Apply theme class to document root
    document.documentElement.classList.toggle("light-mode", !dark);
    // Save to Firestore
    if (user) {
      try {
        const { doc, updateDoc } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        await updateDoc(doc(db, "users", user.uid), { theme: dark ? "dark" : "light" });
      } catch (e) { console.error(e); }
    }
    setTimeout(() => setThemeSaving(false), 600);
  }

  async function saveSubjects() {
    if (!user || selectedSubjects.length === 0) return;
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      await updateDoc(doc(db, "users", user.uid), { subjects: selectedSubjects });
      setUser({ ...user, subjects: selectedSubjects });
      setSubjectsSaved(true);
      setTimeout(() => setSubjectsSaved(false), 2000);
    } catch (e) { console.error(e); }
  }

  async function changePassword() {
    if (passwordNew !== passwordConfirm) {
      setPasswordMsg("Passwords do not match.");
      return;
    }
    if (passwordNew.length < 6) {
      setPasswordMsg("Password must be at least 6 characters.");
      return;
    }
    try {
      const { updatePassword, EmailAuthProvider, reauthenticateWithCredential } = await import("firebase/auth");
      const { auth } = await import("@/lib/firebase");
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) return;
      const credential = EmailAuthProvider.credential(currentUser.email, passwordCurrent);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, passwordNew);
      setPasswordMsg("Password updated successfully.");
      setPasswordCurrent(""); setPasswordNew(""); setPasswordConfirm("");
    } catch (e: any) {
      setPasswordMsg(e.code === "auth/wrong-password" ? "Current password is incorrect." : "Failed to update password.");
    }
  }

  async function downloadData() {
    if (!user) return;
    const data = JSON.stringify({ user, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `vektor-data-${user.uid}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    if (deleteConfirm !== "DELETE") return;
    try {
      const { deleteUser } = await import("firebase/auth");
      const { auth } = await import("@/lib/firebase");
      if (auth.currentUser) await deleteUser(auth.currentUser);
      await logOut();
      router.push("/");
    } catch (e) {
      console.error(e);
    }
  }

  function toggleSubject(id: string) {
    setSelectedSubjects(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }

  if (!user) return null;

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#08080F", color: "#F0F0FF" }}
    >
      {/* ── Top bar ── */}
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid #1E1E36", backgroundColor: "#08080F" }}
      >
        <div className="flex items-center gap-3">
          <Link
            href={user.role === "teacher" ? "/teacher" : user.role === "researcher" ? "/researcher" : "/dashboard"}
            className="text-xs transition-colors"
            style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#C8FF00")}
            onMouseLeave={e => (e.currentTarget.style.color = "#3A3A5C")}
          >← Dashboard</Link>
          <span style={{ color: "#3A3A5C", fontSize: 10 }}>›</span>
          <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Settings</span>
        </div>
        <div
          className="flex items-center justify-center"
          style={{ width: 32, height: 32, border: "1px solid #C8FF0030", backgroundColor: "#0F0F1A" }}
        >
          <span className="font-black text-xs" style={{ fontFamily: "var(--font-syne)", color: "#C8FF00" }}>VI</span>
        </div>
      </header>

      <div className="flex max-w-5xl mx-auto">

        {/* ── Sidebar nav ── */}
        <aside
          className="hidden lg:flex flex-col flex-shrink-0 py-8 pr-6"
          style={{ width: 220, borderRight: "1px solid #1E1E36" }}
        >
          <p
            className="text-xs tracking-widest uppercase mb-4 px-3"
            style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}
          >Settings</p>
          {SECTIONS.map(s => {
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-all duration-150"
                style={{
                  backgroundColor: active ? "#C8FF0010" : "transparent",
                  borderLeft:      active ? "2px solid #C8FF00" : "2px solid transparent",
                  color:           active ? "#C8FF00" : "#6B6A80",
                  fontFamily:      "var(--font-instrument)",
                }}
              >
                <span style={{ fontSize: 12 }}>{s.sym}</span>
                {s.label}
              </button>
            );
          })}
        </aside>

        {/* ── Mobile section selector ── */}
        <div className="lg:hidden w-full px-4 pt-6 pb-2 overflow-x-auto">
          <div className="flex gap-2">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className="flex-shrink-0 px-3 py-2 text-xs font-black transition-all"
                style={{
                  backgroundColor: activeSection === s.id ? "#C8FF0015" : "#0F0F1A",
                  border:          `1px solid ${activeSection === s.id ? "#C8FF0040" : "#1E1E36"}`,
                  color:           activeSection === s.id ? "#C8FF00" : "#6B6A80",
                  fontFamily:      "var(--font-syne)",
                }}
              >{s.label}</button>
            ))}
          </div>
        </div>

        {/* ── Main content ── */}
        <main className="flex-1 p-6 lg:p-8 space-y-4 min-w-0">

          {/* ══ PROFILE ══ */}
          <SectionCard id="profile" title="Profile" activeSection={activeSection}>
            {/* Avatar + name */}
            <div className="flex items-center gap-4 mb-6 pb-6" style={{ borderBottom: "1px solid #1E1E36" }}>
              <div
                className="flex items-center justify-center flex-shrink-0 text-xl font-black"
                style={{
                  width: 56, height: 56,
                  backgroundColor: `${roleColor}15`,
                  border: `1px solid ${roleColor}40`,
                  color: roleColor,
                  fontFamily: "var(--font-syne)",
                }}
              >{(user.displayName || "U")[0].toUpperCase()}</div>
              <div>
                <div
                  className="text-sm font-black"
                  style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}
                >{user.displayName}</div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                >{user.email}</div>
                <div
                  className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 text-xs"
                  style={{
                    backgroundColor: `${roleColor}15`,
                    border: `1px solid ${roleColor}30`,
                    color: roleColor,
                    fontFamily: "var(--font-dm-mono)",
                  }}
                >
                  <span>{user.role?.toUpperCase()}</span>
                </div>
              </div>
            </div>

            {/* Display name */}
            <div className="space-y-4">
              <div>
                <label
                  className="block text-xs mb-2 tracking-widest uppercase"
                  style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                >Display name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 text-sm outline-none"
                  style={{
                    backgroundColor: "#16162A",
                    border: "1px solid #1E1E36",
                    color: "#F0F0FF",
                    fontFamily: "var(--font-instrument)",
                  }}
                  onFocus={e => (e.target.style.borderColor = "#C8FF0060")}
                  onBlur={e => (e.target.style.borderColor = "#1E1E36")}
                />
              </div>

              {/* Email — read only */}
              <div>
                <label
                  className="block text-xs mb-2 tracking-widest uppercase"
                  style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                >Email address</label>
                <input
                  type="email"
                  value={user.email}
                  readOnly
                  className="w-full px-4 py-3 text-sm outline-none cursor-not-allowed"
                  style={{
                    backgroundColor: "#16162A",
                    border: "1px solid #1E1E3660",
                    color: "#3A3A5C",
                    fontFamily: "var(--font-instrument)",
                  }}
                />
                <p className="text-xs mt-1" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                  Email cannot be changed after signup.
                </p>
              </div>

              {/* Institution */}
              {(user.role === "teacher" || user.role === "researcher") && (
                <div>
                  <label
                    className="block text-xs mb-2 tracking-widest uppercase"
                    style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                  >Institution</label>
                  <input
                    type="text"
                    value={institution}
                    onChange={e => setInstitution(e.target.value)}
                    placeholder="e.g. VIT Pune"
                    className="w-full px-4 py-3 text-sm outline-none"
                    style={{
                      backgroundColor: "#16162A",
                      border: "1px solid #1E1E36",
                      color: "#F0F0FF",
                      fontFamily: "var(--font-instrument)",
                    }}
                    onFocus={e => (e.target.style.borderColor = "#C8FF0060")}
                    onBlur={e => (e.target.style.borderColor = "#1E1E36")}
                  />
                </div>
              )}

              {/* Role — read only with change request */}
              <div>
                <label
                  className="block text-xs mb-2 tracking-widest uppercase"
                  style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}
                >Role</label>
                <div className="flex items-center justify-between px-4 py-3"
                  style={{ backgroundColor: "#16162A", border: "1px solid #1E1E3660" }}>
                  <span
                    className="text-sm capitalize"
                    style={{ color: "#3A3A5C", fontFamily: "var(--font-instrument)" }}
                  >{user.role}</span>
                  <a
                    href="mailto:support@vektor.ai?subject=Role change request"
                    className="text-xs transition-colors"
                    style={{ color: "#00E5FF", fontFamily: "var(--font-dm-mono)" }}
                  >Request change →</a>
                </div>
              </div>

              <button
                onClick={saveProfile}
                className="px-6 py-3 text-xs font-black tracking-widest transition-all"
                style={{
                  backgroundColor: profileSaved ? "#C8FF0020" : "#C8FF00",
                  color:           profileSaved ? "#C8FF00" : "#08080F",
                  border:          profileSaved ? "1px solid #C8FF0040" : "none",
                  fontFamily:      "var(--font-syne)",
                }}
              >{profileSaved ? "✓ SAVED" : "SAVE PROFILE"}</button>
            </div>
          </SectionCard>

          {/* ══ APPEARANCE ══ */}
          <SectionCard id="appearance" title="Appearance" activeSection={activeSection}>
            <SettingRow
              label="Theme"
              desc="Dark mode is the VEKTOR identity. Light mode is an accessibility option."
            >
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: darkMode ? "#3A3A5C" : "#C8FF00", fontFamily: "var(--font-dm-mono)" }}>Light</span>
                <Toggle checked={darkMode} onChange={saveTheme} />
                <span className="text-xs" style={{ color: darkMode ? "#C8FF00" : "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Dark</span>
                {themeSaving && <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>Saving...</span>}
              </div>
            </SettingRow>
            <div
              className="flex items-center gap-3 px-4 py-3 mt-4"
              style={{ backgroundColor: darkMode ? "#C8FF0008" : "#FFB80008", border: `1px solid ${darkMode ? "#C8FF0020" : "#FFB80020"}` }}
            >
              <div
                className="w-4 h-4 flex-shrink-0"
                style={{ backgroundColor: darkMode ? "#08080F" : "#FAFAFA", border: "1px solid #1E1E36" }}
              />
              <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                {darkMode ? "Dark mode active — #08080F base" : "Light mode active — #FAFAFA base"}
              </span>
            </div>
          </SectionCard>

          {/* ══ NOTIFICATIONS ══ */}
          <SectionCard id="notifications" title="Notifications" activeSection={activeSection}>
            <SettingRow label="Session summaries" desc="Email after each session with your tier score and gap list.">
              <Toggle checked={notifSession} onChange={setNotifSession} />
            </SettingRow>
            <SettingRow label="Teacher assignments" desc="Notify when a teacher assigns practice tasks.">
              <Toggle checked={notifAssignment} onChange={setNotifAssignment} />
            </SettingRow>
            <SettingRow label="Streak reminders" desc="Daily reminder to maintain your study streak.">
              <Toggle checked={notifStreak} onChange={setNotifStreak} />
            </SettingRow>
            <SettingRow label="In-app notifications" desc="Show notification badges inside the app.">
              <Toggle checked={notifInApp} onChange={setNotifInApp} />
            </SettingRow>

            <div className="pt-4 mt-2" style={{ borderTop: "1px solid #1E1E36" }}>
              <p className="text-xs mb-3 tracking-widest uppercase" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                Email digest frequency
              </p>
              <div className="flex gap-2">
                {(["daily", "weekly", "never"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setEmailFreq(f)}
                    className="px-4 py-2 text-xs font-black capitalize transition-all"
                    style={{
                      backgroundColor: emailFreq === f ? "#C8FF0015" : "#16162A",
                      border:          `1px solid ${emailFreq === f ? "#C8FF0040" : "#1E1E36"}`,
                      color:           emailFreq === f ? "#C8FF00" : "#6B6A80",
                      fontFamily:      "var(--font-syne)",
                    }}
                  >{f}</button>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* ══ ACCESSIBILITY ══ */}
          <SectionCard id="accessibility" title="Accessibility" activeSection={activeSection}>
            <div className="mb-4">
              <p className="text-xs mb-3 tracking-widest uppercase" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                Font size
              </p>
              <div className="flex gap-2">
                {([100, 125, 150] as const).map(size => (
                  <button
                    key={size}
                    onClick={() => setFontSize(size)}
                    className="px-4 py-2 text-xs font-black transition-all"
                    style={{
                      backgroundColor: fontSize === size ? "#C8FF0015" : "#16162A",
                      border:          `1px solid ${fontSize === size ? "#C8FF0040" : "#1E1E36"}`,
                      color:           fontSize === size ? "#C8FF00" : "#6B6A80",
                      fontFamily:      "var(--font-syne)",
                    }}
                  >{size}%</button>
                ))}
              </div>
            </div>

            <SettingRow label="Reduce motion" desc="Disables WebGL animations and page transitions.">
              <Toggle checked={reduceMotion} onChange={setReduceMotion} color="#00E5FF" />
            </SettingRow>
            <SettingRow label="High contrast mode" desc="Overrides subject colors with higher-contrast equivalents.">
              <Toggle checked={highContrast} onChange={setHighContrast} color="#00E5FF" />
            </SettingRow>
            <SettingRow label="Screen reader mode" desc="Enables Alt+G text panels as default alternative to WebGL.">
              <Toggle checked={screenReader} onChange={setScreenReader} color="#00E5FF" />
            </SettingRow>
          </SectionCard>

          {/* ══ SUBJECTS ══ */}
          <SectionCard id="subjects" title="Subjects" activeSection={activeSection}>
            <p className="text-xs mb-4" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
              Removing a subject hides it from your dashboard but preserves all historical session data.
            </p>
            <div className="space-y-2 mb-5">
              {ALL_SUBJECTS.map(subj => {
                const active = selectedSubjects.includes(subj);
                const color  = SUBJECT_COLORS[subj];
                return (
                  <button
                    key={subj}
                    onClick={() => toggleSubject(subj)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150"
                    style={{
                      border:          `1px solid ${active ? color : "#1E1E36"}`,
                      backgroundColor: active ? `${color}10` : "#16162A",
                    }}
                  >
                    <div
                      className="flex items-center justify-center flex-shrink-0 text-sm"
                      style={{
                        width: 28, height: 28,
                        border: `1px solid ${active ? color : "#1E1E36"}`,
                        backgroundColor: active ? `${color}15` : "transparent",
                        color: active ? color : "#3A3A5C",
                        fontFamily: "var(--font-dm-mono)",
                      }}
                    >{SUBJECT_SYMBOLS[subj]}</div>
                    <span
                      className="text-sm font-bold flex-1"
                      style={{ color: active ? "#F0F0FF" : "#6B6A80", fontFamily: "var(--font-instrument)" }}
                    >{SUBJECT_LABELS[subj]}</span>
                    <div
                      className="flex items-center justify-center flex-shrink-0"
                      style={{
                        width: 20, height: 20,
                        border: `1px solid ${active ? color : "#1E1E36"}`,
                        backgroundColor: active ? color : "transparent",
                      }}
                    >
                      {active && <span className="text-xs font-black" style={{ color: "#08080F" }}>✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedSubjects.length === 0 && (
              <p className="text-xs mb-3" style={{ color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}>
                Select at least one subject.
              </p>
            )}

            <button
              onClick={saveSubjects}
              disabled={selectedSubjects.length === 0}
              className="px-6 py-3 text-xs font-black tracking-widest transition-all disabled:opacity-30"
              style={{
                backgroundColor: subjectsSaved ? "#C8FF0020" : "#C8FF00",
                color:           subjectsSaved ? "#C8FF00" : "#08080F",
                border:          subjectsSaved ? "1px solid #C8FF0040" : "none",
                fontFamily:      "var(--font-syne)",
              }}
            >{subjectsSaved ? "✓ SAVED" : "SAVE SUBJECTS"}</button>
          </SectionCard>

          {/* ══ ACCOUNT ══ */}
          <SectionCard id="account" title="Account" activeSection={activeSection}>

            {/* Change password */}
            <div className="mb-6 pb-6" style={{ borderBottom: "1px solid #1E1E36" }}>
              <h3 className="text-xs tracking-widest uppercase mb-4" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                Change password
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Current password", val: passwordCurrent, set: setPasswordCurrent },
                  { label: "New password",      val: passwordNew,     set: setPasswordNew     },
                  { label: "Confirm new",       val: passwordConfirm, set: setPasswordConfirm },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs mb-1.5 tracking-widest uppercase" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{f.label}</label>
                    <input
                      type="password"
                      value={f.val}
                      onChange={e => f.set(e.target.value)}
                      className="w-full px-4 py-3 text-sm outline-none"
                      style={{ backgroundColor: "#16162A", border: "1px solid #1E1E36", color: "#F0F0FF", fontFamily: "var(--font-instrument)" }}
                      onFocus={e => (e.target.style.borderColor = "#C8FF0060")}
                      onBlur={e => (e.target.style.borderColor = "#1E1E36")}
                    />
                  </div>
                ))}
                {passwordMsg && (
                  <p className="text-xs" style={{ color: passwordMsg.includes("success") ? "#C8FF00" : "#FF3D57", fontFamily: "var(--font-dm-mono)" }}>
                    {passwordMsg}
                  </p>
                )}
                <button
                  onClick={changePassword}
                  className="px-5 py-2.5 text-xs font-black tracking-widest transition-all"
                  style={{ backgroundColor: "#C8FF00", color: "#08080F", fontFamily: "var(--font-syne)" }}
                >UPDATE PASSWORD</button>
              </div>
            </div>

            {/* Download data */}
            <div className="mb-6 pb-6" style={{ borderBottom: "1px solid #1E1E36" }}>
              <h3 className="text-xs tracking-widest uppercase mb-2" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
                Download your data
              </h3>
              <p className="text-xs mb-3" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                Export all your personal data as JSON (GDPR compliant).
              </p>
              <button
                onClick={downloadData}
                className="px-5 py-2.5 text-xs font-black tracking-widest transition-all"
                style={{ border: "1px solid #1E1E36", color: "#6B6A80", fontFamily: "var(--font-syne)" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#00E5FF50")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E1E36")}
              >↓ DOWNLOAD DATA</button>
            </div>

            {/* Delete account */}
            <div>
              <h3 className="text-xs tracking-widest uppercase mb-2" style={{ color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}>
                Delete account
              </h3>
              <p className="text-xs mb-4" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                Permanently deletes your account and all data. This cannot be undone.
              </p>

              {deleteStep === 1 ? (
                <button
                  onClick={() => setDeleteStep(2)}
                  className="px-5 py-2.5 text-xs font-black tracking-widest transition-all"
                  style={{ border: "1px solid #FF3D5740", color: "#FF3D57", fontFamily: "var(--font-syne)" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#FF3D5710")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >DELETE ACCOUNT</button>
              ) : (
                <div className="space-y-3">
                  <div
                    className="px-4 py-3"
                    style={{ backgroundColor: "#FF3D5710", border: "1px solid #FF3D5730" }}
                  >
                    <p className="text-xs" style={{ color: "#FF3D57", fontFamily: "var(--font-dm-mono)" }}>
                      Type <strong>DELETE</strong> to confirm permanent account deletion.
                    </p>
                  </div>
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder="Type DELETE to confirm"
                    className="w-full px-4 py-3 text-sm outline-none"
                    style={{
                      backgroundColor: "#16162A",
                      border: `1px solid ${deleteConfirm === "DELETE" ? "#FF3D57" : "#1E1E36"}`,
                      color: "#F0F0FF",
                      fontFamily: "var(--font-dm-mono)",
                    }}
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setDeleteStep(1); setDeleteConfirm(""); }}
                      className="px-5 py-2.5 text-xs font-black tracking-widest"
                      style={{ border: "1px solid #1E1E36", color: "#6B6A80", fontFamily: "var(--font-syne)" }}
                    >CANCEL</button>
                    <button
                      onClick={deleteAccount}
                      disabled={deleteConfirm !== "DELETE"}
                      className="px-5 py-2.5 text-xs font-black tracking-widest transition-all disabled:opacity-30"
                      style={{ backgroundColor: "#FF3D57", color: "#F0F0FF", fontFamily: "var(--font-syne)" }}
                    >CONFIRM DELETE</button>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

        </main>
      </div>
    </div>
  );
}