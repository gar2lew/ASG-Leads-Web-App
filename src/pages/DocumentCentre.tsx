/**
 * Document Centre page
 *
 * Tabs:
 *   Documents — upload/download file templates (PDF, Word, etc.)
 *   Forms     — admin creates fillable form templates with signature support
 *
 * - File storage in Firebase Storage at documents/{timestamp}_{filename}
 * - Document metadata in Firestore `documentLibrary` collection
 * - Form templates in Firestore `formTemplates` collection
 */

import React, { useState, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import jsPDF from "jspdf";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
import {
  LibraryDocument,
  DocFormField,
  Lead,
  FormTemplate,
  FormTemplateField,
  FormFieldType,
  FormFieldAutoFill,
} from "../types";
import { useAppStore } from "../stores/appStore";
import {
  useDocumentLibrary,
  useSaveLibraryDocument,
  useDeleteLibraryDocument,
  useLeads,
  useFormTemplates,
  useSaveFormTemplate,
  useDeleteFormTemplate,
} from "../hooks/useFirebase";
import { useToast } from "../context/ToastContext";
import { uploadFile, deleteFile, formatFileSize, fileTypeIcon } from "../lib/storage";
import { buildLegacyFormTemplateSchema } from "../lib/documentSchema";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  FolderOpen,
  Upload,
  Download,
  Search,
  Trash2,
  X,
  Plus,
  ChevronDown,
  FileText,
  Loader,
  ClipboardList,
  Edit2,
  GripVertical,
  ArrowUpDown,
  Check,
} from "lucide-react";

const FormFillerModal = lazy(() =>
  import("../components/FormFillerModal").then((m) => ({ default: m.FormFillerModal })),
);

const PdfFormFillerModal = lazy(() =>
  import("../components/PdfFormFillerModal").then((m) => ({ default: m.PdfFormFillerModal })),
);

const DOC_CATEGORIES = ["Templates", "Contracts", "Checklists", "Reports", "Training", "Other"];

const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Text",
  textarea: "Text Area",
  date: "Date",
  select: "Dropdown",
  checkbox: "Checkbox",
  signature: "Signature",
};

const AUTO_FILL_LABELS: Record<string, string> = {
  leadName: "Lead Name",
  leadAddress: "Lead Address",
  leadPhone: "Lead Phone",
  leadEmail: "Lead Email",
  leadSuburb: "Lead Suburb",
  leadPostcode: "Lead Postcode",
  leadOwnership: "Renter/Owner",
  repName: "Rep Name",
  today: "Today's Date",
};

// Fields that support auto-fill (signature + checkbox don't)
const AUTO_FILL_SUPPORTED: FormFieldType[] = ["text", "textarea", "date", "select"];

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const inp =
  "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition";

// ── PDF Thumbnail ────────────────────────────────────────────────────────────

