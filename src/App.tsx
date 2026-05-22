import React, { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Lead, Region, Rep } from "./types";
import { ToastProvider, useToast } from "./context/ToastContext";
import { LeadsPage } from "./pages/Leads"; // eager — it's the landing page
import { db } from "./lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { useAppStore } from "./stores/appStore";
import {
  useReps,
  useSaveRep,
  useSaveLead,
  useLeads,
  useOperationalQueueLeads,
  useAppSettings,
  useSaveSettings,
  useAddAuditEntry,
} from "./hooks/useFirebase";
import { deriveOperationalCounters } from "./lib/workflowState";
import { getRegionIdentity, REGION_IDENTITIES } from "./lib/regionIdentity";
import {
  LayoutDashboard,
  MessageCircle,
  MapPin,
  CalendarDays,
  Users,
  ClipboardList,
  BarChart3,
  Briefcase,
  TrendingUp,
  DollarSign,
  FolderOpen,
  BookOpen,
  GraduationCap,
  Calculator,
  UserCircle,
  BarChart2,
  Settings,
  Shield,
  Sun,
  Moon,
  LogOut,
  X,
  Menu,
  ArrowLeftRight,
  FileUp,
  Download,
  Plus,
  Sparkles,
  Inbox,
} from "lucide-react";
import { exportLeadsCSV, exportCallHistoryCSV, normalizeAUPhone } from "./lib/utils";
import { linkRepToFirebaseUser, resolveRepForSession } from "./lib/authIdentity";

// ── Lazy-loaded pages (split into separate JS chunks) ─────────────────────────
const DashboardPage = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.DashboardPage })));
const AdminPage = lazy(() => import("./pages/Admin").then((m) => ({ default: m.AdminPage })));
const DrapsPage = lazy(() => import("./pages/Draps").then((m) => ({ default: m.DrapsPage })));
const CommissionsPage = lazy(() => import("./pages/Commissions").then((m) => ({ default: m.CommissionsPage })));
const Map = lazy(() => import("./pages/Map"));
const DQImportPage = lazy(() => import("./pages/DQImport").then((m) => ({ default: m.DQImportPage })));
const TeamChatPage = lazy(() => import("./pages/TeamChat").then((m) => ({ default: m.TeamChatPage })));
const KnowledgeBasePage = lazy(() => import("./pages/KnowledgeBase").then((m) => ({ default: m.KnowledgeBasePage })));
const DocumentCentre = lazy(() => import("./pages/DocumentCentre"));
const DealDashboardPage = lazy(() => import("./pages/DealDashboard").then((m) => ({ default: m.DealDashboardPage })));
const CalendarPage = lazy(() => import("./pages/Calendar").then((m) => ({ default: m.CalendarPage })));
const ClientHubPage = lazy(() => import("./pages/ClientHub").then((m) => ({ default: m.ClientHubPage })));
const ClientProfilePage = lazy(() =>
  import("./pages/ClientProfilePage").then((m) => ({ default: m.ClientProfilePage })),
);
const PIA = lazy(() => import("./pages/PIA"));
const SMSF = lazy(() => import("./pages/SMSF"));
const ReportsDashboardPage = lazy(() =>
  import("./pages/ReportsDashboard").then((m) => ({ default: m.ReportsDashboardPage })),
);
const TrainingHubPage = lazy(() => import("./pages/TrainingHub").then((m) => ({ default: m.TrainingHubPage })));
const AdminGuidePage = lazy(() => import("./pages/AdminGuide").then((m) => ({ default: m.AdminGuidePage })));
const RepDashboardPage = lazy(() => import("./components/RepDashboard").then((m) => ({ default: m.RepDashboard })));
const MyDashboardPage = lazy(() => import("./pages/MyDashboard").then((m) => ({ default: m.MyDashboardPage })));
const AssistantPage = lazy(() => import("./pages/AssistantPage").then((m) => ({ default: m.AssistantPage })));
const InboxPage = lazy(() => import("./pages/InboxPage").then((m) => ({ default: m.InboxPage })));
const RepSettingsPanel = lazy(() =>
  import("./components/RepSettingsPanel").then((m) => ({ default: m.RepSettingsPanel })),
);

// ── Lazy-loaded heavy modals ──────────────────────────────────────────────────
const CSVImportModal = lazy(() => import("./components/CSVImportModal").then((m) => ({ default: m.CSVImportModal })));
const SheetsSyncModal = lazy(() =>
  import("./components/SheetsSyncModal").then((m) => ({ default: m.SheetsSyncModal })),
);

// App-level components (must stay in sync with JSX usage)
import { FloatingCalculator } from "./components/FloatingCalculator/FloatingCalculator";
import { FloatingCalendar } from "./components/FloatingCalendar/FloatingCalendar";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { LearningDebugPanel } from "./components/dev/LearningDebugPanel";
import { OnboardingFlow } from "./components/onboarding/OnboardingFlow";
import { useNotifications } from "./hooks/useNotifications";
import { useOfflineQueue } from "./hooks/useOfflineQueue";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { useFirebaseAuthUser } from "./hooks/useFirebaseAuthUser";

// ── Google Sheets Quick Pull constants ───────────────────────────────────────
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY ?? "";
const DEV_AUTH_BYPASS_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_AUTH_BYPASS === "true";

if (!GOOGLE_API_KEY) {
  console.warn(
    "Missing Google Sheets API key — set VITE_GOOGLE_SHEETS_API_KEY env var. Quick Pull may not work without OAuth.",
  );
}

// ── Page loader fallback ──────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#b8933a] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Dark mode (class-based, persisted) ───────────────────────────────────────
function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState<boolean>(() => {
    const stored = localStorage.getItem("asgDarkMode");
    if (stored !== null) return stored === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("asgDarkMode", String(dark));
  }, [dark]);

  return [dark, () => setDark((d) => !d)];
}

function useUiScale(): [string, (v: string) => void] {
  const getAuto = () => {
    const w = window.innerWidth;
    if (w < 390) return "0.85";
    if (w < 640) return "0.90";
    if (w < 1024) return "0.95";
    return "1";
  };

  const [scale, setScaleState] = useState<string>(() => {
    return localStorage.getItem("asgUiScale") ?? "auto";
  });

  const applyScale = useCallback((val: string) => {
    const numeric = val === "auto" ? parseFloat(getAuto()) : parseFloat(val);
    document.documentElement.style.fontSize = `${numeric * 16}px`;
  }, []);

  useEffect(() => {
    applyScale(scale);
  }, [scale, applyScale]);

  const setScale = useCallback((val: string) => {
    localStorage.setItem("asgUiScale", val);
    setScaleState(val);
  }, []);

  return [scale, setScale];
}

type Page =
  | "dashboard"
  | "leads"
  | "client-hub"
  | "dq-import"
  | "map"
  | "draps"
  | "commissions"
  | "admin"
  | "team-chat"
  | "knowledge-base"
  | "document-centre"
  | "deal-dashboard"
  | "reports"
  | "training"
  | "calendar"
  | "admin-guide"
  | "my-dashboard"
  | "rep-settings"
  | "pia"
  | "smsf"
  | "rep-dashboard"
  | "assistant"
  | "inbox";

// ── Login screen ──────────────────────────────────────────────────────────────
type LoginStep = "select" | "access-code" | "setup" | "pin" | "forgot" | "new-pin" | "admin";

const INPUT_CLS =
  "w-full px-3 py-2 rounded-lg bg-panel border border-panel text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#b8933a] text-sm";
