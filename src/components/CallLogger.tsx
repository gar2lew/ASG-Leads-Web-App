import { useState, useCallback, useMemo } from "react";
import { Lead, CallResult } from "../types";
import { useAppStore } from "../stores/appStore";
import { useCreateDeal } from "../hooks/useFirebase";
import { formatDateTime } from "../lib/utils";
import { todayInPerth } from "../lib/workflowState";
import { X, CheckCircle } from "lucide-react";

interface CallLoggerProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
  onSave: (lead: Lead) => boolean | void | Promise<boolean | void>;
}

/**
 * Call Logger Modal
 *
 * Simplified call logging with standardised results.
 * - Always shows: result dropdown, notes
 * - Conditionally shows: booking date/time (booked), callback date/time (callback)
 * - When result === "booked": creates a Deal document and links it via lead.dealId
 * - No appointment creation logic
 */
export function CallLogger({ lead, isOpen, onClose, onSave }: CallLoggerProps) {
  const { reps, currentUser } = useAppStore();
  const { create: createDeal, loading: dealCreating } = useCreateDeal();

  const [result, setResult] = useState<CallResult>("no_answer");
  const [notes, setNotes] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [callingRep, setCallingRep] = useState<number>(currentUser?.id || reps[0]?.id || 1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const clearErrors = useCallback((...fields: string[]) => {
    setErrors((prev) => {
      if (fields.length === 0) return {};
      const next = { ...prev };
      fields.forEach((field) => delete next[field]);
      return next;
    });
  }, []);

  const callResultsMap = useMemo(
    () => ({
      connected: {
        label: "✅ Connected",
        requiresFields: ["notes"],
      },
      no_answer: {
        label: "📞 No Answer",
        requiresFields: ["notes"],
      },
      callback: {
        label: "📅 Call Back",
        requiresFields: ["callbackDate", "callbackTime", "notes"],
      },
      booked: {
        label: "📋 Booked",
        requiresFields: ["bookingDate", "bookingTime", "notes"],
      },
      not_interested: {
        label: "❌ Not Interested",
        requiresFields: ["notes"],
      },
      wrong_number: {
        label: "😶 Wrong Number",
        requiresFields: [],
      },
    }),
    [],
  );

  const activeReps = useMemo(() => reps.filter((r) => r.active), [reps]);

  const handleClose = useCallback(() => {
    setResult("no_answer");
    setNotes("");
    setBookingDate("");
    setBookingTime("");
    setCallbackDate("");
    setCallbackTime("");
    setErrors({});
    onClose();
  }, [onClose]);

  const handleResultChange = useCallback(
    (nextResult: CallResult) => {
      setResult(nextResult);
      clearErrors();
      if (nextResult === "callback" && !callbackDate) {
        setCallbackDate(todayInPerth());
      }
    },
    [callbackDate, clearErrors],
  );

  // Validation
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (result === "booked" && !bookingDate) {
      newErrors.bookingDate = "Booking date required";
    }
    if (result === "booked" && !bookingTime) {
      newErrors.bookingTime = "Booking time required";
    }
    if (result === "callback" && !callbackDate) {
      newErrors.callbackDate = "Callback date required";
    }
    if (result === "callback" && !callbackTime) {
      newErrors.callbackTime = "Callback time required";
    }

    // Validate times are HH:MM format
    if (bookingTime && !/^\d{2}:\d{2}$/.test(bookingTime)) {
      newErrors.bookingTime = "Time must be HH:MM format";
    }
    if (callbackTime && !/^\d{2}:\d{2}$/.test(callbackTime)) {
      newErrors.callbackTime = "Time must be HH:MM format";
    }

    // Validate dates are YYYY-MM-DD format
    if (bookingDate && !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
      newErrors.bookingDate = "Date must be YYYY-MM-DD format";
    }
    if (callbackDate && !/^\d{4}-\d{2}-\d{2}$/.test(callbackDate)) {
      newErrors.callbackDate = "Date must be YYYY-MM-DD format";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [result, bookingDate, bookingTime, callbackDate, callbackTime]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!validate() || saving) return;
    setSaving(true);

    const now = new Date();
    const dateStr = todayInPerth(now);
    const timeStr = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Perth",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    const repName = reps.find((r) => r.id === callingRep)?.name || "Unknown";

    // Status mapping: CallResult → LeadStatus
    const statusMap: Record<CallResult, string> = {
      connected: "contacted",
      no_answer: "new",
      callback: "Revisit",
      booked: "booked",
      not_interested: "lost",
      wrong_number: "lost",
    };

    // Build updated lead
    const updatedLead: Lead = {
      ...lead,
      result,
      notes,
      lastCall: now.toISOString(),
      callingRep,
      status: statusMap[result] ?? "new",
      ...(result === "booked" && {
        bookingDate,
        bookingTime,
        appointmentDate: bookingDate,
        appointmentTime: bookingTime,
      }),
      ...(result === "callback" && { callbackDate, callbackTime }),
      // Append to call history (append-only)
      callHistory: [
        ...(lead.callHistory || []),
        {
          date: dateStr,
          time: timeStr,
          rep: repName,
          repId: callingRep,
          result,
          notes,
        },
      ],
    };

    // If booked, create a Deal document only if one doesn't already exist
    if (result === "booked") {
      if (lead.dealId) {
        // Deal already exists — just link it
        updatedLead.dealId = lead.dealId;
      } else {
        const dealId = await createDeal({
          leadId: lead.id,
          clientName: lead.name,
          assignedTo: callingRep,
          dealValue: lead.dealValue,
        });

        if (dealId) {
          updatedLead.dealId = dealId;
        }
      }
    }

    try {
      const ok = await onSave(updatedLead);
      if (ok !== false) handleClose();
    } finally {
      setSaving(false);
    }
  }, [
    validate,
    saving,
    lead,
    result,
    notes,
    bookingDate,
    bookingTime,
    callbackDate,
    callbackTime,
    callingRep,
    reps,
    onSave,
    createDeal,
    handleClose,
  ]);

  if (!isOpen) return null;

  const inputCls = (hasError: boolean) =>
    `w-full min-h-11 px-3 py-2 rounded-lg border ${hasError ? "border-red-500" : "border-gray-300 dark:border-white/[0.08]"} bg-white dark:bg-[var(--surface)] text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400`;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={handleClose} aria-hidden="true" />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <div className="bg-white dark:bg-[var(--surface)] rounded-t-xl sm:rounded-xl shadow-xl w-full max-w-md max-h-[calc(100dvh-env(safe-area-inset-top))] sm:max-h-[90vh] overflow-y-auto overscroll-contain">
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-[var(--surface)] border-b border-gray-200 dark:border-white/[0.06] px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Log Call</h2>
            <button
              onClick={handleClose}
              className="min-h-11 min-w-11 p-2 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded transition"
              aria-label="Close call logger"
            >
              <X size={20} />
            </button>
          </div>

          {/* Lead Info */}
          <div className="px-4 sm:px-6 py-4 bg-gray-50 dark:bg-[var(--surface)] border-b border-gray-200 dark:border-white/[0.06]">
            <p className="font-semibold text-gray-900 dark:text-white">{lead.name}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{lead.phone}</p>
            {lead.lastCall && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Last called: {formatDateTime(lead.lastCall.split("T")[0], "")}
              </p>
            )}
          </div>

          {/* Form */}
          <div className="px-4 sm:px-6 py-4 space-y-4">
            {/* Call Result — always shown */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Call Result *</label>
              <select
                value={result}
                onChange={(e) => handleResultChange(e.target.value as CallResult)}
                className={inputCls(false)}
              >
                {Object.entries(callResultsMap).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Booking Date (only for booked) */}
            {result === "booked" && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Booking Date *</label>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => {
                    setBookingDate(e.target.value);
                    clearErrors("bookingDate");
                  }}
                  className={inputCls(!!errors.bookingDate)}
                />
                {errors.bookingDate && <p className="text-xs text-red-500 mt-1">{errors.bookingDate}</p>}
              </div>
            )}

            {/* Booking Time (only for booked) */}
            {result === "booked" && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Booking Time *</label>
                <input
                  type="time"
                  value={bookingTime}
                  onChange={(e) => {
                    setBookingTime(e.target.value);
                    clearErrors("bookingTime");
                  }}
                  className={inputCls(!!errors.bookingTime)}
                />
                {errors.bookingTime && <p className="text-xs text-red-500 mt-1">{errors.bookingTime}</p>}
              </div>
            )}

            {/* Callback Date (only for callback) */}
            {result === "callback" && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Callback Date *
                </label>
                <input
                  type="date"
                  value={callbackDate}
                  onChange={(e) => {
                    setCallbackDate(e.target.value);
                    clearErrors("callbackDate");
                  }}
                  className={inputCls(!!errors.callbackDate)}
                />
                {errors.callbackDate && <p className="text-xs text-red-500 mt-1">{errors.callbackDate}</p>}
              </div>
            )}

            {/* Callback Time (only for callback) */}
            {result === "callback" && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Callback Time *
                </label>
                <input
                  type="time"
                  value={callbackTime}
                  onChange={(e) => {
                    setCallbackTime(e.target.value);
                    clearErrors("callbackTime");
                  }}
                  className={inputCls(!!errors.callbackTime)}
                />
                {errors.callbackTime && <p className="text-xs text-red-500 mt-1">{errors.callbackTime}</p>}
              </div>
            )}

            {/* Calling Rep (for booked) */}
            {result === "booked" && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Calling Rep</label>
                <select
                  value={callingRep}
                  onChange={(e) => setCallingRep(Number(e.target.value))}
                  className={inputCls(false)}
                >
                  {activeReps.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Notes — always shown */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Call Notes</label>
              <textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  clearErrors("notes");
                }}
                placeholder="Any extra notes?"
                rows={4}
                className={`${inputCls(!!errors.notes)} min-h-[6.5rem] resize-y`}
              />
              {errors.notes && <p className="text-xs text-red-500 mt-1">{errors.notes}</p>}
            </div>

            {/* Call History */}
            {lead.callHistory && lead.callHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Recent Call History</h3>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {lead.callHistory.slice(-3).map((call, idx) => (
                    <div key={idx} className="p-2 bg-gray-50 dark:bg-[var(--surface)] rounded text-xs">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {call.result?.replace(/_/g, " ")} — {call.rep}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">
                        {call.date} {call.time}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400 mt-1">{call.notes}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Booked info */}
            {result === "booked" && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  <strong>Booked</strong> will create a new deal in the <strong>Deal Pipeline</strong> with status{" "}
                  <strong>Lead</strong>. The lead will be linked via <code>dealId</code>.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 dark:bg-[var(--surface)] border-t border-gray-200 dark:border-white/[0.06] px-4 sm:px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleClose}
              className="min-h-11 flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition font-medium text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || dealCreating}
              className="min-h-11 flex-1 px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium flex items-center justify-center gap-2 text-sm"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle size={16} />
              )}
              {saving ? "Saving…" : "Save Call"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default CallLogger;
