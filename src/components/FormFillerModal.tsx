/**
 * FormFillerModal
 *
 * Fills a FormTemplate for a given lead, captures a drawn signature,
 * generates a PDF via jsPDF, and saves it to the lead's file subcollection.
 *
 * Also supports being opened from the Document Centre Forms tab with no
 * pre-selected lead (lead = null) — the rep picks a lead via search first.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import jsPDF from "jspdf";
import { FormTemplate, Lead, Rep } from "../types";
import { useLeads } from "../hooks/useFirebase";
import { useToast } from "../context/ToastContext";
import { uploadFile, deleteFile } from "../lib/storage";
import { resolveField } from "../lib/documentResolver";
import { normalizeDocumentSchema } from "../lib/documentSchema";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../lib/firebase";
import { X, Loader, FileText, Search } from "lucide-react";

// ── SignatureCanvas ───────────────────────────────────────────────────────────

interface SignatureCanvasProps {
  onSign: (dataUrl: string | null) => void;
}

function SignatureCanvas({ onSign }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [signed, setSigned] = useState(false);

  // Initialize canvas with proper dimensions
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use explicit dimensions to avoid 0×0 issue on mobile
    const width = canvas.offsetWidth || 300;
    const height = canvas.offsetHeight || 140;

    // Account for device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }, []);

  // Fill white background on mount and on resize
  useEffect(() => {
    initCanvas();

    // Re-initialize on resize to handle mobile orientation changes
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(initCanvas, 100);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [initCanvas]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    lastPos.current = getPos(e);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !lastPos.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
  }, []);

  const handlePointerUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    setSigned(true);
    if (canvasRef.current) onSign(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setSigned(false);
    onSign(null);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl border-2 border-dashed border-gray-300 dark:border-white/[0.08] bg-white touch-none"
        style={{ height: 140 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="flex items-center justify-between">
        <span className={`text-xs ${signed ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
          {signed ? "✓ Signature captured" : "Draw your signature above"}
        </span>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ── Auto-fill resolver ────────────────────────────────────────────────────────

// ── Main component ────────────────────────────────────────────────────────────

interface FormFillerModalProps {
  template: FormTemplate;
  lead: Lead | null; // null when opened from Document Centre Forms tab
  currentUser: Rep;
  onClose: () => void;
  onSaved: () => void;
}

export function FormFillerModal({ template, lead: initialLead, currentUser, onClose, onSaved }: FormFillerModalProps) {
  const { leads } = useLeads();
  const { showToast } = useToast();

  // Lead selection (only needed when opened without a pre-selected lead)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(initialLead);
  const [leadSearch, setLeadSearch] = useState("");

  const filteredLeads = leads
    .filter((l) => {
      const term = leadSearch.toLowerCase();
      return l.name.toLowerCase().includes(term) || l.phone?.includes(term) || l.suburb?.toLowerCase().includes(term);
    })
    .slice(0, 8);

  // Build initial form values from auto-fill when lead is known
  const buildInitialValues = useCallback(
    (lead: Lead) => {
      const vals: Record<string, string | boolean> = {};
      const schema = normalizeDocumentSchema(template);
      template.fields.forEach((f) => {
        if (f.type === "signature" || f.type === "checkbox") return;
        const schemaField = schema.fields.find((field) => field.legacyFieldId === f.id || field.key === f.autoFill);
        vals[f.id] = f.autoFill
          ? resolveField(f.autoFill, { lead, rep: currentUser }, schemaField).rendered
          : "";
      });
      return vals;
    },
    [template, currentUser],
  );

  const [formValues, setFormValues] = useState<Record<string, string | boolean>>(
    initialLead ? buildInitialValues(initialLead) : {},
  );
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead);
    setLeadSearch("");
    setFormValues(buildInitialValues(lead));
  };

  const handleGenerate = async () => {
    if (!selectedLead) return;

    // Check required fields
    const missing = template.fields.filter((f) => f.required && f.type !== "signature" && !formValues[f.id]);
    if (missing.length > 0) {
      showToast(`❌ Please fill in: ${missing.map((f) => f.label).join(", ")}`, "error");
      return;
    }
    // Check signature
    const hasSignatureField = template.fields.some((f) => f.type === "signature");
    if (hasSignatureField && !signatureDataUrl) {
      showToast("❌ Please draw a signature before saving", "error");
      return;
    }

    setSaving(true);
    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = 210;
      const margin = 18;
      const contentW = pageW - margin * 2;

      // ── Amber header ──
      pdf.setFillColor(245, 158, 11);
      pdf.rect(0, 0, pageW, 30, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.text(template.name, margin, 13);
      pdf.setFontSize(8.5);
      pdf.setFont("helvetica", "normal");
      pdf.text(
        `Lead: ${selectedLead.name}  ·  Rep: ${currentUser.name}  ·  ${new Date().toLocaleDateString("en-AU")}`,
        margin,
        23,
      );

      let y = 42;

      // ── Form fields ──
      const nonSigFields = template.fields.filter((f) => f.type !== "signature");
      nonSigFields.forEach((field) => {
        if (y > 250) {
          pdf.addPage();
          y = 20;
        }

        const val =
          field.type === "checkbox" ? (formValues[field.id] ? "☑ Yes" : "☐ No") : String(formValues[field.id] ?? "—");

        // Field label
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.5);
        pdf.setTextColor(100, 100, 100);
        pdf.text(field.label + (field.required ? " *" : "") + ":", margin, y);
        y += 5.5;

        // Field value
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10.5);
        pdf.setTextColor(25, 25, 25);
        const lines = pdf.splitTextToSize(val || "—", contentW);
        pdf.text(lines, margin, y);
        y += lines.length * 6 + 5;

        // Divider
        pdf.setDrawColor(230, 230, 230);
        pdf.line(margin, y - 2, pageW - margin, y - 2);
        y += 3;
      });

      // ── Signature ──
      if (hasSignatureField && signatureDataUrl) {
        if (y > 220) {
          pdf.addPage();
          y = 20;
        }
        y += 5;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.5);
        pdf.setTextColor(100, 100, 100);
        pdf.text("Signature:", margin, y);
        y += 5;
        pdf.addImage(signatureDataUrl, "PNG", margin, y, 80, 30);
        y += 35;
      }

      // ── Footer ──
      pdf.setFontSize(7);
      pdf.setTextColor(180, 180, 180);
      pdf.text(`${template.name} · Generated by ASG Live Leads · ${new Date().toLocaleString("en-AU")}`, margin, 290);

      // ── Save to Firebase ──
      const blob = pdf.output("blob");
      const safeName = template.name.replace(/[^a-z0-9]/gi, "_");
      const safeLeadName = selectedLead.name.replace(/[^a-z0-9]/gi, "_");
      const filename = `${safeName}_${safeLeadName}_${Date.now()}.pdf`;
      const path = `leadFiles/${selectedLead.id}/${filename}`;
      const file = new File([blob], filename, { type: "application/pdf" });
      const url = await uploadFile(path, file);

      // Write Firestore record — if this fails, clean up the orphaned Storage file
      try {
        await addDoc(collection(db, "leads", String(selectedLead.id), "files"), {
          name: filename,
          storagePath: path,
          downloadUrl: url,
          fileType: "application/pdf",
          fileSize: blob.size,
          type: "document",
          uploadedBy: currentUser.name,
          uploadedAt: Date.now(),
        });
        showToast(`✅ Form saved to ${selectedLead.name}'s files`, "success");
        onSaved();
      } catch (firestoreErr) {
        // Firestore write failed — remove the already-uploaded file so it doesn't orphan in Storage
        deleteFile(path).catch(() => {/* best-effort cleanup */});
        throw firestoreErr; // re-throw so the outer catch surfaces the error toast
      }
    } catch (err) {
      console.error("Form generation failed:", err);
      showToast(`❌ Failed: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const inp =
    "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition";

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[58]" onClick={onClose} />
      <div className="fixed inset-0 z-[59] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText size={16} className="text-amber-500" /> {template.name}
              </h2>
              {selectedLead && <p className="text-xs text-gray-400 mt-0.5">for {selectedLead.name}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] text-gray-400 ml-3"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Lead selector — only shown when no lead was pre-selected */}
            {!initialLead && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Select Lead
                </label>
                {selectedLead ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      ✓ {selectedLead.name}
                    </span>
                    <span className="text-xs text-amber-500">{selectedLead.suburb}</span>
                    <button
                      onClick={() => {
                        setSelectedLead(null);
                        setFormValues({});
                      }}
                      className="ml-auto text-amber-400 hover:text-amber-600"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                      placeholder="Search by name, phone or suburb…"
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                    />
                    {leadSearch && (
                      <div className="absolute top-full left-0 right-0 mt-1 border border-gray-200 dark:border-white/[0.06] rounded-lg overflow-hidden bg-white dark:bg-[var(--surface)] shadow-lg z-10">
                        {filteredLeads.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-400">No leads found</div>
                        ) : (
                          filteredLeads.map((l) => (
                            <button
                              key={l.id}
                              onClick={() => handleSelectLead(l)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition flex items-center justify-between"
                            >
                              <span className="font-medium text-gray-900 dark:text-white">{l.name}</span>
                              <span className="text-xs text-gray-400">{l.suburb}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Form fields */}
            {template.fields.map((field) => {
              if (field.type === "signature") {
                return (
                  <div key={field.id}>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                      ✍ Client Signature
                    </label>
                    <SignatureCanvas onSign={setSignatureDataUrl} />
                  </div>
                );
              }

              return (
                <div key={field.id}>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    {field.autoFill && <span className="ml-1.5 text-xs text-green-500 font-normal">(auto-filled)</span>}
                  </label>

                  {field.type === "text" && (
                    <input
                      className={inp}
                      value={String(formValues[field.id] ?? "")}
                      onChange={(e) => setFormValues((p) => ({ ...p, [field.id]: e.target.value }))}
                    />
                  )}
                  {field.type === "textarea" && (
                    <textarea
                      className={inp}
                      rows={3}
                      value={String(formValues[field.id] ?? "")}
                      onChange={(e) => setFormValues((p) => ({ ...p, [field.id]: e.target.value }))}
                    />
                  )}
                  {field.type === "date" && (
                    <input
                      type="date"
                      className={inp}
                      value={String(formValues[field.id] ?? "")}
                      onChange={(e) => setFormValues((p) => ({ ...p, [field.id]: e.target.value }))}
                    />
                  )}
                  {field.type === "select" && (
                    <select
                      className={inp}
                      value={String(formValues[field.id] ?? "")}
                      onChange={(e) => setFormValues((p) => ({ ...p, [field.id]: e.target.value }))}
                    >
                      <option value="">— Select —</option>
                      {(field.options ?? []).map((opt) => (
                        <option key={opt}>{opt}</option>
                      ))}
                    </select>
                  )}
                  {field.type === "checkbox" && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(formValues[field.id])}
                        onChange={(e) => setFormValues((p) => ({ ...p, [field.id]: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300 dark:border-white/[0.08] text-amber-500 focus:ring-amber-400"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Yes</span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 dark:border-white/[0.06] flex gap-3 flex-shrink-0">
            <button
              onClick={handleGenerate}
              disabled={!selectedLead || saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition"
            >
              {saving ? <Loader size={14} className="animate-spin" /> : <FileText size={14} />}
              {saving ? "Generating PDF…" : "Generate & Save to Lead"}
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
    </>
  );
}

export default FormFillerModal;
