/**
 * CSV Import Modal
 *
 * Step 1: Upload CSV file
 * Step 2: Map CSV columns → Lead fields
 * Step 3: Preview rows + confirm import
 */

import React, { useState, useCallback, useMemo, useRef } from "react";
import { Lead, LeadStatus } from "../types";
import { LEAD_STATUS_OPTIONS } from "../lib/statusConfig";
import { useAppStore } from "../stores/appStore";
import { normalizeAUPhone } from "../lib/utils";
import { X, Upload, ArrowRight, Check, AlertTriangle, FileText } from "lucide-react";

interface CSVImportModalProps {
  onClose: () => void;
  onImport: (leads: Lead[]) => Promise<void>;
}

type Step = "upload" | "map" | "preview";

const LEAD_FIELDS: { key: keyof Lead | ""; label: string }[] = [
  { key: "", label: "— Skip —" },
  { key: "name", label: "Full Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "houseNum", label: "House #" },
  { key: "street", label: "Street" },
  { key: "suburb", label: "Suburb" },
  { key: "postcode", label: "Postcode" },
  { key: "ownership", label: "Ownership" },
  { key: "superannuation", label: "Superannuation" },
  { key: "notes", label: "Notes" },
  { key: "status", label: "Status" },
  { key: "leadDate", label: "Lead Date" },
];

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows };
}

function autoMap(headers: string[]): Record<string, keyof Lead | ""> {
  const map: Record<string, keyof Lead | ""> = {};
  const lower = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");

  headers.forEach((h) => {
    const hk = lower(h);
    if (["name", "fullname", "clientname"].some((k) => hk.includes(k))) map[h] = "name";
    else if (["phone", "mobile", "contact", "number"].some((k) => hk.includes(k))) map[h] = "phone";
    else if (["email", "mail"].some((k) => hk.includes(k))) map[h] = "email";
    else if (["house", "housenum", "houseno", "streetnumber"].some((k) => hk.includes(k))) map[h] = "houseNum";
    else if (["street", "streetname", "address"].some((k) => hk.includes(k))) map[h] = "street";
    else if (["suburb", "city", "town"].some((k) => hk.includes(k))) map[h] = "suburb";
    else if (["postcode", "post", "zip"].some((k) => hk.includes(k))) map[h] = "postcode";
    else if (["ownership", "owner", "renter", "tenure"].some((k) => hk.includes(k))) map[h] = "ownership";
    else if (["super", "superannuation"].some((k) => hk.includes(k))) map[h] = "superannuation";
    else if (["notes", "comment"].some((k) => hk.includes(k))) map[h] = "notes";
    else if (["status"].some((k) => hk.includes(k))) map[h] = "status";
    else map[h] = "";
  });
  return map;
}