function PdfThumbnail({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdfDoc.getPage(1);
        const viewport = page.getViewport({ scale: 0.4 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error)
    return (
      <div className="w-full h-24 bg-gray-100 dark:bg-[var(--surface)] rounded-lg flex items-center justify-center text-gray-400 text-xs">
        Preview unavailable
      </div>
    );

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white mb-2">
      <canvas ref={canvasRef} className="w-full" style={{ display: "block" }} />
    </div>
  );
}

// ── Upload Modal (admin only) ────────────────────────────────────────────────

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const { currentUser } = useAppStore();
  const { save } = useSaveLibraryDocument();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Templates");
  const [uploading, setUploading] = useState(false);
  const [formFields, setFormFields] = useState<DocFormField[]>([]);

  const addField = () => setFormFields((prev) => [...prev, { id: `field_${Date.now()}`, label: "", type: "text" }]);
  const updateField = (id: string, patch: Partial<DocFormField>) =>
    setFormFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const removeField = (id: string) => setFormFields((prev) => prev.filter((f) => f.id !== id));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  };

  const handleUpload = async () => {
    if (!file || !name.trim()) return;
    setUploading(true);
    try {
      const path = `documents/${Date.now()}_${file.name}`;
      const url = await uploadFile(path, file);
      const now = Date.now();
      const id = `doc_${now}_${Math.floor(Math.random() * 9999)}`;
      const libDoc: LibraryDocument = {
        id,
        name: name.trim(),
        description: description.trim(),
        category,
        storagePath: path,
        downloadUrl: url,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        uploadedBy: currentUser?.name ?? "Admin",
        uploadedAt: now,
        formFields: formFields.filter((f) => f.label.trim()),
      };
      await save(libDoc);
      showToast(`✅ "${name}" uploaded`, "success");
      onUploaded();
      onClose();
    } catch (err) {
      showToast(`❌ Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06]">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Upload size={16} className="text-amber-500" /> Upload Document
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] text-gray-400"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 dark:border-white/[0.08] rounded-xl p-6 text-center cursor-pointer hover:border-amber-400 transition"
          >
            <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
            {file ? (
              <div>
                <div className="text-2xl mb-1">{fileTypeIcon(file.type)}</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{file.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatFileSize(file.size)}</p>
              </div>
            ) : (
              <div>
                <Upload size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-500">Click to choose a file</p>
                <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, images, and more</p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Document Name *</label>
            <input
              className={inp}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Client Consent Form"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
            <textarea
              className={inp}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Category</label>
            <select className={inp} value={category} onChange={(e) => setCategory(e.target.value)}>
              {DOC_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Form Fields <span className="text-gray-400 font-normal">(optional — for "Use for Lead")</span>
              </label>
              <button
                onClick={addField}
                className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
              >
                <Plus size={11} /> Add Field
              </button>
            </div>
            {formFields.map((field) => (
              <div key={field.id} className="flex items-center gap-2 p-2 mb-2 rounded-lg bg-gray-50 dark:bg-[var(--surface)]">
                <input
                  className="flex-1 px-2 py-1 text-xs rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none"
                  placeholder="Field label"
                  value={field.label}
                  onChange={(e) => updateField(field.id, { label: e.target.value })}
                />
                <select
                  className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none"
                  value={field.autoFill ?? ""}
                  onChange={(e) =>
                    updateField(field.id, { autoFill: (e.target.value as DocFormField["autoFill"]) || undefined })
                  }
                >
                  <option value="">Manual entry</option>
                  {Object.entries(AUTO_FILL_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <button onClick={() => removeField(field.id)} className="text-red-400 hover:text-red-500 p-0.5">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 dark:border-white/[0.06] flex gap-3">
          <button
            onClick={handleUpload}
            disabled={!file || !name.trim() || uploading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition"
          >
            {uploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Uploading…" : "Upload Document"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-white/[0.08] text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Use for Lead Modal ───────────────────────────────────────────────────────
// Reworked flow:
//   1. Fill in form fields (no lead required)
//   2. Optionally search + select a client to save the PDF to their files
// Footer actions:
//   • Download to Device — always available, generates + downloads instantly
//   • Save to Client     — enabled when a lead is selected, also downloads after saving

function UseForLeadModal({ document: libDoc, onClose }: { document: LibraryDocument; onClose: () => void }) {
  const { currentUser, reps } = useAppStore();
  const { leads } = useLeads();
  const { showToast } = useToast();
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  const filteredLeads = useMemo(() => {
    const term = leadSearch.toLowerCase();
    return leads
      .filter(
        (l) => l.name.toLowerCase().includes(term) || l.phone?.includes(term) || l.suburb?.toLowerCase().includes(term),
      )
      .slice(0, 10);
  }, [leads, leadSearch]);

  const getAutoFill = (key: DocFormField["autoFill"], lead: Lead): string => {
    if (!lead || !key) return "";
    if (key === "leadName") return lead.name;
    if (key === "leadAddress")
      return [lead.houseNum, lead.street, lead.suburb, lead.postcode].filter(Boolean).join(" ");
    if (key === "leadPhone") return lead.phone ?? "";
    if (key === "repName") return reps.find((r) => r.id === lead.dqRep)?.name ?? currentUser?.name ?? "";
    if (key === "today") return new Date().toLocaleDateString("en-AU");
    return "";
  };

  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead);
    setLeadSearch("");
    // Auto-fill fields mapped to lead data — merges with any manually entered values
    const auto: Record<string, string> = {};
    (libDoc.formFields ?? []).forEach((f) => {
      if (f.autoFill) auto[f.id] = getAutoFill(f.autoFill, lead);
    });
    setFormValues((prev) => ({ ...prev, ...auto }));
  };

  // ── Shared PDF builder (returns blob + filename) ───────────────────────────
  const buildPDF = (): { blob: Blob; filename: string } => {
    const pdf = new jsPDF();
    // Amber header bar
    pdf.setFillColor(245, 158, 11);
    pdf.rect(0, 0, 210, 25, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("ASG Live Leads", 15, 12);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(libDoc.name, 15, 20);
    // Sub-header
    pdf.setTextColor(50, 50, 50);
    pdf.setFontSize(9);
    let headerY = 32;
    if (selectedLead) {
      pdf.text(`Client: ${selectedLead.name}`, 15, headerY);
      headerY += 7;
    }
    pdf.text(`Generated: ${new Date().toLocaleString("en-AU")} by ${currentUser?.name ?? ""}`, 15, headerY);
    pdf.setDrawColor(220, 220, 220);
    pdf.line(15, headerY + 5, 195, headerY + 5);
    let y = headerY + 15;
    (libDoc.formFields ?? []).forEach((field) => {
      const val = formValues[field.id] ?? "";
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text(field.label + ":", 15, y);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(20, 20, 20);
      const lines = pdf.splitTextToSize(val || "—", 165);
      pdf.text(lines, 15, y + 7);
      y += 7 + lines.length * 6 + 8;
      if (y > 270) {
        pdf.addPage();
        y = 20;
      }
    });
    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Generated from Document Centre · ${libDoc.name} · ASG Live Leads`, 15, 285);
    const blob = pdf.output("blob");
    const namePart = selectedLead ? `_${selectedLead.name.replace(/[^a-z0-9]/gi, "_")}` : "";
    const filename = `${libDoc.name.replace(/[^a-z0-9]/gi, "_")}${namePart}_${Date.now()}.pdf`;
    return { blob, filename };
  };

  // ── Required field validation ──────────────────────────────────────────────
  const validateRequired = (): boolean => {
    const missing = (libDoc.formFields ?? []).filter(
      (f) => (f as { required?: boolean }).required && !formValues[f.id]?.trim(),
    );
    if (missing.length > 0) {
      showToast(`Please fill required fields: ${missing.map((f) => f.label).join(", ")}`, "error");
      return false;
    }
    return true;
  };

  // ── Download to Device ─────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!validateRequired()) return;
    setGenerating(true);
    try {
      const { blob, filename } = buildPDF();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast("✅ PDF downloaded to your device", "success");
    } catch (err) {
      showToast(`❌ Failed: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
    } finally {
      setGenerating(false);
    }
  };

  // ── Save to selected client's files (+ download) ───────────────────────────
  const handleSaveToLead = async () => {
    if (!selectedLead) return;
    if (!validateRequired()) return;
    setGenerating(true);
    try {
      const { blob, filename } = buildPDF();
      const path = `leadFiles/${selectedLead.id}/${filename}`;
      const generatedFile = new File([blob], filename, { type: "application/pdf" });
      const url = await uploadFile(path, generatedFile);
      await addDoc(collection(db, "leads", String(selectedLead.id), "files"), {
        name: filename,
        storagePath: path,
        downloadUrl: url,
        fileType: "application/pdf",
        fileSize: blob.size,
        type: "document",
        uploadedBy: currentUser?.name ?? "",
        uploadedAt: Date.now(),
        linkedDocumentId: libDoc.id,
      });
      // Also download so the rep has a local copy
      const a = window.document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      showToast(`✅ PDF saved to ${selectedLead.name}'s files`, "success");
      onClose();
    } catch (err) {
      showToast(`❌ Failed: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06]">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2 min-w-0">
            <FileText size={16} className="text-amber-500 flex-shrink-0" />
            <span className="truncate">Fill Form: {libDoc.name}</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] text-gray-400 flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Step 1 — Fill in Details (no lead required) */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
              Step 1 — Fill in Details
            </label>
            {(libDoc.formFields ?? []).length > 0 ? (
              <div className="space-y-3">
                {libDoc.formFields!.map((field) => (
                  <div key={field.id}>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      {field.label}
                      {(field as { required?: boolean }).required && <span className="text-red-500 ml-0.5">*</span>}
                      {field.autoFill && selectedLead && (
                        <span className="ml-1.5 text-green-500 text-xs font-normal">(auto-filled from client)</span>
                      )}
                    </label>
                    <input
                      className={inp}
                      value={formValues[field.id] ?? ""}
                      onChange={(e) => setFormValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 bg-gray-50 dark:bg-[var(--surface)] rounded-lg px-3 py-2">
                This document has no form fields defined. A cover sheet with the document name and date will be
                generated.
              </p>
            )}
          </div>

          {/* Step 2 — Save to Client (optional) */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
              Step 2 — Save to Client
              <span className="ml-1.5 text-gray-400 dark:text-gray-500 font-normal normal-case">
                (optional — skip to download only)
              </span>
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Search for a client to auto-fill their details and save the PDF to their lead files.
            </p>
            <input
              className={inp}
              placeholder="Search by name, phone, or suburb…"
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
            />
            {leadSearch && (
              <div className="mt-1 border border-gray-200 dark:border-white/[0.06] rounded-lg overflow-hidden bg-white dark:bg-[var(--surface)] shadow-sm">
                {filteredLeads.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">No clients found</div>
                ) : (
                  filteredLeads.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => handleSelectLead(lead)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition flex items-center justify-between"
                    >
                      <span className="font-medium text-gray-900 dark:text-white">{lead.name}</span>
                      <span className="text-xs text-gray-400">
                        {lead.phone ? `${lead.phone} · ` : ""}
                        {lead.suburb}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            {selectedLead && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">✓ {selectedLead.name}</span>
                <span className="text-xs text-amber-600 dark:text-amber-500">{selectedLead.suburb}</span>
                <button onClick={() => setSelectedLead(null)} className="ml-auto text-amber-400 hover:text-amber-600">
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer — two action buttons */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-white/[0.06] flex gap-3">
          {/* Always available — no lead required */}
          <button
            onClick={handleDownload}
            disabled={generating}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-300 dark:border-white/[0.08] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)] disabled:opacity-50 transition"
          >
            {generating ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
            Download to Device
          </button>
          {/* Requires a client to be selected */}
          <button
            onClick={handleSaveToLead}
            disabled={!selectedLead || generating}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition"
          >
            {generating ? <Loader size={14} className="animate-spin" /> : <FileText size={14} />}
            Save to Client
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Document Card ────────────────────────────────────────────────────────────

function DocumentCard({
  doc: libDoc,
  isAdmin,
  onDelete,
}: {
  doc: LibraryDocument;
  isAdmin: boolean;
  onDelete: () => void;
}) {
  const [useForLead, setUseForLead] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 flex flex-col gap-3 hover:shadow-md transition group">
        {/* PDF thumbnail preview — shown for PDFs, same as the Forms tab */}
        {libDoc.fileType?.includes("pdf") && libDoc.downloadUrl && <PdfThumbnail url={libDoc.downloadUrl} />}

        <div className="flex items-start gap-3">
          <span className="text-3xl flex-shrink-0">{fileTypeIcon(libDoc.fileType)}</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{libDoc.name}</h3>
            {libDoc.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{libDoc.description}</p>
            )}
          </div>
          {isAdmin && (
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                >
                  <Trash2 size={13} />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={onDelete}
                    className="px-2 py-0.5 rounded text-xs bg-red-500 text-white font-medium hover:bg-red-400"
                  >
                    Del
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-0.5 rounded text-xs border border-gray-300 dark:border-white/[0.08] text-gray-500 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-[var(--surface)] text-gray-600 dark:text-gray-400">
            {libDoc.category}
          </span>
          <span className="text-xs text-gray-400">{formatFileSize(libDoc.fileSize)}</span>
          <span className="text-xs text-gray-400">· {timeAgo(libDoc.uploadedAt)}</span>
          {(libDoc.formFields ?? []).length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              {libDoc.formFields!.length} field{libDoc.formFields!.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex gap-2 mt-auto pt-1">
          <a
            href={libDoc.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={libDoc.name}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
          >
            <Download size={12} /> Download
          </a>
          <button
            onClick={() => setUseForLead(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-400 transition"
          >
            <FileText size={12} /> Fill Form
          </button>
        </div>
      </div>
      {useForLead && <UseForLeadModal document={libDoc} onClose={() => setUseForLead(false)} />}
    </>
  );
}

// ── Form Builder Modal (admin only) ─────────────────────────────────────────

function FormBuilderModal({
  template,
  onClose,
  onSaved,
}: {
  template?: FormTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentUser } = useAppStore();
  const { save } = useSaveFormTemplate();
  const { showToast } = useToast();

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [fields, setFields] = useState<FormTemplateField[]>(template?.fields ?? []);
  const [saving, setSaving] = useState(false);

  const addField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: `field_${Date.now()}_${Math.floor(Math.random() * 999)}`,
        label: "",
        type: "text",
      },
    ]);
  };

  const updateField = (id: string, patch: Partial<FormTemplateField>) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const removeField = (id: string) => setFields((prev) => prev.filter((f) => f.id !== id));

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const now = Date.now();
    const nextFields = fields.filter((f) => f.label.trim() || f.type === "signature");
    const t: FormTemplate = {
      id: template?.id ?? `form_${now}_${Math.floor(Math.random() * 9999)}`,
      name: name.trim(),
      description: description.trim(),
      fields: nextFields,
      createdBy: template?.createdBy ?? currentUser?.name ?? "",
      createdAt: template?.createdAt ?? now,
      updatedAt: now,
    };
    t.schema = buildLegacyFormTemplateSchema(t);
    const ok = await save(t);
    setSaving(false);
    if (ok) {
      showToast(`✅ Form template "${name}" saved`, "success");
      onSaved();
      onClose();
    } else showToast("❌ Failed to save template", "error");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06]">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ClipboardList size={16} className="text-amber-500" />
            {template ? "Edit Form Template" : "New Form Template"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] text-gray-400"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Template Name *</label>
            <input
              className={inp}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Client Consent Form"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
            <textarea
              className={inp}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this form is used for"
            />
          </div>

          {/* Field builder */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Form Fields
              </label>
              <button
                onClick={addField}
                className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"
              >
                <Plus size={12} /> Add Field
              </button>
            </div>

            {fields.length === 0 && (
              <p className="text-xs text-gray-400 italic">
                No fields yet. Add at least one field and a Signature field.
              </p>
            )}

            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="p-3 rounded-xl bg-gray-50 dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06]"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-400 w-5 text-center font-mono">{idx + 1}</span>
                    <input
                      className="flex-1 px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                      placeholder={field.type === "signature" ? "Signature" : "Field label"}
                      value={field.label}
                      disabled={field.type === "signature"}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                    />
                    <select
                      className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                      value={field.type}
                      onChange={(e) => {
                        const t = e.target.value as FormFieldType;
                        const update: Partial<FormTemplateField> = { type: t };
                        if (t === "signature") update.label = "Signature";
                        if (!AUTO_FILL_SUPPORTED.includes(t)) update.autoFill = undefined;
                        updateField(field.id, update);
                      }}
                    >
                      {Object.entries(FORM_FIELD_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeField(field.id)}
                      className="text-red-400 hover:text-red-500 p-0.5 flex-shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  {/* Extra options per type */}
                  <div className="pl-7 flex flex-wrap items-center gap-2">
                    {/* Auto-fill (text, textarea, date, select) */}
                    {AUTO_FILL_SUPPORTED.includes(field.type) && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">Auto-fill:</span>
                        <select
                          className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none"
                          value={field.autoFill ?? ""}
                          onChange={(e) =>
                            updateField(field.id, { autoFill: (e.target.value as FormFieldAutoFill) || undefined })
                          }
                        >
                          <option value="">Manual</option>
                          {Object.entries(AUTO_FILL_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {/* Required toggle */}
                    {field.type !== "signature" && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={field.required ?? false}
                          onChange={(e) => updateField(field.id, { required: e.target.checked })}
                          className="rounded border-gray-300 dark:border-white/[0.08] text-amber-500 focus:ring-amber-400"
                        />
                        Required
                      </label>
                    )}
                    {/* Select options */}
                    {field.type === "select" && (
                      <div className="w-full">
                        <label className="text-xs text-gray-400">Options (comma separated):</label>
                        <input
                          className="w-full mt-0.5 px-2 py-1 text-xs rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none"
                          placeholder="Yes, No, Maybe"
                          value={(field.options ?? []).join(", ")}
                          onChange={(e) =>
                            updateField(field.id, {
                              options: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick-add signature button */}
            {!fields.some((f) => f.type === "signature") && (
              <button
                onClick={() =>
                  setFields((prev) => [...prev, { id: `sig_${Date.now()}`, label: "Signature", type: "signature" }])
                }
                className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 text-xs font-medium hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
              >
                <Plus size={12} /> Add Signature Field
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-white/[0.06] flex gap-3">
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition"
          >
            {saving ? <Loader size={14} className="animate-spin" /> : <ClipboardList size={14} />}
            {saving ? "Saving…" : "Save Template"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-white/[0.08] text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PDF Template Upload Modal ─────────────────────────────────────────────────

function PdfTemplateUploadModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: FormTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentUser } = useAppStore();
  const { save } = useSaveFormTemplate();
  const { showToast } = useToast();

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      showToast("Name is required", "error");
      return;
    }
    if (!existing && !file) {
      showToast("Please select a PDF file", "error");
      return;
    }
    if (!currentUser) return;

    setUploading(true);
    try {
      let pdfUrl = existing?.pdfUrl;
      let pdfStoragePath = existing?.pdfStoragePath;

      if (file) {
        const id = existing?.id ?? `pdfform_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        pdfStoragePath = `formTemplates/${id}/template.pdf`;
        pdfUrl = await uploadFile(pdfStoragePath, file);
      }

      const id = existing?.id ?? `pdfform_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const nextTemplate: FormTemplate = {
        id,
        name: name.trim(),
        description: description.trim(),
        type: "pdf",
        fields: [],
        pdfUrl,
        pdfStoragePath,
        createdBy: existing?.createdBy ?? currentUser.name,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      nextTemplate.schema = buildLegacyFormTemplateSchema(nextTemplate);
      const ok = await save(nextTemplate);

      if (ok) {
        showToast(existing ? "✅ Template updated" : "✅ PDF template uploaded", "success");
        onSaved();
      } else {
        showToast("❌ Failed to save", "error");
      }
    } catch (err) {
      showToast(`❌ ${err instanceof Error ? err.message : "Upload failed"}`, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Upload size={16} className="text-blue-500" />
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {existing ? "Edit PDF Template" : "Upload PDF Form"}
              </h2>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded transition">
              <X size={16} className="text-gray-500" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Template Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Client Agreement"
                className={inp}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
                className={inp}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                PDF File {existing ? "(leave blank to keep existing)" : "*"}
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-white/[0.08] rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition"
              >
                <FileText size={28} className={file ? "text-blue-500" : "text-gray-300 dark:text-gray-600"} />
                {file ? (
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400 text-center">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Click to select a PDF</p>
                    <p className="text-xs text-gray-400">AcroForm PDFs work best — fields are detected automatically</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 dark:border-white/[0.06] flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={uploading}
              className="flex-1 py-2 rounded-lg bg-gray-500 text-white text-sm font-semibold hover:bg-gray-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader size={14} className="animate-spin" /> Uploading…
                </>
              ) : existing ? (
                "Save Changes"
              ) : (
                "Upload Template"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── PDF Template Card (with replace-PDF capability) ──────────────────────────

function PdfTemplateCard({
  t,
  isAdmin,
  confirmDelete,
  onEdit,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onFill,
  onReplaced,
}: {
  t: FormTemplate;
  isAdmin: boolean;
  confirmDelete: boolean;
  onEdit: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onFill: () => void;
  onReplaced: () => void;
}) {
  const { currentUser } = useAppStore();
  const { save } = useSaveFormTemplate();
  const { showToast } = useToast();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);

  const handleReplacePdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    e.target.value = "";
    setReplacing(true);
    try {
      const newVersion = (t.version ?? 1) + 1;
      const newPath = `formTemplates/${t.id}/template_v${newVersion}.pdf`;
      const newUrl = await uploadFile(newPath, file);

      const historyEntry = {
        version: t.version ?? 1,
        pdfUrl: t.pdfUrl ?? "",
        pdfStoragePath: t.pdfStoragePath ?? "",
        replacedAt: Date.now(),
        replacedBy: currentUser.name,
      };

      const ok = await save({
        ...t,
        pdfUrl: newUrl,
        pdfStoragePath: newPath,
        version: newVersion,
        versionHistory: [...(t.versionHistory ?? []), historyEntry],
        updatedAt: Date.now(),
      });

      if (ok) {
        showToast(`✅ Template updated to v${newVersion}`, "success");
        onReplaced();
      } else {
        showToast("❌ Failed to update template", "error");
      }
    } catch (err) {
      showToast(`❌ ${err instanceof Error ? err.message : "Upload failed"}`, "error");
    } finally {
      setReplacing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 flex flex-col gap-3 hover:shadow-md transition group">
      {/* PDF thumbnail */}
      {t.pdfUrl && <PdfThumbnail url={t.pdfUrl} />}

      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">📄</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{t.name}</h3>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800/30 text-gray-700 dark:text-gray-400 flex-shrink-0">
              PDF
            </span>
            {t.version && t.version > 1 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">v{t.version}</span>
            )}
            {(t.versionHistory?.length ?? 0) > 0 && (
              <span className="text-xs text-gray-400">
                ({t.versionHistory!.length} prior version{t.versionHistory!.length !== 1 ? "s" : ""})
              </span>
            )}
          </div>
          {t.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{t.description}</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={onEdit}
              className="p-1 rounded text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
              title="Edit"
            >
              <Edit2 size={13} />
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button onClick={onDelete} className="px-2 py-0.5 rounded text-xs bg-red-500 text-white font-medium">
                  Del
                </button>
                <button
                  onClick={onCancelDelete}
                  className="px-2 py-0.5 rounded text-xs border border-gray-300 dark:border-white/[0.08] text-gray-500"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={onConfirmDelete}
                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Field summary / badges */}
      <div className="flex flex-wrap gap-1.5">
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 dark:bg-gray-800/20 text-gray-600 dark:text-gray-400">
          📄 AcroForm — fields detected on open
        </span>
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
          ✍ Signature at end
        </span>
      </div>

      {/* Actions */}
      <div className="mt-auto pt-1 flex flex-col gap-2">
        <button
          onClick={onFill}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-400 transition"
        >
          <ClipboardList size={12} /> Fill Form
        </button>
        {isAdmin && (
          <>
            <button
              type="button"
              onClick={() => replaceInputRef.current?.click()}
              disabled={replacing}
              className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800/20 transition disabled:opacity-50"
              title="Upload a new version of this PDF"
            >
              {replacing ? <Loader size={11} className="animate-spin" /> : "🔄"} Update PDF
            </button>
            <input ref={replaceInputRef} type="file" accept=".pdf" className="hidden" onChange={handleReplacePdf} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Forms Tab ────────────────────────────────────────────────────────────────

function FormsTab({ isAdmin }: { isAdmin: boolean }) {
  const { currentUser } = useAppStore();
  const { templates, loading } = useFormTemplates();
  const { remove } = useDeleteFormTemplate();
  const { save: saveTemplate } = useSaveFormTemplate();
  const { showToast } = useToast();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FormTemplate | undefined>();
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [fillTarget, setFillTarget] = useState<FormTemplate | null>(null);
  const [pdfFillTarget, setPdfFillTarget] = useState<FormTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ── Reorder state (forms) ─────────────────────────────────────────────────
  const [isReordering, setIsReordering] = useState(false);
  const [reorderList, setReorderList] = useState<FormTemplate[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const dragIdxRef = useRef<number | null>(null);

  const handleDelete = async (t: FormTemplate) => {
    // Also clean up PDF from Storage for PDF-type templates
    if (t.type === "pdf" && t.pdfStoragePath) {
      try {
        await deleteFile(t.pdfStoragePath);
      } catch {
        /* ignore — file may already be gone */
      }
    }
    const ok = await remove(t.id);
    if (ok) showToast("🗑️ Form template deleted", "success");
    else showToast("❌ Failed to delete", "error");
    setConfirmDelete(null);
  };

  const startReorder = () => {
    setReorderList([...templates]);
    setIsReordering(true);
  };
  const saveFormOrder = async () => {
    setSavingOrder(true);
    await Promise.all(reorderList.map((t, i) => saveTemplate({ ...t, sortOrder: i })));
    setSavingOrder(false);
    setIsReordering(false);
    showToast("✓ Order saved", "success");
  };
  const handleFormDragStart = (i: number) => {
    dragIdxRef.current = i;
  };
  const handleFormDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    const from = dragIdxRef.current;
    if (from === null || from === i) return;
    setReorderList((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(i, 0, item);
      dragIdxRef.current = i;
      return next;
    });
  };

  return (
    <div className="space-y-4" onClick={() => showNewMenu && setShowNewMenu(false)}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {templates.length} form template{templates.length !== 1 ? "s" : ""} · Fill, sign and save directly to a lead
        </p>
        {isAdmin && !isReordering && (
          <div className="flex items-center gap-2">
            {templates.length > 1 && (
              <button
                onClick={startReorder}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-600 dark:text-gray-400 text-sm font-medium hover:border-amber-400 hover:text-amber-600 transition"
              >
                <ArrowUpDown size={13} /> Reorder
              </button>
            )}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNewMenu((prev) => !prev);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition"
              >
                <Plus size={14} /> New Form Template <ChevronDown size={12} />
              </button>
              {showNewMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] shadow-xl z-20 overflow-hidden min-w-[200px]">
                  <button
                    onClick={() => {
                      setShowNewMenu(false);
                      setEditingTemplate(undefined);
                      setBuilderOpen(true);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition flex items-center gap-2"
                  >
                    <ClipboardList size={14} className="text-amber-500" /> Build from Scratch
                  </button>
                  <button
                    onClick={() => {
                      setShowNewMenu(false);
                      setEditingTemplate(undefined);
                      setPdfUploadOpen(true);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/20 transition flex items-center gap-2 border-t border-gray-100 dark:border-white/[0.06]"
                  >
                    <Upload size={14} className="text-gray-500" /> Upload PDF Form
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {isAdmin && isReordering && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">Drag rows to reorder</span>
            <button
              onClick={() => setIsReordering(false)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition"
            >
              Cancel
            </button>
            <button
              onClick={saveFormOrder}
              disabled={savingOrder}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-400 disabled:opacity-50 transition"
            >
              <Check size={13} /> {savingOrder ? "Saving…" : "Save Order"}
            </button>
          </div>
        )}
      </div>

      {/* Template list */}
      {isReordering ? (
        <div className="space-y-1.5">
          {reorderList.map((t, i) => (
            <div
              key={t.id}
              draggable
              onDragStart={() => handleFormDragStart(i)}
              onDragOver={(e) => handleFormDragOver(e, i)}
              onDragEnd={() => {
                dragIdxRef.current = null;
              }}
              className="flex items-center gap-3 bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06] rounded-xl px-3 py-2.5 cursor-grab active:cursor-grabbing select-none hover:border-amber-300 dark:hover:border-amber-600 transition group"
            >
              <GripVertical
                size={16}
                className="text-gray-300 dark:text-gray-600 flex-shrink-0 group-hover:text-amber-400 transition"
              />
              <span className="text-base flex-shrink-0">{t.type === "pdf" ? "📄" : "📋"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.name}</p>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                      t.type === "pdf"
                        ? "bg-gray-100 dark:bg-gray-800/30 text-gray-700 dark:text-gray-400"
                        : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {t.type === "pdf" ? "PDF" : "BUILDER"}
                  </span>
                </div>
                {t.description && <p className="text-xs text-gray-400 truncate">{t.description}</p>}
              </div>
              <span className="text-xs text-gray-300 dark:text-gray-600 flex-shrink-0 tabular-nums">#{i + 1}</span>
            </div>
          ))}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader size={24} className="animate-spin text-amber-500" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList size={48} className="text-gray-200 dark:text-gray-700 mb-4" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No form templates yet</h3>
          <p className="text-sm text-gray-400">
            {isAdmin
              ? 'Click "New Form Template" to create your first fillable form.'
              : "Ask your admin to create form templates."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => {
            const isPdf = t.type === "pdf";
            if (isPdf) {
              return (
                <PdfTemplateCard
                  key={t.id}
                  t={t}
                  isAdmin={isAdmin}
                  confirmDelete={confirmDelete === t.id}
                  onEdit={() => {
                    setEditingTemplate(t);
                    setPdfUploadOpen(true);
                  }}
                  onConfirmDelete={() => setConfirmDelete(t.id)}
                  onCancelDelete={() => setConfirmDelete(null)}
                  onDelete={() => handleDelete(t)}
                  onFill={() => setPdfFillTarget(t)}
                  onReplaced={() => setConfirmDelete(null)}
                />
              );
            }
            return (
              <div
                key={t.id}
                className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 flex flex-col gap-3 hover:shadow-md transition group"
              >
                {/* Header */}
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">📋</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{t.name}</h3>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex-shrink-0">
                        BUILDER
                      </span>
                    </div>
                    {t.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{t.description}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => {
                          setEditingTemplate(t);
                          setBuilderOpen(true);
                        }}
                        className="p-1 rounded text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                        title="Edit"
                      >
                        <Edit2 size={13} />
                      </button>
                      {confirmDelete === t.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(t)}
                            className="px-2 py-0.5 rounded text-xs bg-red-500 text-white font-medium"
                          >
                            Del
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2 py-0.5 rounded text-xs border border-gray-300 dark:border-white/[0.08] text-gray-500"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(t.id)}
                          className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Field summary */}
                <div className="flex flex-wrap gap-1.5">
                  {t.fields.slice(0, 4).map((f) => (
                    <span
                      key={f.id}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        f.type === "signature"
                          ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                          : "bg-gray-100 dark:bg-[var(--surface)] text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {f.type === "signature" ? "✍ Signature" : f.label || FORM_FIELD_TYPE_LABELS[f.type]}
                    </span>
                  ))}
                  {t.fields.length > 4 && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-[var(--surface)] text-gray-400">
                      +{t.fields.length - 4} more
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-auto pt-1">
                  <button
                    onClick={() => setFillTarget(t)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-400 transition"
                  >
                    <ClipboardList size={12} /> Fill Form
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Builder Modal (builder type) */}
      {builderOpen && (
        <FormBuilderModal
          template={editingTemplate}
          onClose={() => {
            setBuilderOpen(false);
            setEditingTemplate(undefined);
          }}
          onSaved={() => {
            setBuilderOpen(false);
            setEditingTemplate(undefined);
          }}
        />
      )}

      {/* PDF Template Upload Modal */}
      {pdfUploadOpen && (
        <PdfTemplateUploadModal
          existing={editingTemplate}
          onClose={() => {
            setPdfUploadOpen(false);
            setEditingTemplate(undefined);
          }}
          onSaved={() => {
            setPdfUploadOpen(false);
            setEditingTemplate(undefined);
          }}
        />
      )}

      {/* Form Filler Modal — builder type */}
      {fillTarget && currentUser && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
              <Loader size={32} className="animate-spin text-amber-500" />
            </div>
          }
        >
          <FormFillerModal
            template={fillTarget}
            lead={null}
            currentUser={currentUser}
            onClose={() => setFillTarget(null)}
            onSaved={() => setFillTarget(null)}
          />
        </Suspense>
      )}

      {/* PDF Form Filler Modal — pdf type */}
      {pdfFillTarget && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
              <Loader size={32} className="animate-spin text-amber-500" />
            </div>
          }
        >
          <PdfFormFillerModal template={pdfFillTarget} onClose={() => setPdfFillTarget(null)} />
        </Suspense>
      )}
    </div>
  );
}

// ── Main Document Centre page ────────────────────────────────────────────────

export function DocumentCentrePage() {
  const { currentUser } = useAppStore();
  const { documents, loading } = useDocumentLibrary();
  const { remove } = useDeleteLibraryDocument();
  const { save: saveDoc } = useSaveLibraryDocument();
  const { showToast } = useToast();

  const isAdmin = currentUser?.role === "admin";
  const [activeTab, setActiveTab] = useState<"documents" | "forms">("documents");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Reorder state (documents) ─────────────────────────────────────────────
  const [isReorderingDocs, setIsReorderingDocs] = useState(false);
  const [reorderDocs, setReorderDocs] = useState<LibraryDocument[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const dragIndexRef = useRef<number | null>(null);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return documents.filter((d) => {
      if (filterCategory !== "all" && d.category !== filterCategory) return false;
      if (term && !d.name.toLowerCase().includes(term) && !d.description?.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [documents, search, filterCategory, refreshKey]);

  const handleDelete = async (doc: LibraryDocument) => {
    const ok = await remove(doc);
    if (ok) showToast(`🗑️ "${doc.name}" deleted`, "success");
    else showToast("❌ Failed to delete document", "error");
  };

  const startReorderDocs = () => {
    setReorderDocs([...documents]); // full list, not filtered, to preserve hidden items
    setIsReorderingDocs(true);
  };

  const saveDocOrder = async () => {
    setSavingOrder(true);
    await Promise.all(reorderDocs.map((d, i) => saveDoc({ ...d, sortOrder: i })));
    setSavingOrder(false);
    setIsReorderingDocs(false);
    showToast("✓ Order saved", "success");
  };

  const handleDocDragStart = (i: number) => {
    dragIndexRef.current = i;
  };
  const handleDocDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === i) return;
    setReorderDocs((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(i, 0, item);
      dragIndexRef.current = i;
      return next;
    });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[var(--bg)] p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FolderOpen size={20} className="text-amber-500" /> Document Centre
          </h1>
        </div>
        {isAdmin && activeTab === "documents" && !isReorderingDocs && (
          <div className="flex items-center gap-2">
            {documents.length > 1 && (
              <button
                onClick={startReorderDocs}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-600 dark:text-gray-400 text-sm font-medium hover:border-amber-400 hover:text-amber-600 transition"
              >
                <ArrowUpDown size={13} /> Reorder
              </button>
            )}
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition shadow-sm"
            >
              <Upload size={14} /> Upload Document
            </button>
          </div>
        )}
        {isAdmin && activeTab === "documents" && isReorderingDocs && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">Drag rows to reorder</span>
            <button
              onClick={() => setIsReorderingDocs(false)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition"
            >
              Cancel
            </button>
            <button
              onClick={saveDocOrder}
              disabled={savingOrder}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-400 disabled:opacity-50 transition"
            >
              <Check size={13} /> {savingOrder ? "Saving…" : "Save Order"}
            </button>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-white/[0.06]">
        {(
          [
            ["documents", "📄 Documents"],
            ["forms", "📋 Forms"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setActiveTab(key);
              setIsReorderingDocs(false);
            }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              activeTab === key
                ? "border-amber-500 text-amber-600 dark:text-amber-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Documents tab */}
      {activeTab === "documents" && (
        <>
          {/* Reorder mode — flat draggable list */}
          {isReorderingDocs ? (
            <div className="space-y-1.5">
              {reorderDocs.map((doc, i) => (
                <div
                  key={doc.id}
                  draggable
                  onDragStart={() => handleDocDragStart(i)}
                  onDragOver={(e) => handleDocDragOver(e, i)}
                  onDragEnd={() => {
                    dragIndexRef.current = null;
                  }}
                  className="flex items-center gap-3 bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06] rounded-xl px-3 py-2.5 cursor-grab active:cursor-grabbing select-none hover:border-amber-300 dark:hover:border-amber-600 transition group"
                >
                  <GripVertical
                    size={16}
                    className="text-gray-300 dark:text-gray-600 flex-shrink-0 group-hover:text-amber-400 transition"
                  />
                  <span className="text-base flex-shrink-0">{fileTypeIcon(doc.fileType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{doc.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {doc.category}
                      {doc.description ? ` · ${doc.description}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-gray-300 dark:text-gray-600 flex-shrink-0 tabular-nums">#{i + 1}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Filter bar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-48 max-w-sm">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="Search documents…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {["all", ...DOC_CATEGORIES].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        filterCategory === cat
                          ? "bg-amber-500 text-white"
                          : "bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-400 hover:border-amber-300"
                      }`}
                    >
                      {cat === "all" ? "All" : cat}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader size={24} className="animate-spin text-amber-500" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FolderOpen size={48} className="text-gray-200 dark:text-gray-700 mb-4" />
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                    {search || filterCategory !== "all" ? "No documents match your filters" : "No documents yet"}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {isAdmin
                      ? 'Click "Upload Document" to add the first template.'
                      : "Ask your admin to upload documents."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((doc) => (
                    <DocumentCard key={doc.id} doc={doc} isAdmin={isAdmin} onDelete={() => handleDelete(doc)} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Forms tab */}
      {activeTab === "forms" && <FormsTab isAdmin={isAdmin} />}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onUploaded={() => setRefreshKey((k) => k + 1)} />
      )}
    </div>
  );
}

export default DocumentCentrePage;
