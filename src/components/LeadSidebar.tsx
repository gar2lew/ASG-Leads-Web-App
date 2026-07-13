import React, { useState, useEffect, useRef, lazy, Suspense, useMemo } from "react";
import { Lead, FormTemplate, CustomPinType } from "../types";
import { StatusBadge } from "./ui/StatusBadge";
import { useAppStore } from "../stores/appStore";
import { sanitizePhone } from "../lib/utils";
import { SuburbInput } from "./SuburbInput";
import {
  X,
  Phone,
  Trash2,
  Save,
  Paperclip,
  FileText,
  Image,
  File,
  Download,
  Camera,
  Upload,
  XCircle,
  ClipboardList,
  Loader,
  Edit3,
  Mail,
  MessageSquare,
  CalendarDays,
  CheckCheck,
  StickyNote,
  CalendarClock,
} from "lucide-react";
import { doc, setDoc, deleteDoc, collection, onSnapshot, addDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { uploadFile, formatFileSize, fileTypeIcon } from "../lib/storage";
import { getNextAction, ACTION_COLORS } from "../lib/nextAction";
import { useAIGuidance } from "../hooks/useAIGuidance";
import { AIGuidanceCard } from "./AIGuidanceCard";
import { isOverdue, isDueToday, formatFollowUpDate } from "../lib/followUp";
import { applyAutomation } from "../lib/automation";
import { LEAD_STATUS_OPTIONS } from "../lib/statusConfig";
import {
  useLeadFiles,
  useDeleteLeadFile,
  useFormTemplates,
  useLeadNotes,
  useAddLeadNote,
  useDeleteLeadNote,
  useLeadAppointments,
} from "../hooks/useFirebase";

const FormFillerModal = lazy(() => import("./FormFillerModal").then((m) => ({ default: m.FormFillerModal })));

// Built-in knock result colour map (mirrors Map.tsx KNOCK_COLORS)
const KNOCK_COLORS: Record<string, string> = {
  "not-interested": "#ef4444",
  "no-answer": "#f97316",
  skipped: "#6b7280",
  "dq-complete": "#22c55e",
  "parents-not-home": "#3b82f6",
};
const KNOCK_LABELS: Record<string, string> = {
  "not-interested": "Not Interested",
  "no-answer": "No Answer",
  skipped: "Skipped",
  "dq-complete": "DQ Complete",
  "parents-not-home": "Parents Not Home",
};

interface LeadSidebarProps {
  lead: Lead;
  onClose: () => void;
  onSave: (lead: Lead) => boolean | Promise<boolean | void> | void;
  onDelete: (lead: Lead) => void;
  onCall: (lead: Lead) => void;
  /** When passed (from Map page), shows a Knock Pin Type selector in the form */
  customPinTypes?: CustomPinType[];
  /** 'modal' (default) = fixed overlay with backdrop; 'panel' = inline, fills parent */
  mode?: "modal" | "panel";
  onAIScriptUsed?: (leadId: string | number, action: string) => void;
  /** When set, scrolls the AI guidance card into view on mount */
  initialAIIntent?: string;
}

const SUPER_OPTIONS = ["$0-75k", "$75k to 150k", "$150k+", "Other"];
const STATUS_OPTIONS = LEAD_STATUS_OPTIONS;

function buildAddress(lead: Lead): string {
  return [lead.houseNum, lead.street, lead.suburb, lead.postcode].filter(Boolean).join(" ");
}

function parseAddress(raw: string): { houseNum?: string; street?: string; suburb?: string; postcode?: string } {
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  const hasHouseNum = parts.length > 1 && /^\d+[A-Za-z]?$/.test(parts[0]);
  const houseNum = hasHouseNum ? parts[0] : undefined;
  const body = hasHouseNum ? parts.slice(1) : parts;
  if (body.length === 0) return { houseNum };
  const last = body[body.length - 1];
  if (/^\d{4}$/.test(last)) {
    const withoutPost = body.slice(0, -1);
    const suburb = withoutPost.length > 0 ? withoutPost[withoutPost.length - 1] : undefined;
    const street = withoutPost.slice(0, -1).join(" ") || undefined;
    return { houseNum, street, suburb, postcode: last };
  }
  if (body.length > 1) {
    const suburb = body[body.length - 1];
    const street = body.slice(0, -1).join(" ") || undefined;
    return { houseNum, street, suburb };
  }
  return { houseNum, street: body.join(" ") };
}

export function LeadSidebar({
  lead,
  onClose,
  onSave,
  onDelete,
  onCall,
  customPinTypes,
  mode = "modal",
  onAIScriptUsed,
  initialAIIntent,
}: LeadSidebarProps) {
  const { reps, currentUser } = useAppStore();
  const [form, setForm] = useState<Lead>(lead);
  const [addressStr, setAddressStr] = useState<string>(buildAddress(lead));
  const [optimisticCallbackDate, setOptimisticCallbackDate] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [otherViewers, setOtherViewers] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  // Modal animation — stable (no RAF flicker)
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => { setIsOpen(true); }, []);

  // Camera staging
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([]);
  const [stagedPreviews, setStagedPreviews] = useState<string[]>([]);

  // Clean up blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      stagedPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [stagedPreviews]);

  // Form filler
  const [formPickerOpen, setFormPickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);

  // Files & Documents panel (opens as a modal so it doesn't crush the lead details)
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [guidanceDismissed, setGuidanceDismissed] = useState(false);

  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const guidanceCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialAIIntent || !guidanceCardRef.current) return;
    guidanceCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const { files: leadFiles } = useLeadFiles(String(lead.id));
  const { remove: deleteLeadFile } = useDeleteLeadFile();
  const { templates } = useFormTemplates();

  // Notes subcollection
  const { notes: leadNotes, loading: notesLoading } = useLeadNotes(String(lead.id));
  const { add: addLeadNote } = useAddLeadNote();
  const { remove: deleteLeadNote } = useDeleteLeadNote();
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const isUsingAIScriptRef = useRef(false);

  // Linked appointments
  const { appointments: linkedAppointments } = useLeadAppointments(lead.id);

  // Reset when lead changes
  useEffect(() => {
    setForm(lead);
    setAddressStr(buildAddress(lead));
    setDirty(false);
    setSaveState("idle");
    setSaveMessage(null);
    setConfirmDelete(false);
    setGuidanceDismissed(false);
  }, [lead.id]);

  // Presence
  useEffect(() => {
    if (!currentUser) return;
    const presenceRef = doc(db, "leads", String(lead.id), "presence", String(currentUser.id));
    void setDoc(presenceRef, { name: currentUser.name, ts: Date.now() }).catch((err) => {
      console.error("[LeadSidebar] Presence setDoc error:", err);
    });
    const unsub = onSnapshot(
      collection(db, "leads", String(lead.id), "presence"),
      (snap) => {
        try {
          const others = snap.docs
            .filter((d) => d.id !== String(currentUser.id))
            .map((d) => d.data().name as string);
          setOtherViewers(others);
        } catch (err) {
          console.error("[LeadSidebar] Presence snapshot parse error:", err);
        }
      },
      (err) => {
        console.error("[LeadSidebar] Presence snapshot error:", err);
      },
    );
    return () => {
      unsub();
      void deleteDoc(presenceRef).catch((err) => {
        console.error("[LeadSidebar] Presence cleanup deleteDoc error:", err);
      });
    };
  }, [lead.id, currentUser]);

  // Auto-save debounce — after 1.5s of no changes, save silently
  const persistDraft = async (draft: Lead, source: "auto" | "manual" | "close" = "manual"): Promise<boolean> => {
    if (!draft.name?.trim()) {
      setDirty(true);
      setSaveState("error");
      setSaveMessage("Name is required before this lead can be saved.");
      return false;
    }

    setSaveState("saving");
    setSaveMessage(source === "close" ? "Saving before close..." : null);
    try {
      const result = await onSave(draft);
      if (result === false) {
        setDirty(true);
        setSaveState("error");
        setSaveMessage("Save failed. Check your connection, then retry.");
        return false;
      }
      setDirty(false);
      setSaveState("saved");
      setSaveMessage(source === "auto" ? "Saved automatically" : "Saved");
      setOptimisticCallbackDate(null);
      window.setTimeout(() => {
        setSaveState((current) => (current === "saved" ? "idle" : current));
        setSaveMessage((current) => (current === "Saved" || current === "Saved automatically" ? null : current));
      }, 1800);
      return true;
    } catch {
      setDirty(true);
      setSaveState("error");
      setSaveMessage("Save failed. Check your connection, then retry.");
      return false;
    }
  };

  useEffect(() => {
    if (!dirty) return;
    setSaveState("dirty");
    setSaveMessage(null);
    const t = setTimeout(() => {
      void persistDraft(form, "auto");
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dirty]);

  // Automation — runs when lead loads or its call/note activity changes.
  // Writes back to Firestore only if there are actual updates (non-empty result).
  useEffect(() => {
    if (!lead.name?.trim()) return;
    const updates = applyAutomation(lead);
    if (Object.keys(updates).length === 0) return;
    const updated: Lead = { ...lead, ...updates };
    setForm(updated);
    void persistDraft(updated, "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, lead.callHistory?.length ?? 0, leadNotes.length]);

  const dismissDeleteConfirmation = () => {
    setConfirmDelete(false);
  };

  const update = (field: keyof Lead, value: unknown) => {
    dismissDeleteConfirmation();
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const updateAddress = (raw: string) => {
    dismissDeleteConfirmation();
    setAddressStr(raw);
    const parsed = parseAddress(raw);
    setForm((prev) => ({
      ...prev,
      houseNum: parsed.houseNum,
      street: parsed.street,
      suburb: parsed.suburb ?? prev.suburb,
      postcode: parsed.postcode,
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    await persistDraft(form, "manual");
  };

  const handleClose = async () => {
    if (dirty) {
      const saved = await persistDraft(form, "close");
      if (!saved) return;
    }
    onClose();
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(lead);
  };

  const handleFileUpload = async (file: File, type: "document" | "photo" | "file") => {
    if (!currentUser) return;
    setUploading(true);
    try {
      const path = `leadFiles/${lead.id}/${Date.now()}_${file.name}`;
      const url = await uploadFile(path, file);
      await addDoc(collection(db, "leads", String(lead.id), "files"), {
        name: file.name,
        storagePath: path,
        downloadUrl: url,
        fileType: file.type,
        fileSize: file.size,
        type,
        uploadedBy: currentUser.name,
        uploadedAt: Date.now(),
      });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setStagedPhotos((prev) => [...prev, file]);
    setStagedPreviews((prev) => [...prev, previewUrl]);
    e.target.value = "";
  };

  const handleRemoveStaged = (index: number) => {
    URL.revokeObjectURL(stagedPreviews[index]);
    setStagedPhotos((prev) => prev.filter((_, i) => i !== index));
    setStagedPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDiscardAllStaged = () => {
    stagedPreviews.forEach((url) => URL.revokeObjectURL(url));
    setStagedPhotos([]);
    setStagedPreviews([]);
  };

  const handleUploadStaged = async () => {
    if (!currentUser || stagedPhotos.length === 0) return;
    setUploading(true);
    try {
      for (const file of stagedPhotos) {
        const path = `leadFiles/${lead.id}/${Date.now()}_${file.name}`;
        const url = await uploadFile(path, file);
        await addDoc(collection(db, "leads", String(lead.id), "files"), {
          name: file.name,
          storagePath: path,
          downloadUrl: url,
          fileType: file.type,
          fileSize: file.size,
          type: "photo",
          uploadedBy: currentUser.name,
          uploadedAt: Date.now(),
        });
      }
    } catch (err) {
      console.error("Camera upload failed:", err);
    } finally {
      stagedPreviews.forEach((url) => URL.revokeObjectURL(url));
      setStagedPhotos([]);
      setStagedPreviews([]);
      setUploading(false);
    }
  };

  const handleFillForm = () => {
    if (templates.length === 0) return;
    if (templates.length === 1) {
      setSelectedTemplate(templates[0]);
      return;
    }
    setFormPickerOpen(true);
  };

  /** One-click "I just spoke to this lead" — sets status to Booked and logs a minimal call entry */
  const handleMarkContacted = () => {
    if (!currentUser) return;
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toTimeString().slice(0, 5);
    const updatedLead: Lead = {
      ...form,
      status: "Booked",
      lastCall: `${dateStr}T${timeStr}`,
      callHistory: [
        ...(form.callHistory ?? []),
        {
          date: dateStr,
          time: timeStr,
          rep: currentUser.name,
          repId: currentUser.id,
          result: "live",
          notes: "Marked as contacted",
        },
      ],
    };
    setForm(updatedLead);
    void persistDraft(updatedLead, "manual");
  };

  /** Submits a new note to the leads/{id}/notes subcollection */
  const handleAddNote = async () => {
    if (!noteText.trim() || !currentUser) return;
    const usedAIScript = isUsingAIScriptRef.current;
    isUsingAIScriptRef.current = false;
    const noteContent = noteText.trim();
    setAddingNote(true);
    try {
      await addLeadNote(String(lead.id), {
        text: noteContent,
        createdAt: Date.now(),
        createdBy: currentUser.name,
        createdById: currentUser.id,
      });
      void addDoc(collection(db, "auditLogs"), {
        type: "note_create",
        entityId: lead.id,
        previousValue: "",
        newValue: noteContent.slice(0, 200),
        userId: String(currentUser.id),
        timestamp: Date.now(),
        source: usedAIScript ? "ai" : "manual",
        ...(usedAIScript && guidance?.action ? { contextAction: guidance.action } : {}),
      }).catch((err) => console.warn("[audit]", err));
      setNoteText("");
      noteInputRef.current?.focus();
    } catch (err) {
      console.error("[LeadSidebar] Add note failed:", err);
    } finally {
      setAddingNote(false);
    }
  };

  const activeReps = reps.filter((r) => r.active !== false);
  const formerReps = reps.filter((r) => r.active === false);
  const dqRepName = reps.find((r) => r.id === lead.dqRep)?.name || "—";
  const lastCall =
    lead.callHistory && lead.callHistory.length > 0 ? lead.callHistory[lead.callHistory.length - 1] : null;
  const lastContactRep = lastCall?.rep || "—";
  const lastCallDate = lead.lastCall
    ? new Date(lead.lastCall).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })
    : "Never";
  const callCount = lead.callHistory?.length || 0;

  // ── Next Action Engine ────────────────────────────────────────────────────
  const nextAction = useMemo(
    () => getNextAction(lead, linkedAppointments),
    [lead.id, lead.status, lead.lastCall, lead.callHistory, linkedAppointments],
  );

  // ── AI Guidance ───────────────────────────────────────────────────────────
  const recentNotes = useMemo(
    () => leadNotes.slice(-5).map((n) => n.text),
    [leadNotes],
  );
  const guidance = useAIGuidance(lead, nextAction, recentNotes, currentUser ? String(currentUser.id) : undefined);

  const handleUseScript = (script: string) => {
    isUsingAIScriptRef.current = true;
    if (guidance?.action) {
      onAIScriptUsed?.(lead.id, guidance.action);
    }
    setNoteText(script);
    setTimeout(() => {
      noteInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      noteInputRef.current?.focus();
    }, 50);
  };

  // NextActionType uses "booked"; AIGuidanceCard uses "book" — normalize here once
  const guidanceActionType: "call" | "followup" | "book" | null =
    nextAction.type === "call"
      ? "call"
      : nextAction.type === "followup"
        ? "followup"
        : nextAction.type === "booked"
          ? "book"
          : null;

  const isPanel = mode === "panel";

  return (
    <>
      {/* ── Backdrop — modal mode only ────────────────────────────────── */}
      {!isPanel && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[4px] z-[99]" onClick={handleClose} />
      )}

      {/* ── Outer container ───────────────────────────────────────────── */}
      <div
        className={
          isPanel
            ? "flex flex-col h-full w-full bg-[#141824] text-white"
            : "fixed inset-0 z-[100] flex items-stretch justify-center p-0 sm:items-center sm:px-6 sm:py-6"
        }
      >
        <div
          className={
            isPanel
              ? "flex flex-col h-full w-full"
              : `relative w-full max-w-[1100px] h-[100dvh] sm:h-[80vh] rounded-none sm:rounded-2xl border border-[#2a2a2e] shadow-2xl overflow-hidden flex flex-col bg-[#141824] text-white overscroll-contain will-change-transform transition-all duration-200 ease-out${isOpen ? " opacity-100 translate-y-0" : " opacity-0 translate-y-2"}`
          }
        >
        {/* ── X close button — modal mode only ─────────────────────────── */}
        {!isPanel && (
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 z-10 min-h-11 min-w-11 p-2 rounded-lg bg-[#2a2a2e] hover:bg-[#3a3a3e] border border-[#3a3a3e] text-gray-400 hover:text-white transition-all duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:top-4 sm:right-4"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        )}
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 border-b border-gray-200 px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-4 dark:border-white/[0.06] flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 pr-11 sm:pr-0">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-tight truncate">
                  {lead.name}
                </h2>
                {saveState === "dirty" && <StatusBadge variant="draft" className="flex-shrink-0" />}
                {saveState === "saving" && <StatusBadge variant="loading" className="flex-shrink-0" />}
                {saveState === "saved" && <StatusBadge variant="saved" className="flex-shrink-0" />}
                {saveState === "error" && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 flex-shrink-0">
                    Save failed
                  </span>
                )}
              </div>
              {saveMessage && (
                <p
                  className={`text-xs mt-1 ${
                    saveState === "error" ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"
                  }`}
                  role={saveState === "error" ? "alert" : "status"}
                >
                  {saveMessage}
                </p>
              )}
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                {dqRepName} · {lead.status}
                {lead.dnqFellOver && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 flex-shrink-0">
                    ❌ Fell Over
                  </span>
                )}
              </p>
              {nextAction.type !== "none" && nextAction.type !== "settled" && nextAction.type !== "lost" && (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-300">
                  <CalendarClock size={13} className="flex-shrink-0" />
                  Next step: {nextAction.label}
                </p>
              )}
              <a
                href={`tel:${lead.phone.replace(/\s/g, "")}`}
                className="mt-1 flex min-h-8 w-fit items-center gap-1 rounded-md text-xs text-amber-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <Phone size={12} /> {lead.phone}
              </a>
              {otherViewers.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                  ⚠️ {otherViewers.join(", ")} {otherViewers.length === 1 ? "is" : "are"} also viewing
                </p>
              )}
            </div>
            <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:w-auto sm:overflow-visible sm:pb-0 sm:ml-3 sm:flex-shrink-0">
              <button
                type="button"
                onClick={() => onCall(lead)}
                aria-label={`Log call for ${lead.name}`}
                className="flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 flex-shrink-0"
              >
                <Phone size={14} />
                <span className="hidden sm:inline">
                  {nextAction.type === "call" || nextAction.type === "followup" || nextAction.type === "callback"
                    ? "Call Now"
                    : "Log Call"}
                </span>
                <span className="sm:hidden">Call</span>
              </button>

              {/* Quick "Mark as Contacted" — available when lead hasn't been contacted yet or is DQ/No Answer */}
              {form.status === "DQ" && (
                <button
                  onClick={handleMarkContacted}
                  title="Mark as Contacted — sets status to Booked and logs a quick contact entry"
                  className="flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 flex-shrink-0"
                >
                  <CheckCheck size={14} />
                  <span className="hidden sm:inline">Contacted</span>
                </button>
              )}

              {/* Quick Add Note shortcut — scrolls note input into view */}
              <button
                onClick={() => {
                  noteInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  noteInputRef.current?.focus();
                }}
                title="Add a note"
                className="flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)] text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 flex-shrink-0"
              >
                <StickyNote size={14} />
                <span className="hidden sm:inline">Note</span>
              </button>

              <button
                onClick={handleDelete}
                className={`flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition flex-shrink-0 ${
                  confirmDelete
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400`}
              >
                <Trash2 size={14} />
                {confirmDelete ? "Confirm?" : <span className="hidden sm:inline">Delete</span>}
              </button>
              <button
                onClick={handleClose}
                className="min-h-11 min-w-11 p-2 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded-lg transition text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 flex-shrink-0"
                aria-label="Close lead details"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ── Body: single scrollable column ─────────────────────────────── */}
          <div className="flex-1 overflow-hidden min-h-0">
            {/* Lead detail form */}
            <div className="h-full overflow-y-auto overscroll-contain px-3 sm:px-5 py-3 sm:py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {/* ── Next Action Banner ──────────────────────────────────────── */}
              {nextAction.type !== "none" && nextAction.type !== "settled" && nextAction.type !== "lost" && (
                <div
                  className={`mb-3 rounded-xl border text-xs ${ACTION_COLORS[nextAction.priority]?.bg ?? ""} ${
                    nextAction.priority === "high"
                      ? "border-red-200 dark:border-red-800"
                      : nextAction.priority === "medium"
                        ? "border-amber-200 dark:border-amber-800"
                        : "border-green-200 dark:border-green-800"
                  }`}
                >
                  {/* Top row: icon + text */}
                  <div className="flex items-start gap-2.5 p-3 pb-0">
                    <span className="text-base leading-none mt-0.5 flex-shrink-0">
                      {nextAction.type === "call"
                        ? "📞"
                        : nextAction.type === "followup"
                          ? "⏰"
                          : nextAction.type === "callback"
                            ? "📅"
                            : nextAction.type === "confirm"
                              ? "✅"
                              : nextAction.type === "booked"
                                ? "📋"
                                : "🔄"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`font-bold tracking-wide text-xs mb-0.5 ${
                          nextAction.priority === "high"
                            ? "text-red-700 dark:text-red-300"
                            : nextAction.priority === "medium"
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-green-700 dark:text-green-300"
                        }`}
                      >
                        {nextAction.label}
                      </div>
                      <div className={`text-[10px] ${ACTION_COLORS[nextAction.priority]?.text ?? "text-gray-400"}`}>
                        {nextAction.reason}
                      </div>
                    </div>
                  </div>
                  {/* Bottom row: action buttons */}
                  <div className="flex gap-2 p-3 pt-2">
                    <button
                      onClick={() => onCall(lead)}
                      className={`min-h-11 flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold transition active:scale-[0.98] shadow-sm ${
                        nextAction.priority === "high"
                          ? "bg-red-500 text-white hover:bg-red-400"
                          : nextAction.priority === "medium"
                            ? "bg-amber-500 text-white hover:bg-amber-400"
                            : "bg-green-500 text-white hover:bg-green-400"
                      }`}
                    >
                      <Phone size={13} />
                      {nextAction.type === "call" || nextAction.type === "followup"
                        ? "Call Now"
                        : nextAction.type === "booked"
                          ? "View Client"
                          : "Log Call"}
                    </button>
                    <button
                      onClick={() => {
                        const noteEl = document.getElementById("lead-note-text");
                        noteEl?.focus();
                        noteEl?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      className="min-h-11 flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 text-xs font-medium hover:bg-gray-200 dark:hover:bg-white/10 transition active:scale-[0.98]"
                    >
                      <Edit3 size={13} /> Log Note
                    </button>
                  </div>
                </div>
              )}

              {/* ── AI Guidance Card ────────────────────────────────────────── */}
              {guidance && !guidanceDismissed && (
                <div
                  ref={guidanceCardRef}
                  className={`mb-3 rounded-xl transition-shadow duration-500 ${initialAIIntent ? "ring-2 ring-amber-500/40" : ""}`}
                >
                  <AIGuidanceCard
                    suggestion={guidance.action}
                    actionType={guidanceActionType}
                    script={guidance.script}
                    objection={guidance.objection?.type}
                    coaching={guidance.coaching}
                    confidenceHint={guidance.confidenceHint}
                    onDismiss={() => setGuidanceDismissed(true)}
                    onUseScript={handleUseScript}
                  />
                </div>
              )}

              {/* ── Follow-Up Section ──────────────────────────────────────── */}
              <div className="mb-3 p-3 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-[var(--surface)]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <CalendarClock size={12} />
                    Next Contact Date
                  </div>
                  {form.nextContactDate && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                        isOverdue(form.nextContactDate)
                          ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                          : isDueToday(form.nextContactDate)
                            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
                            : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {isOverdue(form.nextContactDate)
                        ? "Overdue"
                        : isDueToday(form.nextContactDate)
                          ? "Due Today"
                          : formatFollowUpDate(form.nextContactDate)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="min-h-11 flex-1 px-3 py-2 text-base sm:text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                    value={form.nextContactDate || ""}
                    onChange={(e) => {
                      dismissDeleteConfirmation();
                      const val = e.target.value || undefined;
                      const updated: Lead = { ...form, nextContactDate: val };
                      setForm(updated);
                      // Save immediately — don't queue through the debounce
                      void persistDraft(updated, "manual");
                    }}
                  />
                  {form.nextContactDate && (
                    <button
                      type="button"
                    onClick={() => {
                        dismissDeleteConfirmation();
                        const updated: Lead = { ...form, nextContactDate: undefined };
                        setForm(updated);
                        void persistDraft(updated, "manual");
                      }}
                      className="min-h-11 min-w-11 flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                      title="Clear follow-up date"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                {/* Date + Status */}
                <Field label="Date">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.leadDate || ""}
                    onChange={(e) => update("leadDate", e.target.value)}
                  />
                </Field>
                <Field label="Lead Status">
                  <select
                    className={inputCls}
                    value={form.status}
                    onChange={(e) => update("status", e.target.value as Lead["status"])}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>

                {/* Name + Phone */}
                <Field label="Lead Name *">
                  <input
                    className={inputCls}
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="Full name"
                  />
                </Field>
                <Field label="Contact Number">
                  <input
                    className={inputCls}
                    value={form.phone}
                    onChange={(e) => update("phone", sanitizePhone(e.target.value))}
                    placeholder="04xx xxx xxx"
                  />
                </Field>

                {/* Email + Owner/Renter */}
                <Field
                  label={
                    <span className="flex items-center gap-1.5">
                      Email
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-amber-500 hover:text-amber-400 transition"
                          title={`Email ${lead.email}`}
                        >
                          <Mail size={10} />
                        </a>
                      )}
                    </span>
                  }
                >
                  <input
                    className={inputCls}
                    value={form.email || ""}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="optional"
                  />
                </Field>
                <Field label="Renter / Owner">
                  <select
                    className={inputCls}
                    value={form.ownership || ""}
                    onChange={(e) => update("ownership", e.target.value)}
                  >
                    <option value="">—</option>
                    <option>Renter</option>
                    <option>Owner</option>
                  </select>
                </Field>

                {/* Address — full width */}
                <div className="col-span-1 sm:col-span-2">
                  <Field label="Address">
                    <input
                      className={inputCls}
                      value={addressStr}
                      onChange={(e) => updateAddress(e.target.value)}
                      placeholder="15 Smith St Bentleigh 3204"
                    />
                  </Field>
                </div>

                {/* Suburb (with WA autocomplete) — full width */}
                <div className="col-span-1 sm:col-span-2">
                  <Field label="Suburb">
                    <SuburbInput
                      value={form.suburb ?? ""}
                      onChange={(v) => {
                        dismissDeleteConfirmation();
                        setForm((f) => ({ ...f, suburb: v }));
                        setDirty(true);
                      }}
                      className={inputCls}
                      placeholder="Suburb"
                    />
                  </Field>
                </div>

                {/* Super + DQ Rep */}
                <Field label="Superannuation">
                  <select
                    className={inputCls}
                    value={form.superannuation || ""}
                    onChange={(e) => update("superannuation", e.target.value)}
                  >
                    <option value="">—</option>
                    {SUPER_OPTIONS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </Field>
                <Field label="DQ Rep">
                  <select
                    className={inputCls}
                    value={form.dqRep || ""}
                    onChange={(e) => update("dqRep", Number(e.target.value))}
                  >
                    <option value="">— Select —</option>
                    {activeReps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                    {formerReps.length > 0 && (
                      <optgroup label="── Former Staff ──">
                        {formerReps.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </Field>

                {/* ── Booked Details — only shown when status is Booked ───── */}
                {form.status === "Booked" && (
                  <div className="col-span-1 sm:col-span-2 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 space-y-3">
                    <div className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                      📋 Booked Details
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {/* DQ Rep — read-only */}
                      <Field label="DQ Rep">
                        <div className="px-3 py-2 text-sm rounded-lg bg-white/70 dark:bg-[var(--surface)]/70 border border-green-200 dark:border-green-700 text-gray-700 dark:text-gray-300 font-medium">
                          {dqRepName}
                        </div>
                      </Field>

                      {/* FC Rep */}
                      <Field label="FC Rep">
                        <select
                          className={`${inputCls} border-green-200 dark:border-green-700`}
                          value={form.fcRep || ""}
                          onChange={(e) => update("fcRep", e.target.value ? Number(e.target.value) : undefined)}
                        >
                          <option value="">— Select FC —</option>
                          {activeReps.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                          {formerReps.length > 0 && (
                            <optgroup label="── Former Staff ──">
                              {formerReps.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </Field>

                      {/* FR Rep */}
                      <Field label="FR Rep">
                        <select
                          className={`${inputCls} border-green-200 dark:border-green-700`}
                          value={form.frRep || ""}
                          onChange={(e) => update("frRep", e.target.value ? Number(e.target.value) : undefined)}
                        >
                          <option value="">— Select FR —</option>
                          {activeReps.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                          {formerReps.length > 0 && (
                            <optgroup label="── Former Staff ──">
                              {formerReps.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </Field>

                      {/* PS Rep — full width */}
                      <div className="col-span-1 sm:col-span-2">
                        <Field label="PS Rep (Post-Settlement)">
                          <select
                            className={`${inputCls} border-green-200 dark:border-green-700`}
                            value={form.psRep || ""}
                            onChange={(e) => update("psRep", e.target.value ? Number(e.target.value) : undefined)}
                          >
                            <option value="">— Select PS Rep —</option>
                            {activeReps.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                            {formerReps.length > 0 && (
                              <optgroup label="── Former Staff ──">
                                {formerReps.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </Field>
                      </div>
                    </div>

                    {/* DNQ / Fell Over toggle */}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !form.dnqFellOver;
                          update("dnqFellOver", next);
                          if (!next) update("dnqNotes", "");
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          form.dnqFellOver ? "bg-red-500" : "bg-gray-300 dark:bg-[var(--surface)]"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            form.dnqFellOver ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                      <span
                        className={`text-sm font-semibold ${form.dnqFellOver ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}
                      >
                        {form.dnqFellOver ? "❌ DNQ / Fell Over" : "DNQ / Fell Over?"}
                      </span>
                    </div>

                    {/* DNQ Notes — only when toggled on */}
                    {form.dnqFellOver && (
                      <div>
                        <label className="block text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                          Reason / Notes *
                        </label>
                        <textarea
                          className="w-full min-h-11 px-3 py-2 text-base sm:text-sm rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
                          rows={3}
                          placeholder="Why did this fall over? e.g. Client changed mind, couldn't verify super, no show…"
                          value={form.dnqNotes || ""}
                          onChange={(e) => update("dnqNotes", e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Callback — conditional, full width */}
                {(form.status === "Revisit" || form.callbackDate) && (
                  <div className="col-span-1 grid grid-cols-1 gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700 sm:col-span-2 sm:grid-cols-2">
                    <Field label="Callback Date">
                      <input
                        type="date"
                        className={inputCls}
                        value={optimisticCallbackDate ?? form.callbackDate ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setOptimisticCallbackDate(value);
                          update("callbackDate", value);
                        }}
                      />
                    </Field>
                    <Field label="Callback Time">
                      <input
                        type="time"
                        className={inputCls}
                        value={form.callbackTime || ""}
                        onChange={(e) => update("callbackTime", e.target.value)}
                      />
                    </Field>
                  </div>
                )}

                {/* Knock Pin Type — only shown when opened from Map page */}
                {customPinTypes !== undefined && (
                  <div className="col-span-1 sm:col-span-2">
                    <Field label="Knock Pin Type">
                      <div className="flex flex-wrap gap-1.5 mt-0.5">
                        <button
                          type="button"
                          onClick={() => update("knockResult", "")}
                          className={`min-h-10 px-3 py-2 rounded-full text-xs font-medium border transition ${
                            !form.knockResult
                              ? "bg-gray-700 text-white border-gray-700 dark:bg-gray-500 dark:border-gray-500"
                              : "border-gray-300 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                          }`}
                        >
                          None
                        </button>
                        {[
                          ...Object.entries(KNOCK_LABELS).map(([id, name]) => ({ id, name, color: KNOCK_COLORS[id] })),
                          ...customPinTypes.map((c) => ({ id: c.id, name: c.name, color: c.color })),
                        ].map(({ id, name, color }) => {
                          const active = form.knockResult === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => update("knockResult", id)}
                              className="min-h-10 px-3 py-2 rounded-full text-xs font-medium border transition"
                              style={
                                active
                                  ? { backgroundColor: color, borderColor: color, color: "#fff" }
                                  : { borderColor: color, color: color }
                              }
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  </div>
                )}

                {/* Last Contact Rep + Last Call */}
                <Field label="Last Contact Rep">
                  <div className={readOnlyCls}>{lastContactRep}</div>
                </Field>
                <Field label="Last Call">
                  <div className={readOnlyCls}>{lastCallDate}</div>
                </Field>

                {/* Notes — editable lead-level notes */}
                <div className="col-span-1 sm:col-span-2">
                  <Field label="Notes">
                    <textarea
                      id="lead-note-text"
                      className="w-full min-h-[5.5rem] px-3 py-2 text-base sm:text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
                      rows={3}
                      placeholder="Add notes about this lead…"
                      value={form.notes || ""}
                      onChange={(e) => {
                        dismissDeleteConfirmation();
                        setForm((f) => ({ ...f, notes: e.target.value }));
                        setDirty(true);
                      }}
                    />
                  </Field>
                </div>
              </div>

              {/* Autosave footer: changes persist automatically; Save now flushes the debounce. */}
              {dirty && (
                <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {saveState === "error" ? "Autosave failed. Retry when ready." : "Autosaving changes..."}
                  </p>
                  <button
                    onClick={handleSave}
                    disabled={saveState === "saving"}
                    className="min-h-11 w-full px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-60 transition flex items-center justify-center gap-2 sm:w-auto"
                  >
                    <Save size={14} /> {saveState === "error" ? "Retry save" : "Save now"}
                  </button>
                </div>
              )}

              {/* Files & Forms button — compact single-line button */}
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/[0.06] flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilesPanel(true)}
                  className="min-h-11 flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
                >
                  <Paperclip size={14} />
                  Files &amp; Forms
                  {leadFiles.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                      {leadFiles.length}
                    </span>
                  )}
                  {uploading && <span className="text-amber-500 text-xs font-normal">Uploading…</span>}
                </button>
              </div>

              {/* ── Note History ─────────────────────────────────────────── */}
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/[0.06]">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <StickyNote size={12} />
                  Note History
                  {leadNotes.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                      {leadNotes.length}
                    </span>
                  )}
                </div>

                {/* Composer */}
                <div className="flex flex-col gap-2 mb-3 sm:flex-row">
                  <textarea
                    ref={noteInputRef}
                    className="min-h-[4.75rem] flex-1 px-3 py-2 text-base sm:text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
                    rows={2}
                    placeholder="Add a note… (Ctrl+Enter to save)"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void handleAddNote();
                      }
                    }}
                  />
                  <button
                    onClick={() => void handleAddNote()}
                    disabled={!noteText.trim() || addingNote || !currentUser}
                    className="min-h-11 w-full justify-center px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition disabled:opacity-40 flex items-center gap-1 flex-shrink-0 sm:w-auto sm:self-end"
                  >
                    {addingNote ? <Loader size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                    Add
                  </button>
                </div>

                {/* Note list */}
                {notesLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 py-2">
                    <Loader size={12} className="animate-spin" /> Loading notes…
                  </div>
                ) : leadNotes.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                    No notes yet — type above to add the first one.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {leadNotes.map((note) => (
                      <div
                        key={note.id}
                        className="group flex gap-2 p-2.5 bg-amber-50/60 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-900/30"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
                            {note.text}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {note.createdBy} · {timeAgoMs(note.createdAt)}
                          </p>
                        </div>
                        {(currentUser?.role === "admin" || currentUser?.id === note.createdById) && (
                          <button
                            onClick={() => void deleteLeadNote(String(lead.id), note.id)}
                            className="min-h-10 min-w-10 opacity-100 p-2 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition flex-shrink-0 self-start mt-0.5 sm:opacity-0 sm:group-hover:opacity-100"
                            title="Delete note"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Call History — kept in main column ───────────────────── */}
              {callCount > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/[0.06]">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Phone size={12} /> Call History ({callCount})
                  </div>
                  <div className="space-y-0">
                    {[...(lead.callHistory || [])].reverse().map((call, i, arr) => (
                      <div key={i} className="flex gap-3 relative">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div
                            className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${
                              call.result === "booked"
                                ? "bg-purple-500"
                                : call.result === "not-interested"
                                  ? "bg-red-500"
                                  : call.result === "callback" || call.result === "callback-today"
                                    ? "bg-orange-500"
                                    : call.result === "no-answer"
                                      ? "bg-gray-400"
                                      : "bg-amber-400"
                            }`}
                          />
                          {i < arr.length - 1 && (
                            <div className="w-0.5 bg-gray-200 dark:bg-[var(--hover)] flex-1 mt-1 mb-1 min-h-[12px]" />
                          )}
                        </div>
                        <div className="pb-3 flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 capitalize">
                              {call.result?.replace(/-/g, " ")}
                            </span>
                            <span className="text-xs text-gray-400 flex-shrink-0">{call.rep}</span>
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                            {(() => {
                              // Support both new format (date=YYYY-MM-DD, time=HH:MM) and old (ISO strings)
                              const isNewFmt =
                                /^\d{4}-\d{2}-\d{2}$/.test(call.date ?? "") && /^\d{2}:\d{2}$/.test(call.time ?? "");
                              const dt = isNewFmt
                                ? new Date(`${call.date}T${call.time}`)
                                : new Date(call.time || call.date || "");
                              return isNaN(dt.getTime())
                                ? (call.date ?? "")
                                : dt.toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
                            })()}
                          </div>
                          {call.notes && (
                            <p className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-[var(--surface)] rounded-lg px-2 py-1.5 leading-relaxed">
                              {call.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* ── Linked Appointments ──────────────────────────────────── */}
              {linkedAppointments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/[0.06]">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <CalendarDays size={12} />
                    Linked Appointments ({linkedAppointments.length})
                  </div>
                  <div className="space-y-2">
                    {linkedAppointments.map((appt) => {
                      const dateFormatted = new Date(appt.date + "T00:00").toLocaleDateString("en-AU", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      });
                      const apptRep = reps.find((r) => r.id === appt.repId);
                      // Derive a readable status label
                      const statusLabel = appt.status.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                      // Colour-code by status group
                      const statusStyle =
                        appt.status === "completed" || appt.status === "fc-complete-fr-booked"
                          ? { backgroundColor: "#22c55e22", color: "#22c55e" }
                          : appt.status === "no-show" || appt.status === "cancelled"
                            ? { backgroundColor: "#ef444422", color: "#ef4444" }
                            : appt.status === "confirmed" || appt.status === "arrived" || appt.status === "started"
                              ? { backgroundColor: "#6366f122", color: "#6366f1" }
                              : { backgroundColor: "#f9731622", color: "#f97316" };
                      return (
                        <div
                          key={appt.id}
                          className="p-2.5 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-lg border border-indigo-100 dark:border-indigo-900/30"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                                {appt.title}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {dateFormatted} · {appt.startTime}
                                {apptRep ? ` · ${apptRep.name}` : ""}
                              </p>
                            </div>
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap"
                              style={statusStyle}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          {appt.notes && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                              {appt.notes}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Files & Forms modal — opened by the button above ──────────────────── */}
      {showFilesPanel && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60]" onClick={() => setShowFilesPanel(false)} />
          <div className="fixed inset-0 z-[61] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white dark:bg-[var(--surface)] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col max-h-[calc(100dvh-env(safe-area-inset-top))] sm:max-h-[90vh] overscroll-contain">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Paperclip size={15} className="text-amber-500" />
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    Files &amp; Forms — {lead.name}
                  </h3>
                  {leadFiles.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                      {leadFiles.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowFilesPanel(false)}
                  className="min-h-11 min-w-11 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] text-gray-400 transition"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
                {/* Fill Form button */}
                {templates.length > 0 && (
                  <button
                    type="button"
                      onClick={() => {
                      setShowFilesPanel(false);
                      handleFillForm();
                    }}
                    className="min-h-11 w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition"
                  >
                    <ClipboardList size={14} />
                    Fill a Form
                    {templates.length > 1 && (
                      <span className="ml-auto text-amber-500 font-normal text-xs">{templates.length} templates</span>
                    )}
                  </button>
                )}

                {/* Upload buttons */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Attach Files
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      disabled={uploading}
                      className="min-h-11 justify-center flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition disabled:opacity-50"
                    >
                      <FileText size={13} /> Document
                    </button>
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={uploading}
                      className="min-h-11 justify-center flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition disabled:opacity-50"
                    >
                      <Image size={13} /> Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="min-h-11 justify-center flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition disabled:opacity-50"
                    >
                      <File size={13} /> File
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={uploading}
                      className="min-h-11 justify-center flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-amber-400 dark:border-amber-600 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition disabled:opacity-50"
                    >
                      <Camera size={13} /> Camera
                    </button>
                  </div>
                </div>

                {/* Hidden file inputs */}
                <input
                  ref={docInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f, "document");
                    e.target.value = "";
                  }}
                />
                <input
                  ref={photoInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f, "photo");
                    e.target.value = "";
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f, "file");
                    e.target.value = "";
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleCameraCapture}
                />

                {/* Camera staging area */}
                {stagedPhotos.length > 0 && (
                  <div className="rounded-xl border-2 border-dashed border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <Camera size={11} /> {stagedPhotos.length} photo{stagedPhotos.length !== 1 ? "s" : ""} staged
                      </span>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={uploading}
                        className="min-h-10 px-2 text-xs text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50"
                      >
                        + Take Another
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {stagedPreviews.map((src, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={src}
                            alt={`Photo ${i + 1}`}
                            className="w-full h-16 object-cover rounded-lg border border-amber-200 dark:border-amber-700"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveStaged(i)}
                            className="absolute top-0.5 right-0.5 min-h-8 min-w-8 bg-black/60 text-white rounded-full p-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"
                          >
                            <XCircle size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleDiscardAllStaged}
                        disabled={uploading}
                        className="min-h-11 flex-1 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        <XCircle size={11} /> Discard
                      </button>
                      <button
                        type="button"
                        onClick={handleUploadStaged}
                        disabled={uploading}
                        className="min-h-11 flex-1 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        <Upload size={11} />
                        {uploading ? "Uploading…" : `Upload ${stagedPhotos.length}`}
                      </button>
                    </div>
                  </div>
                )}

                {/* File list */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Attached Files {leadFiles.length > 0 && `(${leadFiles.length})`}
                  </p>
                  {leadFiles.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic">No files attached yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {leadFiles.map((lf) => (
                        <div key={lf.id} className="p-2.5 bg-gray-50 dark:bg-[var(--surface)] rounded-lg">
                          {lf.type === "photo" && (
                            <img
                              src={lf.downloadUrl}
                              alt={lf.name}
                              className="w-full h-28 object-cover rounded-md mb-2"
                            />
                          )}
                          <div className="flex items-start gap-2">
                            <span className="text-base leading-none mt-0.5">{fileTypeIcon(lf.fileType)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{lf.name}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">
                                {formatFileSize(lf.fileSize)} · {lf.uploadedBy} · {timeAgoMs(lf.uploadedAt)}
                              </p>
                            </div>
                            <a
                              href={lf.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-10 min-w-10 p-2 text-gray-400 hover:text-amber-500 transition"
                              title="Download"
                            >
                              <Download size={13} />
                            </a>
                            {(currentUser?.role === "admin" || currentUser?.name === lf.uploadedBy) && (
                              <button
                                type="button"
                                onClick={() => deleteLeadFile(String(lead.id), lf)}
                                className="min-h-10 min-w-10 p-2 text-gray-400 hover:text-red-500 transition"
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Template picker — shown when >1 template exists */}
      {formPickerOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60]" onClick={() => setFormPickerOpen(false)} />
          <div className="fixed inset-0 z-[61] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div className="bg-white dark:bg-[var(--surface)] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[calc(100dvh-env(safe-area-inset-top))] sm:max-h-[70vh] overscroll-contain">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06]">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Select a Form Template</h3>
                <button
                  onClick={() => setFormPickerOpen(false)}
                  className="min-h-11 min-w-11 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] text-gray-400"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTemplate(t);
                      setFormPickerOpen(false);
                    }}
                    className="min-h-11 w-full text-left p-3 rounded-xl border border-gray-200 dark:border-white/[0.06] hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</p>
                    {t.description && <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      {t.fields.length} field{t.fields.length !== 1 ? "s" : ""}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Form Filler Modal */}
      {selectedTemplate && currentUser && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
              <Loader size={32} className="animate-spin text-amber-500" />
            </div>
          }
        >
          <FormFillerModal
            template={selectedTemplate}
            lead={lead}
            currentUser={currentUser}
            onClose={() => setSelectedTemplate(null)}
            onSaved={() => setSelectedTemplate(null)}
          />
        </Suspense>
      )}
    </>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgoMs(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const inputCls =
  "w-full min-h-11 px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

const readOnlyCls =
  "w-full min-h-11 px-3 py-2 rounded-lg border border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-[var(--surface)]/50 text-gray-700 dark:text-gray-300 text-base sm:text-sm";

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

export default LeadSidebar;