export function CSVImportModal({ onClose, onImport }: CSVImportModalProps) {
  const { reps, currentUser } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, keyof Lead | "">>({});
  const [defaultRep, setDefaultRep] = useState<number>(currentUser?.id ?? 0);
  const [defaultStatus, setDefaultStatus] = useState<LeadStatus>("new");
  const [importing, setImporting] = useState(false);

  const activeReps = useMemo(() => reps.filter((r) => r.active), [reps]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows.slice(0, 500)); // cap at 500
      setMapping(autoMap(parsed.headers));
      setStep("map");
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const previewLeads = useMemo((): Lead[] => {
    const now = Date.now();
    return rows
      .filter((row) => row.some((c) => c.trim()))
      .map((row, idx) => {
        const lead: Partial<Lead> = {
          id: now + idx,
          dqRep: defaultRep,
          status: defaultStatus,
          createdAt: now,
          callHistory: [],
          leadDate: new Date().toISOString().split("T")[0],
        };
        headers.forEach((h, i) => {
          const field = mapping[h];
          if (field && row[i]?.trim()) {
            const raw = row[i].trim();
            (lead as Partial<Record<keyof Lead, unknown>>)[field] = field === "phone" ? normalizeAUPhone(raw) : raw;
          }
        });
        return lead as Lead;
      })
      .filter((l) => l.name && l.phone && l.suburb);
  }, [rows, headers, mapping, defaultRep, defaultStatus]);

  const handleImport = async () => {
    setImporting(true);
    await onImport(previewLeads);
    setImporting(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-3">
              <FileText size={18} className="text-amber-500" />
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Import CSV</h2>
              {/* Step indicator */}
              <div className="flex items-center gap-1 text-xs text-gray-400">
                {(["upload", "map", "preview"] as Step[]).map((s, i) => (
                  <React.Fragment key={s}>
                    {i > 0 && <ArrowRight size={10} />}
                    <span
                      className={`capitalize font-medium ${step === s ? "text-amber-500" : step === "preview" && s === "map" ? "text-gray-500" : ""}`}
                    >
                      {s}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded transition text-gray-500"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-6 py-5">
            {/* Step 1: Upload */}
            {step === "upload" && (
              <div
                className="border-2 border-dashed border-gray-300 dark:border-white/[0.08] rounded-xl p-12 text-center cursor-pointer hover:border-amber-400 dark:hover:border-amber-500 transition"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={40} className="mx-auto text-gray-300 dark:text-gray-500 mb-4" />
                <p className="text-gray-600 dark:text-gray-400 font-medium mb-1">
                  Drop CSV file here or click to browse
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Max 500 rows · UTF-8 encoding recommended</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>
            )}

            {/* Step 2: Map columns */}
            {step === "map" && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Default Rep
                    </label>
                    <select
                      value={defaultRep}
                      onChange={(e) => setDefaultRep(Number(e.target.value))}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none"
                    >
                      <option value={0}>— Unassigned —</option>
                      {activeReps.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Default Status
                    </label>
                    <select
                      value={defaultStatus}
                      onChange={(e) => setDefaultStatus(e.target.value as LeadStatus)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none"
                    >
                      {LEAD_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 self-end ml-auto">
                    {rows.length} rows detected
                  </p>
                </div>

                <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-[var(--hover)]">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                          CSV Column
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                          Maps To
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                          Sample
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-600">
                      {headers.map((h) => (
                        <tr key={h} className={`${mapping[h] ? "bg-green-50/30 dark:bg-green-900/5" : ""}`}>
                          <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-200">{h}</td>
                          <td className="px-4 py-2">
                            <select
                              value={mapping[h] ?? ""}
                              onChange={(e) => setMapping((p) => ({ ...p, [h]: e.target.value as keyof Lead | "" }))}
                              className="w-full px-2 py-1 rounded border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                            >
                              {LEAD_FIELDS.map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2 text-gray-400 text-xs truncate max-w-[160px]">
                            {rows[0]?.[headers.indexOf(h)] ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={12} /> Rows missing Name, Phone, or Suburb will be skipped ({previewLeads.length}{" "}
                  of {rows.length} will be imported)
                </p>
              </div>
            )}

            {/* Step 3: Preview */}
            {step === "preview" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
                  <Check size={16} /> {previewLeads.length} leads ready to import
                </div>
                <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-[var(--hover)]">
                      <tr>
                        {["#", "Name", "Phone", "Suburb", "Status", "Rep"].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-600">
                      {previewLeads.map((l, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{l.name}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{l.phone}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{l.suburb}</td>
                          <td className="px-3 py-2">
                            <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400">
                              {l.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">
                            {reps.find((r) => r.id === l.dqRep)?.name ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-white/[0.06] flex-shrink-0 bg-gray-50 dark:bg-[var(--surface)]">
            <button
              onClick={step === "upload" ? onClose : () => setStep(step === "preview" ? "map" : "upload")}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition text-sm"
            >
              {step === "upload" ? "Cancel" : "← Back"}
            </button>

            {step === "map" && (
              <button
                onClick={() => setStep("preview")}
                disabled={previewLeads.length === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 disabled:opacity-50 transition text-sm"
              >
                Preview {previewLeads.length} Leads →
              </button>
            )}

            {step === "preview" && (
              <button
                onClick={handleImport}
                disabled={importing || previewLeads.length === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 disabled:opacity-50 transition text-sm"
              >
                {importing ? (
                  "Importing…"
                ) : (
                  <>
                    <Check size={15} /> Import {previewLeads.length} Leads
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default CSVImportModal;
