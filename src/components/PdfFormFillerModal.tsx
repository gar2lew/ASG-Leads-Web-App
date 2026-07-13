/**
 * PdfFormFillerModal (v4)
 *
 * Core:
 *  - Auto-scales PDF pages to modal width (transform-scale, inputs stay aligned)
 *  - AcroForm field auto-type-detection (date/time/currency/number/text)
 *  - Add-Field mode: click+drag to draw a new field on any page
 *  - Field config popup: type (text/date/time/currency/number/dropdown),
 *    font size, label, dropdown options — editable after placing
 *  - Photo attachment (each image → extra PDF page on export)
 *  - Client 1 + optional Client 2 signature canvas
 *  - Editable document title + date in header
 *  - Save filename smart-fill (new title / keep original)
 *  - Download to device or Save to Lead
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { FormTemplate, Lead, LeadFile } from "../types";
import { useLeads } from "../hooks/useFirebase";
import { useAppStore } from "../stores/appStore";
import { useToast } from "../context/ToastContext";
import { uploadFile, downloadFileAsArrayBuffer } from "../lib/storage";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  X,
  FileText,
  Download,
  Save,
  Loader,
  Search,
  Pen,
  Camera,
  Plus,
  CalendarDays,
  UserPlus,
  MousePointerClick,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

const RENDER_SCALE = 2;
const TODAY = new Date().toISOString().split("T")[0];

// ── Types ─────────────────────────────────────────────────────────────────────

interface AcroField {
  fieldName: string;
  fieldType: string;
  multiLine: boolean;
  isCheckbox: boolean;
  options: string[];
  rect: { left: number; top: number; width: number; height: number };
}

interface PageData {
  dataUrl: string;
  width: number;
  height: number;
  fields: AcroField[];
}

interface AttachedPhoto {
  id: string;
  dataUrl: string;
  name: string;
  mimeType: string;
}

type CustomFieldType = "text" | "date" | "time" | "currency" | "number" | "dropdown";

interface CustomField {
  id: string;
  pageIndex: number;
  rect: { left: number; top: number; width: number; height: number }; // PDF pixel space
  type: CustomFieldType;
  label: string;
  fontSize: number; // PDF points
  options: string[]; // dropdown options
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Guess a useful input type from an AcroForm field name */
function detectAcroType(fieldName: string): CustomFieldType {
  const n = fieldName.toLowerCase().replace(/[_\s-]/g, "");
  if (n.includes("date") && !n.includes("update") && !n.includes("candidate")) return "date";
  if (n.includes("time")) return "time";
  if (
    n.includes("price") ||
    n.includes("cost") ||
    n.includes("amount") ||
    n.includes("total") ||
    n.includes("fee") ||
    n.includes("value") ||
    n.includes("payment") ||
    n.includes("dollar")
  )
    return "currency";
  if (n.includes("age") || n.includes("qty") || n.includes("quantity") || n.includes("percent")) return "number";
  return "text";
}

/** Format a value for PDF export based on its custom field type */
function formatForPdf(value: string, type: CustomFieldType): string {
  if (!value) return "";
  switch (type) {
    case "currency": {
      const n = parseFloat(value.replace(/[^0-9.]/g, ""));
      if (isNaN(n)) return value;
      return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    case "date": {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split("-");
        return `${d}/${m}/${y}`;
      }
      return value;
    }
    case "time":
      return value; // HH:MM — fine as-is
    default:
      return value;
  }
}

// ── Signature canvas ──────────────────────────────────────────────────────────

function SignatureCanvas({ label, onSign }: { label: string; onSign: (d: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasSig = useRef(false);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "#4b5563";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    hasSig.current = true;
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = false;
    if (hasSig.current) onSign(canvasRef.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    hasSig.current = false;
    onSign(null);
  };
  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <Pen size={14} className="text-purple-500" /> {label}
        </span>
        <button onClick={clear} className="text-xs text-gray-400 hover:text-red-500 transition px-2 py-0.5 rounded">
          ✕ Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={1200}
        height={280}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="w-full border-2 border-dashed border-gray-300 dark:border-white/[0.08] rounded-xl touch-none cursor-crosshair bg-white"
        style={{ touchAction: "none" }}
      />
      <p className="text-xs text-gray-400 text-center">Draw signature above</p>
    </div>
  );
}

// ── Field Config Popup ────────────────────────────────────────────────────────

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "currency", label: "Currency ($)" },
  { value: "number", label: "Number" },
  { value: "dropdown", label: "Dropdown" },
];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24];

interface FieldConfigState {
  pageIndex: number;
  rect: CustomField["rect"];
  type: CustomFieldType;
  label: string;
  fontSize: number;
  optionsText: string;
  editingId?: string;
}

