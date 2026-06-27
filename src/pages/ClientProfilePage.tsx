/**
 * ClientProfilePage.tsx — Full-screen client hub overlay.
 *
 * Replaces the sidebar-style profile with a full-screen workspace:
 *  - Header with client info + quick actions
 *  - Quick insight bar (next action, last contact, notes/deals count)
 *  - Tabbed content: Overview, Notes, Appointments, Deals, Documents, Reports
 *
 * Receives clientId via props; locks background scroll; traps focus.
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  orderBy,
  limit,
  getDocs,
  writeBatch,
  addDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";import { loadPIAReportsByClient } from "../lib/piaReports";
import { useAppStore } from "../stores/appStore";
import { useToast } from "../context/ToastContext";
import { useClientNotes } from "../hooks/useClientNotes";
import { useLeadAppointments, useClientDealDocuments } from "../hooks/useFirebase";
import { useRepSettings } from "../hooks/useDashboard";
import { useFirebaseAuthUser } from "../hooks/useFirebaseAuthUser";
import { useAIGuidance } from "../hooks/useAIGuidance";
import { AIGuidanceCard } from "../components/AIGuidanceCard";
import { generateClientBrief, enhanceNoteContent, type ClientBrief } from "../lib/aiInsights";
import { getNextAction, deriveLastActivityAt } from "../lib/nextAction";
import { timeAgo } from "../lib/dates";
import { Lead, Rep, ClientNote, Appointment } from "../types";
import { normalizeLeadStatus } from "../lib/statusConfig";
import {
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  BarChart3,
  Search,
  X,
  Plus,
  Calendar,
  Briefcase,
  MessageSquare,
  Send,
  Star,
  Zap,
  Clock,
  TrendingUp,
  Download,
  ArrowLeft,
  Home,
  DollarSign,
  ChevronRight,
  Loader2,
  Sparkles,
  CheckCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────────── */

type ClientTab = "overview" | "notes" | "appointments" | "deals" | "documents" | "reports" | "history";

interface AuditLogEntry {
  type: string;
  entityId: number;
  previousValue: string;
  newValue: string;
  timestamp: number;
}


interface SavedReport {
  id: string;
  createdAt: number;
  userName: string;
  result: Record<string, unknown>;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Constants
 * ───────────────────────────────────────────────────────────────────────────── */

const amber = "#b8933a";

const TABS: { key: ClientTab; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: User },
  { key: "notes", label: "Notes", icon: MessageSquare },
  { key: "appointments", label: "Appointments", icon: Calendar },
  { key: "deals", label: "Deals", icon: Briefcase },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "history", label: "History", icon: Clock },
];

const DOC_TYPE_LABELS: Record<string, string> = {
  oa: "Offer & Acceptance",
  compliance: "Compliance",
  contract: "Contract",
  other: "Other",
};