const BTN_AMBER =
  "w-full py-2 rounded-lg bg-[#b8933a] text-white font-semibold hover:bg-[#d4aa55] disabled:opacity-40 disabled:cursor-not-allowed transition text-sm";
const BTN_GHOST = "w-full py-2 rounded-lg border border-panel text-slate-300 hover:bg-hover transition text-sm";

// Shared card wrapper — logo fills the full screen, glass card floats in the centre
function LoginCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen relative flex items-center justify-center p-4"
      style={{
        backgroundImage: "url(/asg-logo.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Subtle dark vignette so the form stays readable without hiding the logo */}
      <div className="absolute inset-0" style={{ background: "rgba(6, 13, 31, 0.45)" }} />

      {/* Floating glass card */}
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl p-8 shadow-2xl"
        style={{
          background: "rgba(10, 20, 48, 0.60)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "1px solid rgba(201, 168, 76, 0.30)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(201,168,76,0.15)",
        }}
      >
        <div className="text-center mb-6">
          <p className="text-xs tracking-[0.2em] uppercase" style={{ color: "#c9a84c" }}>
            Amplify Solutions Group
          </p>
          <p className="text-slate-400 text-xs tracking-wider mt-0.5">Customer Relations Management</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function LoginScreen({
  onLoginRep,
  onAdminBypass,
}: {
  onLoginRep: (rep: Rep) => void;
  onAdminBypass: (rep: Rep) => void;
}) {
  const { reps, setReps } = useAppStore();
  const [step, setStep] = useState<LoginStep>("select");
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step: select
  const [selectedRepId, setSelectedRepId] = useState<number | "">("");

  // Step: access-code
  const [accessCode, setAccessCode] = useState("");

  // Step: setup
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [setupPin2, setSetupPin2] = useState("");
  const [setupBackup, setSetupBackup] = useState("");
  const [setupBackup2, setSetupBackup2] = useState("");

  // Step: pin
  const [pin, setPin] = useState("");

  // Step: forgot
  const [backupInput, setBackupInput] = useState("");

  // Step: new-pin
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");

  // Step: admin
  const [adminInitials, setAdminInitials] = useState("");
  const [adminCode, setAdminCode] = useState("");

  const sortedReps = [...reps].filter((r) => r.active).sort((a, b) => a.name.localeCompare(b.name));

  const go = (s: LoginStep) => {
    setError("");
    setStep(s);
  };

  // ── Step: select name ────────────────────────────────────────────────────
  const handleSelect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepId) {
      setError("Please select your name");
      return;
    }
    const rep = reps.find((r) => r.id === selectedRepId);
    if (!rep) return;
    setSelectedRep(rep);
    setError("");
    go(rep.isSetup ? "pin" : "access-code");
  };

  // ── Step: first-time access code ─────────────────────────────────────────
  const handleAccessCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode !== "9090") {
      setError("Incorrect access code");
      return;
    }
    setAccessCode("");
    go("setup");
  };

  // ── Step: first-time setup ───────────────────────────────────────────────
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRep) return;
    if (!/^\S+@\S+\.\S+$/.test(setupEmail)) {
      setError("Enter a valid email address");
      return;
    }
    if (!/^\d{4,6}$/.test(setupPin)) {
      setError("PIN must be 4–6 digits (numbers only)");
      return;
    }
    if (setupPin !== setupPin2) {
      setError("PINs do not match");
      return;
    }
    if (setupBackup.length < 6) {
      setError("Backup password must be at least 6 characters");
      return;
    }
    if (setupBackup !== setupBackup2) {
      setError("Backup passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const updated: Rep = {
        ...selectedRep,
        email: setupEmail,
        pin: setupPin,
        backupPassword: setupBackup,
        isSetup: true,
      };
      setReps(reps.map((r) => (r.id === updated.id ? updated : r)));
      await updateDoc(doc(db, "reps", String(selectedRep.id)), {
        email: setupEmail,
        pin: setupPin,
        backupPassword: setupBackup,
        isSetup: true,
      });
      onLoginRep(updated);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step: PIN login ──────────────────────────────────────────────────────
  const handlePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRep) return;
    if (pin !== selectedRep.pin) {
      setError("Incorrect PIN");
      setPin("");
      return;
    }
    onLoginRep(selectedRep);
  };

  // ── Step: forgot PIN — enter backup password ─────────────────────────────
  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRep) return;
    if (backupInput !== selectedRep.backupPassword) {
      setError("Incorrect backup password");
      return;
    }
    setBackupInput("");
    go("new-pin");
  };

  // ── Step: set new PIN after recovery ─────────────────────────────────────
  const handleNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRep) return;
    if (!/^\d{4,6}$/.test(newPin)) {
      setError("PIN must be 4–6 digits (numbers only)");
      return;
    }
    if (newPin !== newPin2) {
      setError("PINs do not match");
      return;
    }
    setLoading(true);
    try {
      const updated: Rep = { ...selectedRep, pin: newPin };
      setReps(reps.map((r) => (r.id === updated.id ? updated : r)));
      await updateDoc(doc(db, "reps", String(selectedRep.id)), { pin: newPin });
      onLoginRep(updated);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step: admin bypass ───────────────────────────────────────────────────
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!DEV_AUTH_BYPASS_ENABLED) {
      setError("Admin quick access is disabled.");
      return;
    }
    if (adminInitials.toUpperCase().trim() !== "GL") {
      setError("Incorrect initials");
      return;
    }
    if (adminCode !== "8711") {
      setError("Incorrect passcode");
      return;
    }
    const adminRep = reps.find((r) => r.role === "admin") ?? reps.find((r) => r.name.toUpperCase().startsWith("G"));
    if (!adminRep) {
      setError("Admin rep not found in roster");
      return;
    }
    onAdminBypass(adminRep);
  };

  // ── Renders ──────────────────────────────────────────────────────────────

  if (step === "select")
    return (
      <LoginCard>
        <form onSubmit={handleSelect} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Select your name</label>
            {sortedReps.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-3 text-slate-400 text-sm">
                <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                Loading staff list…
              </div>
            ) : (
              <select
                value={selectedRepId}
                onChange={(e) => setSelectedRepId(Number(e.target.value) || "")}
                className={INPUT_CLS}
                required
              >
                <option value="">— Choose your name —</option>
                {sortedReps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" disabled={sortedReps.length === 0} className={BTN_AMBER}>
            Continue
          </button>
        </form>
        {DEV_AUTH_BYPASS_ENABLED && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                go("admin");
                setAdminInitials("");
                setAdminCode("");
              }}
              className="text-xs text-slate-600 hover:text-slate-400 transition"
            >
              Dev Admin Access
            </button>
          </div>
        )}
      </LoginCard>
    );

  if (step === "access-code")
    return (
      <LoginCard>
        <p className="text-amber-400 text-sm font-semibold text-center mb-1">Welcome, {selectedRep?.name}!</p>
        <p className="text-slate-400 text-xs text-center mb-4">
          Enter your first-time access code to set up your account. Ask your manager for the code if you don't have it.
        </p>
        <form onSubmit={handleAccessCode} className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder="Access code"
            autoFocus
            className={INPUT_CLS + " tracking-widest text-center text-lg"}
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" className={BTN_AMBER}>
            Continue
          </button>
          <button type="button" onClick={() => go("select")} className={BTN_GHOST}>
            ← Back
          </button>
        </form>
      </LoginCard>
    );

  if (step === "setup")
    return (
      <LoginCard>
        <p className="text-amber-400 text-sm font-semibold text-center mb-1">Set Up Your Account</p>
        <p className="text-slate-400 text-xs text-center mb-4">This only needs to be done once.</p>
        <form onSubmit={handleSetup} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Email address <span className="text-slate-500">(for PIN recovery only)</span>
            </label>
            <input
              type="email"
              value={setupEmail}
              onChange={(e) => setSetupEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Choose a PIN <span className="text-slate-500">(4–6 digits)</span>
            </label>
            <input
              type="password"
              inputMode="numeric"
              value={setupPin}
              onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="e.g. 1234"
              maxLength={6}
              className={INPUT_CLS + " tracking-widest text-center text-lg"}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={setupPin2}
              onChange={(e) => setSetupPin2(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Repeat PIN"
              maxLength={6}
              className={INPUT_CLS + " tracking-widest text-center text-lg"}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Backup password <span className="text-slate-500">(if you forget your PIN)</span>
            </label>
            <input
              type="password"
              value={setupBackup}
              onChange={(e) => setSetupBackup(e.target.value)}
              placeholder="Min. 6 characters"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Confirm backup password</label>
            <input
              type="password"
              value={setupBackup2}
              onChange={(e) => setSetupBackup2(e.target.value)}
              placeholder="Repeat backup password"
              className={INPUT_CLS}
            />
          </div>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" disabled={loading} className={BTN_AMBER}>
            {loading ? "Saving…" : "Save & Sign In"}
          </button>
        </form>
      </LoginCard>
    );

  if (step === "pin")
    return (
      <LoginCard>
        <p className="text-amber-400 text-sm font-semibold text-center mb-1">Welcome back, {selectedRep?.name}!</p>
        <p className="text-slate-400 text-xs text-center mb-4">Enter your PIN to sign in.</p>
        <form onSubmit={handlePin} className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="PIN"
            maxLength={6}
            autoFocus
            className={INPUT_CLS + " tracking-widest text-center text-2xl"}
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" className={BTN_AMBER}>
            Sign In
          </button>
          <button
            type="button"
            onClick={() => go("forgot")}
            className="w-full text-xs text-slate-500 hover:text-slate-300 transition py-1"
          >
            Forgot PIN?
          </button>
          <button
            type="button"
            onClick={() => {
              setPin("");
              go("select");
            }}
            className={BTN_GHOST}
          >
            ← Back
          </button>
        </form>
      </LoginCard>
    );

  if (step === "forgot")
    return (
      <LoginCard>
        <p className="text-slate-300 text-sm font-medium text-center mb-1">Forgot PIN</p>
        <p className="text-slate-400 text-xs text-center mb-4">
          Enter your backup password to sign in and set a new PIN.
        </p>
        <form onSubmit={handleForgot} className="space-y-3">
          <input
            type="password"
            value={backupInput}
            onChange={(e) => setBackupInput(e.target.value)}
            placeholder="Backup password"
            autoFocus
            className={INPUT_CLS}
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" className={BTN_AMBER}>
            Continue
          </button>
          <button type="button" onClick={() => go("pin")} className={BTN_GHOST}>
            ← Back to PIN
          </button>
        </form>
      </LoginCard>
    );

  if (step === "new-pin")
    return (
      <LoginCard>
        <p className="text-green-400 text-sm font-semibold text-center mb-1">Identity verified ✓</p>
        <p className="text-slate-400 text-xs text-center mb-4">Choose a new PIN for future logins.</p>
        <form onSubmit={handleNewPin} className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="New PIN"
            maxLength={6}
            autoFocus
            className={INPUT_CLS + " tracking-widest text-center text-lg"}
          />
          <input
            type="password"
            inputMode="numeric"
            value={newPin2}
            onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="Confirm new PIN"
            maxLength={6}
            className={INPUT_CLS + " tracking-widest text-center text-lg"}
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" disabled={loading} className={BTN_AMBER}>
            {loading ? "Saving…" : "Set PIN & Sign In"}
          </button>
        </form>
      </LoginCard>
    );

  if (!DEV_AUTH_BYPASS_ENABLED) {
    return null;
  }

  // Dev-only admin bypass
  return (
    <LoginCard>
      <p className="text-slate-300 text-sm font-medium mb-4 text-center">Admin Quick Access</p>
      <form onSubmit={handleAdminLogin} className="space-y-3">
        <input
          type="text"
          value={adminInitials}
          onChange={(e) => setAdminInitials(e.target.value)}
          placeholder="Initials (e.g. GL)"
          maxLength={4}
          autoFocus
          className={INPUT_CLS + " tracking-widest uppercase"}
        />
        <input
          type="password"
          value={adminCode}
          onChange={(e) => setAdminCode(e.target.value)}
          placeholder="Passcode"
          className={INPUT_CLS}
        />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button type="submit" className={BTN_AMBER}>
          Continue
        </button>
        <button type="button" onClick={() => go("select")} className={BTN_GHOST}>
          ← Back
        </button>
      </form>
    </LoginCard>
  );
}

// ── Page labels (for topbar title) ───────────────────────────────────────────
const PAGE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  "client-hub": "Clients",
  calendar: "Calendar",
  "deal-dashboard": "Deal Dashboard",
  reports: "Reports",
  training: "Training Hub",
  "dq-import": "DQ Import",
  map: "Map",
  draps: "DRAPS & Stats",
  commissions: "Comms Calculator",
  admin: "Admin",
  "team-chat": "Team Chat",
  "knowledge-base": "Knowledge Base",
  "document-centre": "Documents",
  "admin-guide": "Admin Guide",
  "my-dashboard": "My Dashboard",
  "rep-settings": "My Settings",
  pia: "PIA Calculator",
  smsf: "SMSF Calculator",
  "rep-dashboard": "Rep Dashboard",
};

// ── Sidebar item ──────────────────────────────────────────────────────────────
function SidebarItem({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left ${
        active ? "bg-[#1A1A1D] text-[var(--region-accent)]" : "text-[#c8c8c4] hover:bg-[#222226] hover:text-white"
      }`}
      style={
        active ? { borderLeft: "2px solid var(--region-accent)", paddingLeft: "10px" } : { borderLeft: "2px solid transparent" }
      }
    >
      {icon}
      <span className="truncate flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
          style={{ background: "var(--region-accent)", color: "var(--region-text-on-accent)" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

// ── Sidebar section ───────────────────────────────────────────────────────────
function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a7a74]">{label}</p>
      {children}
    </div>
  );
}// ── Authenticated app shell ───────────────────────────────────────────────────
function AppShell() {
  const { currentUser, setCurrentUser, leads, reps, activeRegion, setActiveRegion, setLeads } = useAppStore();
  useReps(); // sync Firestore reps → Zustand store (keeps credentials current across devices)
  useNotifications();
  const { save: migrateRep } = useSaveRep();
  const { save: saveLead } = useSaveLead();
  const { add: addAudit } = useAddAuditEntry();
  const { settings: appSettings } = useAppSettings();
  const { save: saveSettings } = useSaveSettings();
  const { leads: allLeads } = useLeads();
  const { leads: operationalQueueLeads } = useOperationalQueueLeads();
  const { currentUser: firebaseUser, authLoading: firebaseAuthLoading } = useFirebaseAuthUser();
  const { showToast } = useToast();
  useOfflineQueue();
  const { isProbablyOffline } = useNetworkStatus();
  const [dark, toggleDark] = useDarkMode();
  const [uiScale, setUiScale] = useUiScale();
  const regionIdentity = getRegionIdentity(activeRegion);
  const [regionSwitchNotice, setRegionSwitchNotice] = useState<string | null>(null);
  const regionNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regionShellVars = {
    "--region-accent": regionIdentity.accent,
    "--region-accent-soft": regionIdentity.accentSoft,
    "--region-accent-border": regionIdentity.accentBorder,
    "--region-text-on-accent": regionIdentity.textOnAccent,
  } as React.CSSProperties;

  const [page, setPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [csvImportOpen, setCSVImportOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [pendingCallLeadId, setPendingCallLeadId] = useState<number | null>(null);
  const [sheetsSyncOpen, setSheetsSyncOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [quickPulling, setQuickPulling] = useState(false);
  const [leadsFilter, setLeadsFilter] = useState<string | null>(null);
  const [clientsFilter, setClientsFilter] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // ── PIN-based auth state (no Firebase Auth) ──────────────────────────────
  // Admin bypass uses a separate ref to survive sign-out without Firebase
  const [, setBypassAdmin] = useState(false);
  const bypassAdminRef = useRef(false);

  const handleLoginRep = useCallback(
    (rep: Rep) => {
      const linkedRep = linkRepToFirebaseUser(rep, firebaseUser);
      if (!linkedRep) {
        localStorage.removeItem("asgCurrentUserId");
        showToast("This Firebase account is linked to a different rep profile.", "error");
        return;
      }

      localStorage.setItem("asgCurrentUserId", String(linkedRep.id));
      const updatedRep = { ...linkedRep, lastLoginAt: Date.now() };
      setCurrentUser(updatedRep);
      migrateRep(updatedRep).catch(() => {
        /* non-fatal */
      });
    },
    [firebaseUser, migrateRep, setCurrentUser, showToast],
  );

  const handleAdminBypass = useCallback(
    (rep: Rep) => {
      if (!DEV_AUTH_BYPASS_ENABLED) {
        return;
      }
      localStorage.setItem("asgCurrentUserId", String(rep.id));
      const updatedRep = { ...rep, lastLoginAt: Date.now() };
      bypassAdminRef.current = true;
      setBypassAdmin(true);
      setCurrentUser(updatedRep);
      migrateRep(updatedRep).catch(() => {
        /* non-fatal */
      });
    },
    [setCurrentUser, migrateRep],
  );

  // ── Auto-login from persisted session ────────────────────────────────────
  useEffect(() => {
    if (currentUser) return; // already logged in
    if (firebaseAuthLoading || reps.length === 0) return;

    const savedId = localStorage.getItem("asgCurrentUserId");
    const resolution = resolveRepForSession(reps, firebaseUser, savedId);

    if (resolution.shouldClearSavedRep) {
      localStorage.removeItem("asgCurrentUserId");
    }

    if (!resolution.rep) {
      return;
    }

    localStorage.setItem("asgCurrentUserId", String(resolution.rep.id));
    setCurrentUser(resolution.rep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseAuthLoading, firebaseUser, reps]);

  // ── One-time migration: push localStorage reps → Firestore ───────────────
  // Runs once per app start; useReps will no-op on empty snapshot so this seeds it.
  useEffect(() => {
    if (reps.length === 0) return;
    const KEY = "asgRepsMigrated";
    if (localStorage.getItem(KEY)) return; // already migrated
    Promise.all(reps.map((r) => migrateRep(r)))
      .then(() => localStorage.setItem(KEY, "1"))
      .catch(() => {}); // silent — will retry next session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reps.length]);

  // Dev-only magic URL auto-login (/GLadmin). Production strips this route back to "/".
  useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, ""); // strip trailing slash
    if (path === "/GLadmin" && !DEV_AUTH_BYPASS_ENABLED) {
      window.history.replaceState({}, "", "/");
      return;
    }
    if (path === "/GLadmin" && DEV_AUTH_BYPASS_ENABLED && !bypassAdminRef.current && reps.length > 0) {
      const adminRep = reps.find((r) => r.role === "admin") ?? reps.find((r) => r.name.toUpperCase().startsWith("G"));
      if (adminRep) {
        handleAdminBypass(adminRep);
        // Clean up URL so it looks like the normal home page
        window.history.replaceState({}, "", "/");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reps]);

  // ── Onboarding flow trigger ───────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => {
      if (!currentUser.hasCompletedOnboarding) {
        setShowOnboarding(true);
      }
      setCheckedOnboarding(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [currentUser]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (
        event instanceof MouseEvent &&
        exportMenuRef.current &&
        exportMenuRef.current.contains(event.target as Node)
      ) {
        return;
      }
      setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", handler);
    };
  }, [exportMenuOpen]);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  const handleOnboardingNavigate = useCallback((action: "leads" | "calendar" | "client-hub") => {
    setPage(action as Page);
    setShowOnboarding(false);
  }, []);

  const handleRegionChange = useCallback(
    (region: Region) => {
      if (region === activeRegion) return;
      const nextIdentity = getRegionIdentity(region);
      setRegionSwitchNotice(`Switching to ${nextIdentity.label} workspace...`);
      if (regionNoticeTimerRef.current) clearTimeout(regionNoticeTimerRef.current);
      regionNoticeTimerRef.current = setTimeout(() => setRegionSwitchNotice(null), 1800);
      setActiveRegion(region);
      setLeads([]);
      setLeadsFilter(null);
      setClientsFilter(null);
      setSelectedClientId(null);
    },
    [activeRegion, setActiveRegion, setLeads],
  );

  const handleSignOut = useCallback(() => {
    localStorage.removeItem("asgCurrentUserId");
    bypassAdminRef.current = false;
    setBypassAdmin(false);
    setCurrentUser(null);
  }, [setCurrentUser]);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Audit helper
  const logAudit = useCallback(
    async (action: string, detail: string, leadId?: number, leadName?: string) => {
      if (!currentUser) return;
      const now = new Date();
      await addAudit({
        timestamp: now.getTime(),
        date: now.toISOString().split("T")[0],
        time: now.toTimeString().slice(0, 5),
        user: currentUser.name,
        action,
        detail,
        leadId,
        leadName,
      });
    },
    [currentUser, addAudit],
  );

  // CSV Import save
  const handleCSVImportSave = useCallback(
    async (importedLeads: Lead[]) => {
      let saved = 0;
      for (const lead of importedLeads) {
        const ok = await saveLead(lead);
        if (ok) {
          saved++;
          logAudit("lead_created", `CSV imported: ${lead.name}`, lead.id, lead.name);
        }
      }
      showToast(`✅ ${saved} lead${saved !== 1 ? "s" : ""} imported from CSV`, "success");
      if (saved < importedLeads.length) showToast(`⚠️ ${importedLeads.length - saved} failed`, "error");
    },
    [saveLead, showToast, logAudit],
  );

  // CSV Export
  const handleExportLeads = useCallback(() => {
    const repsMap: Record<number, string> = {};
    reps.forEach((r) => {
      repsMap[r.id] = r.name;
    });
    exportLeadsCSV(leads, repsMap);
    showToast(`📥 Exported ${leads.length} leads`, "success");
  }, [leads, reps, showToast]);

  const handleExportCallHistory = useCallback(() => {
    const ok = exportCallHistoryCSV(leads);
    if (ok) showToast("📥 Call history exported", "success");
    else showToast("No call history to export", "error");
  }, [leads, showToast]);

  // ── Quick Pull: fetch sheet using cached OAuth token or API key ──────────
  const handleQuickPull = useCallback(async () => {
    const sheetsConfig = appSettings?.sheets;
    if (!sheetsConfig?.url || !sheetsConfig?.tab) {
      showToast("Sheet not configured — go to Admin → Sync to set it up", "error");
      return;
    }
    const sheetId = sheetsConfig.url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!sheetId) {
      showToast("Invalid sheet URL in settings", "error");
      return;
    }

    // Prefer cached OAuth token (avoids API key restrictions); fall back to API key
    let cachedToken: string | null = null;
    try {
      const token = sessionStorage.getItem("asgSheetsToken");
      const ts = Number(sessionStorage.getItem("asgSheetsTokenTs") ?? 0);
      if (token && Date.now() - ts < 55 * 60 * 1000) cachedToken = token;
    } catch {
      /* ignore */
    }

    setQuickPulling(true);
    try {
      const tab = encodeURIComponent(`${sheetsConfig.tab}!A:Z`);
      const url = cachedToken
        ? `${SHEETS_API}/${sheetId}/values/${tab}`
        : `${SHEETS_API}/${sheetId}/values/${tab}?key=${GOOGLE_API_KEY}`;
      const fetchOpts: RequestInit = cachedToken ? { headers: { Authorization: `Bearer ${cachedToken}` } } : {};
      const res = await fetch(url, { ...fetchOpts, referrerPolicy: "strict-origin-when-cross-origin" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message ?? "Failed to read sheet";
        // If API key is blocked and no OAuth token, guide the user
        if (!cachedToken && (msg.includes("blocked") || msg.includes("API key") || res.status === 403)) {
          showToast(
            "Open the Sheets panel (top-right) and sign in once — Quick Pull will work automatically after that",
            "error",
          );
          return;
        }
        throw new Error(msg);
      }
      const data = await res.json();
      const rows: string[][] = data.values ?? [];
      if (rows.length < 2) {
        showToast("Sheet has no data rows", "error");
        return;
      }

      const headers = rows[0].map((h: string) => h.toLowerCase().trim());
      // Auto-detect column indices by header name
      const col = (aliases: string[]): number => headers.findIndex((h) => aliases.some((a) => h.includes(a)));

      const nameIdx = col(["name", "full name", "customer", "client"]);
      const phoneIdx = col(["phone", "mobile", "contact number", "contact", "ph"]);
      const suburbIdx = col(["suburb", "city", "town"]);
      const statusIdx = col(["status", "lead status"]);
      const addrIdx = col(["address", "full address", "property address", "street address"]);
      const houseIdx = col(["house num", "house #", "housenum", "house no"]);
      const streetIdx = col(["street"]);
      const postcodeIdx = col(["postcode", "post code", "zip"]);
      const repIdx = col(["rep", "rep name", "dq rep", "agent", "assigned to"]);

      const get = (row: string[], idx: number) => (idx >= 0 ? (row[idx] ?? "").trim() : "");

      // Build phone→lead map from current leads
      const phoneMap = new globalThis.Map<string, Lead>();
      allLeads.forEach((l) => {
        const p = normalizeAUPhone(l.phone ?? "");
        if (p) phoneMap.set(p, l);
      });

      let added = 0,
        updated = 0;
      const dataRows = rows.slice(1);

      for (const row of dataRows) {
        const name = get(row, nameIdx);
        const rawPhone = get(row, phoneIdx);
        const phone = normalizeAUPhone(rawPhone);
        const suburb = get(row, suburbIdx);
        if (!name && !phone && !suburb) continue; // skip empty rows

        const rawStatus = get(row, statusIdx);
        // Simple status normalisation
        const normaliseStatus = (s: string): string => {
          const lower = s.toLowerCase().replace(/[-_]/g, " ");
          if (lower === "dq") return "DQ";
          if (lower === "live" || lower === "booked") return "Booked";
          if (lower === "revisit" || lower === "callback" || lower === "call back") return "Revisit";
          if (lower === "not interested" || lower === "ni") return "Not Interested";
          if (lower === "wrong number" || lower === "wn") return "Wrong Number";
          if (lower === "no answer" || lower === "na") return "No Answer";
          return "DQ";
        };
        const status = rawStatus ? normaliseStatus(rawStatus) : "DQ";

        const existing = phone ? phoneMap.get(phone) : undefined;
        if (existing) {
          // Update status if changed
          if (String(existing.status) !== status) {
            await saveLead({ ...existing, status: status as import("./types").LeadStatus });
            updated++;
          }
        } else {
          // Create new lead
          const repName = get(row, repIdx);
          const rep = reps.find((r) => r.name.toLowerCase() === repName.toLowerCase());
          const newLead: import("./types").Lead = {
            id: Date.now() + Math.random(),
            name: name || "Unknown",
            phone: rawPhone,
            suburb,
            houseNum: houseIdx >= 0 ? get(row, houseIdx) || undefined : undefined,
            street: streetIdx >= 0 ? get(row, streetIdx) || undefined : undefined,
            postcode: postcodeIdx >= 0 ? get(row, postcodeIdx) || undefined : undefined,
            status: status as import("./types").LeadStatus,
            dqRep: rep?.id ?? currentUser?.id ?? 1,
            createdAt: Date.now(),
            callHistory: [],
            // Parse address if a combined address column exists
            ...(addrIdx >= 0 && get(row, addrIdx)
              ? (() => {
                  const parts = get(row, addrIdx).split(/\s+/);
                  const hasHouse = parts.length > 1 && /^\d+[A-Za-z]?$/.test(parts[0]);
                  const body = hasHouse ? parts.slice(1) : parts;
                  const pc = /^\d{4}$/.test(body[body.length - 1] ?? "") ? body[body.length - 1] : undefined;
                  const bodyNoPc = pc ? body.slice(0, -1) : body;
                  const parsedSuburb = bodyNoPc.length > 1 ? bodyNoPc[bodyNoPc.length - 1] : "";
                  const parsedStreet = bodyNoPc.slice(0, parsedSuburb ? -1 : undefined).join(" ") || undefined;
                  return {
                    houseNum: hasHouse ? parts[0] : undefined,
                    street: parsedStreet,
                    suburb: suburb || parsedSuburb,
                    postcode: pc,
                  };
                })()
              : {}),
          };
          await saveLead(newLead);
          if (phone) phoneMap.set(phone, newLead);
          added++;
        }
      }

      showToast(`✅ Pull complete — ${added} new, ${updated} updated`, "success");
      // Persist sync timestamp
      saveSettings({
        sheets: {
          ...(sheetsConfig as import("./types").SyncConfig),
          lastSyncAt: Date.now(),
          lastSyncResult: "success",
          lastSyncSummary: `↓${added} new, ${updated} updated`,
        },
      }).catch(() => {});
    } catch (e: unknown) {
      showToast("Quick Pull failed: " + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setQuickPulling(false);
    }
  }, [appSettings, allLeads, reps, currentUser, saveLead, saveSettings, showToast]);

  const handleCallFromDashboard = useCallback((lead: Lead) => {
    setPage("leads");
    setPendingCallLeadId(lead.id);
  }, []);

  const handleNavigateFromDashboard = useCallback(
    (p: string, filter?: { type: "leads" | "clients"; value: string }) => {
      if (filter) {
        if (filter.type === "leads") {
          setLeadsFilter(filter.value);
        } else if (filter.type === "clients") {
          setClientsFilter(filter.value);
        }
      } else {
        setLeadsFilter(null);
        setClientsFilter(null);
      }
      setPage(p as Page);
    },
    [],
  );

  // ── Safe derived values (must NOT depend on early return) ───────────────────
  const isAdmin = currentUser?.role === "admin";

  // ── Permission helper ──────────────────────────────────────────────────────
  const canSee = (pageKey: string): boolean => {
    if (!currentUser) return false;
    if (isAdmin) return true;

    const perms = currentUser.permissions;
    if (!perms || perms.length === 0) return true;

    return perms.includes(pageKey);
  };

  // ── Effective page (safe when currentUser is null) ─────────────────────────
  const effectivePage: Page = currentUser
    ? canSee(page)
      ? page
      : (((currentUser.permissions ?? []).find((p) => canSee(p)) as Page | undefined) ?? "map")
    : "dashboard"; // fallback, won't be used while logged out

  // ── Operational queue badges (HOOK must always run) ───────────────────────
  const badgeCounters = useMemo(() => {
    if (!currentUser) return deriveOperationalCounters([]);
    const scopedLeads = isAdmin ? operationalQueueLeads : operationalQueueLeads.filter((l) => l.dqRep === currentUser.id);
    return deriveOperationalCounters(scopedLeads);
  }, [operationalQueueLeads, currentUser, isAdmin]);
  const callbackBadge = badgeCounters.callbacks;
  const followUpBadge = badgeCounters.followups;

  const [syncClock, setSyncClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setSyncClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // ── NOW it's safe to return early ──────────────────────────────────────────
  if (!currentUser) {
    return <LoginScreen onLoginRep={handleLoginRep} onAdminBypass={handleAdminBypass} />;
  }

  // ── Sidebar nav helpers (shared between desktop + mobile) ────────────────
  const sidebarNav = (onNav: (p: Page) => void) => (
    <nav className="flex-1 py-3 px-2 space-y-4 overflow-y-auto scrollbar-none bg-[#0B0B0C]">
      {/* Top section (no label) */}
      <div className="space-y-1">
        {canSee("assistant") && (
          <SidebarItem
            icon={<Sparkles size={15} />}
            label="Assistant"
            active={effectivePage === "assistant"}
            onClick={() => onNav("assistant")}
          />
        )}
        {canSee("inbox") && (
          <SidebarItem
            icon={<Inbox size={15} />}
            label="Inbox"
            active={effectivePage === "inbox"}
            onClick={() => onNav("inbox")}
          />
        )}
        {canSee("dashboard") && (
          <SidebarItem
            icon={<LayoutDashboard size={15} />}
            label="Dashboard"
            active={effectivePage === "dashboard"}
            onClick={() => onNav("dashboard")}
          />
        )}
        {canSee("team-chat") && (
          <SidebarItem
            icon={<MessageCircle size={15} />}
            label="Team Chat"
            active={effectivePage === "team-chat"}
            onClick={() => onNav("team-chat")}
          />
        )}
        {canSee("map") && (
          <SidebarItem
            icon={<MapPin size={15} />}
            label="Map"
            active={effectivePage === "map"}
            onClick={() => onNav("map")}
          />
        )}
        {canSee("calendar") && (
          <SidebarItem
            icon={<CalendarDays size={15} />}
            label="Calendar"
            active={effectivePage === "calendar"}
            onClick={() => onNav("calendar")}
          />
        )}
      </div>

      {/* LEADS */}
      {(canSee("leads") || canSee("dq-import") || canSee("draps")) && (
        <SidebarSection label="LEADS">
          {canSee("leads") && (
            <SidebarItem
              icon={<Users size={15} />}
              label="Leads"
              active={effectivePage === "leads"}
              onClick={() => {
                if (callbackBadge + followUpBadge > 0) setLeadsFilter("actionable-queue");
                onNav("leads");
              }}
              badge={callbackBadge + followUpBadge}
            />
          )}
          {canSee("dq-import") && (
            <SidebarItem
              icon={<ClipboardList size={15} />}
              label="DQ Import"
              active={effectivePage === "dq-import"}
              onClick={() => onNav("dq-import")}
            />
          )}
          {canSee("draps") && (
            <SidebarItem
              icon={<BarChart3 size={15} />}
              label="DRAPS & Stats"
              active={effectivePage === "draps"}
              onClick={() => onNav("draps")}
            />
          )}
        </SidebarSection>
      )}

      {/* SALES */}
      {(canSee("client-hub") || canSee("deal-dashboard") || canSee("commissions")) && (
        <SidebarSection label="SALES">
          {canSee("client-hub") && (
            <SidebarItem
              icon={<Briefcase size={15} />}
              label="Clients"
              active={effectivePage === "client-hub"}
              onClick={() => onNav("client-hub")}
            />
          )}
          {canSee("deal-dashboard") && (
            <SidebarItem
              icon={<TrendingUp size={15} />}
              label="Deal Dashboard"
              active={effectivePage === "deal-dashboard"}
              onClick={() => onNav("deal-dashboard")}
            />
          )}
          {canSee("commissions") && (
            <SidebarItem
              icon={<DollarSign size={15} />}
              label="Comms Calculator"
              active={effectivePage === "commissions"}
              onClick={() => onNav("commissions")}
            />
          )}
        </SidebarSection>
      )}

      {/* DOCUMENTS & TRAINING */}
      {(canSee("document-centre") || canSee("knowledge-base") || canSee("training")) && (
        <SidebarSection label="DOCUMENTS & TRAINING">
          {canSee("document-centre") && (
            <SidebarItem
              icon={<FolderOpen size={15} />}
              label="Documents"
              active={effectivePage === "document-centre"}
              onClick={() => onNav("document-centre")}
            />
          )}
          {canSee("knowledge-base") && (
            <SidebarItem
              icon={<BookOpen size={15} />}
              label="Knowledge Base"
              active={effectivePage === "knowledge-base"}
              onClick={() => onNav("knowledge-base")}
            />
          )}
          {canSee("training") && (
            <SidebarItem
              icon={<GraduationCap size={15} />}
              label="Training Hub"
              active={effectivePage === "training"}
              onClick={() => onNav("training")}
            />
          )}
        </SidebarSection>
      )}

      {/* TOOLS */}
      {(canSee("pia") || canSee("smsf")) && (
        <SidebarSection label="TOOLS">
          {canSee("pia") && (
            <SidebarItem
              icon={<Calculator size={15} />}
              label="PIA Calculator"
              active={effectivePage === "pia"}
              onClick={() => onNav("pia")}
            />
          )}
          {canSee("smsf") && (
            <SidebarItem
              icon={<Calculator size={15} />}
              label="SMSF Calculator"
              active={effectivePage === "smsf"}
              onClick={() => onNav("smsf")}
            />
          )}
        </SidebarSection>
      )}

      {/* MY */}
      {(canSee("my-dashboard") || canSee("rep-dashboard") || canSee("rep-settings")) && (
        <SidebarSection label="MY">
          {canSee("my-dashboard") && (
            <SidebarItem
              icon={<UserCircle size={15} />}
              label="My Dashboard"
              active={effectivePage === "my-dashboard"}
              onClick={() => onNav("my-dashboard")}
            />
          )}
          {canSee("rep-dashboard") && (
            <SidebarItem
              icon={<BarChart2 size={15} />}
              label="Rep Dashboard"
              active={effectivePage === "rep-dashboard"}
              onClick={() => onNav("rep-dashboard")}
            />
          )}
          {canSee("rep-settings") && (
            <SidebarItem
              icon={<Settings size={15} />}
              label="My Settings"
              active={effectivePage === "rep-settings"}
              onClick={() => onNav("rep-settings")}
            />
          )}
        </SidebarSection>
      )}

      {/* SYSTEM */}
      <SidebarSection label="SYSTEM">
        {isAdmin && (
          <SidebarItem
            icon={<Shield size={15} />}
            label="Admin"
            active={effectivePage === "admin"}
            onClick={() => onNav("admin")}
          />
        )}
        {isAdmin && (
          <SidebarItem
            icon={<BookOpen size={15} />}
            label="Admin Guide"
            active={effectivePage === "admin-guide"}
            onClick={() => onNav("admin-guide")}
          />
        )}
      </SidebarSection>
    </nav>
  );

  const syncSettings = appSettings?.sheets;
  const syncStatusIndicator = syncSettings?.lastSyncAt
    ? (() => {
        const diff = syncClock - syncSettings.lastSyncAt;
        const label =
          diff < 60000
            ? "Just now"
            : diff < 3600000
              ? `${Math.floor(diff / 60000)}m ago`
              : diff < 86400000
                ? `${Math.floor(diff / 3600000)}h ago`
                : `${Math.floor(diff / 86400000)}d ago`;
        return (
          <div className="px-3 pb-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[rgba(255,255,255,0.04)]">
              <div
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  syncSettings.lastSyncResult === "success"
                    ? "bg-green-400"
                    : syncSettings.lastSyncResult === "partial"
                      ? "bg-amber-400"
                      : "bg-red-400"
                }`}
              />
              <span className="text-[11px] text-[#7a7a74]">Synced {label}</span>
            </div>
          </div>
        );
      })()
    : null;

  const WorkspaceSwitcher = () => (
    <div
      className="mt-3 rounded-xl border px-2.5 py-2"
      style={{
        background: "var(--region-accent-soft)",
        borderColor: "var(--region-accent-border)",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8e8e86]">Workspace</span>
        <span className="text-[10px] font-bold uppercase" style={{ color: "var(--region-accent)" }}>
          {regionIdentity.shortLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {(Object.keys(REGION_IDENTITIES) as Region[]).map((region) => {
          const identity = getRegionIdentity(region);
          const isActive = activeRegion === region;
          return (
            <button
              key={region}
              type="button"
              onClick={() => handleRegionChange(region)}
              className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                isActive ? "shadow-sm" : "text-[#9a9a92] hover:bg-white/[0.06] hover:text-[#c8c8c4]"
              }`}
              style={
                isActive
                  ? {
                      background: identity.accent,
                      color: identity.textOnAccent,
                    }
                  : undefined
              }
              aria-pressed={isActive}
              aria-label={`Switch to ${identity.label} workspace`}
            >
              {identity.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const sidebarBrand = (
    <div className="flex-shrink-0 border-b border-white/[0.06] px-4 py-3">
      <div className="flex items-center gap-3">
        <img
          src="/asg-circle.png"
          alt="ASG"
          className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
          style={{ border: "1.5px solid var(--region-accent-border)" }}
        />
        <div className="min-w-0">
          <p className="font-display text-sm font-bold leading-none tracking-tight text-white">ASG CRM</p>
          <p className="mt-0.5 truncate text-[10px] font-semibold" style={{ color: "var(--region-accent)" }}>
            {regionIdentity.label} workspace
          </p>
        </div>
      </div>
      <WorkspaceSwitcher />
    </div>
  );

  const sidebarUserCard = (
    <div className="flex-shrink-0 border-t border-white/[0.06]">
      {/* Quick Pull button — shown when sheet is configured */}
      {appSettings?.sheets?.url && (
        <div className="px-3 pt-2">
          <button
            onClick={handleQuickPull}
            disabled={quickPulling}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50 transition"
            title="Pull latest leads from Google Sheet"
          >
            {quickPulling ? (
              <>
                <svg
                  className="w-3 h-3 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Pulling…
              </>
            ) : (
              <>↓ Quick Pull</>
            )}
          </button>
        </div>
      )}
      {syncStatusIndicator}
      <div className="px-3 py-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
            style={{ background: "#b8933a" }}
          >
            {currentUser.name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#c8c8c4] truncate leading-none">{currentUser.name}</p>
            <p className="text-[10px] text-[#7a7a74] mt-0.5 capitalize">{currentUser.role}</p>
          </div>
          <button
            onClick={toggleDark}
            title={dark ? "Light mode" : "Dark mode"}
            className="p-1.5 text-[#7a7a74] hover:text-[#c8c8c4] transition rounded"
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <select
            value={uiScale}
            onChange={(e) => setUiScale(e.target.value)}
            title="Display zoom"
            className="text-[10px] bg-transparent text-[#7a7a74] hover:text-[#c8c8c4] border border-white/10 rounded px-1 py-0.5 cursor-pointer outline-none"
          >
            <option value="auto" className="bg-[#0B0B0C]">
              Auto
            </option>
            <option value="0.85" className="bg-[#0B0B0C]">
              85%
            </option>
            <option value="0.90" className="bg-[#0B0B0C]">
              90%
            </option>
            <option value="0.95" className="bg-[#0B0B0C]">
              95%
            </option>
            <option value="1" className="bg-[#0B0B0C]">
              100%
            </option>
            <option value="1.1" className="bg-[#0B0B0C]">
              110%
            </option>
            <option value="1.2" className="bg-[#0B0B0C]">
              120%
            </option>
          </select>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="p-1.5 text-[#7a7a74] hover:text-[#c8c8c4] transition rounded"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`h-dvh flex overflow-hidden ${isProbablyOffline ? "pt-7" : ""}`}
      style={regionShellVars}
      data-region={activeRegion}
    >
      {isProbablyOffline && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "#1a1a1a",
            color: "#e5e5e5",
            fontSize: "12px",
            fontWeight: 500,
            textAlign: "center",
            padding: "5px 12px",
            letterSpacing: "0.01em",
          }}
        >
          Offline mode — changes will sync when connection returns
        </div>
      )}
      {/* ── Desktop Sidebar ───────────────────────────────────────────────── */}
      {regionSwitchNotice && (
        <div
          className="fixed left-1/2 top-16 z-[9998] -translate-x-1/2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg"
          style={{
            background: "var(--surface)",
            borderColor: "var(--region-accent-border)",
            color: "var(--region-accent)",
          }}
          role="status"
          aria-live="polite"
        >
          {regionSwitchNotice}
        </div>
      )}
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col bg-[#0B0B0C] border-r border-white/[0.06] overflow-hidden">
        {/* Brand */}
        {sidebarBrand}
        {sidebarNav(setPage)}
        {sidebarUserCard}
      </aside>

      {/* ── Mobile Sidebar Overlay ────────────────────────────────────────── */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-[#0B0B0C] border-r border-white/[0.06] overflow-hidden lg:hidden">
            <div className="relative">
              {sidebarBrand}
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute right-3 top-3 p-1.5 text-[#7a7a74] hover:text-white transition"
                aria-label="Close sidebar"
              >
                <X size={16} />
              </button>
            </div>
            {sidebarNav((p) => {
              setPage(p);
              setSidebarOpen(false);
            })}
            {sidebarUserCard}
          </aside>
        </>
      )}

      {/* ── Right Column ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 flex-shrink-0 flex items-center gap-2 px-4 bg-[var(--surface)] border-b border-[var(--border)]">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <Menu size={18} />
          </button>

          {/* Page title */}
          <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-1 min-w-0 truncate">
            {PAGE_LABELS[effectivePage] ?? ""}
          </h1>

          <span
            className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold"
            style={{
              background: "var(--region-accent-soft)",
              borderColor: "var(--region-accent-border)",
              color: "var(--region-accent)",
            }}
            title={`${regionIdentity.label} workspace`}
          >
            <span className="uppercase">{regionIdentity.shortLabel}</span>
            <span className="hidden sm:inline">{regionIdentity.label}</span>
          </span>

          {/* Offline badge */}
          {!isOnline && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-semibold">
              ● Offline
            </span>
          )}

          {callbackBadge > 0 && (
            <button
              onClick={() => {
                setLeadsFilter("callbacks");
                setPage("leads");
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition hover:opacity-80"
              style={{
                background: "var(--region-accent-soft)",
                color: "var(--region-accent)",
                border: "1px solid var(--region-accent-border)",
              }}
              title="Callbacks in the actionable queue"
            >
              {callbackBadge} Callback{callbackBadge === 1 ? "" : "s"}
            </button>
          )}

          {/* Actionable follow-ups badge */}
          {followUpBadge > 0 && (
            <button
              onClick={() => {
                setLeadsFilter("followups");
                setPage("leads");
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition hover:opacity-80"
              style={{
                background: "var(--region-accent-soft)",
                color: "var(--region-accent)",
                border: "1px solid var(--region-accent-border)",
              }}
              title="Actionable follow-ups in the operational queue"
            >
              {followUpBadge} Follow-up{followUpBadge === 1 ? "" : "s"}
            </button>
          )}

          {/* Sheets sync */}
          <button
            onClick={() => setSheetsSyncOpen(true)}
            title="Google Sheets Sync"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition"
          >
            <ArrowLeftRight size={14} />
            <span className="hidden md:inline">Sheets</span>
          </button>

          {/* Leads toolbar */}
          {effectivePage === "leads" && (
            <>
              <button
                onClick={() => setCSVImportOpen(true)}
                title="Import CSV"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition"
              >
                <FileUp size={14} />
                <span className="hidden md:inline">CSV</span>
              </button>
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setExportMenuOpen((open) => !open)}
                  title="Export"
                  aria-expanded={exportMenuOpen}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition"
                >
                  <Download size={14} />
                  <span className="hidden md:inline">Export</span>
                </button>
                {exportMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-slate-700 shadow-lg z-30"
                  role="menu"
                >
                  <button
                    onClick={() => {
                      handleExportLeads();
                      setExportMenuOpen(false);
                    }}
                    className="w-full min-h-11 px-4 py-2.5 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-t-xl transition"
                    role="menuitem"
                  >
                    Export Leads CSV
                  </button>
                  <button
                    onClick={() => {
                      handleExportCallHistory();
                      setExportMenuOpen(false);
                    }}
                    className="w-full min-h-11 px-4 py-2.5 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-b-xl border-t border-gray-100 dark:border-slate-800 transition"
                    role="menuitem"
                  >
                    Export Call History CSV
                  </button>
                </div>
                )}
              </div>
              <button
                onClick={() => setAddLeadOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg hover:opacity-90 transition font-medium text-sm"
                style={{ background: "var(--region-accent)", color: "var(--region-text-on-accent)" }}
              >
                <Plus size={15} />
                <span className="hidden sm:inline">Add Lead</span>
              </button>
            </>
          )}
        </header>

        {/* Page content — flex-1 so it fills height after the 56px topbar */}
        <div className="app-scale-root flex-1 overflow-hidden flex flex-col">
          <main className="flex-1 overflow-hidden flex flex-col">
            {effectivePage === "leads" && (
              <LeadsPage
                key={activeRegion}
                addLeadOpen={addLeadOpen}
                onAddLeadOpenChange={setAddLeadOpen}
                pendingCallLeadId={pendingCallLeadId}
                onPendingCallLeadConsumed={() => setPendingCallLeadId(null)}
                initialFilter={leadsFilter}
                onFilterCleared={() => setLeadsFilter(null)}
              />
            )}
            <Suspense fallback={<PageLoader />}>
              {effectivePage === "client-hub" && (
                <ClientHubPage
                  initialFilter={clientsFilter}
                  onFilterCleared={() => setClientsFilter(null)}
                  onOpenProfile={(leadId) => setSelectedClientId(leadId)}
                />
              )}
              {effectivePage === "dashboard" && (
                <DashboardPage onCallLead={handleCallFromDashboard} onNavigate={handleNavigateFromDashboard} />
              )}
              {effectivePage === "calendar" && <CalendarPage onViewClientProfile={(_lead) => setPage("client-hub")} />}
              {effectivePage === "deal-dashboard" && <DealDashboardPage />}
              {effectivePage === "reports" && <ReportsDashboardPage />}
              {effectivePage === "training" && <TrainingHubPage />}
              {effectivePage === "dq-import" && <DQImportPage />}
              {effectivePage === "map" && <Map />}
              {effectivePage === "draps" && <DrapsPage />}
              {effectivePage === "commissions" && <CommissionsPage />}
              {effectivePage === "admin" && isAdmin && <AdminPage onOpenSheetsSync={() => setSheetsSyncOpen(true)} />}
              {effectivePage === "team-chat" && <TeamChatPage />}
              {effectivePage === "knowledge-base" && <KnowledgeBasePage />}
              {effectivePage === "document-centre" && <DocumentCentre />}
              {effectivePage === "pia" && <PIA />}
              {effectivePage === "smsf" && <SMSF />}
              {effectivePage === "admin-guide" && isAdmin && <AdminGuidePage />}
              {effectivePage === "my-dashboard" && <MyDashboardPage />}
              {effectivePage === "assistant" && <AssistantPage key={activeRegion} />}
              {effectivePage === "inbox" && <InboxPage key={activeRegion} />}
              {effectivePage === "rep-dashboard" && <RepDashboardPage />}
              {effectivePage === "rep-settings" && (
                <Suspense fallback={<PageLoader />}>
                  <RepSettingsPanel />
                </Suspense>
              )}
            </Suspense>
          </main>
        </div>

        {/* ── Client Profile Overlay ────────────────────────────────────────── */}
        {selectedClientId !== null && (
          <Suspense fallback={<PageLoader />}>
            <ClientProfilePage
              clientId={selectedClientId}
              onClose={() => setSelectedClientId(null)}
              onNavigate={(page) => {
                if (page === "pia") {
                  const client = allLeads.find((l) => l.id === selectedClientId);
                  if (client) {
                    const { setPiaPrefillContext } = useAppStore.getState();
                    setPiaPrefillContext(String(client.id), client.name);
                  }
                  setSelectedClientId(null);
                  setPage("pia");
                }
              }}
            />
          </Suspense>
        )}

        {/* ── Floating Tools ────────────────────────────────────────────────── */}
        <FloatingCalculator />
        <FloatingCalendar />

        {/* ── Onboarding ────────────────────────────────────────────────────── */}
        {showOnboarding && checkedOnboarding && (
          <OnboardingFlow onComplete={handleOnboardingComplete} onNavigate={handleOnboardingNavigate} />
        )}

        {/* ── Modals ────────────────────────────────────────────────────────── */}
        <Suspense fallback={null}>
          {csvImportOpen && <CSVImportModal onClose={() => setCSVImportOpen(false)} onImport={handleCSVImportSave} />}
          {sheetsSyncOpen && <SheetsSyncModal onClose={() => setSheetsSyncOpen(false)} />}
        </Suspense>
        <OfflineIndicator />
        <LearningDebugPanel />
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="min-h-screen bg-[var(--bg)]">
          <AppShell />
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
