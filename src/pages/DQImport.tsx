import React, { useState, useCallback, useMemo, useRef } from "react";
import { Lead } from "../types";
import { useAppStore } from "../stores/appStore";
import { useLeads, useSaveLead, useAddAuditEntry } from "../hooks/useFirebase";
import { useToast } from "../context/ToastContext";
import { SuburbInput } from "../components/SuburbInput";
import { sanitizePhone, normalizeAUPhone } from "../lib/utils";
import { generateLeadId } from "../lib/idGenerator";
import { geocodeBatch, geocodeAddressSafe, buildAddressString } from "../lib/geocode";
import { WA_SUBURB_POSTCODES, WA_POSTCODE_SUBURB } from "../data/waSuburbPostcodes";
import { ClipboardList, Plus, Trash2, AlertTriangle, RotateCcw, Calendar, Tag, Users, UserPlus, List, Loader2, Check } from "lucide-react";
import { LeadStatus } from "../types";
import { LEAD_STATUS_OPTIONS } from "../lib/statusConfig";

const MAX_ROWS = 25;
const SUPER_OPTIONS = ["$0-75k", "$75k to 150k", "$150k+", "Other"];
const EMPLOYMENT_OPTIONS = ["Full Time", "Part Time", "Casual", "Self Employed", "Retired"];
const IMPORT_STATUSES: LeadStatus[] = [...LEAD_STATUS_OPTIONS] as LeadStatus[];

interface DQRow {
  name: string;
  phone: string;
  houseNum: string;
  street: string;
  suburb: string;
  postcode: string;
  ownership: string;
  superannuation: string;
  employment: string;
  notes: string;
  dqRep: number | "";
}

const emptyRow = (defaultRep: number | "" = ""): DQRow => ({
  name: "",
  phone: "",
  houseNum: "",
  street: "",
  suburb: "",
  postcode: "",
  ownership: "",
  superannuation: "",
  employment: "",
  notes: "",
  dqRep: defaultRep,
});