function FieldConfigPopup({
  config,
  onChange,
  onSave,
  onCancel,
}: {
  config: FieldConfigState;
  onChange: (c: FieldConfigState) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onCancel} />
      <div className="fixed z-[70] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl p-5 w-80 border border-gray-200 dark:border-white/[0.06]">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">
          {config.editingId ? "Edit Field" : "New Field"}
        </h3>

        {/* Label */}
        <div className="space-y-1 mb-3">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Label / Name</label>
          <input
            value={config.label}
            onChange={(e) => onChange({ ...config, label: e.target.value })}
            placeholder="e.g. Appointment Date"
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        {/* Type */}
        <div className="space-y-1 mb-3">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Field Type</label>
          <select
            value={config.type}
            onChange={(e) => onChange({ ...config, type: e.target.value as CustomFieldType })}
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Font size */}
        <div className="space-y-1 mb-3">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Font Size (pt)</label>
          <select
            value={config.fontSize}
            onChange={(e) => onChange({ ...config, fontSize: Number(e.target.value) })}
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}pt
              </option>
            ))}
          </select>
        </div>

        {/* Dropdown options */}
        {config.type === "dropdown" && (
          <div className="space-y-1 mb-3">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Options (one per line)</label>
            <textarea
              value={config.optionsText}
              onChange={(e) => onChange({ ...config, optionsText: e.target.value })}
              rows={4}
              placeholder={"Option 1\nOption 2\nOption 3"}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition flex-1"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="flex-1 px-4 py-1.5 text-sm rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 transition"
          >
            {config.editingId ? "Save Changes" : "Add Field"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function PdfFormFillerModal({ template, onClose }: { template: FormTemplate; onClose: () => void }) {
  const { currentUser } = useAppStore();
  const { leads } = useLeads();
  const { showToast } = useToast();

  // PDF load state
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const originalBytesRef = useRef<ArrayBuffer | null>(null);

  // Global default font size (persisted to localStorage)
  const [globalFontSize, setGlobalFontSize] = useState<number>(() => {
    const stored = localStorage.getItem("asgPdfDefaultFontSize");
    return stored ? Math.max(6, Math.min(36, parseInt(stored, 10))) : 11;
  });

  // Logo bytes for PDF extra-page headers
  const logoBytesRef = useRef<Uint8Array | null>(null);

  // Display scale
  const [displayScale, setDisplayScale] = useState(1);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Document meta
  const [documentTitle, setDocumentTitle] = useState(template.name);
  const [documentDate, setDocumentDate] = useState(TODAY);
  const titleModified = documentTitle !== template.name;

  // AcroForm values
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  // Per-field font size overrides for existing AcroForm fields
  const [acroFontSizes, setAcroFontSizes] = useState<Record<string, number>>({});

  // Custom added fields
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  // Add-field drawing mode
  const [addFieldMode, setAddFieldMode] = useState(false);
  const drawStartRef = useRef<{ pageIndex: number; x: number; y: number } | null>(null);
  const [rubberBand, setRubberBand] = useState<{
    pageIndex: number;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [fieldConfig, setFieldConfig] = useState<FieldConfigState | null>(null);

  // Signatures
  const [sig1DataUrl, setSig1DataUrl] = useState<string | null>(null);
  const [sig1Name, setSig1Name] = useState("");
  const [sig1Date, setSig1Date] = useState(TODAY);
  const [showSig2, setShowSig2] = useState(false);
  const [sig2DataUrl, setSig2DataUrl] = useState<string | null>(null);
  const [sig2Name, setSig2Name] = useState("");
  const [sig2Date, setSig2Date] = useState(TODAY);

  // Photos
  const [photos, setPhotos] = useState<AttachedPhoto[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Save flow
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showLeadSearch, setShowLeadSearch] = useState(false);
  const [filename, setFilename] = useState("");
  const [saveMode, setSaveMode] = useState<"download" | "lead" | null>(null);
  const [saving, setSaving] = useState(false);

  const templateSnap = useRef({
    pdfUrl: template.pdfUrl,
    pdfStoragePath: template.pdfStoragePath,
    name: template.name,
  });

  // Persist global font size
  useEffect(() => {
    localStorage.setItem("asgPdfDefaultFontSize", String(globalFontSize));
  }, [globalFontSize]);

  // Load company logo bytes for PDF headers (non-fatal if missing)
  useEffect(() => {
    fetch("/asg-logo.png")
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((buf) => {
        logoBytesRef.current = new Uint8Array(buf);
      })
      .catch(() => {
        /* logo not available — skip */
      });
  }, []);

  // ── Load PDF ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const { pdfUrl, pdfStoragePath, name } = templateSnap.current;
    if (!pdfUrl) {
      setLoadError("No PDF URL found on this template.");
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        let buf: ArrayBuffer;
        if (pdfStoragePath) buf = await downloadFileAsArrayBuffer(pdfStoragePath);
        else {
          const res = await fetch(pdfUrl!);
          if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.statusText}`);
          buf = await res.arrayBuffer();
        }
        originalBytesRef.current = buf;

        const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
        const pageResults: PageData[] = [];

        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: RENDER_SCALE });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;

          const anns = await page.getAnnotations({ intent: "display" as any });
          const fields: AcroField[] = [];
          for (const a of anns) {
            if (a.subtype !== "Widget" || a.hidden || a.readOnly || !a.fieldName) continue;
            const vr = vp.convertToViewportRectangle(a.rect);
            fields.push({
              fieldName: a.fieldName,
              fieldType: a.fieldType ?? "Tx",
              multiLine: a.multiLine ?? false,
              isCheckbox: a.fieldType === "Btn" && !a.radioButton,
              options: (a.options ?? []).map((o: any) =>
                typeof o === "string" ? o : (o.displayValue ?? o.exportValue ?? String(o)),
              ),
              rect: {
                left: Math.min(vr[0], vr[2]),
                top: Math.min(vr[1], vr[3]),
                width: Math.abs(vr[2] - vr[0]),
                height: Math.abs(vr[3] - vr[1]),
              },
            });
          }
          pageResults.push({
            dataUrl: canvas.toDataURL("image/jpeg", 0.88),
            width: canvas.width,
            height: canvas.height,
            fields,
          });
        }

        if (!cancelled) {
          setPages(pageResults);
          const init: Record<string, string | boolean> = {};
          pageResults.forEach((p) =>
            p.fields.forEach((f) => {
              if (!(f.fieldName in init)) init[f.fieldName] = f.isCheckbox ? false : "";
            }),
          );
          setFieldValues(init);
          setFilename(`${name} ${new Date().toLocaleDateString("en-AU").replace(/\//g, "-")}`);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load PDF");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Display scale ──────────────────────────────────────────────────────────

  useLayoutEffect(() => {
    if (!bodyRef.current || pages.length === 0) return;
    const el = bodyRef.current;
    const compute = () => setDisplayScale(Math.min(1, (el.offsetWidth - 32) / pages[0].width));
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pages]);

  // ── Draw-field pointer handlers ────────────────────────────────────────────

  const onPagePointerDown = (e: React.PointerEvent<HTMLDivElement>, pageIndex: number) => {
    if (!addFieldMode) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / displayScale;
    const y = (e.clientY - rect.top) / displayScale;
    drawStartRef.current = { pageIndex, x, y };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setRubberBand({ pageIndex, left: x, top: y, width: 0, height: 0 });
  };

  const onPagePointerMove = (e: React.PointerEvent<HTMLDivElement>, pageIndex: number) => {
    if (!addFieldMode || !drawStartRef.current || drawStartRef.current.pageIndex !== pageIndex) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / displayScale;
    const y = (e.clientY - rect.top) / displayScale;
    const { x: sx, y: sy } = drawStartRef.current;
    setRubberBand({
      pageIndex,
      left: Math.min(sx, x),
      top: Math.min(sy, y),
      width: Math.abs(x - sx),
      height: Math.abs(y - sy),
    });
  };

  const onPagePointerUp = (e: React.PointerEvent<HTMLDivElement>, pageIndex: number) => {
    if (!addFieldMode || !drawStartRef.current || drawStartRef.current.pageIndex !== pageIndex) return;
    e.preventDefault();
    const rb = rubberBand;
    setRubberBand(null);
    drawStartRef.current = null;
    if (!rb || rb.width < 15 || rb.height < 8) return;
    setFieldConfig({
      pageIndex,
      rect: { left: rb.left, top: rb.top, width: rb.width, height: rb.height },
      type: "text",
      label: "",
      fontSize: 12,
      optionsText: "",
    });
  };

  // ── Field config save ──────────────────────────────────────────────────────

  const saveFieldConfig = () => {
    if (!fieldConfig) return;
    const options =
      fieldConfig.type === "dropdown"
        ? fieldConfig.optionsText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    if (fieldConfig.editingId) {
      setCustomFields((prev) =>
        prev.map((f) =>
          f.id === fieldConfig.editingId
            ? { ...f, type: fieldConfig.type, label: fieldConfig.label, fontSize: fieldConfig.fontSize, options }
            : f,
        ),
      );
    } else {
      const id = `cf_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      setCustomFields((prev) => [
        ...prev,
        {
          id,
          pageIndex: fieldConfig.pageIndex,
          rect: fieldConfig.rect,
          type: fieldConfig.type,
          label: fieldConfig.label,
          fontSize: fieldConfig.fontSize,
          options,
        },
      ]);
      setCustomValues((prev) => ({ ...prev, [id]: "" }));
    }
    setFieldConfig(null);
    setAddFieldMode(false);
  };

  // ── Photos ─────────────────────────────────────────────────────────────────

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) =>
        setPhotos((p) => [
          ...p,
          {
            id: `ph_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            dataUrl: ev.target!.result as string,
            name: file.name,
            mimeType: file.type || "image/jpeg",
          },
        ]);
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  // ── Formatted date string for PDF ─────────────────────────────────────────

  const formattedDate = documentDate
    ? new Date(documentDate + "T12:00:00").toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  // ── Export ─────────────────────────────────────────────────────────────────

  const fillAndExport = useCallback(async (): Promise<Uint8Array> => {
    const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, StandardFonts, rgb } = await import("pdf-lib");
    const pdfDoc = await PDFDocument.load(originalBytesRef.current!.slice(0));
    const form = pdfDoc.getForm();

    // Fill AcroForm fields
    for (const [name, value] of Object.entries(fieldValues)) {
      try {
        const field = form.getField(name);
        const strVal = typeof value === "string" ? value : "";
        if (field instanceof PDFTextField) {
          // Per-field override → global default; always set so PDF looks consistent
          const effectiveSize = acroFontSizes[name] ?? globalFontSize;
          try {
            field.setFontSize(effectiveSize);
          } catch {
            /* ignore */
          }
          const autoType = detectAcroType(name);
          field.setText(autoType === "currency" || autoType === "date" ? formatForPdf(strVal, autoType) : strVal);
        } else if (field instanceof PDFCheckBox) {
          value ? field.check() : field.uncheck();
        } else if (field instanceof PDFDropdown && strVal) {
          try {
            field.select(strVal);
          } catch {
            /* option not found */
          }
        }
      } catch {
        /* field not in form */
      }
    }
    form.flatten();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Brand colour palette for extra-page headers
    const HEADER_H = 52; // pt
    const GREY_BG = rgb(0.96, 0.96, 0.975); // light blue-grey background
    const GOLD = rgb(0.961, 0.62, 0.043); // amber/gold accent strip
    const DARK = rgb(0.12, 0.16, 0.24); // near-black text
    const MID = rgb(0.4, 0.4, 0.45); // secondary text
    const BORDER = rgb(0.85, 0.85, 0.88); // subtle bottom border

    /** Draw a branded header on a page (light grey-blue + gold left strip + logo + text) */
    const drawHeader = async (
      page: ReturnType<typeof pdfDoc.getPage>,
      pgW: number,
      pgH: number,
      titleLine: string,
      metaLine: string,
    ) => {
      // Background
      page.drawRectangle({ x: 0, y: pgH - HEADER_H, width: pgW, height: HEADER_H, color: GREY_BG });
      // Gold left accent strip
      page.drawRectangle({ x: 0, y: pgH - HEADER_H, width: 4, height: HEADER_H, color: GOLD });
      // Bottom border
      page.drawRectangle({ x: 0, y: pgH - HEADER_H - 1, width: pgW, height: 1, color: BORDER });
      // Title
      page.drawText(titleLine, { x: 16, y: pgH - 22, size: 13, font: helveticaBold, color: DARK, maxWidth: pgW - 140 });
      // Meta line
      if (metaLine)
        page.drawText(metaLine, { x: 16, y: pgH - 40, size: 8.5, font: helvetica, color: MID, maxWidth: pgW - 140 });
      // Logo (top-right, if available)
      if (logoBytesRef.current) {
        try {
          const logoImg = await pdfDoc.embedPng(logoBytesRef.current);
          const lScale = (HEADER_H * 0.62) / Math.max(logoImg.height, 1);
          const lW = logoImg.width * lScale,
            lH = logoImg.height * lScale;
          page.drawImage(logoImg, { x: pgW - lW - 12, y: pgH - HEADER_H + (HEADER_H - lH) / 2, width: lW, height: lH });
        } catch {
          /* logo not embeddable */
        }
      }
    };

    // Draw custom fields onto PDF pages
    for (const cf of customFields) {
      const rawValue = customValues[cf.id] ?? "";
      const displayValue = formatForPdf(rawValue, cf.type);
      if (!displayValue) continue;

      const page = pdfDoc.getPage(cf.pageIndex);
      const pgH = page.getHeight();
      const pdfX = cf.rect.left / RENDER_SCALE;
      const pdfYb = pgH - (cf.rect.top + cf.rect.height) / RENDER_SCALE;

      // Light background
      page.drawRectangle({
        x: pdfX,
        y: pdfYb,
        width: cf.rect.width / RENDER_SCALE,
        height: cf.rect.height / RENDER_SCALE,
        color: rgb(1, 0.98, 0.94),
      });

      // Text (baseline at ~72% of field height from top)
      const textY = pgH - (cf.rect.top + cf.rect.height * 0.72) / RENDER_SCALE;
      page.drawText(displayValue, {
        x: pdfX + 3,
        y: textY,
        size: cf.fontSize,
        font: helvetica,
        color: rgb(0.1, 0.1, 0.1),
        maxWidth: cf.rect.width / RENDER_SCALE - 6,
      });
    }

    // Photo pages
    for (const photo of photos) {
      const b64 = photo.dataUrl.split(",")[1];
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const img = photo.mimeType === "image/png" ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      const { width: iW, height: iH } = img;
      const A4W = 595,
        A4H = 842;
      const availH = A4H - HEADER_H - 20;
      const sc = Math.min((A4W - 80) / iW, availH / iH, 1);
      const pg = pdfDoc.addPage([A4W, A4H]);

      // Photo name → title, client/rep → meta line
      const photoTitle = photo.name.length > 60 ? photo.name.slice(0, 57) + "…" : photo.name;
      const metaParts: string[] = [];
      if (selectedLead?.name) metaParts.push(`Client: ${selectedLead.name}`);
      if (currentUser?.name) metaParts.push(`Consultant: ${currentUser.name}`);
      if (formattedDate) metaParts.push(formattedDate);
      await drawHeader(pg, A4W, A4H, photoTitle, metaParts.join("  ·  "));

      // Centre image in the space below the header
      pg.drawImage(img, {
        x: (A4W - iW * sc) / 2,
        y: (A4H - HEADER_H - iH * sc) / 2,
        width: iW * sc,
        height: iH * sc,
      });
    }

    // Signature page
    if (sig1DataUrl || sig2DataUrl) {
      const { width: pgW, height: pgH } = pdfDoc.getPage(0).getSize();
      const sp = pdfDoc.addPage([pgW, pgH]);

      // Branded header: document title + date/client/rep meta
      const sigMetaParts: string[] = [];
      if (formattedDate) sigMetaParts.push(formattedDate);
      if (selectedLead?.name) sigMetaParts.push(`Client: ${selectedLead.name}`);
      if (currentUser?.name) sigMetaParts.push(`Consultant: ${currentUser.name}`);
      await drawHeader(sp, pgW, pgH, documentTitle, sigMetaParts.join("  ·  "));

      const drawSig = async (
        dataUrl: string | null,
        label: string,
        x: number,
        maxW: number,
        startY: number,
        signerName: string,
        signerDate: string,
      ) => {
        sp.drawText(label, { x, y: startY, size: 10, font: helveticaBold, color: MID });
        let lineY: number;
        if (dataUrl) {
          const b64 = dataUrl.split(",")[1];
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const img = await pdfDoc.embedPng(bytes);
          const { width: sW, height: sH } = img;
          const sc = Math.min(maxW / sW, 160 / sH, 1);
          sp.drawImage(img, { x, y: startY - 12 - sH * sc, width: sW * sc, height: sH * sc });
          lineY = startY - 18 - sH * sc;
        } else {
          lineY = startY - 80;
        }
        sp.drawLine({ start: { x, y: lineY }, end: { x: x + maxW, y: lineY }, thickness: 0.75, color: BORDER });
        // Name + date beneath signature line
        if (signerName) {
          sp.drawText(`Name: ${signerName}`, { x, y: lineY - 14, size: 9, font: helvetica, color: MID });
        }
        if (signerDate) {
          const [yr, mo, dy] = signerDate.split("-");
          sp.drawText(`Date: ${dy}/${mo}/${yr}`, { x, y: lineY - 26, size: 9, font: helvetica, color: MID });
        }
      };

      // Signatures start just below the branded header (HEADER_H + 24 = 76 keeps same layout)
      const sigStartY = pgH - HEADER_H - 24;
      if (sig2DataUrl) {
        const col = (pgW - 60) / 2;
        await drawSig(sig1DataUrl, "Client 1 Signature", 20, col, sigStartY, sig1Name, sig1Date);
        await drawSig(sig2DataUrl, "Client 2 Signature", 30 + col, col, sigStartY, sig2Name, sig2Date);
      } else {
        await drawSig(sig1DataUrl, "Client Signature", 20, pgW - 40, sigStartY, sig1Name, sig1Date);
      }
    }

    return pdfDoc.save();
  }, [
    fieldValues,
    acroFontSizes,
    globalFontSize,
    customFields,
    customValues,
    photos,
    sig1DataUrl,
    sig1Name,
    sig1Date,
    sig2DataUrl,
    sig2Name,
    sig2Date,
    selectedLead,
    currentUser,
    documentTitle,
    formattedDate,
  ]);

  // ── Save handlers ──────────────────────────────────────────────────────────

  const openSaveMode = (mode: "download" | "lead") => {
    if (titleModified) setFilename(documentTitle);
    setSaveMode(mode);
  };

  const doExport = async (saveFn: (blob: Blob, name: string) => Promise<void>) => {
    setSaving(true);
    try {
      const bytes = await fillAndExport();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      await saveFn(blob, `${filename || templateSnap.current.name}.pdf`);
    } catch (err) {
      showToast(`❌ ${err instanceof Error ? err.message : "Export failed"}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () =>
    doExport(async (blob, name) => {
      const url = URL.createObjectURL(blob);
      try {
        Object.assign(document.createElement("a"), { href: url, download: name }).click();
        showToast("✅ PDF downloaded", "success");
      } finally {
        URL.revokeObjectURL(url);
      }
      setSaveMode(null);
    });

  const handleSaveToLead = () => {
    if (!selectedLead || !currentUser) return;
    doExport(async (blob, name) => {
      const storagePath = `leads/${selectedLead.id}/files/${Date.now()}_${name}`;
      const downloadUrl = await uploadFile(storagePath, new File([blob], name, { type: "application/pdf" }));
      await addDoc(collection(db, "leads", String(selectedLead.id), "files"), {
        name,
        storagePath,
        downloadUrl,
        fileType: "application/pdf",
        fileSize: blob.size,
        type: "document",
        uploadedBy: currentUser.name,
        uploadedAt: Date.now(),
      } as Omit<LeadFile, "id">);
      const url = URL.createObjectURL(blob);
      try {
        Object.assign(document.createElement("a"), { href: url, download: name }).click();
        showToast(`✅ Saved to ${selectedLead.name}'s files`, "success");
        onClose();
      } finally {
        URL.revokeObjectURL(url);
      }
    });
  };

  const filteredLeads = leadSearch.trim()
    ? leads
        .filter((l) => {
          const t = leadSearch.toLowerCase();
          return l.name.toLowerCase().includes(t) || l.phone.includes(t) || l.suburb.toLowerCase().includes(t);
        })
        .slice(0, 8)
    : [];

  const originalFilename = `${templateSnap.current.name} ${new Date().toLocaleDateString("en-AU").replace(/\//g, "-")}`;

  // ── Render AcroForm field ──────────────────────────────────────────────────

  const renderAcroField = (field: AcroField, fi: number) => {
    const val = fieldValues[field.fieldName];
    const key = `acro-${field.fieldName}-${fi}`;

    // Effective font size: per-field override → global default
    const hasOverride = field.fieldName in acroFontSizes;
    const fs = acroFontSizes[field.fieldName] ?? globalFontSize;

    const adjustFs = (delta: number) => {
      const next = Math.max(6, Math.min(36, fs + delta));
      setAcroFontSizes((p) => ({ ...p, [field.fieldName]: next }));
    };
    const resetFs = () =>
      setAcroFontSizes((p) => {
        const n = { ...p };
        delete n[field.fieldName];
        return n;
      });

    // Shared input style — positioned at (0,0) inside the wrapper
    const inp: React.CSSProperties = {
      position: "absolute",
      left: 0,
      top: 0,
      width: field.rect.width,
      height: field.rect.height,
      border: "none",
      outline: "2px solid rgba(245,158,11,0.6)",
      outlineOffset: "-1px",
      borderRadius: 2,
      background: "rgba(255,255,255,0.9)",
      boxSizing: "border-box",
      fontFamily: "Arial, Helvetica, sans-serif",
      color: "#4b5563",
      padding: "1px 4px",
    };

    // Checkbox — no font size control needed
    if (field.isCheckbox)
      return (
        <div
          key={key}
          style={{
            position: "absolute",
            left: field.rect.left,
            top: field.rect.top,
            width: field.rect.width,
            height: field.rect.height,
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <input
            type="checkbox"
            checked={!!val}
            onChange={(e) => setFieldValues((p) => ({ ...p, [field.fieldName]: e.target.checked }))}
            style={{
              width: Math.min(field.rect.width * 0.7, 22),
              height: Math.min(field.rect.height * 0.7, 22),
              cursor: "pointer",
            }}
          />
        </div>
      );

    // Font-size hover pill (shown top-right of the wrapper)
    // ↺ reset button appears when this field has a per-field override
    const fsPill = (
      <div
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          position: "absolute",
          top: -20,
          right: 0,
          display: "flex",
          alignItems: "center",
          background: "#4b5563",
          borderRadius: 4,
          padding: "2px 4px",
          gap: 2,
          zIndex: 30,
          pointerEvents: "auto",
        }}
      >
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            adjustFs(-1);
          }}
          style={{
            color: "#fff",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            padding: "0 2px",
            fontWeight: 700,
          }}
        >
          −
        </button>
        <span
          style={{
            color: hasOverride ? "#f59e0b" : "#94a3b8",
            fontSize: 10,
            fontWeight: 700,
            minWidth: 22,
            textAlign: "center",
          }}
        >
          {fs}pt
        </span>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            adjustFs(1);
          }}
          style={{
            color: "#fff",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            padding: "0 2px",
            fontWeight: 700,
          }}
        >
          +
        </button>
        {hasOverride && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              resetFs();
            }}
            title="Reset to global font size"
            style={{
              color: "#94a3b8",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              lineHeight: 1,
              padding: "0 2px",
            }}
          >
            ↺
          </button>
        )}
      </div>
    );

    const wrap = (input: React.ReactNode) => (
      <div
        key={key}
        className="group"
        style={{
          position: "absolute",
          left: field.rect.left,
          top: field.rect.top,
          width: field.rect.width,
          height: field.rect.height,
        }}
      >
        {fsPill}
        {input}
      </div>
    );

    if (field.fieldType === "Ch" && field.options.length > 0)
      return wrap(
        <select
          value={typeof val === "string" ? val : ""}
          onChange={(e) => setFieldValues((p) => ({ ...p, [field.fieldName]: e.target.value }))}
          style={{ ...inp, fontSize: fs, cursor: "pointer" }}
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>,
      );

    const autoType = detectAcroType(field.fieldName);

    if (autoType === "date")
      return wrap(
        <input
          type="date"
          value={typeof val === "string" ? val : ""}
          onChange={(e) => setFieldValues((p) => ({ ...p, [field.fieldName]: e.target.value }))}
          style={{ ...inp, fontSize: Math.min(fs, 12), cursor: "pointer" }}
        />,
      );

    if (autoType === "time")
      return wrap(
        <input
          type="time"
          value={typeof val === "string" ? val : ""}
          onChange={(e) => setFieldValues((p) => ({ ...p, [field.fieldName]: e.target.value }))}
          style={{ ...inp, fontSize: Math.min(fs, 12), cursor: "pointer" }}
        />,
      );

    if (autoType === "currency")
      return wrap(
        <div style={{ ...inp, display: "flex", alignItems: "center", padding: "0 4px" }}>
          <span style={{ color: "#6b7280", fontSize: Math.min(fs, 12), marginRight: 2, flexShrink: 0 }}>$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={typeof val === "string" ? val : ""}
            onChange={(e) => setFieldValues((p) => ({ ...p, [field.fieldName]: e.target.value }))}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "#4b5563",
              fontSize: fs,
              fontFamily: "inherit",
            }}
          />
        </div>,
      );

    if (autoType === "number")
      return wrap(
        <input
          type="number"
          value={typeof val === "string" ? val : ""}
          onChange={(e) => setFieldValues((p) => ({ ...p, [field.fieldName]: e.target.value }))}
          style={{ ...inp, fontSize: fs }}
        />,
      );

    const Tag = field.multiLine ? "textarea" : "input";
    return wrap(
      <Tag
        value={typeof val === "string" ? val : ""}
        onChange={(e) => setFieldValues((p) => ({ ...p, [field.fieldName]: e.target.value }))}
        style={{ ...inp, fontSize: fs, lineHeight: 1.2, resize: "none" as const }}
      />,
    );
  };

  // ── Render custom field ────────────────────────────────────────────────────

  const renderCustomField = (cf: CustomField) => {
    const val = customValues[cf.id] ?? "";
    const base: React.CSSProperties = {
      position: "absolute",
      left: cf.rect.left,
      top: cf.rect.top,
      width: cf.rect.width,
      height: cf.rect.height,
      border: "none",
      outline: "2px solid rgba(59,130,246,0.7)",
      outlineOffset: "-1px",
      borderRadius: 2,
      background: "rgba(239,246,255,0.92)",
      boxSizing: "border-box",
      fontFamily: "Arial, Helvetica, sans-serif",
      color: "#4b5563",
      padding: "1px 4px",
    };
    const fs = Math.min(cf.rect.height * 0.62, Math.max(cf.fontSize, 8));

    // Edit/delete controls
    const controls = (
      <div style={{ position: "absolute", top: -18, right: 0, display: "flex", gap: 3, zIndex: 20 }}>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            setFieldConfig({
              pageIndex: cf.pageIndex,
              rect: cf.rect,
              type: cf.type,
              label: cf.label,
              fontSize: cf.fontSize,
              optionsText: cf.options.join("\n"),
              editingId: cf.id,
            });
          }}
          style={{
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: 3,
            padding: "1px 4px",
            cursor: "pointer",
            fontSize: 10,
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <span>✏</span>
        </button>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            setCustomFields((p) => p.filter((f) => f.id !== cf.id));
            setCustomValues((p) => {
              const n = { ...p };
              delete n[cf.id];
              return n;
            });
          }}
          style={{
            background: "#ef4444",
            color: "#fff",
            border: "none",
            borderRadius: 3,
            padding: "1px 4px",
            cursor: "pointer",
            fontSize: 10,
          }}
        >
          ✕
        </button>
      </div>
    );

    const wrapper = (input: React.ReactNode) => (
      <div
        key={cf.id}
        className="group"
        style={{
          position: "absolute",
          left: cf.rect.left,
          top: cf.rect.top,
          width: cf.rect.width,
          height: cf.rect.height,
        }}
      >
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ position: "absolute", top: -18, right: 0 }}
        >
          {controls}
        </div>
        {input}
      </div>
    );

    if (cf.type === "dropdown")
      return wrapper(
        <select
          value={val}
          onChange={(e) => setCustomValues((p) => ({ ...p, [cf.id]: e.target.value }))}
          style={{ ...base, left: 0, top: 0, fontSize: fs, cursor: "pointer" }}
        >
          <option value="">—</option>
          {cf.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>,
      );

    if (cf.type === "date")
      return wrapper(
        <input
          type="date"
          value={val}
          onChange={(e) => setCustomValues((p) => ({ ...p, [cf.id]: e.target.value }))}
          style={{ ...base, left: 0, top: 0, fontSize: Math.min(fs, 12), cursor: "pointer" }}
        />,
      );

    if (cf.type === "time")
      return wrapper(
        <input
          type="time"
          value={val}
          onChange={(e) => setCustomValues((p) => ({ ...p, [cf.id]: e.target.value }))}
          style={{ ...base, left: 0, top: 0, fontSize: Math.min(fs, 12), cursor: "pointer" }}
        />,
      );

    if (cf.type === "currency")
      return wrapper(
        <div style={{ ...base, left: 0, top: 0, display: "flex", alignItems: "center", padding: "0 4px" }}>
          <span style={{ color: "#6b7280", fontSize: Math.min(fs, 12), marginRight: 2, flexShrink: 0 }}>$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={val}
            onChange={(e) => setCustomValues((p) => ({ ...p, [cf.id]: e.target.value }))}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "#4b5563",
              fontSize: Math.min(fs, 13),
              fontFamily: "inherit",
            }}
          />
        </div>,
      );

    if (cf.type === "number")
      return wrapper(
        <input
          type="number"
          value={val}
          onChange={(e) => setCustomValues((p) => ({ ...p, [cf.id]: e.target.value }))}
          style={{ ...base, left: 0, top: 0, fontSize: fs }}
        />,
      );

    return wrapper(
      <input
        type="text"
        value={val}
        onChange={(e) => setCustomValues((p) => ({ ...p, [cf.id]: e.target.value }))}
        style={{ ...base, left: 0, top: 0, fontSize: fs }}
      />,
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[96vh] flex flex-col">
          {/* ── Header ────────────────────────────────────────────────── */}
          <div className="border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap gap-y-2">
              <FileText size={16} className="text-blue-500 flex-shrink-0" />

              {/* Editable title */}
              <div className="flex-1 min-w-40">
                <input
                  value={documentTitle}
                  onChange={(e) => setDocumentTitle(e.target.value)}
                  className="w-full text-sm font-bold text-gray-900 dark:text-white bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-slate-600 focus:border-amber-400 focus:outline-none transition px-0.5"
                  placeholder="Document title…"
                  title="Click to rename"
                />
                {titleModified && <p className="text-xs text-amber-500 mt-0.5">Title changed</p>}
              </div>

              {/* Date */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <CalendarDays size={12} className="text-gray-400" />
                <input
                  type="date"
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                  className="text-xs text-gray-700 dark:text-gray-300 bg-transparent border border-gray-200 dark:border-white/[0.06] rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Global font size control */}
              <div
                className="flex items-center gap-0.5 flex-shrink-0 bg-gray-100 dark:bg-[var(--surface)] rounded-lg px-2 py-1"
                title="Default font size for all form fields. Per-field overrides still available on hover."
              >
                <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Font:</span>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setGlobalFontSize((s) => Math.max(6, s - 1))}
                  className="text-gray-600 dark:text-gray-300 hover:text-amber-500 font-bold text-sm leading-none px-1 transition"
                >
                  −
                </button>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 min-w-[28px] text-center">
                  {globalFontSize}pt
                </span>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setGlobalFontSize((s) => Math.min(36, s + 1))}
                  className="text-gray-600 dark:text-gray-300 hover:text-amber-500 font-bold text-sm leading-none px-1 transition"
                >
                  +
                </button>
              </div>

              {/* Add Field toggle */}
              <button
                onClick={() => setAddFieldMode((v) => !v)}
                title="Click then draw a rectangle on the PDF to add a custom field"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition flex-shrink-0 ${addFieldMode ? "bg-gray-500 text-white" : "bg-gray-100 dark:bg-gray-800/30 text-gray-700 dark:text-gray-400 hover:bg-gray-200"}`}
              >
                <MousePointerClick size={13} />
                {addFieldMode ? "Drawing… (drag on PDF)" : "Add Field"}
              </button>

              {/* Add Photo */}
              <button
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-semibold hover:bg-purple-200 transition flex-shrink-0"
              >
                <Camera size={13} />
                Add Photo{photos.length > 0 ? ` (${photos.length})` : ""}
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoChange}
                className="hidden"
              />

              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded-lg transition flex-shrink-0"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>
          </div>

          {/* ── Body ──────────────────────────────────────────────────── */}
          <div ref={bodyRef} className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader size={28} className="animate-spin text-blue-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading PDF…</p>
              </div>
            )}

            {loadError && (
              <div className="flex flex-col items-center justify-center py-20 gap-3 px-6 text-center">
                <span className="text-4xl">⚠️</span>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">{loadError}</p>
              </div>
            )}

            {!loading && !loadError && (
              <div className="p-4 space-y-4">
                {/* ── PDF pages ───────────────────────────────────────── */}
                {pages.map((page, pageIndex) => {
                  const pageCustomFields = customFields.filter((f) => f.pageIndex === pageIndex);
                  const isDrawing = rubberBand?.pageIndex === pageIndex;

                  return (
                    <div key={pageIndex} className="mx-auto">
                      {/* Outer: display dimensions */}
                      <div
                        className={`relative shadow-lg rounded overflow-hidden border border-gray-200 dark:border-white/[0.06] mx-auto select-none ${addFieldMode ? "cursor-crosshair" : ""}`}
                        style={{
                          width: Math.floor(page.width * displayScale),
                          height: Math.floor(page.height * displayScale),
                        }}
                        onPointerDown={(e) => onPagePointerDown(e, pageIndex)}
                        onPointerMove={(e) => onPagePointerMove(e, pageIndex)}
                        onPointerUp={(e) => onPagePointerUp(e, pageIndex)}
                      >
                        {/* Inner: full PDF pixel size, scaled as a unit */}
                        <div
                          style={{
                            width: page.width,
                            height: page.height,
                            transform: `scale(${displayScale})`,
                            transformOrigin: "top left",
                            position: "absolute",
                            top: 0,
                            left: 0,
                          }}
                        >
                          <img
                            src={page.dataUrl}
                            alt={`Page ${pageIndex + 1}`}
                            style={{ width: page.width, height: page.height, display: "block" }}
                            draggable={false}
                          />
                          {/* AcroForm inputs */}
                          {page.fields.map((field, fi) => renderAcroField(field, fi))}
                          {/* Custom fields */}
                          {pageCustomFields.map((cf) => renderCustomField(cf))}
                        </div>

                        {/* Rubber-band overlay (in DISPLAY pixel space) */}
                        {isDrawing && rubberBand && (
                          <div
                            style={{
                              position: "absolute",
                              left: rubberBand.left * displayScale,
                              top: rubberBand.top * displayScale,
                              width: rubberBand.width * displayScale,
                              height: rubberBand.height * displayScale,
                              border: "2px dashed #3b82f6",
                              background: "rgba(59,130,246,0.1)",
                              pointerEvents: "none",
                              borderRadius: 2,
                            }}
                          />
                        )}
                      </div>

                      <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-1">
                        Page {pageIndex + 1} of {pages.length}
                        {addFieldMode && " — drag to draw a field"}
                      </p>
                    </div>
                  );
                })}

                {/* ── Photo thumbnails ─────────────────────────────────── */}
                {photos.length > 0 && (
                  <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/10 p-4">
                    <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-3 flex items-center gap-1.5">
                      <Camera size={12} /> {photos.length} photo{photos.length !== 1 ? "s" : ""} — each added as a PDF
                      page
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {photos.map((ph) => (
                        <div key={ph.id} className="relative group">
                          <img
                            src={ph.dataUrl}
                            alt={ph.name}
                            className="w-28 h-28 object-cover rounded-xl border-2 border-purple-200 dark:border-purple-700 shadow-sm"
                          />
                          <button
                            onClick={() => setPhotos((p) => p.filter((x) => x.id !== ph.id))}
                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow"
                          >
                            ✕
                          </button>
                          <p className="text-xs text-gray-500 mt-1 truncate max-w-28 text-center">{ph.name}</p>
                        </div>
                      ))}
                      <button
                        onClick={() => photoInputRef.current?.click()}
                        className="w-28 h-28 rounded-xl border-2 border-dashed border-purple-300 dark:border-purple-700 flex flex-col items-center justify-center gap-1.5 text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/20 transition"
                      >
                        <Plus size={22} />
                        <span className="text-xs font-medium">Add more</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Signatures ──────────────────────────────────────── */}
                <div className="bg-gray-50 dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 space-y-4">
                  <SignatureCanvas label="Client 1 Signature" onSign={setSig1DataUrl} />
                  {/* Name + date for Client 1 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Client Name</label>
                      <input
                        value={sig1Name}
                        onChange={(e) => setSig1Name(e.target.value)}
                        placeholder="Full name"
                        className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Signature Date</label>
                      <input
                        type="date"
                        value={sig1Date}
                        onChange={(e) => setSig1Date(e.target.value)}
                        className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    </div>
                  </div>

                  {!showSig2 ? (
                    <button
                      onClick={() => setShowSig2(true)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-white/[0.08] text-gray-400 hover:text-purple-500 hover:border-purple-400 text-sm font-medium transition"
                    >
                      <UserPlus size={15} /> Add Client 2 Signature
                    </button>
                  ) : (
                    <div className="border-t border-gray-200 dark:border-white/[0.06] pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Client 2</span>
                        <button
                          onClick={() => {
                            setShowSig2(false);
                            setSig2DataUrl(null);
                            setSig2Name("");
                            setSig2Date(TODAY);
                          }}
                          className="text-xs text-gray-400 hover:text-red-500 transition"
                        >
                          Remove
                        </button>
                      </div>
                      <SignatureCanvas label="Client 2 Signature" onSign={setSig2DataUrl} />
                      {/* Name + date for Client 2 */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Client Name</label>
                          <input
                            value={sig2Name}
                            onChange={(e) => setSig2Name(e.target.value)}
                            placeholder="Full name"
                            className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Signature Date</label>
                          <input
                            type="date"
                            value={sig2Date}
                            onChange={(e) => setSig2Date(e.target.value)}
                            className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Save options ──────────────────────────────────────────── */}
          {saveMode && (
            <div className="border-t border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-[var(--surface)] px-4 py-3 space-y-3 flex-shrink-0">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Save as:</label>
                <div className="flex items-center gap-2">
                  <input
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    placeholder={templateSnap.current.name}
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <span className="text-xs text-gray-400 flex-shrink-0">.pdf</span>
                </div>
                {titleModified && (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setFilename(documentTitle)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium hover:bg-amber-200 transition"
                    >
                      📄 Use new title: "{documentTitle}"
                    </button>
                    <button
                      onClick={() => setFilename(originalFilename)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-gray-200 dark:bg-[var(--hover)] text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-300 dark:hover:bg-[var(--hover)] transition"
                    >
                      📄 Keep original: "{originalFilename}"
                    </button>
                  </div>
                )}
              </div>
              {saveMode === "lead" && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={leadSearch}
                      onChange={(e) => {
                        setLeadSearch(e.target.value);
                        setShowLeadSearch(true);
                      }}
                      onFocus={() => setShowLeadSearch(true)}
                      placeholder="Search lead by name, phone, or suburb…"
                      className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  {selectedLead && (
                    <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        {selectedLead.name}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedLead(null);
                          setLeadSearch("");
                        }}
                        className="text-amber-500 hover:text-red-500 transition"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                  {showLeadSearch && filteredLeads.length > 0 && !selectedLead && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] shadow-lg divide-y divide-gray-100 dark:divide-slate-800">
                      {filteredLeads.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => {
                            setSelectedLead(l);
                            setLeadSearch(l.name);
                            setShowLeadSearch(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                        >
                          <span className="font-medium text-gray-900 dark:text-white">{l.name}</span>
                          <span className="text-gray-400 ml-2 text-xs">
                            {l.suburb} · {l.phone}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSaveMode(null);
                    setSelectedLead(null);
                    setLeadSearch("");
                  }}
                  className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={saveMode === "download" ? handleDownload : handleSaveToLead}
                  disabled={saving || (saveMode === "lead" && !selectedLead)}
                  className="flex-1 px-4 py-1.5 text-sm rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader size={14} className="animate-spin" /> {saveMode === "lead" ? "Saving…" : "Generating…"}
                    </>
                  ) : saveMode === "lead" ? (
                    <>
                      <Save size={14} /> Save to Lead
                    </>
                  ) : (
                    <>
                      <Download size={14} /> Download PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Footer ────────────────────────────────────────────────── */}
          {!saveMode && !loading && !loadError && (
            <div className="border-t border-gray-200 dark:border-white/[0.06] px-4 py-3 flex gap-2 flex-shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition"
              >
                Cancel
              </button>
              <button
                onClick={() => openSaveMode("download")}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-amber-500 text-amber-600 dark:text-amber-400 text-sm font-semibold hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
              >
                <Download size={15} /> Download to Device
              </button>
              <button
                onClick={() => openSaveMode("lead")}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition"
              >
                <Save size={15} /> Save to Lead
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Field config popup ────────────────────────────────────────── */}
      {fieldConfig && (
        <FieldConfigPopup
          config={fieldConfig}
          onChange={setFieldConfig}
          onSave={saveFieldConfig}
          onCancel={() => {
            setFieldConfig(null);
            setAddFieldMode(false);
          }}
        />
      )}
    </>
  );
}

export default PdfFormFillerModal;
