import { useState, useRef, useEffect, useCallback } from "react";
import { db } from "../lib/firebase";
import { collection, doc, setDoc, getDocs, query, where } from "firebase/firestore";
import { savePIAReport, loadPIAReportsByConsultant, uploadPIAPdf } from "../lib/piaReports";
import { useToast } from "../context/ToastContext";
import { useAppStore } from "../stores/appStore";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { StatusBadge } from "../components/ui/StatusBadge";
import { SkeletonCard } from "../components/ui/Skeleton";
import { EmptyCard } from "../components/ui/EmptyState";

interface PIAResult {
  propertyValue: number | null;
  loanAmount: number | null;
  repayments: number | null;
  rentalIncome: number | null;
  netPosition: number | null;
  timestamp: number;
  grossYield: number | null;
  netYield: number | null;
  equity: number | null;
  weeklyShortfall: number | null;
  strategy: string | null;
}

interface PIAReport {
  id: string;
  label: string;
  result: PIAResult;
  createdAt: number;
  isLocal: boolean;
  isCloud: boolean;
}

const fmtAUD = (v: number | null) => {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
};

const fmtDate = (ts: number) => {
  try {
    const d = new Date(ts);
    const now = new Date();
    const opts: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "short",
      ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    };
    return d.toLocaleDateString("en-AU", opts);
  } catch {
    return "—";
  }
};

function PIAReportCard({ report, expanded, onToggle }: { report: PIAReport; expanded: boolean; onToggle: () => void }) {
  const r = report.result;
  return (
    <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] overflow-hidden transition-colors hover:border-[#b8933a]">
      <div className="flex items-center">
        <button onClick={onToggle} className="flex-1 flex items-center gap-3 px-4 py-3 text-left">
          <span className="text-[var(--text-muted)] flex-shrink-0">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900/30 text-blue-400 flex-shrink-0">
            PIA
          </span>
          <StatusBadge isLocal={report.isLocal} isCloud={report.isCloud} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[var(--text-muted)]">{fmtDate(report.createdAt)}</p>
          </div>
          <div className="text-right flex-shrink-0 pr-1">
            <p className="text-sm font-semibold text-[#b8933a]">{fmtAUD(r.netPosition)}/wk</p>
            <p className="text-[10px] text-[var(--text-muted)]">net position</p>
          </div>
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-[var(--border)] pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-[var(--border)] opacity-50">
              <span className="text-[var(--text-muted)]">Property Value</span>
              <span className="font-medium text-[var(--text)]">{fmtAUD(r.propertyValue)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--border)] opacity-50">
              <span className="text-[var(--text-muted)]">Loan Amount</span>
              <span className="font-medium text-[var(--text)]">{fmtAUD(r.loanAmount)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--border)] opacity-50">
              <span className="text-[var(--text-muted)]">Repayments</span>
              <span className="font-medium text-[var(--text)]">{fmtAUD(r.repayments)}/mo</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[var(--border)] opacity-50">
              <span className="text-[var(--text-muted)]">Rental Income</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{fmtAUD(r.rentalIncome)}/yr</span>
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-2">
            {report.isLocal ? "Draft (unsaved)" : "Saved to cloud"} · {fmtDate(report.createdAt)}
          </p>
        </div>
      )}
    </div>
  );
}

// Map a cloud PIA doc (canonical schema from piaReports.ts) into the UI shape.
function cloudToUiReport(r: { id: string; label: string; clientName: string; inputs: Record<string, any>; createdAt: number }): PIAReport {
  return {
    id: r.id,
    label: r.label || (r.clientName ? `Client: ${r.clientName}` : "Untitled"),
    result: (r.inputs || {}) as PIAResult,
    createdAt: r.createdAt,
    isLocal: false,
    isCloud: true,
  };
}