const NOTE_SOURCE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  appointment: { label: "Appt", color: "#b8933a", bg: "rgba(184,147,58,0.12)" },
  call: { label: "Call", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  deal: { label: "Deal", color: "#a855f7", bg: "rgba(168,85,247,0.12)" },
  manual: { label: "Note", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
};

const NOTE_APPT_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  FC: { label: "FC", color: "#b8933a", bg: "rgba(184,147,58,0.15)" },
  FR: { label: "FR", color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  Discovery: { label: "Discovery", color: "#06b6d4", bg: "rgba(6,182,212,0.15)" },
};

const STATUS_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "New", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  contacted: { label: "Contacted", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  qualified: { label: "Qualified", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  booked: { label: "Booked", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  lost: { label: "Lost", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  DQ: { label: "DQ", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
  Booked: { label: "Booked", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  Revisit: { label: "Revisit", color: "#b8933a", bg: "rgba(184,147,58,0.12)" },
  "Not Interested": { label: "Not Interested", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  "Wrong Number": { label: "Wrong Number", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
  "No Answer": { label: "No Answer", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────────────────────── */

function fmtDate(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtNoteDate(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtAUD(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function apptLabel(appt: Appointment): string {
  // Use title if present, otherwise derive from serviceTypeId or fall back
  if (appt.title) return appt.title;
  const id = (appt.serviceTypeId ?? "").toLowerCase();
  if (id.includes("fc") || id.includes("first")) return "First Consult (FC)";
  if (id.includes("fr") || id.includes("finance")) return "Finance Run (FR)";
  if (id.includes("discovery")) return "Discovery";
  return "Appointment";
}

/** Unified card class — uses CSS variables so it respects light/dark mode */
const CARD = "rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm hover:shadow-md transition-shadow" as const;
/** @deprecated Use CARD instead */
const cardCls = CARD;
const cardStyle = {} as const;
void cardCls;
void cardStyle;

/* ─────────────────────────────────────────────────────────────────────────────
 * Couple Linker Modal
 * ───────────────────────────────────────────────────────────────────────────── */

function CoupleLinkerModal({
  clientId,
  onClose,
  onLink,
  allLeads,
}: {
  clientId: string;
  onClose: () => void;
  onLink: (partnerId: string) => void;
  allLeads: Lead[];
}) {
  const [search, setSearch] = React.useState("");

  const potentialPartners = React.useMemo(() => {
    const others = allLeads.filter((l) => String(l.id) !== String(clientId));
    if (!search.trim()) return others;
    const term = search.toLowerCase();
    return others.filter(
      (l) =>
        l.name.toLowerCase().includes(term) ||
        l.email?.toLowerCase().includes(term) ||
        l.phone?.includes(term),
    );
  }, [allLeads, clientId, search]);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[9500]" onClick={onClose} />
      <div className="fixed inset-0 z-[9501] flex items-center justify-center p-4">
        <div
          className="rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col"
          style={{ background: "var(--surface, #141824)" }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-bold text-[var(--text)]">Link Partner</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-muted)]"
            >
              <X size={16} />
            </button>
          </div>
          <div className="px-5 py-3 border-b border-[var(--border)]">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, phone..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
            {potentialPartners.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-[var(--text-muted)]">
                No clients found
              </div>
            ) : (
              potentialPartners.map((partner) => (
                <button
                  key={partner.id}
                  onClick={() => onLink(String(partner.id))}
                  className="w-full text-left p-3 rounded-lg border border-[var(--border)] hover:bg-black/5 dark:hover:bg-white/5 hover:border-[#b8933a] transition-all text-xs"
                >
                  <div className="font-medium text-[var(--text)]">{partner.name}</div>
                  {(partner.email || partner.phone) && (
                    <div className="text-[var(--text-muted)] text-[11px] mt-1">
                      {partner.email && <div>{partner.email}</div>}
                      {partner.phone && <div>{partner.phone}</div>}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Document Library Modal
 * ───────────────────────────────────────────────────────────────────────────── */

function DocumentLibraryModal({
  onClose,
  onLink,
  clientId,
}: {
  onClose: () => void;
  onLink: (docId: string) => void;
  clientId: string;
}) {
  const { documents: docs, loading } = useClientDealDocuments(clientId);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const sorted = [...docs].sort((a, b) => b.createdAt - a.createdAt);
    if (!search.trim()) return sorted;
    const term = search.toLowerCase();
    return sorted.filter((d) => d.name.toLowerCase().includes(term) || d.type.includes(term));
  }, [docs, search]);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[9500]" onClick={onClose} />
      <div className="fixed inset-0 z-[9501] flex items-center justify-center p-4">
        <div
          className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col"
          style={{ background: "var(--surface, #141824)" }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-bold text-[var(--text)]">Link Document</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-muted)]">
              <X size={16} />
            </button>
          </div>
          <div className="px-5 py-3 border-b border-[var(--border)]">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div
                  className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: amber, borderTopColor: "transparent" }}
                />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-8">
                No documents found.{" "}
                <span className="text-[var(--text-muted)]">Upload documents in the Deal Dashboard first.</span>
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => onLink(d.id)}
                    className="w-full text-left px-3 py-2.5 rounded-lg bg-[var(--bg)] hover:brightness-[0.97] transition"
                  >
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{d.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: `${amber}18`, color: amber }}
                      >
                        {DOC_TYPE_LABELS[d.type] || d.type}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">Added {fmtDate(d.createdAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Note Card
 * ───────────────────────────────────────────────────────────────────────────── */

function NoteCard({
  note,
  onToggleImportant,
}: {
  note: ClientNote;
  onToggleImportant: (id: string, val: boolean) => Promise<void>;
}) {
  const sourceBadge = NOTE_SOURCE_BADGES[note.source] || NOTE_SOURCE_BADGES.manual;
  const apptBadge = note.appointmentType ? NOTE_APPT_BADGES[note.appointmentType] : null;
  const resolveTime =
    note.createdAtTs && typeof note.createdAtTs.toMillis === "function"
      ? note.createdAtTs.toMillis()
      : note.createdAt;

  return (
    <div className="px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] hover:brightness-[0.97] transition-all duration-150">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <button
          onClick={() => onToggleImportant(note.id, !note.isImportant)}
          className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition"
          title={note.isImportant ? "Unpin note" : "Pin note"}
        >
          <Star size={13} className={note.isImportant ? "text-amber-400 fill-amber-400" : "text-[var(--text-muted)]"} />
        </button>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ color: sourceBadge.color, background: sourceBadge.bg }}
        >
          {sourceBadge.label}
        </span>
        {apptBadge && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ color: apptBadge.color, background: apptBadge.bg }}
          >
            {apptBadge.label}
          </span>
        )}
        <span className="text-xs font-medium text-[var(--text)]">{note.repName}</span>
        <span className="text-[10px] text-[var(--text-muted)] ml-auto">{fmtNoteDate(resolveTime)}</span>
      </div>
      <p className="text-xs text-[var(--text)] whitespace-pre-wrap leading-relaxed">{note.content}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Stat Tile
 * ───────────────────────────────────────────────────────────────────────────── */

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={CARD}>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-medium text-[var(--text)] mt-1 truncate">{value}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Main Page Component
 * ───────────────────────────────────────────────────────────────────────────── */

export interface ClientProfilePageProps {
  clientId: number;
  onClose: () => void;
  onNavigate?: (page: string) => void;
}

export function ClientProfilePage({ clientId, onClose, onNavigate }: ClientProfilePageProps) {
  const { currentUser, leads, reps } = useAppStore();
  const { currentUser: firebaseUser, authLoading } = useFirebaseAuthUser();
  const { showToast } = useToast();
  const { settings: repSettings } = useRepSettings(currentUser?.id);
  const [activeTab, setActiveTab] = useState<ClientTab>("overview");
  const [showLibrary, setShowLibrary] = useState(false);
  const [showCoupleModal, setShowCoupleModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [piaDocs, setPiaDocs] = useState<any[]>([]);
  const [clientPiaReports, setClientPiaReports] = useState<any[]>([]);
  const [piaReports, setPiaReports] = useState<SavedReport[]>([]);
  const [smsfReports, setSmsfReports] = useState<SavedReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [guidanceDismissed, setGuidanceDismissed] = useState(false);
  const [linkClientId, setLinkClientId] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [smsfFinancials] = useState<any>(null);
  const [showBankDetails, setShowBankDetails] = useState(false);
  // Controls slide-in animation — false on mount, true after first paint
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  // Resolve the lead/client from the store
  const client = useMemo(() => leads.find((l) => l.id === clientId) ?? null, [leads, clientId]);
  const clientIdStr = client ? String(client.id) : "";

  const linkedPartner = useMemo(() => {
    if (!client?.clientGroupId) return null;
    return leads.find(
      (l) =>
        l.clientGroupId === client.clientGroupId && String(l.id) !== String(client.id),
    ) ?? null;
  }, [leads, client]);

  // ── Client notes hook ───────────────────────────────────────────────────
  const { notes: clientNotes, loading: loadingNotes, addNote, toggleImportant } = useClientNotes(clientIdStr);
  const [optimisticNotes, setOptimisticNotes] = useState<ClientNote[]>([]);

  useEffect(() => {
    if (optimisticNotes.length === 0) return;
    setOptimisticNotes((prev) =>
      prev.filter(
        (opt) =>
          !clientNotes.some(
            (real) =>
              real.createdAt === opt.createdAt &&
              real.content === opt.content &&
              real.createdBy === opt.createdBy,
          ),
      ),
    );
  }, [clientNotes]);

  const displayNotes = useMemo(() => [...optimisticNotes, ...clientNotes], [optimisticNotes, clientNotes]);

  const [auditHistory, setAuditHistory] = useState<AuditLogEntry[] | null>(null);
  const prevClientIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (client?.id !== prevClientIdRef.current) {
      prevClientIdRef.current = client?.id;
      setAuditHistory(null);
      return;
    }
    if (activeTab !== "history" || !client?.id || auditHistory !== null) return;
    let mounted = true;
    getDocs(
      query(
        collection(db, "auditLogs"),
        where("entityId", "==", client.id),
        orderBy("timestamp", "desc"),
        limit(20),
      ),
    )
      .then((snap) => {
        if (!mounted) return;
        setAuditHistory(snap.docs.map((d) => d.data() as AuditLogEntry));
      })
      .catch(() => {
        if (!mounted) return;
        setAuditHistory([]);
      });
    return () => { mounted = false; };
  }, [activeTab, client?.id, auditHistory]);

  // ── AI Brief (non-blocking) ──────────────────────────────────────────────
  const [clientBrief, setClientBrief] = useState<ClientBrief | null>(null);
  useEffect(() => {
    if (!clientIdStr) { setClientBrief(null); return; }
    generateClientBrief(clientIdStr)
      .then(setClientBrief)
      .catch(() => setClientBrief(null));
  }, [clientIdStr]);

  // ── Appointments ────────────────────────────────────────────────────────
  const { appointments } = useLeadAppointments(clientId);

  // ── Linked documents ────────────────────────────────────────────────────
  const { documents: linkedDocs, loading: loadingDocs } = useClientDealDocuments(clientId);

  // ── PIA reports for this client (filtered by clientId or clientGroupId) ──
  useEffect(() => {
    if (authLoading) return;
    if (!client) return;
    if (!firebaseUser) return;

    const queries = [];

    queries.push(
      query(
        collection(db, "piaReports"),
        where("clientId", "==", String(client.id))
      )
    );

    if (client.clientGroupId) {
      queries.push(
        query(
          collection(db, "piaReports"),
          where("clientGroupId", "==", client.clientGroupId)
        )
      );
    }

    const unsubscribers = queries.map((q) =>
      onSnapshot(
        q,
        (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setPiaDocs((prev) => {
            const map = new Map(prev.map(d => [d.id, d]));
            docs.forEach(d => map.set(d.id, d));
            return Array.from(map.values());
          });
        },
        (err) => {
          console.error("[ClientProfilePage] PIA snapshot error:", err);
        },
      )
    );

    return () => unsubscribers.forEach(unsub => unsub());
  }, [authLoading, firebaseUser, client]);

  // ── Load normalized PIA reports for this client ──
  useEffect(() => {
    if (!client?.id) {
      setClientPiaReports([]);
      return;
    }

    loadPIAReportsByClient(String(client.id))
      .then(setClientPiaReports)
      .catch(() => setClientPiaReports([]));
  }, [client?.id]);

  // ── SMSF Financials (decrypted via Cloud Function) ──────────────────────────
  useEffect(() => {
    if (!client?.id) return;

    // Cloud Functions disabled — stub out
    void client.id;
  }, [client?.id]);

  // ── PIA + SMSF reports (loaded when reports tab opens) ──────────────────
  useEffect(() => {
    if (activeTab !== "reports" || !currentUser) return;
    setLoadingReports(true);
    const piaQ = query(
      collection(db, "piaReports"),
      where("userId", "==", currentUser.id),
      orderBy("createdAt", "desc"),
      limit(10),
    );
    const smsfQ = query(
      collection(db, "smsfReports"),
      where("userId", "==", currentUser.id),
      orderBy("createdAt", "desc"),
      limit(10),
    );
    Promise.all([getDocs(piaQ), getDocs(smsfQ)])
      .then(([pSnap, sSnap]) => {
        setPiaReports(
          pSnap.docs.map((d) => ({ id: d.id, ...d.data() } as SavedReport)),
        );
        setSmsfReports(
          sSnap.docs.map((d) => ({ id: d.id, ...d.data() } as SavedReport)),
        );
      })
      .catch(() => {})
      .finally(() => setLoadingReports(false));
  }, [activeTab, currentUser]);

  // ── Lock background scroll ──────────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev || ""; };
  }, []);

  // ── ESC to close ────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [onClose]);

  // ── Slide-in animation — stable (no RAF flicker) ────────────────────
  useEffect(() => {
    setIsOpen(true);
  }, []);

  // ── Focus panel on mount ────────────────────────────────────────────────
  useEffect(() => { modalRef.current?.focus(); }, []);

  // ── Derived data ────────────────────────────────────────────────────────
  const repMap = useMemo(() => {
    const m = new Map<number, Rep>();
    reps.forEach((r) => m.set(r.id, r));
    return m;
  }, [reps]);

  const nextAction = useMemo(
    () => (client ? getNextAction(client, appointments) : null),
    [client, appointments],
  );

  // AI guidance — rule-based, no API calls
  const aiGuidanceEnabled = repSettings.aiGuidanceEnabled !== false; // defaults to true
  const recentNoteContents = useMemo(
    () => clientNotes.slice(0, 5).map((n) => n.content),
    [clientNotes],
  );
  const aiGuidance = useAIGuidance(client, nextAction, recentNoteContents);

  const lastContactMs = useMemo(() => (client ? deriveLastActivityAt(client) : undefined), [client]);

  const today = new Date().toISOString().split("T")[0];

  const upcomingAppts = useMemo(
    () => appointments.filter((a) => (a.date ?? "") >= today).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
    [appointments, today],
  );

  const pastAppts = useMemo(
    () => appointments.filter((a) => (a.date ?? "") < today).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    [appointments, today],
  );

  const nextAppt = upcomingAppts[0] ?? null;

  const displayStatus = client ? normalizeLeadStatus(client.status) : null;
  const statusBadge = displayStatus
    ? (STATUS_BADGES[displayStatus] ?? { label: displayStatus, color: "#6b7280", bg: "rgba(107,114,128,0.12)" })
    : null;

  const dqRepName = client ? (repMap.get(client.dqRep)?.name ?? "—") : "—";
  const fcRepName = client?.fcRep != null ? (repMap.get(client.fcRep)?.name ?? "—") : null;

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleAddNote = useCallback(async () => {
    if (!noteText.trim() || !client || !currentUser) return;
    setAddingNote(true);
    const enhancedContent = enhanceNoteContent(noteText.trim());
    const now = Date.now();
    const tempNote: ClientNote = {
      id: `temp-${now}`,
      clientId: String(client.id),
      content: enhancedContent,
      source: "manual",
      createdBy: String(currentUser.id),
      repName: currentUser.name,
      createdAt: now,
    };
    setOptimisticNotes((prev) => [tempNote, ...prev]);
    setNoteText("");
    try {
      await addNote({
        clientId: String(client.id),
        content: enhancedContent,
        source: "manual",
        createdBy: String(currentUser.id),
        repName: currentUser.name,
      });
      void addDoc(collection(db, "auditLogs"), {
        type: "note_create",
        entityId: client.id,
        previousValue: "",
        newValue: enhancedContent.slice(0, 200),
        userId: String(currentUser?.id ?? "unknown"),
        timestamp: Date.now(),
        source: "manual",
      }).catch((err) => console.warn("[audit]", err));
      showToast("✅ Note added", "success");
    } catch {
      setOptimisticNotes((prev) => prev.filter((n) => n.id !== tempNote.id));
      setNoteText(noteText);
      showToast("❌ Failed to add note", "error");
    } finally {
      setAddingNote(false);
    }
  }, [noteText, client, currentUser, addNote, showToast]);

  const handleLinkDocument = useCallback(
    async (docId: string) => {
      if (!client) return;
      try {
        await updateDoc(doc(db, "dealDocuments", docId), { clientId: String(client.id) });
        showToast("✅ Document linked", "success");
        setShowLibrary(false);
      } catch {
        showToast("❌ Failed to link document", "error");
      }
    },
    [client, showToast],
  );

  const handleLinkClient = useCallback(async () => {
    if (!client || !linkClientId) return;
    await linkClientsAsCouple(linkClientId);
    setLinkClientId("");
  }, [client, linkClientId, showToast]);

  const linkClientsAsCouple = useCallback(async (partnerId: string) => {
    if (!client) return;

    const partner = leads.find((l) => String(l.id) === String(partnerId));
    if (!partner) {
      showToast("❌ Partner client not found", "error");
      return;
    }
    if (client.clientGroupId || partner.clientGroupId) {
      showToast("❌ One or both clients are already linked", "error");
      return;
    }

    const groupId = crypto.randomUUID();
    const groupRef = doc(db, "clientGroups", groupId);
    try {
      const batch = writeBatch(db);
      batch.set(groupRef, {
        id: groupId,
        clientIds: [String(client.id), String(partnerId)],
        createdAt: Date.now(),
        createdBy: currentUser?.id ?? "",
      });
      batch.update(doc(db, "leads", String(client.id)), { clientGroupId: groupId });
      batch.update(doc(db, "leads", String(partnerId)), { clientGroupId: groupId });
      await batch.commit();
      showToast("✅ Clients linked as couple", "success");
      setShowCoupleModal(false);
    } catch {
      showToast("❌ Failed to link clients", "error");
    }
  }, [client, leads, currentUser, showToast]);

  const handleUnlinkCouple = useCallback(async () => {
    if (!client || !linkedPartner) return;
    try {
      const batch = writeBatch(db);
      if (client.clientGroupId) {
        batch.delete(doc(db, "clientGroups", client.clientGroupId));
      }
      batch.update(doc(db, "leads", String(client.id)), { clientGroupId: null });
      batch.update(doc(db, "leads", String(linkedPartner.id)), { clientGroupId: null });
      await batch.commit();
      showToast("✅ Couple link removed", "success");
    } catch {
      showToast("❌ Failed to unlink clients", "error");
    }
  }, [client, linkedPartner, showToast]);

  const saveSmsfFinancials = async (clientId: string, data: {
    accountName: string;
    bsb: string;
    accountNumber: string;
  }) => {
    // Cloud Functions disabled — stub out
    void clientId; void data;
  };
  void saveSmsfFinancials;

  const handleCall = useCallback(() => {
    if (!client) return;
    if (client.phone) {
      window.location.href = `tel:${client.phone}`;
    } else {
      showToast("No phone number on file", "error");
    }
  }, [client, showToast]);

  const handleBookAppointment = useCallback(() => {
    showToast("📅 Opening appointment booking…", "info");
  }, [showToast]);

  const handleLogNote = useCallback(() => {
    setActiveTab("notes");
    setTimeout(() => noteInputRef.current?.focus(), 100);
  }, []);

  const handleUseScript = useCallback((script: string) => {
    setNoteText(script);
    setActiveTab("notes");
    setGuidanceDismissed(true);
    setTimeout(() => noteInputRef.current?.focus(), 100);
  }, []);

  // ── Loading / missing client ─────────────────────────────────────────────
  if (!client) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 py-6">
        {/* backdrop */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[4px]" onClick={onClose} />
        {/* loading panel — centered modal */}
        <div
          className={`relative w-full max-w-[1200px] h-[85vh] rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden flex items-center justify-center bg-[var(--surface)] text-[var(--text)] will-change-transform transition-all duration-200 ease-out${isOpen ? " opacity-100 translate-y-0" : " opacity-0 translate-y-2"}`}
        >
          <div className="text-center">
            <div
              className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: amber, borderTopColor: "transparent" }}
            />
            <p className="text-[var(--text-muted)] text-sm">Loading client…</p>
          </div>
        </div>
      </div>
    );
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * Render
   * ───────────────────────────────────────────────────────────────────────────*/
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 py-6">
      {/* backdrop — click outside to close */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[4px]"
        onClick={onClose}
      />

      {/* centered modal panel — fades + slides in */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`relative w-full max-w-[1200px] h-[85vh] rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col outline-none bg-[var(--surface)] text-[var(--text)] will-change-transform transition-all duration-200 ease-out${isOpen ? " opacity-100 translate-y-0" : " opacity-0 translate-y-2"}`}
      >
      {/* ── Inner wrapper — prevents theme flash during animation ─────── */}
      <div className="h-full w-full bg-[var(--surface)] text-[var(--text)] flex flex-col">
      {/* ── X close button — absolute top-right ─────────────────────────── */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-[var(--bg)] hover:brightness-95 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all duration-150 hover:scale-105"
        aria-label="Close"
      >
        <X size={16} />
      </button>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-[var(--border)] flex items-center gap-4">
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text)] transition flex-shrink-0"
          aria-label="Close client profile"
        >
          <ArrowLeft size={18} />
        </button>

        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: `${amber}18` }}
        >
          <User size={20} style={{ color: amber }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base font-bold text-[var(--text)] truncate">{client.name}</h1>
            {statusBadge && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: statusBadge.color, background: statusBadge.bg }}
              >
                {statusBadge.label}
              </span>
            )}
            {linkedPartner && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: amber, background: `${amber}18` }}
              >
                Linked with {linkedPartner.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mt-0.5 flex-wrap">
            {client.phone && (
              <span className="flex items-center gap-1">
                <Phone size={11} /> {client.phone}
              </span>
            )}
            {client.email && (
              <span className="flex items-center gap-1">
                <Mail size={11} /> {client.email}
              </span>
            )}
            {(client.houseNum || client.street || client.suburb) && (
              <span className="flex items-center gap-1">
                <MapPin size={11} />{" "}
                {[client.houseNum, client.street, client.suburb].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleCall}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text)] transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
            style={{ background: amber }}
          >
            <Phone size={13} /> Call
          </button>
          <button
            onClick={handleBookAppointment}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--text)] hover:bg-black/5 dark:hover:bg-black/5 dark:hover:bg-white/5 hover:border-black/20 dark:hover:border-white/20 transition-all duration-150 active:scale-[0.98]"
          >
            <Calendar size={13} /> Book
          </button>
          <button
            onClick={handleLogNote}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--text)] hover:bg-black/5 dark:hover:bg-black/5 dark:hover:bg-white/5 hover:border-black/20 dark:hover:border-white/20 transition-all duration-150 active:scale-[0.98]"
          >
            <MessageSquare size={13} /> Note
          </button>
          <button
            onClick={() => setShowCoupleModal(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--text)] hover:bg-black/5 dark:hover:bg-black/5 dark:hover:bg-white/5 hover:border-black/20 dark:hover:border-white/20 transition-all duration-150 active:scale-[0.98]"
          >
            {linkedPartner ? "Linked" : "Couple"}
          </button>
        </div>
      </header>

      {/* ── Quick Insight Bar ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-2.5 border-b border-[var(--border)] flex items-center gap-4 overflow-x-auto text-xs">
        {nextAction && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Zap size={12} className="text-[var(--text-muted)]" />
            <span className="text-[var(--text-muted)]">Next:</span>
            <span
              className="font-medium px-2 py-0.5 rounded"
              style={{
                color:
                  nextAction.priority === "high"
                    ? "#ef4444"
                    : nextAction.priority === "medium"
                      ? amber
                      : "#22c55e",
                background:
                  nextAction.priority === "high"
                    ? "rgba(239,68,68,0.1)"
                    : nextAction.priority === "medium"
                      ? "rgba(184,147,58,0.1)"
                      : "rgba(34,197,94,0.1)",
              }}
            >
              {nextAction.label}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Clock size={12} className="text-[var(--text-muted)]" />
          <span className="text-[var(--text-muted)]">Last contact:</span>
          <span className="text-gray-700 dark:text-gray-300 font-medium">{timeAgo(lastContactMs)}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <MessageSquare size={12} className="text-[var(--text-muted)]" />
          <span className="text-[var(--text-muted)]">Notes:</span>
          <span className="text-gray-700 dark:text-gray-300 font-medium">{displayNotes.length}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Briefcase size={12} className="text-[var(--text-muted)]" />
          <span className="text-[var(--text-muted)]">Docs:</span>
          <span className="text-gray-700 dark:text-gray-300 font-medium">{linkedDocs.length}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Calendar size={12} className="text-[var(--text-muted)]" />
          <span className="text-[var(--text-muted)]">Appointments:</span>
          <span className="text-gray-700 dark:text-gray-300 font-medium">{appointments.length}</span>
        </div>
      </div>

      {/* ── Persistent Next-Action Strip (visible on all non-overview tabs) ─ */}
      {nextAction && nextAction.type !== "none" && activeTab !== "overview" && (
        <div
          className="flex-shrink-0 px-4 sm:px-6 py-2 flex items-center gap-3 border-b border-[var(--border)]"
          style={{
            background:
              nextAction.priority === "high"
                ? "rgba(239,68,68,0.04)"
                : nextAction.priority === "medium"
                  ? "rgba(184,147,58,0.04)"
                  : "rgba(34,197,94,0.04)",
          }}
        >
          <Zap
            size={12}
            style={{
              color:
                nextAction.priority === "high" ? "#ef4444" : nextAction.priority === "medium" ? amber : "#22c55e",
              flexShrink: 0,
            }}
          />
          <span className="text-xs text-[var(--text-muted)] flex-1 min-w-0 truncate">
            <span className="text-[var(--text-muted)] mr-1">Next:</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{nextAction.label}</span>
          </span>
          <button
            onClick={handleCall}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text)] transition hover:opacity-90"
            style={{ background: amber }}
          >
            <Phone size={11} /> Call
          </button>
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-[var(--border)] flex overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-all duration-150 flex-shrink-0 border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.key
                ? "border-[#b8933a] text-[var(--text)]"
                : "border-transparent text-[var(--text-muted)] hover:text-gray-700 dark:hover:text-gray-700 dark:text-gray-300 hover:border-black/10 dark:hover:border-white/10"
            }`}
          >
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
            {/* Next Action (prominent) */}
            {nextAction && nextAction.type !== "none" && (
              <div
                className="rounded-xl p-4 flex items-center gap-4 border shadow-sm hover:shadow-md transition-shadow"
                style={{
                  background:
                    nextAction.priority === "high"
                      ? "rgba(239,68,68,0.05)"
                      : nextAction.priority === "medium"
                        ? "rgba(184,147,58,0.05)"
                        : "rgba(34,197,94,0.05)",
                  borderColor:
                    nextAction.priority === "high"
                      ? "rgba(239,68,68,0.18)"
                      : nextAction.priority === "medium"
                        ? "rgba(184,147,58,0.18)"
                        : "rgba(34,197,94,0.18)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background:
                      nextAction.priority === "high"
                        ? "rgba(239,68,68,0.10)"
                        : nextAction.priority === "medium"
                          ? "rgba(184,147,58,0.10)"
                          : "rgba(34,197,94,0.10)",
                  }}
                >
                  <Zap
                    size={18}
                    style={{
                      color:
                        nextAction.priority === "high"
                          ? "#ef4444"
                          : nextAction.priority === "medium"
                            ? amber
                            : "#22c55e",
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)]">{nextAction.label}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{nextAction.reason}</p>
                </div>
                <button
                  onClick={handleCall}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text)] transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                  style={{ background: amber }}
                >
                  <Phone size={12} /> Call now
                </button>
              </div>
            )}

            {/* AI Guidance Card — rule-based, dismissible, below Next Action */}
            {aiGuidanceEnabled && aiGuidance && !guidanceDismissed && (
              <AIGuidanceCard
                suggestion={aiGuidance.action}
                objection={aiGuidance.objection?.type}
                coaching={aiGuidance.coaching}
                script={aiGuidance.script}
                onDismiss={() => setGuidanceDismissed(true)}
                onUseScript={handleUseScript}
              />
            )}

            {/* Quick stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Status" value={displayStatus || "—"} />
              <StatTile label="Deal Stage" value={client.dealStage || "—"} />
              <StatTile label="DQ Rep" value={dqRepName} />
              {fcRepName && <StatTile label="FC Rep" value={fcRepName} />}
              <StatTile label="Lead Date" value={client.leadDate || "—"} />
              <StatTile label="Last Contact" value={timeAgo(lastContactMs)} />
              <StatTile label="Notes" value={String(displayNotes.length)} />
              <StatTile label="Appointments" value={String(appointments.length)} />
            </div>

            {/* Link as couple */}
            <div className={`${CARD}`}>
              <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Link Partner</p>
              {linkedPartner ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: `${amber}12`, border: `1px solid ${amber}30` }}>
                    <span className="text-xs text-[var(--text)]">Linked with: <span className="font-semibold">{linkedPartner.name}</span></span>
                  </div>
                  <button
                    onClick={handleUnlinkCouple}
                    className="w-full text-xs px-3 py-1.5 rounded-lg font-medium border border-[var(--border)] text-[var(--text)] hover:bg-black/5 dark:hover:bg-white/5 transition"
                  >
                    Unlink
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={linkClientId}
                    onChange={(e) => setLinkClientId(e.target.value)}
                    className="flex-1 text-xs border border-[var(--border)] px-2 py-1.5 rounded-lg bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#b8933a]"
                  >
                    <option value="">Select partner</option>
                    {(leads || []).filter(l => l.id !== clientId).map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>

                  <button
                    onClick={handleLinkClient}
                    disabled={!linkClientId}
                    className="text-xs px-3 py-1.5 bg-[#b8933a] text-white rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Link
                  </button>
                </div>
              )}
            </div>

            {/* Combined Financials (if linked) */}
            {linkedPartner && (
              <div className={`${CARD}`}>
                <p className="text-xs font-medium text-[var(--text-muted)] mb-3">Combined Financials</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: `${amber}08` }}>
                    <span className="text-xs text-[var(--text-muted)]">Combined Income</span>
                    <span className="text-xs font-semibold text-[var(--text)]">
                      ${(((client?.income ?? 0) + (linkedPartner?.income ?? 0)) / 1000).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: `${amber}08` }}>
                    <span className="text-xs text-[var(--text-muted)]">Combined Deposit</span>
                    <span className="text-xs font-semibold text-[var(--text)]">
                      ${(((client?.deposit ?? 0) + (linkedPartner?.deposit ?? 0)) / 1000).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* AI Brief (if loaded) */}
            {clientBrief && (
              <div className={CARD}>
                <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles size={11} style={{ color: amber }} /> AI Client Brief
                </p>
                {clientBrief.goal && (
                  <p className="text-xs text-gray-700 dark:text-gray-300 mb-1">
                    <span className="text-[var(--text-muted)]">Goal: </span>
                    {clientBrief.goal}
                  </p>
                )}
                {clientBrief.timeline && (
                  <p className="text-xs text-gray-700 dark:text-gray-300 mb-1">
                    <span className="text-[var(--text-muted)]">Timeline: </span>
                    {clientBrief.timeline}
                  </p>
                )}
                {clientBrief.suggestedApproach?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {clientBrief.suggestedApproach.map((s, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                        <ChevronRight size={12} className="text-[var(--text-muted)] mt-0.5 flex-shrink-0" />
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Last 3 notes */}
            {displayNotes.length > 0 && (
              <div className={CARD}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5">
                    <MessageSquare size={13} style={{ color: amber }} /> Recent Notes
                  </p>
                  <button
                    onClick={() => setActiveTab("notes")}
                    className="text-[11px] text-[var(--text-muted)] hover:text-gray-700 dark:text-gray-300 transition-colors duration-100 flex items-center gap-1"
                  >
                    View all <ChevronRight size={11} />
                  </button>
                </div>
                <div className="space-y-2">
                  {displayNotes
                    .slice()
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .slice(0, 3)
                    .map((note) => (
                      <NoteCard key={note.id} note={note} onToggleImportant={toggleImportant} />
                    ))}
                </div>
              </div>
            )}

            {/* Upcoming appointment */}
            {nextAppt && (
              <div className={CARD}>
                <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5 mb-3">
                  <Calendar size={13} style={{ color: amber }} /> Upcoming Appointment
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${amber}15` }}
                  >
                    <Calendar size={18} style={{ color: amber }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text)]">{apptLabel(nextAppt)}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {nextAppt.date} {nextAppt.startTime && `at ${nextAppt.startTime}`}
                    </p>
                    {nextAppt.repId && (
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Rep: {repMap.get(nextAppt.repId)?.name ?? "—"}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setActiveTab("appointments")}
                    className="text-xs text-[var(--text-muted)] hover:text-gray-700 dark:text-gray-300 transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Active deal */}
            {client.dealId && (
              <div className={CARD}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5">
                    <TrendingUp size={13} style={{ color: amber }} /> Active Deal
                  </p>
                  <button
                    onClick={() => onNavigate?.("deal-dashboard")}
                    className="text-[11px] text-[var(--text-muted)] hover:text-gray-700 dark:text-gray-300 flex items-center gap-1 transition"
                  >
                    Open dashboard <ChevronRight size={11} />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(139,92,246,0.12)" }}
                  >
                    <Briefcase size={18} style={{ color: "#a855f7" }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Deal linked</p>
                    <p className="text-xs text-[var(--text-muted)]">ID: {client.dealId}</p>
                    {client.dealStage && (
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Stage: {client.dealStage}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SMSF Financials */}
            {["admin", "director"].includes(currentUser?.role ?? "") && smsfFinancials && (
              <div className="mt-4 p-4 rounded-xl border border-[#2a2a2e] bg-[#1a1a1d] shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-white">SMSF Financials</p>

                  <button
                    onClick={() => setShowBankDetails(v => !v)}
                    className="text-xs px-2 py-1 rounded bg-[#2a2a2e] hover:scale-105 transition-all"
                  >
                    {showBankDetails ? "Hide" : "Reveal"}
                  </button>
                </div>

                <div className="space-y-1 text-xs text-gray-300">
                  <p>
                    Account Name: {showBankDetails ? smsfFinancials?.accountName : "••••••••"}
                  </p>
                  <p>
                    BSB: {showBankDetails ? smsfFinancials?.bsb : "••••••"}
                  </p>
                  <p>
                    Account Number: {showBankDetails ? smsfFinancials?.accountNumber : "••••••••"}
                  </p>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!nextAction && displayNotes.length === 0 && appointments.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm text-[var(--text-muted)]">No activity yet for this client.</p>
                <p className="text-xs text-gray-600 mt-1">Log a note or book an appointment to get started.</p>
              </div>
            )}
          </div>
        )}

        {/* ── NOTES ─────────────────────────────────────────────────────── */}
        {activeTab === "notes" && (
          <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
            {/* Add note input */}
            <div className={CARD}>
              <label className="block text-sm font-semibold text-[var(--text)] mb-2">Add Note</label>
              <textarea
                ref={noteInputRef}
                id="quick-note-input"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleAddNote();
                  }
                }}
                placeholder="Type a note… (Ctrl+Enter to save)"
                rows={3}
                className="w-full bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-muted)] border border-[var(--border)] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleAddNote}
                  disabled={addingNote || !noteText.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-[var(--text)] transition-all duration-150 disabled:opacity-40 active:scale-[0.98]"
                  style={{ background: amber }}
                >
                  {addingNote ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  {addingNote ? "Adding…" : "Add Note"}
                </button>
              </div>
            </div>

            {/* Notes list */}
            {loadingNotes ? (
              <div className="flex justify-center py-8">
                <div
                  className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: amber, borderTopColor: "transparent" }}
                />
              </div>
            ) : displayNotes.length === 0 ? (
              <div className="text-center py-10">
                <MessageSquare size={32} className="mx-auto mb-3 text-gray-600" />
                <p className="text-sm text-[var(--text-muted)]">No notes yet</p>
                <p className="text-xs text-gray-600 mt-1">Add the first note above</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Important notes first */}
                {displayNotes.some((n) => n.isImportant) && (
                  <>
                    <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-1">
                      Pinned
                    </p>
                    {displayNotes
                      .filter((n) => n.isImportant)
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .map((note) => (
                        <NoteCard key={note.id} note={note} onToggleImportant={toggleImportant} />
                      ))}
                    <div className="h-px bg-[var(--border)]" />
                    <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide px-1">
                      All Notes
                    </p>
                  </>
                )}
                {displayNotes
                  .filter((n) => !n.isImportant)
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((note) => (
                    <NoteCard key={note.id} note={note} onToggleImportant={toggleImportant} />
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY ───────────────────────────────────────────────────── */}
        {activeTab === "history" && (
          <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
            {auditHistory === null ? (
              <div className="flex justify-center py-8">
                <div
                  className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: amber, borderTopColor: "transparent" }}
                />
              </div>
            ) : auditHistory.length === 0 ? (
              <div className="text-center py-10">
                <Clock size={32} className="mx-auto mb-3 text-gray-600" />
                <p className="text-sm text-[var(--text-muted)]">No activity yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {auditHistory.map((entry) => {
                  const typeMap: Record<string, { badge: string; color: string; bg: string; label: string }> = {
                    status_change:   { badge: "Status",   color: "#b8933a", bg: "rgba(184,147,58,0.12)", label: `${entry.previousValue} → ${entry.newValue}` },
                    callback_update: { badge: "Callback", color: "#3b82f6", bg: "rgba(59,130,246,0.12)", label: `${entry.previousValue || "—"} → ${entry.newValue || "—"}` },
                    note_create:     { badge: "Note",     color: "#22c55e", bg: "rgba(34,197,94,0.12)",  label: "Note added" },
                  };
                  const t = typeMap[entry.type] ?? {
                    badge: "Event",
                    color: "var(--text-muted)",
                    bg: "var(--hover)",
                    label: entry.type.replace(/_/g, " "),
                  };
                  return (
                    <div key={`${entry.type}-${entry.timestamp}`} className={`${CARD} flex items-center gap-3`}>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ color: t.color, background: t.bg }}
                      >
                        {t.badge}
                      </span>
                      <span className="text-xs text-[var(--text)] flex-1 min-w-0 truncate">{t.label}</span>
                      <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0">
                        {timeAgo(entry.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── APPOINTMENTS ──────────────────────────────────────────────── */}
        {activeTab === "appointments" && (
          <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
            {/* Upcoming */}
            <div>
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
                Upcoming ({upcomingAppts.length})
              </p>
              {upcomingAppts.length === 0 ? (
                <div className={`${CARD} text-center py-8`}>
                  <Calendar size={28} className="mx-auto mb-2 text-gray-600" />
                  <p className="text-sm font-medium text-[var(--text-muted)] mb-1">No upcoming appointments</p>
                  <p className="text-xs text-gray-600 mb-4">Book one to lock in the next step.</p>
                  <button
                    onClick={handleBookAppointment}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-[var(--text)] mx-auto transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                    style={{ background: amber }}
                  >
                    <Plus size={12} /> Book Appointment
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingAppts.map((appt) => (
                    <div key={appt.id} className={CARD}>
                      <div className="flex items-start gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: `${amber}15` }}
                        >
                          <Calendar size={16} style={{ color: amber }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text)]">{apptLabel(appt)}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            {appt.date}
                            {appt.startTime && ` · ${appt.startTime}`}
                            {appt.endTime && ` – ${appt.endTime}`}
                          </p>
                          {appt.repId && (
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                              Rep: {repMap.get(appt.repId)?.name ?? "—"}
                            </p>
                          )}
                          {appt.notes && (
                            <p className="text-xs text-[var(--text-muted)] mt-1 italic">{appt.notes}</p>
                          )}
                        </div>
                        {appt.status && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{
                              color:
                                appt.status === "completed"
                                  ? "#22c55e"
                                  : appt.status === "cancelled"
                                    ? "#ef4444"
                                    : amber,
                              background:
                                appt.status === "completed"
                                  ? "rgba(34,197,94,0.12)"
                                  : appt.status === "cancelled"
                                    ? "rgba(239,68,68,0.12)"
                                    : `${amber}12`,
                            }}
                          >
                            {appt.status.replace(/-/g, " ")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Past */}
            {pastAppts.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
                  Past ({pastAppts.length})
                </p>
                <div className="space-y-2">
                  {pastAppts.map((appt) => (
                    <div key={appt.id} className={`${CARD} opacity-60`}>
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--border)]">
                          <Calendar size={16} className="text-[var(--text-muted)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{apptLabel(appt)}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">{appt.date}</p>
                          {appt.repId && (
                            <p className="text-[11px] text-[var(--text-muted)]">{repMap.get(appt.repId)?.name ?? "—"}</p>
                          )}
                        </div>
                        {appt.status && (
                          <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{appt.status}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DEALS ─────────────────────────────────────────────────────── */}
        {activeTab === "deals" && (
          <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
            {client.dealId ? (
              <>
                {/* Active deal card */}
                <div className={CARD}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.12)" }}>
                      <TrendingUp size={20} style={{ color: "#a855f7" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Active Deal</p>
                      <p className="text-xs text-[var(--text-muted)]">Deal ID: {client.dealId}</p>
                    </div>
                    <button
                      onClick={() => onNavigate?.("deal-dashboard")}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition"
                    >
                      Open Dashboard <ChevronRight size={12} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {client.dealStage && <StatTile label="Deal Stage" value={client.dealStage} />}
                    {client.status && <StatTile label="Status" value={displayStatus || "—"} />}
                    {client.fcAppt?.date && <StatTile label="FC Date" value={client.fcAppt.date} />}
                    {client.frAppt?.date && <StatTile label="FR Date" value={client.frAppt.date} />}
                    {client.psAppt?.date && <StatTile label="PS Date" value={client.psAppt.date} />}
                    {client.settlementDate && <StatTile label="Settlement" value={client.settlementDate} />}
                  </div>
                </div>

                {/* Deal qualification data */}
                {(client.ownership || client.superannuation || client.employment) && (
                  <div className={CARD}>
                    <p className="text-sm font-semibold text-[var(--text)] mb-3">
                      Qualification Data
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {client.ownership && <StatTile label="Ownership" value={client.ownership} />}
                      {client.superannuation && <StatTile label="Super" value={client.superannuation} />}
                      {client.employment && <StatTile label="Employment" value={client.employment} />}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className={`${CARD} text-center py-10`}>
                <Briefcase size={36} className="mx-auto mb-3 text-gray-600" />
                <p className="text-sm font-medium text-[var(--text-muted)] mb-1">No deal linked yet</p>
                <p className="text-xs text-[var(--text-muted)] mb-4">
                  Deals are created when a lead progresses to an appointment.
                </p>
                <button
                  onClick={() => onNavigate?.("deal-dashboard")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border border-white/10 text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-150 active:scale-[0.98] mx-auto"
                >
                  Open Deal Dashboard <ChevronRight size={13} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENTS ─────────────────────────────────────────────────── */}
        {activeTab === "documents" && (
          <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--text-muted)]">
                {linkedDocs.length} document{linkedDocs.length !== 1 ? "s" : ""} linked
              </p>
              <button
                onClick={() => setShowLibrary(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text)] transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                style={{ background: amber }}
              >
                <Plus size={12} /> Link Document
              </button>
            </div>

            {loadingDocs ? (
              <div className="flex justify-center py-8">
                <div
                  className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: amber, borderTopColor: "transparent" }}
                />
              </div>
            ) : linkedDocs.length === 0 ? (
              <div className={`${CARD} text-center py-10`}>
                <FileText size={36} className="mx-auto mb-3 text-gray-600" />
                <p className="text-sm font-medium text-[var(--text-muted)] mb-1">No documents linked</p>
                <p className="text-xs text-[var(--text-muted)] mb-4">
                  Link documents from the Deal Dashboard to keep everything together.
                </p>
                <button
                  onClick={() => setShowLibrary(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-[var(--text)] transition-all duration-150 hover:opacity-90 active:scale-[0.98] mx-auto"
                  style={{ background: amber }}
                >
                  <Plus size={13} /> Link Document
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {linkedDocs.map((d) => (
                  <div key={d.id} className={`${CARD} hover:shadow-lg hover:scale-[1.01] transition-all duration-150`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--border)]">
                        <FileText size={16} className="text-[var(--text-muted)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{d.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: `${amber}18`, color: amber }}
                          >
                            {DOC_TYPE_LABELS[d.type] || d.type}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">{fmtDate(d.createdAt)}</span>
                        </div>
                      </div>
                      {d.fileUrl && (
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-muted)] hover:text-gray-800 dark:text-gray-200 transition flex-shrink-0"
                          title="Open document"
                        >
                          <Download size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* PIA Reports in Documents Tab */}
            {piaDocs.length > 0 && (
              <div className="border-t border-[var(--border)] pt-4 mt-4">
                <p className="text-xs text-[var(--text-muted)] mb-2 font-medium">PIA Reports</p>
                <div className="space-y-2">
                  {piaDocs
                    .filter(doc => doc.type === "pia" || doc.type === "smsf" || !doc.type)
                    .map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between hover:shadow-lg hover:scale-[1.01] transition-all duration-150"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span>
                            {doc.type === "pia" ? "📊" : doc.type === "smsf" ? "🏦" : "📄"}
                          </span>
                          <p className="text-sm font-medium">
                            {doc.type === "pia"
                              ? "PIA Report"
                              : doc.type === "smsf"
                              ? "SMSF Report"
                              : "Document"}
                          </p>

                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${
                              doc.type === "pia"
                                ? "bg-[#b8933a]/20 text-[#b8933a]"
                                : doc.type === "smsf"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-gray-500/20 text-gray-400"
                            }`}
                          >
                            {doc.type ?? "unknown"}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)]">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <button
                        onClick={() => setPreviewUrl(doc.pdfUrl)}
                        className="text-xs px-2 py-1 rounded bg-[#b8933a] text-white"
                      >
                        View
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── REPORTS ───────────────────────────────────────────────────── */}
        {activeTab === "reports" && (
          <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
            {loadingReports ? (
              <div className="flex justify-center py-12">
                <div
                  className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: amber, borderTopColor: "transparent" }}
                />
              </div>
            ) : (
              <>
                {/* Client-Linked PIA Reports */}
                {clientPiaReports.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5">
                        <Home size={13} style={{ color: amber }} /> Client PIA Reports
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {clientPiaReports.map((r) => {
                        const result = r.inputs || r.result || {};
                        const handleLoadReport = () => {
                          const { setReportToLoad } = useAppStore.getState();
                          setReportToLoad(result || {});
                          onNavigate?.("pia");
                        };
                        return (
                          <button
                            key={r.id}
                            onClick={handleLoadReport}
                            className={`${CARD} text-left transition-all hover:shadow-lg hover:border-[#b8933a] cursor-pointer`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">PIA Analysis</p>
                              <p className="text-[10px] text-[var(--text-muted)]">{fmtDate(r.createdAt)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {result.propertyValue != null && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Property Value</p>
                                  <p className="text-xs font-semibold text-[var(--text)]">
                                    {fmtAUD(result.propertyValue)}
                                  </p>
                                </div>
                              )}
                              {result.netPosition != null && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Net Position</p>
                                  <p
                                    className="text-xs font-semibold"
                                    style={{ color: result.netPosition >= 0 ? "#22c55e" : "#ef4444" }}
                                  >
                                    {fmtAUD(result.netPosition)}/wk
                                  </p>
                                </div>
                              )}
                              {result.grossYield != null && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Gross Yield</p>
                                  <p className="text-xs font-semibold text-[var(--text)]">
                                    {result.grossYield.toFixed(2)}%
                                  </p>
                                </div>
                              )}
                              {result.equity != null && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Equity</p>
                                  <p className="text-xs font-semibold text-[var(--text)]">
                                    {fmtAUD(result.equity)}
                                  </p>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mt-2">By {r.consultantName || r.userName}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PIA Reports */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5">
                      <Home size={13} style={{ color: amber }} /> PIA Reports
                    </p>
                    <button
                      onClick={() => onNavigate?.("pia")}
                      className="text-[11px] text-[var(--text-muted)] hover:text-gray-700 dark:text-gray-300 flex items-center gap-1 transition-colors duration-100"
                    >
                      Open PIA Calculator <ChevronRight size={11} />
                    </button>
                  </div>
                  {piaReports.length === 0 ? (
                    <div className={`${CARD} text-center py-6`}>
                      <p className="text-xs text-[var(--text-muted)] mb-2">No PIA reports saved yet</p>
                      <button
                        onClick={() => onNavigate?.("pia")}
                        className="text-xs font-medium transition-colors duration-100"
                        style={{ color: amber }}
                      >
                        Run a PIA analysis →
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {piaReports.map((r) => {
                        const res = r.result as Record<string, number | string | null>;
                        return (
                          <div key={r.id} className={CARD}>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">PIA Analysis</p>
                              <p className="text-[10px] text-[var(--text-muted)]">{fmtDate(r.createdAt)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {res.propertyValue != null && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Property Value</p>
                                  <p className="text-xs font-semibold text-[var(--text)]">
                                    {fmtAUD(res.propertyValue as number)}
                                  </p>
                                </div>
                              )}
                              {res.netPosition != null && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Net Position</p>
                                  <p
                                    className="text-xs font-semibold"
                                    style={{ color: (res.netPosition as number) >= 0 ? "#22c55e" : "#ef4444" }}
                                  >
                                    {fmtAUD(res.netPosition as number)}/wk
                                  </p>
                                </div>
                              )}
                              {res.grossYield != null && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Gross Yield</p>
                                  <p className="text-xs font-semibold text-[var(--text)]">
                                    {(res.grossYield as number).toFixed(2)}%
                                  </p>
                                </div>
                              )}
                              {res.equity != null && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Equity</p>
                                  <p className="text-xs font-semibold text-[var(--text)]">
                                    {fmtAUD(res.equity as number)}
                                  </p>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mt-2">By {r.userName}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* SMSF Reports */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5">
                      <DollarSign size={13} style={{ color: amber }} /> SMSF Reports
                    </p>
                    <button
                      onClick={() => onNavigate?.("smsf")}
                      className="text-[11px] text-[var(--text-muted)] hover:text-gray-700 dark:text-gray-300 flex items-center gap-1 transition-colors duration-100"
                    >
                      Open SMSF Calculator <ChevronRight size={11} />
                    </button>
                  </div>
                  {smsfReports.length === 0 ? (
                    <div className={`${CARD} text-center py-6`}>
                      <p className="text-xs text-[var(--text-muted)] mb-2">No SMSF reports saved yet</p>
                      <button
                        onClick={() => onNavigate?.("smsf")}
                        className="text-xs font-medium transition-colors duration-100"
                        style={{ color: amber }}
                      >
                        Run an SMSF analysis →
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {smsfReports.map((r) => {
                        const res = r.result as Record<string, number | string | null>;
                        return (
                          <div key={r.id} className={CARD}>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">SMSF Analysis</p>
                              <p className="text-[10px] text-[var(--text-muted)]">{fmtDate(r.createdAt)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {res.smsfBalance != null && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">SMSF Balance</p>
                                  <p className="text-xs font-semibold text-[var(--text)]">
                                    {fmtAUD(res.smsfBalance as number)}
                                  </p>
                                </div>
                              )}
                              {res.projectedBalance != null && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Projected</p>
                                  <p className="text-xs font-semibold" style={{ color: "#22c55e" }}>
                                    {fmtAUD(res.projectedBalance as number)}
                                  </p>
                                </div>
                              )}
                              {res.deltaFinal != null && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Advantage</p>
                                  <p
                                    className="text-xs font-semibold"
                                    style={{ color: (res.deltaFinal as number) >= 0 ? "#22c55e" : "#ef4444" }}
                                  >
                                    {fmtAUD(res.deltaFinal as number)}
                                  </p>
                                </div>
                              )}
                              {res.years != null && (
                                <div>
                                  <p className="text-[10px] text-[var(--text-muted)]">Years</p>
                                  <p className="text-xs font-semibold text-[var(--text)]">{res.years}</p>
                                </div>
                              )}
                            </div>
                            {res.winner && (
                              <div className="mt-2 flex items-center gap-1">
                                <CheckCircle size={11} className="text-emerald-400" />
                                <p className="text-[10px] text-emerald-400 font-medium">
                                  {String(res.winner)} wins
                                </p>
                              </div>
                            )}
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">By {r.userName}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </div>{/* ── /inner wrapper ── */}

      {/* ── Document Library Modal ────────────────────────────────────────── */}
      {showLibrary && (
        <DocumentLibraryModal
          onClose={() => setShowLibrary(false)}
          onLink={handleLinkDocument}
          clientId={clientIdStr}
        />
      )}

      {/* ── Couple Linker Modal ────────────────────────────────────────────── */}
      {showCoupleModal && (
        <CoupleLinkerModal
          clientId={clientIdStr}
          onClose={() => setShowCoupleModal(false)}
          onLink={linkClientsAsCouple}
          allLeads={leads || []}
        />
      )}
      </div>

      {/* PDF Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-[90vw] h-[90vh] max-w-[1200px] bg-[#141824] rounded-2xl border border-[#2a2a2e] overflow-hidden">
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-[#1a1a1d] border border-[#3a3a3e] flex items-center justify-center hover:scale-105 transition-all"
            >
              ✕
            </button>
            <a
              href={previewUrl ?? ""}
              download
              target="_blank"
              className="absolute top-4 right-14 z-10 px-3 py-1 text-xs rounded bg-[#1a1a1d] border border-[#3a3a3e] hover:scale-105 transition-all"
            >
              Download
            </a>
            <iframe
              src={previewUrl ?? ""}
              className="w-full h-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