export function DQImportPage() {
  const { reps, currentUser } = useAppStore();
  const activeReps = reps.filter((r) => r.active !== false);
  const formerReps = reps.filter((r) => r.active === false);
  const { leads: existingLeads } = useLeads();
  const { save: saveLead } = useSaveLead();
  const { add: addAudit } = useAddAuditEntry();
  const { showToast } = useToast();

  // Batch controls — apply to the whole import at once
  const [batchDate, setBatchDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [batchStatus, setBatchStatus] = useState<LeadStatus>("DQ");
  const [batchRep, setBatchRep] = useState<number | "">(currentUser?.id ?? "");

  const freshRows = useCallback(
    () => Array.from({ length: 5 }, () => emptyRow(batchRep)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentionally omit batchRep — only used at mount/reset time
  );

  const [mode, setMode] = useState<"fill" | "bulk">("fill");
  const [rows, setRows] = useState<DQRow[]>(freshRows);
  const [errors, setErrors] = useState<Record<number, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(0);

  // ── Fill Lead single-lead state ──────────────────────────────────────────────
  const emptyFill = useCallback(
    (): DQRow => emptyRow(currentUser?.id ?? ""),
    [currentUser],
  );
  const [fillRow, setFillRow] = useState<DQRow>(emptyFill);
  const [fillErrors, setFillErrors] = useState<string[]>([]);
  const [fillSaving, setFillSaving] = useState(false);
  const [fillSaved, setFillSaved] = useState(false);

  // Ordered field refs for keyboard navigation (Enter → next, Shift+Enter → prev)
  const fillFieldOrder = ["name", "phone", "houseNum", "street", "suburb", "postcode", "ownership", "superannuation", "employment", "notes"] as const;
  const fillRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>>({});
  const fillSuburbRef = useRef<HTMLInputElement | null>(null);

  const focusFillField = useCallback((fieldName: string) => {
    if (fieldName === "suburb") {
      fillSuburbRef.current?.focus();
    } else {
      fillRefs.current[fieldName]?.focus();
    }
  }, []);

  const handleFillKeyNav = useCallback((e: React.KeyboardEvent, currentField: string) => {
    if (e.key !== "Enter") return;
    // Don't intercept if a textarea wants newlines (Shift+Enter always navs back, Enter saves on textarea)
    e.preventDefault();
    const idx = fillFieldOrder.indexOf(currentField as typeof fillFieldOrder[number]);
    if (e.shiftKey) {
      // Move backwards
      if (idx > 0) focusFillField(fillFieldOrder[idx - 1]);
    } else {
      // Move forwards; last field → submit
      if (idx < fillFieldOrder.length - 1) {
        focusFillField(fillFieldOrder[idx + 1]);
      }
    }
  }, [focusFillField]);

  const updateFill = useCallback((field: keyof DQRow, value: string | number) => {
    setFillRow((prev) => ({ ...prev, [field]: value }));
    setFillErrors([]);
  }, []);

  const validateFill = (): boolean => {
    const errs: string[] = [];
    if (!fillRow.name.trim()) errs.push("Name is required");
    if (!fillRow.phone.trim()) errs.push("Contact number is required");
    if (!fillRow.suburb.trim()) errs.push("Suburb is required");
    if (!fillRow.dqRep) errs.push("Rep is required");
    setFillErrors(errs);
    return errs.length === 0;
  };

  const handleFillSave = async (_andAnother: boolean) => {
    if (!validateFill()) return;
    setFillSaving(true);
    const lead: Lead = {
      id: generateLeadId(),
      name: fillRow.name.trim(),
      phone: normalizeAUPhone(fillRow.phone.trim()),
      houseNum: fillRow.houseNum.trim() || undefined,
      street: fillRow.street.trim() || undefined,
      suburb: fillRow.suburb.trim(),
      postcode: fillRow.postcode.trim() || undefined,
      ownership: fillRow.ownership || undefined,
      superannuation: fillRow.superannuation || undefined,
      employment: fillRow.employment || undefined,
      notes: fillRow.notes.trim() || undefined,
      dqRep: Number(fillRow.dqRep),
      status: batchStatus,
      leadDate: batchDate,
      createdAt: Date.now(),
      callHistory: [],
    };
    try {
      const ok = await saveLead(lead);
      if (ok) {
        if (currentUser) {
          const now = new Date();
          await addAudit({
            timestamp: now.getTime(),
            date: now.toISOString().split("T")[0],
            time: now.toTimeString().slice(0, 5),
            user: currentUser.name,
            action: "lead_created",
            detail: `DQ imported: ${lead.name}`,
            leadId: lead.id,
            leadName: lead.name,
          }).catch(() => {});
        }
        showToast(`✅ ${lead.name} saved`, "success");
        setFillSaved(true);
        setTimeout(() => setFillSaved(false), 2000);
        setFillRow(emptyFill());
        // Geocode in background — sets geocodeStatus to success/failed
        geocodeAddressSafe(buildAddressString(lead)).then(async (attempt) => {
          if (attempt.result) {
            await saveLead({ ...lead, lat: attempt.result.lat, lng: attempt.result.lng, geocodeStatus: "success" }).catch(() => {});
          } else {
            await saveLead({ ...lead, geocodeStatus: "failed" }).catch(() => {});
          }
        });
      } else {
        showToast("Failed to save lead", "error");
      }
    } catch {
      showToast("Error saving lead", "error");
    } finally {
      setFillSaving(false);
    }
  };

  // When batch rep changes, update ALL rows to match (individual rows can still be overridden)
  const handleBatchRepChange = useCallback((repId: number | "") => {
    setBatchRep(repId);
    if (repId !== "") {
      setRows((prev) => prev.map((r) => ({ ...r, dqRep: repId })));
    }
  }, []);

  // ── Duplicate address detection ──────────────────────────────────────────────
  const existingAddressKeys = useMemo(() => {
    const keys = new Set<string>();
    existingLeads.forEach((l) => {
      const key = `${l.houseNum ?? ""} ${l.street ?? ""} ${l.suburb ?? ""}`.toLowerCase().trim().replace(/\s+/g, " ");
      if (key.replace(/\s/g, "")) keys.add(key);
    });
    return keys;
  }, [existingLeads]);

  const isDuplicateAddress = useCallback(
    (row: DQRow): boolean => {
      if (!row.suburb.trim()) return false;
      const key = `${row.houseNum} ${row.street} ${row.suburb}`.toLowerCase().trim().replace(/\s+/g, " ");
      return existingAddressKeys.has(key);
    },
    [existingAddressKeys],
  );

  // ── Row helpers ──────────────────────────────────────────────────────────────
  const updateRow = useCallback((i: number, field: keyof DQRow, value: string | number) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
    setErrors((prev) => {
      if (!prev[i]) return prev;
      const { [i]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const addRow = useCallback(() => {
    if (rows.length >= MAX_ROWS) return;
    setRows((prev) => [...prev, emptyRow(batchRep)]);
  }, [rows.length, batchRep]);

  const removeRow = useCallback((i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setErrors((prev) => {
      const next: Record<number, string[]> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const num = Number(k);
        if (num < i) next[num] = v;
        else if (num > i) next[num - 1] = v;
      });
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    const repId = currentUser?.id ?? "";
    setBatchDate(new Date().toISOString().split("T")[0]);
    setBatchStatus("DQ");
    setBatchRep(repId);
    setRows(Array.from({ length: 5 }, () => emptyRow(repId)));
    setErrors({});
    setLastSaved(0);
  }, [currentUser]);

  // ── Validation ───────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const newErrors: Record<number, string[]> = {};
    rows.forEach((row, i) => {
      const hasAnyData = row.name.trim() || row.phone.trim() || row.suburb.trim();
      if (!hasAnyData) return;
      const rowErrors: string[] = [];
      if (!row.name.trim()) rowErrors.push("Name");
      if (!row.phone.trim()) rowErrors.push("Contact Number");
      if (!row.suburb.trim()) rowErrors.push("Suburb");
      if (!row.dqRep) rowErrors.push("Rep");
      if (rowErrors.length) newErrors[i] = rowErrors;
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return;

    const valid = rows.filter((r) => r.name.trim() && r.phone.trim() && r.suburb.trim() && r.dqRep);

    if (valid.length === 0) {
      setErrors({ 0: ["Fill in at least one complete row (Name, Phone, Suburb, Rep)"] });
      return;
    }

    setSaving(true);
    const leads: Lead[] = valid.map((r) => ({
      id: generateLeadId(),
      name: r.name.trim(),
      phone: normalizeAUPhone(r.phone.trim()),
      houseNum: r.houseNum.trim() || undefined,
      street: r.street.trim() || undefined,
      suburb: r.suburb.trim(),
      postcode: r.postcode.trim() || undefined,
      ownership: r.ownership || undefined,
      superannuation: r.superannuation || undefined,
      employment: r.employment || undefined,
      notes: r.notes.trim() || undefined,
      dqRep: Number(r.dqRep),
      status: batchStatus,
      leadDate: batchDate,
      createdAt: Date.now(),
      callHistory: [],
    }));

    // Atomic batch save with rollback on failure
    const savedLeads: Lead[] = [];
    const failedLeads: { lead: Lead; error: unknown }[] = [];

    try {
      for (const lead of leads) {
        try {
          const ok = await saveLead(lead);
          if (ok) {
            savedLeads.push(lead);
            // Log audit entry for successfully saved lead
            if (currentUser) {
              const now = new Date();
              await addAudit({
                timestamp: now.getTime(),
                date: now.toISOString().split("T")[0],
                time: now.toTimeString().slice(0, 5),
                user: currentUser.name,
                action: "lead_created",
                detail: `DQ imported: ${lead.name}`,
                leadId: lead.id,
                leadName: lead.name,
              }).catch(() => {
                // Audit failure shouldn't block the import
                console.warn("Failed to log audit entry");
              });
            }
          } else {
            failedLeads.push({ lead, error: new Error("saveLead returned false") });
          }
        } catch (error) {
          failedLeads.push({ lead, error });
        }
      }

      // If any leads failed, attempt rollback of successfully saved ones
      if (failedLeads.length > 0) {
        console.error(
          `${failedLeads.length} lead(s) failed to save. Rolling back ${savedLeads.length} successful lead(s)...`,
        );

        const rollbackErrors: Array<{ lead: Lead; error: unknown }> = [];
        for (const savedLead of savedLeads) {
          try {
            // Use saveLead with _deleted status to mark for deletion
            await saveLead({ ...savedLead, status: "_deleted" });
          } catch (rollbackError) {
            rollbackErrors.push({ lead: savedLead, error: rollbackError });
            console.error(`Rollback failed for lead: ${savedLead.name}`, rollbackError);
          }
        }

        if (rollbackErrors.length > 0) {
          showToast(
            `⚠️ Import failed. ${rollbackErrors.length} lead(s) could not be rolled back. Manual cleanup required.`,
            "error",
          );
        } else {
          showToast(`♻️ Import failed. All ${savedLeads.length} lead(s) have been rolled back.`, "error");
        }

        // Report original failures
        if (failedLeads.length > 0) {
          console.error(
            "Failed leads:",
            failedLeads.map((f) => ({ name: f.lead.name, error: f.error })),
          );
        }
      } else {
        // All saved successfully — geocode in background with status tracking
        showToast(`✅ ${savedLeads.length} lead${savedLeads.length !== 1 ? "s" : ""} imported`, "success");
        // Mark all as "pending" geocode immediately
        geocodeBatch(savedLeads, undefined).then(async (geoMap) => {
          let geocodedCount = 0;
          for (const lead of savedLeads) {
            const geo = geoMap.get(lead.id);
            if (geo) {
              await saveLead({ ...lead, lat: geo.lat, lng: geo.lng, geocodeStatus: "success" }).catch(() => {});
              geocodedCount++;
            } else {
              await saveLead({ ...lead, geocodeStatus: "failed" }).catch(() => {});
            }
          }
          if (geocodedCount > 0)
            showToast(`📍 ${geocodedCount} / ${savedLeads.length} lead${savedLeads.length !== 1 ? "s" : ""} geocoded`, "success");
          else if (savedLeads.length > 0)
            showToast(`⚠️ Geocoding failed — use Retry in Admin to map pins`, "error");
        });

        // Reset to fresh rows after short delay
        const repAtSave = batchRep;
        setTimeout(() => {
          setRows(Array.from({ length: 5 }, () => emptyRow(repAtSave)));
          setErrors({});
          setLastSaved(0);
        }, 1800);
      }
    } finally {
      setSaving(false);
      setLastSaved(savedLeads.length);
    }
  };

  const filledCount = rows.filter((r) => r.name.trim() && r.phone.trim() && r.suburb.trim() && r.dqRep).length;

  const dupCount = rows.filter((r) => r.name.trim() && isDuplicateAddress(r)).length;

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[var(--surface)] overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ClipboardList size={18} className="text-amber-500" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">DQ Lead Import</h1>
          {/* Mode switch */}
          <div className="flex items-center bg-gray-100 dark:bg-white/5 rounded-lg p-0.5 gap-0.5 ml-1">
            <button
              onClick={() => setMode("fill")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${mode === "fill" ? "bg-white dark:bg-[#2a2a30] text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
            >
              <UserPlus size={12} />
              Fill Lead
            </button>
            <button
              onClick={() => setMode("bulk")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${mode === "bulk" ? "bg-white dark:bg-[#2a2a30] text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
            >
              <List size={12} />
              Bulk Import
            </button>
          </div>
          {mode === "bulk" && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {rows.length} / {MAX_ROWS} rows
            </span>
          )}
        </div>

        {/* Batch date picker */}
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-amber-500 flex-shrink-0" />
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Lead Date</label>
          <input
            type="date"
            value={batchDate}
            onChange={(e) => setBatchDate(e.target.value)}
            className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        {/* Batch status selector */}
        <div className="flex items-center gap-2">
          <Tag size={15} className="text-amber-500 flex-shrink-0" />
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Import as</label>
          <select
            value={batchStatus}
            onChange={(e) => setBatchStatus(e.target.value as LeadStatus)}
            className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {IMPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Batch DQ rep selector — sets ALL rows at once */}
        <div className="flex items-center gap-2">
          <Users size={15} className="text-amber-500 flex-shrink-0" />
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">DQ Rep</label>
          <select
            value={batchRep}
            onChange={(e) => handleBatchRepChange(e.target.value === "" ? "" : Number(e.target.value))}
            className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">— Select rep —</option>
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
        </div>

        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/[0.06] rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition"
        >
          <RotateCcw size={14} />
          Clear All
        </button>
      </div>

      {/* ── Fill Lead form ── */}
      {mode === "fill" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-5">
            {fillErrors.length > 0 && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {fillErrors.map((e) => <div key={e}>• {e}</div>)}
              </div>
            )}
            {/* Contact */}
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden bg-white dark:bg-[var(--surface)]">
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Contact</div>
              <div className="grid grid-cols-2 gap-4 p-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Full Name *</label>
                  <input
                    ref={(el) => { fillRefs.current["name"] = el; }}
                    value={fillRow.name}
                    onChange={(e) => updateFill("name", e.target.value)}
                    onKeyDown={(e) => handleFillKeyNav(e, "name")}
                    placeholder="First Last"
                    className={fillInputCls(fillErrors.some((e) => e.includes("Name")))}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone *</label>
                  <input
                    ref={(el) => { fillRefs.current["phone"] = el; }}
                    value={fillRow.phone}
                    onChange={(e) => updateFill("phone", e.target.value)}
                    onKeyDown={(e) => handleFillKeyNav(e, "phone")}
                    placeholder="04XX XXX XXX"
                    className={fillInputCls(fillErrors.some((e) => e.includes("number")))}
                  />
                </div>
              </div>
            </div>
            {/* Address */}
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden bg-white dark:bg-[var(--surface)]">
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Address</div>
              <div className="grid grid-cols-4 gap-4 p-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">House #</label>
                  <input
                    ref={(el) => { fillRefs.current["houseNum"] = el; }}
                    value={fillRow.houseNum}
                    onChange={(e) => updateFill("houseNum", e.target.value)}
                    onKeyDown={(e) => handleFillKeyNav(e, "houseNum")}
                    placeholder="12"
                    className={fillInputCls(false)}
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Street</label>
                  <input
                    ref={(el) => { fillRefs.current["street"] = el; }}
                    value={fillRow.street}
                    onChange={(e) => updateFill("street", e.target.value)}
                    onKeyDown={(e) => handleFillKeyNav(e, "street")}
                    placeholder="Main Street"
                    className={fillInputCls(false)}
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Suburb *</label>
                  <SuburbInput
                    ref={fillSuburbRef}
                    value={fillRow.suburb}
                    onChange={(v) => {
                      updateFill("suburb", v);
                      // Auto-fill postcode if known and postcode field is empty
                      if (WA_SUBURB_POSTCODES[v] && !fillRow.postcode) {
                        updateFill("postcode", WA_SUBURB_POSTCODES[v]);
                      }
                    }}
                    onSelect={(_suburb, postcode) => {
                      // Always sync postcode when explicitly selected from dropdown
                      if (postcode) updateFill("postcode", postcode);
                    }}
                    onKeyDown={(e) => handleFillKeyNav(e, "suburb")}
                    className={fillInputCls(fillErrors.some((e) => e.includes("Suburb")))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Postcode</label>
                  <input
                    ref={(el) => { fillRefs.current["postcode"] = el; }}
                    value={fillRow.postcode}
                    onChange={(e) => {
                      const pc = e.target.value;
                      updateFill("postcode", pc);
                      // Auto-fill suburb if known and suburb field is empty
                      if (pc.length === 4 && WA_POSTCODE_SUBURB[pc] && !fillRow.suburb) {
                        updateFill("suburb", WA_POSTCODE_SUBURB[pc]);
                      }
                    }}
                    onKeyDown={(e) => handleFillKeyNav(e, "postcode")}
                    placeholder="6000"
                    className={fillInputCls(false)}
                  />
                </div>
              </div>
            </div>
            {/* Qualification */}
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden bg-white dark:bg-[var(--surface)]">
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Qualification</div>
              <div className="grid grid-cols-3 gap-4 p-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ownership</label>
                  <select
                    ref={(el) => { fillRefs.current["ownership"] = el; }}
                    value={fillRow.ownership}
                    onChange={(e) => updateFill("ownership", e.target.value)}
                    onKeyDown={(e) => handleFillKeyNav(e, "ownership")}
                    className={fillSelectCls}
                  >
                    <option value="">—</option>
                    <option value="Owner">Owner</option>
                    <option value="Tenant">Tenant</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Super</label>
                  <select
                    ref={(el) => { fillRefs.current["superannuation"] = el; }}
                    value={fillRow.superannuation}
                    onChange={(e) => updateFill("superannuation", e.target.value)}
                    onKeyDown={(e) => handleFillKeyNav(e, "superannuation")}
                    className={fillSelectCls}
                  >
                    <option value="">—</option>
                    {SUPER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Employment</label>
                  <select
                    ref={(el) => { fillRefs.current["employment"] = el; }}
                    value={fillRow.employment}
                    onChange={(e) => updateFill("employment", e.target.value)}
                    onKeyDown={(e) => handleFillKeyNav(e, "employment")}
                    className={fillSelectCls}
                  >
                    <option value="">—</option>
                    {EMPLOYMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {/* Notes */}
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden bg-white dark:bg-[var(--surface)]">
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Notes</div>
              <div className="p-4">
                <textarea
                  ref={(el) => { fillRefs.current["notes"] = el; }}
                  value={fillRow.notes}
                  onChange={(e) => updateFill("notes", e.target.value)}
                  onKeyDown={(e) => {
                    // Shift+Enter → go back to employment; plain Enter inserts newline in textarea
                    if (e.key === "Enter" && e.shiftKey) {
                      e.preventDefault();
                      handleFillKeyNav(e, "notes");
                    }
                  }}
                  placeholder="Any additional notes… (Shift+Enter to go back)"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.06] text-sm bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
            </div>
            {/* Fill Lead actions */}
            <div className="flex items-center gap-3 pt-1">
              {isDuplicateAddress(fillRow) && (
                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                  <AlertTriangle size={12} />
                  Address already exists
                </span>
              )}
              <div className="flex-1" />
              <button onClick={() => setFillRow(emptyFill())} className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/[0.06] rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition">
                Clear
              </button>
              <button
                onClick={() => handleFillSave(true)}
                disabled={fillSaving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition disabled:opacity-50"
              >
                {fillSaving && <Loader2 size={14} className="animate-spin" />}
                {fillSaving ? "Saving…" : "Save & Add Another"}
              </button>
              <button
                onClick={() => handleFillSave(false)}
                disabled={fillSaving}
                className={`flex items-center gap-1.5 px-5 py-2 text-sm font-semibold rounded-lg transition disabled:opacity-50 ${
                  fillSaved
                    ? "bg-emerald-500 text-white hover:bg-emerald-400"
                    : "bg-amber-500 text-white hover:bg-amber-400"
                }`}
              >
                {fillSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : fillSaved ? (
                  <Check size={14} />
                ) : null}
                {fillSaving ? "Saving…" : fillSaved ? "Saved ✓" : "Save Lead"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Import table ── */}
      {mode === "bulk" && (<><div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: "1400px" }}>
          <thead className="sticky top-0 bg-gray-50 dark:bg-[var(--surface)] z-10">
            <tr>
              <th className={thCls} style={{ width: 36 }}>
                #
              </th>
              <th className={thCls} style={{ minWidth: 150 }}>
                Full Name *
              </th>
              <th className={thCls} style={{ minWidth: 130 }}>
                Contact Number *
              </th>
              <th className={thCls} style={{ width: 64 }}>
                House #
              </th>
              <th className={thCls} style={{ minWidth: 130 }}>
                Street
              </th>
              <th className={thCls} style={{ minWidth: 110 }}>
                Suburb *
              </th>
              <th className={thCls} style={{ width: 72 }}>
                Postcode
              </th>
              <th className={thCls} style={{ width: 110 }}>
                Renter/Owner
              </th>
              <th className={thCls} style={{ width: 120 }}>
                Super
              </th>
              <th className={thCls} style={{ width: 120 }}>
                Employment
              </th>
              <th className={thCls} style={{ minWidth: 200 }}>
                Notes
              </th>
              <th className={thCls} style={{ minWidth: 120 }}>
                Rep Name *
              </th>
              <th className={thCls} style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const rowError = errors[i];
              const isDup = isDuplicateAddress(row);
              return (
                <tr
                  key={i}
                  className={`border-b border-gray-100 dark:border-white/[0.06] ${
                    rowError
                      ? "bg-red-50 dark:bg-red-900/10"
                      : isDup
                        ? "bg-amber-50/60 dark:bg-amber-900/10"
                        : "hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50"
                  }`}
                >
                  {/* Row # / Duplicate indicator */}
                  <td className="px-3 py-1.5 text-xs text-gray-400 text-center">
                    {isDup ? (
                      <span
                        title="Address already exists in leads"
                        className="inline-flex items-center justify-center text-amber-500"
                      >
                        <AlertTriangle size={13} />
                      </span>
                    ) : (
                      i + 1
                    )}
                  </td>

                  {/* Name */}
                  <td className="px-1.5 py-1">
                    <input
                      className={inputCls(!!rowError?.includes("Name"))}
                      placeholder="John Smith"
                      value={row.name}
                      onChange={(e) => updateRow(i, "name", e.target.value)}
                    />
                  </td>

                  {/* Phone */}
                  <td className="px-1.5 py-1">
                    <input
                      className={inputCls(!!rowError?.includes("Contact Number"))}
                      placeholder="04xx xxx xxx"
                      value={row.phone}
                      onChange={(e) => updateRow(i, "phone", sanitizePhone(e.target.value))}
                    />
                  </td>

                  {/* House # */}
                  <td className="px-1.5 py-1">
                    <input
                      className={inputCls(false)}
                      placeholder="12"
                      value={row.houseNum}
                      onChange={(e) => updateRow(i, "houseNum", e.target.value)}
                      style={{ width: 52 }}
                    />
                  </td>

                  {/* Street */}
                  <td className="px-1.5 py-1">
                    <input
                      className={inputCls(false)}
                      placeholder="Street name"
                      value={row.street}
                      onChange={(e) => updateRow(i, "street", e.target.value)}
                    />
                  </td>

                  {/* Suburb */}
                  <td className="px-1.5 py-1">
                    <SuburbInput
                      value={row.suburb}
                      onChange={(v) => updateRow(i, "suburb", v)}
                      className={inputCls(!!rowError?.includes("Suburb"))}
                      placeholder="Suburb"
                    />
                  </td>

                  {/* Postcode */}
                  <td className="px-1.5 py-1">
                    <input
                      className={inputCls(false)}
                      placeholder="3000"
                      value={row.postcode}
                      onChange={(e) => updateRow(i, "postcode", e.target.value)}
                      style={{ width: 60 }}
                    />
                  </td>

                  {/* Renter/Owner */}
                  <td className="px-1.5 py-1">
                    <select
                      className={selectCls}
                      value={row.ownership}
                      onChange={(e) => updateRow(i, "ownership", e.target.value)}
                    >
                      <option value="">—</option>
                      <option>Renter</option>
                      <option>Owner</option>
                    </select>
                  </td>

                  {/* Superannuation */}
                  <td className="px-1.5 py-1">
                    <select
                      className={selectCls}
                      value={row.superannuation}
                      onChange={(e) => updateRow(i, "superannuation", e.target.value)}
                    >
                      <option value="">—</option>
                      {SUPER_OPTIONS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </td>

                  {/* Employment */}
                  <td className="px-1.5 py-1">
                    <select
                      className={selectCls}
                      value={row.employment}
                      onChange={(e) => updateRow(i, "employment", e.target.value)}
                    >
                      <option value="">—</option>
                      {EMPLOYMENT_OPTIONS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </td>

                  {/* Notes */}
                  <td className="px-1.5 py-1">
                    <input
                      className={inputCls(false)}
                      placeholder="Any notes about this lead..."
                      value={row.notes}
                      onChange={(e) => updateRow(i, "notes", e.target.value)}
                    />
                  </td>

                  {/* Rep */}
                  <td className="px-1.5 py-1">
                    <select
                      className={selectCls + (rowError?.includes("Rep") ? " border-red-500" : "")}
                      value={row.dqRep}
                      onChange={(e) => updateRow(i, "dqRep", Number(e.target.value))}
                    >
                      <option value="">— Rep —</option>
                      {activeReps.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                      {formerReps.length > 0 && (
                        <optgroup label="── Former ──">
                          {formerReps.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </td>

                  {/* Remove */}
                  <td className="px-1.5 py-1 text-center">
                    <button
                      onClick={() => removeRow(i)}
                      className="p-1 text-gray-400 hover:text-red-500 transition rounded"
                      title="Remove row"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-[var(--surface)] flex-shrink-0 gap-4">
        <button
          onClick={addRow}
          disabled={rows.length >= MAX_ROWS}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-white/[0.08] rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <Plus size={14} />
          Add Row
        </button>

        <div className="flex items-center gap-3">
          {filledCount > 0 && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {filledCount} lead{filledCount !== 1 ? "s" : ""} ready to import
            </span>
          )}
          {dupCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
              <AlertTriangle size={12} />
              {dupCount} duplicate address{dupCount !== 1 ? "es" : ""}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || filledCount === 0}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition text-sm ${lastSaved > 0 ? "bg-emerald-500 hover:bg-emerald-400" : "bg-amber-500 hover:bg-amber-400"}`}
          >
            {lastSaved > 0 ? (
              <><Check size={15} /> Imported ✓</>
            ) : saving ? (
              <><Loader2 size={15} className="animate-spin" /> Saving…</>
            ) : (
              `Import ${filledCount > 0 ? filledCount : ""} Lead${filledCount !== 1 ? "s" : ""}`
            )}
          </button>
        </div>
      </div></>)}
    </div>
  );
}

const fillInputCls = (hasError: boolean) =>
  `w-full px-3 py-2 rounded-lg border text-sm bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 ${
    hasError ? "border-red-400" : "border-gray-200 dark:border-white/[0.06]"
  }`;
const fillSelectCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.06] text-sm bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400";

const thCls =
  "px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-white/[0.06] whitespace-nowrap";
const inputCls = (hasError: boolean) =>
  `w-full px-2 py-1 rounded border text-sm bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400 ${
    hasError ? "border-red-400" : "border-gray-200 dark:border-white/[0.06]"
  }`;
const selectCls =
  "w-full px-2 py-1 rounded border border-gray-200 dark:border-white/[0.06] text-sm bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400";

export default DQImportPage;