// Dedup: cloud entries always win over local drafts that share createdAt+label.
function mergeReports(local: PIAReport[], cloud: PIAReport[]): PIAReport[] {
  const cloudKeys = new Set(cloud.map((r) => `${r.createdAt}|${r.label}`));
  const seenIds = new Set<string>();
  const result: PIAReport[] = [];
  for (const r of cloud) {
    if (seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    result.push(r);
  }
  for (const r of local) {
    if (cloudKeys.has(`${r.createdAt}|${r.label}`)) continue;
    if (seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    result.push(r);
  }
  result.sort((a, b) => b.createdAt - a.createdAt);
  return result;
}

function PIAPage() {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [piaResult, setPiaResult] = useState<PIAResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkedToClient, setLinkedToClient] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [lastSavedUrl, setLastSavedUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [reports, setReports] = useState<PIAReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const { currentUser, leads, reportToLoad, setReportToLoad, piaPrefillClientId, clearPiaPrefillContext } = useAppStore();

  // Refs for use inside stable closures
  const selectedClientIdRef = useRef<string | null>(null);
  const leadsRef = useRef(leads);
  const hydratedClientRef = useRef<string | null>(null);
  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-prefill from context if navigating from ClientProfilePage
  useEffect(() => {
    if (piaPrefillClientId && !selectedClientId) {
      setSelectedClientId(piaPrefillClientId);
      setLinkedToClient(true);
      clearPiaPrefillContext();
    }
  }, [piaPrefillClientId, selectedClientId, clearPiaPrefillContext]);

  // Send client data to PIA iframe via postMessage
  useEffect(() => {
    if (!loaded || !iframeRef.current) return;

    const timer = setTimeout(() => {
      try {
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "CRM_CONTEXT",
            payload: {
              source: "asg-crm",
              theme: "dark",
              userId: currentUser?.id ?? null,
              userName: currentUser?.name ?? null,
            },
          },
          window.location.origin,
        );
      } catch {
        // cross-origin — silently ignore
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [loaded, currentUser]);

  // Expose a method the CRM can call to load a specific client
  const loadClient = useCallback((clientData: { name?: string; income?: number; deposit?: number }) => {
    if (!iframeRef.current) return;
    try {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "LOAD_CLIENT",
          payload: {
            name: clientData.name ?? "",
            income: clientData.income ?? 0,
            deposit: clientData.deposit ?? 0,
          },
        },
        window.location.origin,
      );
    } catch {
      // cross-origin — silently ignore
    }
  }, []);

  // Make loadClient available globally via window
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__piaLoadClient = loadClient;
    return () => {
      delete (window as unknown as Record<string, unknown>).__piaLoadClient;
    };
  }, [loadClient]);

  // Keep refs in sync so closures always see latest values
  useEffect(() => { selectedClientIdRef.current = selectedClientId; }, [selectedClientId]);
  useEffect(() => { leadsRef.current = leads; }, [leads]);

  // Load local + cloud reports, merge, and deduplicate
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      setLoadingReports(true);
      try {
        // Load local reports from localStorage (legacy / offline drafts only)
        const localReportsJson = localStorage.getItem("piaReports") || "[]";
        const localReports: PIAReport[] = JSON.parse(localReportsJson).map((r: any) => ({
          ...r,
          isLocal: true,
          isCloud: false,
        }));

        // Load cloud reports through canonical lib (single schema)
        const cloud = await loadPIAReportsByConsultant(currentUser.name);
        const cloudReports: PIAReport[] = cloud.map(cloudToUiReport);

        setReports(mergeReports(localReports, cloudReports));
      } catch (err) {
        console.warn("[PIA] Failed to load reports:", err);
      } finally {
        setLoadingReports(false);
      }
    })();
  }, [currentUser]);

  // Load persisted state when client is selected or iframe becomes ready
  useEffect(() => {
    if (!selectedClientId || !loaded) return;
    if (hydratedClientRef.current === selectedClientId) return;
    hydratedClientRef.current = selectedClientId;

    (async () => {
      try {
        const q = query(
          collection(db, "calculatorStates"),
          where("clientId", "==", selectedClientId),
          where("type", "==", "pia"),
        );
        const snap = await getDocs(q);
        let state: Record<string, unknown> | null = null;

        if (!snap.empty) {
          state = snap.docs[0].data().state as Record<string, unknown>;
        } else {
          const client = (leadsRef.current || []).find(
            (l) => String(l.id) === String(selectedClientId),
          );
          if (client?.clientGroupId) {
            const gq = query(
              collection(db, "calculatorStates"),
              where("clientGroupId", "==", client.clientGroupId),
              where("type", "==", "pia"),
            );
            const gSnap = await getDocs(gq);
            if (!gSnap.empty) {
              state = gSnap.docs[0].data().state as Record<string, unknown>;
            }
          }
        }

        if (state) {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "RESTORE_STATE", payload: state },
            window.location.origin,
          );
        }
      } catch (err) {
        console.warn("[PIA] Failed to load state:", err);
      }
    })();
  }, [selectedClientId, loaded]);

  // Memoize selected client lookup
  const selectedClient = (leads || []).find(
    (l) => String(l.id) === String(selectedClientId)
  ) || null;

  // Listen for messages from the iframe (PIA_READY and PIA_RESULT)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (!e.data || typeof e.data !== "object") return;

      if (e.data.type === "PIA_READY") {
        setLoaded(true);
        return;
      }

      if (e.data.type === "PIA_STATE") {
        const payload = e.data.payload;
        if (!payload || typeof payload !== "object") return;
        const clientId = selectedClientIdRef.current;
        if (!clientId) return;
        if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current);
        saveStateTimerRef.current = setTimeout(async () => {
          try {
            const client = (leadsRef.current || []).find(
              (l) => String(l.id) === String(clientId),
            );
            await setDoc(
              doc(db, "calculatorStates", `pia_${clientId}`),
              {
                clientId,
                clientGroupId: client?.clientGroupId ?? null,
                type: "pia",
                state: payload,
                updatedAt: Date.now(),
              },
              { merge: true },
            );
          } catch (err) {
            console.warn("[PIA] Failed to save state:", err);
          }
        }, 500);
        return;
      }

      if (e.data.type === "PIA_RESULT") {
        try {
          const payload = e.data.payload;
          if (!payload || typeof payload !== "object") return;

          setPiaResult({
            propertyValue: typeof payload.propertyValue === "number" ? payload.propertyValue : null,
            loanAmount: typeof payload.loanAmount === "number" ? payload.loanAmount : null,
            repayments: typeof payload.repayments === "number" ? payload.repayments : null,
            rentalIncome: typeof payload.rentalIncome === "number" ? payload.rentalIncome : null,
            netPosition: typeof payload.netPosition === "number" ? payload.netPosition : null,
            timestamp: typeof payload.timestamp === "number" ? payload.timestamp : Date.now(),
            grossYield: typeof payload.grossYield === "number" ? payload.grossYield : null,
            netYield: typeof payload.netYield === "number" ? payload.netYield : null,
            equity: typeof payload.equity === "number" ? payload.equity : null,
            weeklyShortfall: typeof payload.weeklyShortfall === "number" ? payload.weeklyShortfall : null,
            strategy: typeof payload.strategy === "string" ? payload.strategy : null,
          });
        } catch (err) {
          console.warn("[PIAPage] Error parsing PIA_RESULT:", err);
        }
        return;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Fallback timeout: if iframe doesn't signal ready, show after 3s
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded) setLoaded(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [loaded]);

  // Load saved report into calculator if available
  useEffect(() => {
    if (!loaded || !reportToLoad || !iframeRef.current) return;

    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "RESTORE_STATE", payload: reportToLoad },
        window.location.origin,
      );
      showToast("✅ Report loaded into calculator", "success");
      setReportToLoad(null);
    } catch (err) {
      console.warn("[PIA] Failed to load report into calculator:", err);
    }
  }, [loaded, reportToLoad, setReportToLoad, showToast]);

  // Auto-load selected client data into PIA iframe
  useEffect(() => {
    if (!linkedToClient) return;
    if (!selectedClientId) return;
    if (!iframeRef.current || !loaded) return;

    const selectedClient = (leads || []).find(
      (l) => String(l.id) === String(selectedClientId)
    );

    if (!selectedClient) return;

    try {
      (window as any).__piaLoadClient?.({
        name: selectedClient.name ?? "",
        income: selectedClient.income ?? 0,
        deposit: selectedClient.deposit ?? 0,
      });
    } catch {
      // silent fail
    }
  }, [selectedClientId, linkedToClient, leads, loaded]);

  // Save result to Firestore via canonical savePIAReport
  const handleSave = useCallback(async () => {
    if (!piaResult) return;
    if (!currentUser) {
      showToast("Not logged in — cannot save", "error");
      return;
    }

    setSaving(true);
    try {
      // Request PDF export from iframe — leak-proof: cleanup runs on success AND timeout.
      let pdfBlob: Blob | null = null;
      try {
        pdfBlob = await new Promise<Blob>((resolve, reject) => {
          let settled = false;
          const cleanup = () => {
            settled = true;
            clearTimeout(timeout);
            window.removeEventListener("message", handler);
          };
          const handler = (e: MessageEvent) => {
            if (settled) return;
            if (e.source !== iframeRef.current?.contentWindow) return;
            if (e.data?.type !== "PIA_PDF") return;
            cleanup();
            resolve(e.data.blob as Blob);
          };
          const timeout = setTimeout(() => {
            if (settled) return;
            cleanup();
            reject(new Error("PDF timeout"));
          }, 5000);

          window.addEventListener("message", handler);

          iframeRef.current?.contentWindow?.postMessage(
            { type: "EXPORT_PDF" },
            window.location.origin,
          );
        });
      } catch (err) {
        console.warn("[PIA] PDF export failed", err);
        pdfBlob = null;
      }

      let pdfUrl: string | null = null;
      if (pdfBlob) {
        pdfUrl = await uploadPIAPdf(pdfBlob, currentUser.name);
      }

      const createdAt = Date.now();
      const label = selectedClient?.name ? `Client: ${selectedClient.name}` : "Untitled";

      const newId = await savePIAReport({
        consultantName: currentUser.name,
        clientName: selectedClient?.name ?? "",
        clientId: selectedClientId ?? null,
        clientGroupId: selectedClient?.clientGroupId ?? null,
        label,
        inputs: piaResult as unknown as Record<string, any>,
        pdfUrl,
        createdAt,
      });

      if (!newId) {
        showToast("Failed to save report", "error");
        return;
      }

      if (pdfUrl) setLastSavedUrl(pdfUrl);

      // Optimistic insert so the saved report appears immediately, with the real Firestore id.
      const newReport: PIAReport = {
        id: newId,
        label,
        result: piaResult,
        createdAt,
        isLocal: false,
        isCloud: true,
      };
      setReports((prev) => mergeReports(
        prev.filter((r) => r.isLocal),
        [newReport, ...prev.filter((r) => r.isCloud && r.id !== newId)],
      ));

      showToast(pdfUrl ? "✅ PIA report saved" : "✅ Saved (PDF unavailable)", "success");

      // Authoritative refresh from Firestore (single canonical query)
      try {
        const cloud = await loadPIAReportsByConsultant(currentUser.name);
        const cloudReports: PIAReport[] = cloud.map(cloudToUiReport);
        const localReportsJson = localStorage.getItem("piaReports") || "[]";
        const localReports: PIAReport[] = JSON.parse(localReportsJson).map((r: any) => ({
          ...r,
          isLocal: true,
          isCloud: false,
        }));
        setReports(mergeReports(localReports, cloudReports));
      } catch (err) {
        console.warn("[PIA] Post-save refresh failed:", err);
      }
    } catch (err) {
      console.error("[PIAPage] Failed to save report:", err);
      showToast("Failed to save report", "error");
    } finally {
      setSaving(false);
    }
  }, [piaResult, currentUser, showToast, selectedClientId, selectedClient]);

  // Ctrl+wheel to zoom iframe only
  useEffect(() => {
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setScale((prev) => clamp(prev + delta, 0.75, 1.5));
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  // Pinch to zoom iframe only
  useEffect(() => {
    const container = iframeContainerRef.current;
    if (!container) return;
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    let lastDist = 0;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        lastDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const delta = (dist - lastDist) / 200;
      lastDist = dist;
      setScale((prev) => clamp(prev + delta, 0.75, 1.5));
    };
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  // Toggle report expansion
  const handleToggleReport = (reportId: string) => {
    setExpandedReportId(expandedReportId === reportId ? null : reportId);
  };

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg)] text-[var(--text)] overflow-hidden">
      {/* Page Header */}
      <header className="flex-shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(184,147,58,0.15)" }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#b8933a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-[var(--text)] leading-tight">PIA Calculator</h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Property investment analysis</p>
            </div>
          </div>

          {/* Save button + result summary */}
          <div className="flex items-center gap-3">
            {piaResult && (
              <div className="hidden sm:flex items-center gap-4 text-xs text-[var(--text-muted)]">
                <span>
                  Value: <span className="text-[#b8933a] font-semibold">{fmtAUD(piaResult.propertyValue)}</span>
                </span>
                <span>
                  Net: <span className="text-[#b8933a] font-semibold">{fmtAUD(piaResult.netPosition)}/wk</span>
                </span>
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={!piaResult || saving || (linkedToClient && !selectedClientId)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#b8933a" }}
            >
              {saving ? (
                <>
                  <svg
                    className="w-3.5 h-3.5 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </button>
            {lastSavedUrl && (
              <button
                onClick={() => window.open(lastSavedUrl, "_blank")}
                className="ml-2 text-xs underline text-[#b8933a] hover:opacity-80 transition"
              >
                View last report
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Select Client to Link — Primary workflow */}
      <div className="flex-shrink-0 bg-[var(--surface)] px-4 sm:px-6 py-3">
        <div className="border border-[var(--border)] rounded-xl p-3 mb-4">
          <label className="text-xs sm:text-sm font-medium text-[var(--text)] block mb-2">Select Client to Link</label>
          <select
            value={selectedClientId || ""}
            onChange={(e) => {
              const clientId = e.target.value || null;
              setSelectedClientId(clientId);
              if (clientId) {
                setLinkedToClient(true);
              }
            }}
            className="w-full px-3 py-2 rounded-lg text-xs sm:text-sm border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[#b8933a]"
          >
            <option value="">Select a client…</option>
            {(leads || []).map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mt-1.5">Fields will auto-fill once a client is selected</p>
          {selectedClient && linkedToClient && (
            <div className="mt-2 text-xs text-green-500">
              ✔ Linked to: <span className="font-medium">{selectedClient.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Result summary bar (mobile) */}
      {piaResult && (
        <div className="flex-shrink-0 sm:hidden bg-[var(--surface)] border-b border-[var(--border)] px-4 py-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>
              Value: <span className="text-[#b8933a] font-semibold">{fmtAUD(piaResult.propertyValue)}</span>
            </span>
            <span>
              Net: <span className="text-[#b8933a] font-semibold">{fmtAUD(piaResult.netPosition)}/wk</span>
            </span>
          </div>
        </div>
      )}

      {/* Content Area: Calculator + Reports */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Calculator Section */}
        <div className="flex-1 relative overflow-hidden">
          {/* Loading overlay */}
          {!loaded && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg)]">
              <div className="text-center">
                <div
                  className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
                  style={{ borderColor: "#b8933a", borderTopColor: "transparent" }}
                />
                <p className="text-sm text-[var(--text-muted)]">Loading PIA Calculator…</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {hasError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg)]">
              <div className="text-center max-w-sm px-6">
                <div className="text-3xl mb-3">⚠️</div>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  Failed to load the PIA Calculator. Please try refreshing the page.
                </p>
                <button
                  onClick={() => {
                    setHasError(false);
                    setLoaded(false);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: "#b8933a" }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Iframe — wrapped for independent scaling */}
          <div ref={iframeContainerRef} className="absolute inset-0 overflow-hidden">
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top center",
                width: "100%",
                height: "100%",
              }}
            >
              <iframe
                ref={iframeRef}
                src="/pia/index.html"
                title="PIA Calculator"
                className="w-full h-full border-0"
                style={{
                  opacity: loaded ? 1 : 0,
                  transition: "opacity 0.4s ease-in-out",
                  background: "var(--bg)",
                }}
                onLoad={() => {
                  // The iframe will postMessage when ready; fallback handles the rest
                }}
                onError={() => setHasError(true)}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>
          </div>
        </div>

        {/* Reports Section */}
        <div className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--surface)] overflow-y-auto" style={{ maxHeight: "280px" }}>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={14} className="text-blue-400" />
              <h3 className="text-xs font-semibold text-[var(--text)] uppercase tracking-wide">
                PIA Reports
              </h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--border)] text-[var(--text-muted)]">
                {reports.length}
              </span>
            </div>

            {loadingReports && <SkeletonCard />}

            {!loadingReports && reports.length === 0 && (
              <EmptyCard
                title="No reports yet"
                description="Save a calculation to get started"
              />
            )}

            {!loadingReports && reports.length > 0 && (
              <div className="space-y-2">
                {reports.map((r) => (
                  <PIAReportCard
                    key={r.id}
                    report={r}
                    expanded={expandedReportId === r.id}
                    onToggle={() => handleToggleReport(r.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PIAPage;
