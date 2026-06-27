import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Lead, FilterOptions, LeadStatus } from "../types";
import { LEAD_STATUS_OPTIONS, getStatusColor, normalizeLeadStatus } from "../lib/statusConfig";
import { useAppStore } from "../stores/appStore";
import { useToast } from "../context/ToastContext";
import { Phone, Clock, Eye, ChevronDown, ChevronRight, Columns, Bookmark } from "lucide-react";
import { formatDateSmart, formatDateRelative, formatDateFull, timeAgo } from "../lib/dates";import { getNextAction, ACTION_COLORS } from "../lib/nextAction";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { deriveStatusTabCounts, getWorkflowState, matchesStatusTab } from "../lib/workflowState";

interface DataTableProps {
  leads: Lead[];
  loading?: boolean;
  onSelectLead: (lead: Lead) => void;
  onAddCall: (lead: Lead) => void;
  onDeleteLead: (lead: Lead) => void;
  onBulkDeleteLeads?: (leads: Lead[]) => void;
  onUpdateLead: (lead: Lead) => void;
  onNextAction?: (lead: Lead) => void;
  flashedLeadId?: number | null;
  currentUserId?: number;
  isAdmin?: boolean;
  loadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  forceAllTab?: boolean;
}

// ── Skeleton row (shown during initial Firestore load) ────────────────────────
function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td className="pl-4 pr-2 py-3">
        <div className="w-4 h-4 rounded skeleton-shimmer" />
      </td>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div className={`h-3 rounded skeleton-shimmer ${i === 0 ? "w-32" : i === 1 ? "w-24" : "w-20"}`} />
        </td>
      ))}
      <td className="px-3 py-3">
        <div className="w-16 h-3 rounded skeleton-shimmer" />
      </td>
    </tr>
  );
}

function SkeletonCard() {
  return (
    <div className="p-4 border-b border-[var(--border)]">
      <div className="flex items-center justify-between mb-2">
        <div className="h-4 w-36 rounded skeleton-shimmer" />
        <div className="h-5 w-16 rounded-full skeleton-shimmer" />
      </div>
      <div className="h-3 w-28 rounded skeleton-shimmer mb-1" />
      <div className="h-3 w-24 rounded skeleton-shimmer" />
    </div>
  );
}

interface DateGroup {
  dateKey: string;
  label: string;
  leads: Lead[];
}

interface FilterPreset {
  name: string;
  search: string;
  repId?: number;
  suburb?: string;
  tab: LeadStatus | "all";
}

function loadSavedFilters(): FilterOptions {
  try {
    return JSON.parse(localStorage.getItem("asgLeadFilters") || "{}");
  } catch {
    return {};
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

const STATUS_TABS: { label: string; value: LeadStatus | "all" }[] = [
  { label: "All Leads", value: "all" },
  { label: "DQ", value: "DQ" },
  { label: "No Answer", value: "No Answer" },
  { label: "Revisit", value: "Revisit" },
  { label: "Booked", value: "Booked" },
  { label: "Not Interested", value: "Not Interested" },
  { label: "Wrong Number", value: "Wrong Number" },
];

// Columns that can be toggled (Name and Action always visible)
const COLUMNS: { key: string; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "phone", label: "Contact" },
  { key: "address", label: "Address" },
  { key: "ownership", label: "Renter/Owner" },
  { key: "super", label: "Super" },
  { key: "lastContact", label: "Last Contact" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
  { key: "lastCall", label: "Last Call" },
];

/** Returns inline styles for a status badge using the hex colour from settings. */
function statusBadgeStyle(hex: string): React.CSSProperties {
  return {
    backgroundColor: hex + "26",
    color: hex,
    border: `1px solid ${hex}55`,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAddress(lead: Lead): string {
  return [lead.houseNum, lead.street, lead.suburb, lead.postcode].filter(Boolean).join(" ") || "—";
}

/** Normalise any common date string to YYYY-MM-DD so grouping works correctly.
 *  Handles: YYYY-MM-DD (passthrough), DD/MM/YYYY, D/M/YYYY, generic JS-parseable strings.
 *  Returns 'No Date' when the value can't be interpreted. */
function normalizeDateKey(dateStr: string | undefined | null): string {
  if (!dateStr) return "No Date";
  const s = String(dateStr).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Full ISO timestamp e.g. "2026-03-31T14:30:00.000Z" — slice directly to avoid UTC offset shifting the date
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY or D/M/YYYY (common AU format)
  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // DD-MM-YYYY
  const dmyDashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDashMatch) {
    const [, d, m, y] = dmyDashMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Firestore Timestamp seconds (number-like string)
  if (/^\d{10}$/.test(s)) {
    const d = new Date(parseInt(s) * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  // Generic JS parse fallback
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return "No Date";
}

function formatGroupDate(isoDate: string): string {
  const longDate = formatDateFull(isoDate);
  const relative = formatDateRelative(isoDate);
  if (relative === "-" || relative === isoDate) return longDate;
  return `${relative}  ·  ${longDate}`;
}

// Street-type words often found in dirty suburb fields — excluded from suburb filter
const STREET_TYPE_WORDS = new Set([
  "way",
  "drive",
  "road",
  "rd",
  "st",
  "street",
  "ave",
  "avenue",
  "crescent",
  "cres",
  "ct",
  "court",
  "close",
  "cl",
  "place",
  "pl",
  "loop",
  "lp",
  "rise",
  "parade",
  "pde",
  "boulevard",
  "blvd",
  "bvd",
  "circuit",
  "cct",
  "pass",
  "grove",
  "gardens",
  "terrace",
  "tce",
  "view",
  "mews",
  "chase",
  "lane",
  "turn",
  "bend",
  "head",
  "hill",
  "ridge",
  "park",
  "vale",
  "vista",
  "springs",
  "heights",
  "brook",
  "crossing",
  "ramble",
  "harbour",
  "bay",
  "green",
  "waters",
  "reserve",
  "promenade",
  "grange",
  "approach",
  "approch",
  "entrance",
  "ent",
  "alley",
  "walk",
  "row",
  "run",
  "link",
  "address",
  "sg",
  "b",
  "av",
  "dr",
  "grn",
  "tce",
  "pde",
  "bvd",
  "drv",
  "cct",
  "grv",
  "hwy",
]);

/** Max rows rendered per date group before showing "Load more" button.
 *  Keeps DOM node count low — only expands when user explicitly requests more. */
const ROWS_PER_GROUP = 100;

// ── Component ─────────────────────────────────────────────────────────────────

export function DataTable({
  leads,
  loading = false,
  onSelectLead,
  onAddCall,
  onDeleteLead,
  onBulkDeleteLeads,
  onUpdateLead,
  onNextAction,
  flashedLeadId,
  currentUserId,
  isAdmin,
  loadMore,
  hasMore,
  loadingMore,
  forceAllTab,
}: DataTableProps) {
  const { reps, statusColors } = useAppStore();
  const { showToast } = useToast();

  const [sortBy, setSortBy] = useState<keyof Lead>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [myLeadsOnly, setMyLeadsOnly] = useState<boolean>(() => {
    const stored = localStorage.getItem("asgMyLeadsOnly");
    if (stored !== null) return stored === "true";
    return !isAdmin; // default: non-admins see only their leads
  });
  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem("asgLeadSearch") ?? ""); // debounced — used for actual filtering
  const [searchInput, setSearchInput] = useState(() => localStorage.getItem("asgLeadSearch") ?? ""); // live input value shown in the box
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sentinelDesktopRef = useRef<HTMLDivElement>(null);
  const sentinelMobileRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasMoreRef = useRef(hasMore ?? true);
  useEffect(() => { hasMoreRef.current = hasMore ?? true; }, [hasMore]);

  useEffect(() => {
    if (!loadMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        Promise.resolve(loadMore()).finally(() => {
          if (hasMoreRef.current) observer.observe(entry.target);
        });
      },
      { root: null, rootMargin: "200px", threshold: 0 },
    );
    observerRef.current = observer;
    if (sentinelDesktopRef.current) observer.observe(sentinelDesktopRef.current);
    if (sentinelMobileRef.current) observer.observe(sentinelMobileRef.current);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [loadMore]);
  const [filters, setFilters] = useState<FilterOptions>(() => loadSavedFilters());
  const [currentTab, setCurrentTab] = useState<LeadStatus | "all">(() => {
    const stored = localStorage.getItem("asgActiveTab");
    return stored === "all" ? "all" : (normalizeLeadStatus(stored) as LeadStatus);
  });
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>("DQ");
  const [bulkRep, setBulkRep] = useState<number | "">("");
  const [bulkDate, setBulkDate] = useState("");
  const [bulkCallbackDate, setBulkCallbackDate] = useState("");
  const [bulkCallbackTime, setBulkCallbackTime] = useState("09:00");
  const [bulkFollowUpDate, setBulkFollowUpDate] = useState("");
  const [bulkSuburb, setBulkSuburb] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupSortOrder, setGroupSortOrder] = useState<"newest" | "oldest">("newest");
  const [groupShowAll, setGroupShowAll] = useState<Set<string>>(new Set());
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<number, string>>({});
  const [optimisticCallbackDates, setOptimisticCallbackDates] = useState<Record<number, string>>({});
  const [conflictStatuses, setConflictStatuses] = useState<Record<number, boolean>>({});
  const { hasPendingWrites } = useNetworkStatus();

  useEffect(() => {
    if (hasPendingWrites) return;
    setConflictStatuses((prev) => {
      const next: Record<number, boolean> = {};
      leads.forEach((lead) => {
        const optimistic = optimisticStatuses[lead.id];
        if (optimistic !== undefined && optimistic !== lead.status) {
          next[lead.id] = true;
        }
      });
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (
        prevKeys.length === nextKeys.length &&
        nextKeys.every((k) => prev[Number(k)] === next[Number(k)])
      ) {
        return prev;
      }
      return next;
    });
  }, [leads, optimisticStatuses, hasPendingWrites]);

  useEffect(() => {
    setOptimisticStatuses((prev) => {
      const next = { ...prev };
      leads.forEach((lead) => {
        if (next[lead.id] === lead.status) {
          delete next[lead.id];
        }
      });
      return next;
    });
  }, [leads]);

  useEffect(() => {
    setOptimisticCallbackDates((prev) => {
      const next = { ...prev };
      leads.forEach((lead) => {
        if (next[lead.id] !== undefined && next[lead.id] === lead.callbackDate) {
          delete next[lead.id];
        }
      });
      return next;
    });
  }, [leads]);

  // ── Feature 3: Column visibility ───────────────────────────────────────────
  const [colVis, setColVis] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("asgColVis") || "{}");
    } catch {
      return {};
    }
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  const isColVisible = (key: string) => colVis[key] !== false; // default true

  const toggleCol = (key: string) => {
    const next = { ...colVis, [key]: !isColVisible(key) };
    setColVis(next);
    localStorage.setItem("asgColVis", JSON.stringify(next));
  };

  // Persist myLeadsOnly to localStorage
  useEffect(() => {
    localStorage.setItem("asgMyLeadsOnly", String(myLeadsOnly));
  }, [myLeadsOnly]);

  // Persist active tab to localStorage
  useEffect(() => {
    localStorage.setItem("asgActiveTab", currentTab);
  }, [currentTab]);

  useEffect(() => {
    if (forceAllTab) setCurrentTab("all");
  }, [forceAllTab]);

  useEffect(() => {
    localStorage.setItem("asgLeadSearch", searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    localStorage.setItem("asgLeadFilters", JSON.stringify(filters));
  }, [filters]);

  // Close col menu on outside click
  useEffect(() => {
    if (!colMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colMenuOpen]);

  // Dynamic column count for group header colSpan
  const totalCols = 2 + COLUMNS.filter((c) => isColVisible(c.key)).length + 1; // checkbox + name + visible cols + action

  // ── Feature 2: Undo state ──────────────────────────────────────────────────
  const [undoSnapshot, setUndoSnapshot] = useState<Lead[] | null>(null);
  const [undoLabel, setUndoLabel] = useState("Bulk change");
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUndoTimer = useCallback(() => {
    if (!undoTimerRef.current) return;
    clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
  }, []);

  useEffect(() => clearUndoTimer, [clearUndoTimer]);

  // ── Feature 4: Filter presets ──────────────────────────────────────────────
  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("asgFilterPresets") || "[]");
    } catch {
      return [];
    }
  });
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const presetMenuRef = useRef<HTMLDivElement>(null);

  // Close preset menu on outside click
  useEffect(() => {
    if (!presetMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
        setPresetMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [presetMenuOpen]);

  const savePreset = useCallback(() => {
    if (!presetName.trim()) return;
    const preset: FilterPreset = {
      name: presetName.trim(),
      search: searchTerm,
      repId: filters.repId,
      suburb: filters.suburb,
      tab: currentTab,
    };
    const next = [...presets, preset];
    setPresets(next);
    localStorage.setItem("asgFilterPresets", JSON.stringify(next));
    setSavingPreset(false);
    setPresetName("");
    showToast(`📌 Preset "${preset.name}" saved`, "success");
  }, [presetName, searchTerm, filters, currentTab, presets, showToast]);

  const applyPreset = useCallback((p: FilterPreset) => {
    setSearchTerm(p.search);
    setFilters({ repId: p.repId, suburb: p.suburb });
    setCurrentTab(p.tab);
    setPresetMenuOpen(false);
  }, []);

  const deletePreset = useCallback(
    (i: number) => {
      const next = presets.filter((_, idx) => idx !== i);
      setPresets(next);
      localStorage.setItem("asgFilterPresets", JSON.stringify(next));
    },
    [presets],
  );

  const hasActiveFilters = !!(searchInput || filters.repId || filters.suburb);

  const activeReps = useMemo(() => reps.filter((r) => r.active !== false), [reps]);
  const formerReps = useMemo(() => reps.filter((r) => r.active === false), [reps]);
  const suburbs = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    leads.forEach((l) => {
      const raw = l.suburb?.trim();
      if (!raw) return;
      if (/^\d+$/.test(raw)) return; // purely numeric → skip
      if (raw.length < 4) return; // too short → skip
      if (STREET_TYPE_WORDS.has(raw.toLowerCase())) return; // street type → skip
      if (/^[a-z]{1,3}[.,]?$/i.test(raw)) return; // 1-3 char abbreviation → skip
      // Normalise to title case for dedup
      const norm = raw.charAt(0).toUpperCase() + raw.slice(1);
      const key = norm.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(norm);
      }
    });
    return result.sort();
  }, [leads]);

  const tabCountBase = useMemo(() => {
    let base = leads.filter((l) => l.status !== "_deleted");
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      base = base.filter(
        (l) =>
          l.name.toLowerCase().includes(term) ||
          l.phone.includes(term) ||
          l.suburb.toLowerCase().includes(term) ||
          (l.email?.toLowerCase().includes(term) ?? false) ||
          (l.houseNum?.toLowerCase().includes(term) ?? false) ||
          (l.street?.toLowerCase().includes(term) ?? false) ||
          (l.notes?.toLowerCase().includes(term) ?? false) ||
          [l.houseNum, l.street, l.suburb, l.postcode].filter(Boolean).join(" ").toLowerCase().includes(term),
      );
    }
    if (myLeadsOnly && currentUserId) {
      base = base.filter((l) => l.dqRep === currentUserId);
    } else if (!myLeadsOnly && filters.repId) {
      base = base.filter((l) => l.dqRep === filters.repId);
    }
    if (filters.suburb) base = base.filter((l) => l.suburb === filters.suburb);
    return base;
  }, [leads, searchTerm, filters, myLeadsOnly, currentUserId]);

  // Per-tab counts reflect the active search/rep/suburb scope, excluding only the tab itself.
  const tabCounts = useMemo(() => {
    return deriveStatusTabCounts(tabCountBase);
  }, [tabCountBase]);

  const filteredLeads = useMemo(() => {
    let result = leads;
    // Always hide soft-deleted leads
    result = result.filter((l) => l.status !== "_deleted");
    if (currentTab !== "all") result = result.filter((l) => matchesStatusTab(l, currentTab));
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(term) ||
          l.phone.includes(term) ||
          l.suburb.toLowerCase().includes(term) ||
          (l.email?.toLowerCase().includes(term) ?? false) ||
          (l.houseNum?.toLowerCase().includes(term) ?? false) ||
          (l.street?.toLowerCase().includes(term) ?? false) ||
          (l.notes?.toLowerCase().includes(term) ?? false) ||
          // Combined address search (e.g. "22 Smith St")
          [l.houseNum, l.street, l.suburb, l.postcode].filter(Boolean).join(" ").toLowerCase().includes(term),
      );
    }
    // My Leads filter takes priority over the Rep dropdown
    if (myLeadsOnly && currentUserId) {
      result = result.filter((l) => l.dqRep === currentUserId);
    } else if (!myLeadsOnly && filters.repId) {
      result = result.filter((l) => l.dqRep === filters.repId);
    }
    if (filters.suburb) result = result.filter((l) => l.suburb === filters.suburb);
    return result;
  }, [leads, searchTerm, filters, currentTab, myLeadsOnly, currentUserId]);

  const sortedLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => {
      let aVal = a[sortBy] as any;
      let bVal = b[sortBy] as any;
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortOrder === "asc" ? 1 : -1;
      if (bVal == null) return sortOrder === "asc" ? -1 : 1;
      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredLeads, sortBy, sortOrder]);

  const selectedVisibleLeads = useMemo(
    () => sortedLeads.filter((lead) => selectedLeads.has(lead.id)),
    [selectedLeads, sortedLeads],
  );

  const selectionSummary = useMemo(() => {
    if (selectedVisibleLeads.length === 0) return "";
    const sample = selectedVisibleLeads.slice(0, 3).map((lead) => lead.name).join(", ");
    const extra = selectedVisibleLeads.length > 3 ? ` +${selectedVisibleLeads.length - 3} more` : "";
    return `${sample}${extra}`;
  }, [selectedVisibleLeads]);

  const selectedVisibleIdsKey = useMemo(
    () => selectedVisibleLeads.map((lead) => lead.id).join(","),
    [selectedVisibleLeads],
  );

  useEffect(() => {
    const visibleIds = new Set(sortedLeads.map((lead) => lead.id));
    setSelectedLeads((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [sortedLeads]);

  useEffect(() => {
    setConfirmingDelete(false);
  }, [selectedVisibleIdsKey]);

  useEffect(() => {
    if (selectedId === null || sortedLeads.some((lead) => lead.id === selectedId)) return;
    setSelectedId(sortedLeads[0]?.id ?? null);
  }, [selectedId, sortedLeads]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (sortedLeads.length === 0) return;

      const currentIndex = selectedId === null ? -1 : sortedLeads.findIndex((lead) => lead.id === selectedId);
      const moveTo = (index: number) => {
        const next = sortedLeads[Math.max(0, Math.min(sortedLeads.length - 1, index))];
        if (next) setSelectedId(next.id);
      };
      const activeLead = currentIndex >= 0 ? sortedLeads[currentIndex] : sortedLeads[0];

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        moveTo(currentIndex < 0 ? 0 : currentIndex + 1);
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        moveTo(currentIndex < 0 ? 0 : currentIndex - 1);
      } else if (event.key === "Enter" && activeLead) {
        event.preventDefault();
        setSelectedId(activeLead.id);
        onSelectLead(activeLead);
      } else if ((event.key === "c" || event.key === "C") && activeLead) {
        event.preventDefault();
        setSelectedId(activeLead.id);
        onAddCall(activeLead);
      } else if ((event.key === "a" || event.key === "A") && activeLead && onNextAction) {
        event.preventDefault();
        setSelectedId(activeLead.id);
        onNextAction(activeLead);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onAddCall, onNextAction, onSelectLead, selectedId, sortedLeads]);

  // ── Date grouping (always applied, persists with filters) ─────────────────
  const groupedLeads = useMemo((): DateGroup[] => {
    const groupMap = new Map<string, Lead[]>();
    sortedLeads.forEach((lead) => {
      // Normalise the date key so all formats collapse into YYYY-MM-DD or 'No Date'
      const key = normalizeDateKey(lead.leadDate);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(lead);
    });
    // Sort groups newest-first or oldest-first; "No Date" always last
    return Array.from(groupMap.entries())
      .sort(([a], [b]) => {
        if (a === "No Date") return 1;
        if (b === "No Date") return -1;
        return groupSortOrder === "newest" ? b.localeCompare(a) : a.localeCompare(b);
      })
      .map(([dateKey, groupLeadList]) => ({
        dateKey,
        label: dateKey === "No Date" ? "No Date" : formatGroupDate(dateKey),
        leads: groupLeadList,
      }));
  }, [sortedLeads, groupSortOrder]);

  const toggleGroup = useCallback((dateKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }, []);

  // ── Sorting ───────────────────────────────────────────────────────────────
  const handleSort = useCallback((col: keyof Lead) => {
    setSortBy((prev) => {
      if (prev === col) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
      else setSortOrder("asc");
      return col;
    });
  }, []);

  // ── Selection ─────────────────────────────────────────────────────────────
  const handleSelectLead = useCallback((leadId: number) => {
    setSelectedLeads((prev) => {
      const next = new Set(prev);
      next.has(leadId) ? next.delete(leadId) : next.add(leadId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedLeads.size === sortedLeads.length) setSelectedLeads(new Set());
    else setSelectedLeads(new Set(sortedLeads.map((l) => l.id)));
  }, [sortedLeads, selectedLeads]);

  const scheduleUndo = useCallback(
    (snapshot: Lead[], label: string) => {
      setUndoSnapshot(snapshot);
      setUndoLabel(label);
      clearUndoTimer();
      undoTimerRef.current = setTimeout(() => {
        setUndoSnapshot(null);
        setUndoLabel("Bulk change");
        undoTimerRef.current = null;
      }, 5000);
    },
    [clearUndoTimer],
  );

  // ── Bulk actions ──────────────────────────────────────────────────────────

  // Feature 2: Bulk status update with undo
  const handleBulkStatusUpdate = useCallback(() => {
    const toUpdate = selectedVisibleLeads;
    if (toUpdate.length === 0) return;
    // Capture snapshot before updating for undo
    const snapshot = toUpdate.map((l) => ({ ...l }));
    toUpdate.forEach((l) => onUpdateLead({ ...l, status: bulkStatus }));
    showToast(`✅ Updated ${toUpdate.length} lead${toUpdate.length !== 1 ? "s" : ""} to ${bulkStatus}`, "success");
    setSelectedLeads(new Set());
    scheduleUndo(snapshot, "Status change");
  }, [selectedVisibleLeads, bulkStatus, onUpdateLead, showToast, scheduleUndo]);

  const handleBulkRepUpdate = useCallback(() => {
    if (!bulkRep) return;
    const toUpdate = selectedVisibleLeads;
    if (toUpdate.length === 0) return;
    const snapshot = toUpdate.map((l) => ({ ...l }));
    const repName = reps.find((r) => r.id === bulkRep)?.name ?? "";
    toUpdate.forEach((l) => onUpdateLead({ ...l, dqRep: bulkRep as number }));
    showToast(`✅ Reassigned ${toUpdate.length} lead${toUpdate.length !== 1 ? "s" : ""} to ${repName}`, "success");
    setSelectedLeads(new Set());
    setBulkRep("");
    scheduleUndo(snapshot, "Rep reassignment");
  }, [selectedVisibleLeads, bulkRep, reps, onUpdateLead, showToast, scheduleUndo]);

  const handleBulkDelete = useCallback(() => {
    if (selectedVisibleLeads.length === 0) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    const toDelete = selectedVisibleLeads;
    if (onBulkDeleteLeads && toDelete.length > 1) onBulkDeleteLeads(toDelete);
    else toDelete.forEach((l) => onDeleteLead(l));
    setSelectedLeads(new Set());
    setConfirmingDelete(false);
  }, [confirmingDelete, selectedVisibleLeads, onDeleteLead, onBulkDeleteLeads]);

  // Feature 5: Bulk date update
  const handleBulkDateUpdate = useCallback(() => {
    if (!bulkDate) return;
    const toUpdate = selectedVisibleLeads;
    if (toUpdate.length === 0) return;
    const snapshot = toUpdate.map((l) => ({ ...l }));
    toUpdate.forEach((l) => onUpdateLead({ ...l, leadDate: bulkDate }));
    showToast(`✅ Set date for ${toUpdate.length} lead(s)`, "success");
    setSelectedLeads(new Set());
    setBulkDate("");
    scheduleUndo(snapshot, "Date change");
  }, [selectedVisibleLeads, bulkDate, onUpdateLead, showToast, scheduleUndo]);

  const handleBulkCallbackUpdate = useCallback(() => {
    if (!bulkCallbackDate) return;
    const toUpdate = selectedVisibleLeads;
    if (toUpdate.length === 0) return;
    const snapshot = toUpdate.map((l) => ({ ...l }));
    toUpdate.forEach((l) =>
      onUpdateLead({
        ...l,
        status: "Revisit",
        callbackDate: bulkCallbackDate,
        callbackTime: bulkCallbackTime || "09:00",
      }),
    );
    showToast(`Scheduled callback for ${toUpdate.length} lead${toUpdate.length !== 1 ? "s" : ""}`, "success");
    setSelectedLeads(new Set());
    setBulkCallbackDate("");
    scheduleUndo(snapshot, "Callback schedule");
  }, [selectedVisibleLeads, bulkCallbackDate, bulkCallbackTime, onUpdateLead, showToast, scheduleUndo]);

  const handleBulkFollowUpUpdate = useCallback(() => {
    if (!bulkFollowUpDate) return;
    const toUpdate = selectedVisibleLeads;
    if (toUpdate.length === 0) return;
    const snapshot = toUpdate.map((l) => ({ ...l }));
    toUpdate.forEach((l) => onUpdateLead({ ...l, nextContactDate: bulkFollowUpDate }));
    showToast(`Set follow-up for ${toUpdate.length} lead${toUpdate.length !== 1 ? "s" : ""}`, "success");
    setSelectedLeads(new Set());
    setBulkFollowUpDate("");
    scheduleUndo(snapshot, "Follow-up schedule");
  }, [selectedVisibleLeads, bulkFollowUpDate, onUpdateLead, showToast, scheduleUndo]);

  // Feature 5: Bulk suburb update
  const handleBulkSuburbUpdate = useCallback(() => {
    if (!bulkSuburb) return;
    const toUpdate = selectedVisibleLeads;
    if (toUpdate.length === 0) return;
    const snapshot = toUpdate.map((l) => ({ ...l }));
    toUpdate.forEach((l) => onUpdateLead({ ...l, suburb: bulkSuburb }));
    showToast(`✅ Set suburb for ${toUpdate.length} lead(s)`, "success");
    setSelectedLeads(new Set());
    setBulkSuburb("");
    scheduleUndo(snapshot, "Suburb change");
  }, [selectedVisibleLeads, bulkSuburb, onUpdateLead, showToast, scheduleUndo]);

  // ── Derived field helpers ─────────────────────────────────────────────────
  const getRepName = (repId: number | undefined) => {
    if (!repId) return "—";
    return reps.find((r) => r.id === repId)?.name || `Rep ${repId}`;
  };

  // Last Contact Rep: use the rep from the most recent call; fall back to DQ rep if no calls
  const getLastContactRep = (lead: Lead): string => {
    if (lead.callHistory && lead.callHistory.length > 0) {
      return lead.callHistory[lead.callHistory.length - 1].rep || "—";
    }
    return getRepName(lead.dqRep);
  };

  // Most recent call notes (or lead-level notes if no calls)
  const getLastNotes = (lead: Lead): string => {
    if (lead.callHistory && lead.callHistory.length > 0) {
      return lead.callHistory[lead.callHistory.length - 1].notes || "—";
    }
    return (lead as any).notes || "—";
  };

  const daysSinceCall = (lastCall: string | undefined) => {
    return timeAgo(lastCall ? new Date(lastCall).getTime() : undefined);
  };

  // Priority tint follows centralized workflow semantics.
  const getRowPriority = (lead: Lead): { bg: string; border: string } => {
    const state = getWorkflowState(lead);
    if (state.queueType === "booked") {
      return { bg: "bg-green-50/40 dark:bg-green-900/5", border: "border-l-2 border-l-green-400" };
    }
    if (state.queueType === "callback" || state.queueType === "followup") {
      return { bg: "bg-amber-50/40 dark:bg-amber-900/5", border: "border-l-2 border-l-amber-400" };
    }
    if (state.queueType === "call") {
      return { bg: "bg-red-50/40 dark:bg-red-900/5", border: "border-l-2 border-l-red-400" };
    }
    return { bg: "", border: "border-l-2 border-l-transparent" };
  };

  // Short date for the Date column (e.g. "10 Apr")
  const formatShortDate = (isoDate: string | undefined): string => {
    return formatDateSmart(isoDate);
  };

  const SortArrow = ({ col }: { col: keyof Lead }) =>
    sortBy === col ? <span className="ml-1 text-amber-500">{sortOrder === "asc" ? "↑" : "↓"}</span> : null;

  const thCls =
    "px-3 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide cursor-pointer select-none hover:text-[var(--text)] transition whitespace-nowrap";
  const thStatic =
    "px-3 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide whitespace-nowrap";

  return (
    <div className="w-full h-full flex flex-col bg-[var(--surface)]" onKeyDown={(e) => { if (e.key === "Escape") setSelectedId(null); }}>
      {/* ── Toolbar ── */}
      <div className="border-b border-[var(--border)] flex-shrink-0">
        {/* Header row — title + total count */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <span className="text-sm font-semibold text-[var(--text)]">Leads</span>
          <span className="text-xs text-[var(--text-muted)] tabular-nums">{leads.length.toLocaleString()} records</span>
        </div>
        {/* Search & Filters */}
        <div className="flex gap-2 flex-wrap items-center px-4 pb-3">
          {/* My Leads / All Leads toggle */}
          <button
            onClick={() => setMyLeadsOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all flex-shrink-0 ${
              myLeadsOnly
                ? "bg-amber-500 text-white border-amber-500"
                : "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)] hover:border-amber-300"
            }`}
          >
            {myLeadsOnly ? "👤 My Leads" : "👥 All Leads"}
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${myLeadsOnly ? "bg-white/20 text-white" : "bg-[var(--hover)] text-[var(--text-muted)]"}`}
            >
              {myLeadsOnly && currentUserId ? leads.filter((l) => l.dqRep === currentUserId).length : leads.length}
            </span>
          </button>

          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search leads..."
            value={searchInput}
            onChange={(e) => {
              const v = e.target.value;
              setSearchInput(v);
              if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
              searchDebounceRef.current = setTimeout(() => setSearchTerm(v), 250);
            }}
            className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brass)]"
          />
          <select
            value={filters.repId || ""}
            onChange={(e) =>
              setFilters((p) => ({ ...p, repId: e.target.value ? parseInt(e.target.value) : undefined }))
            }
            disabled={myLeadsOnly}
            className={`px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brass)] ${myLeadsOnly ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <option value="">All Reps</option>
            {activeReps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={filters.suburb || ""}
            onChange={(e) => setFilters((p) => ({ ...p, suburb: e.target.value || undefined }))}
            className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brass)]"
          >
            <option value="">All Suburbs</option>
            {suburbs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearchTerm("");
                setSearchInput("");
                setFilters({});
              }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition"
            >
              Clear
            </button>
          )}

          {/* Feature 4: Save Filter button (only shown when filters active) */}
          {hasActiveFilters && !savingPreset && (
            <button
              onClick={() => setSavingPreset(true)}
              title="Save current filters as preset"
              className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--hover)] transition flex items-center gap-1.5 whitespace-nowrap"
            >
              <Bookmark size={13} />
              Save Filter
            </button>
          )}

          {/* Feature 4: Saved presets dropdown */}
          {presets.length > 0 && (
            <div className="relative" ref={presetMenuRef}>
              <button
                onClick={() => setPresetMenuOpen((o) => !o)}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--hover)] transition flex items-center gap-1.5 whitespace-nowrap"
              >
                📌 Saved ({presets.length})
              </button>
              {presetMenuOpen && (
                <div className="absolute left-0 top-full mt-1 z-30 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg min-w-[200px] py-1">
                  {presets.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 hover:bg-[var(--hover)] group"
                    >
                      <button
                        onClick={() => applyPreset(p)}
                        className="text-sm text-[var(--text)] text-left flex-1 truncate"
                      >
                        {p.name}
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">({p.tab})</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePreset(i);
                        }}
                        className="ml-2 text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Date group sort toggle */}
          <button
            onClick={() => setGroupSortOrder((o) => (o === "newest" ? "oldest" : "newest"))}
            title="Toggle date sort order"
            className="ml-auto px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--hover)] transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0"
          >
            {groupSortOrder === "newest" ? "↓ Newest First" : "↑ Oldest First"}
          </button>

          {/* Feature 3: Columns toggle button */}
          <div className="relative flex-shrink-0" ref={colMenuRef}>
            <button
              onClick={() => setColMenuOpen((o) => !o)}
              title="Toggle column visibility"
              className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--hover)] transition flex items-center gap-1.5 whitespace-nowrap"
            >
              <Columns size={13} />
              Columns ▾
            </button>
            {colMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg min-w-[160px] py-2">
                {COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--hover)] cursor-pointer text-sm text-[var(--text-muted)]"
                  >
                    <input
                      type="checkbox"
                      checked={isColVisible(col.key)}
                      onChange={() => toggleCol(col.key)}
                      className="w-3.5 h-3.5 accent-amber-500"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Feature 4: Preset name input (shown when savingPreset) */}
        {savingPreset && (
          <div className="flex items-center gap-2 flex-wrap px-4 pb-3">
            <span className="text-sm text-[var(--text-muted)]">Preset name:</span>
            <input
              autoFocus
              type="text"
              placeholder="e.g. My DQ leads"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") savePreset();
                if (e.key === "Escape") {
                  setSavingPreset(false);
                  setPresetName("");
                }
              }}
              className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brass)] w-48"
            />
            <button
              onClick={savePreset}
              disabled={!presetName.trim()}
              className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-400 disabled:opacity-40 transition font-medium"
            >
              Save
            </button>
            <button
              onClick={() => {
                setSavingPreset(false);
                setPresetName("");
              }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Status Tabs */}
        <div className="flex gap-1 overflow-x-auto px-4 py-2 border-t border-[var(--border)] scrollbar-none">
          {STATUS_TABS.map((tab) => {
            const hex =
              tab.value !== "all"
                ? getStatusColor(tab.value, statusColors)
                : "#9ca3af";
            const isActive = currentTab === tab.value;
            const count = tab.value === "all" ? tabCounts.all : tabCountBase.filter((lead) => matchesStatusTab(lead, tab.value)).length;
            return (
              <button
                key={tab.value}
                onClick={() => setCurrentTab(tab.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap text-xs font-medium transition flex-shrink-0 ${
                  isActive
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-[var(--hover)] text-[var(--text-muted)] hover:bg-[var(--border)]"
                }`}
              >
                {tab.value !== "all" && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: isActive ? "rgba(255,255,255,0.8)" : hex }}
                  />
                )}
                {tab.label}
                <span
                  className={`${isActive ? "bg-white/20 text-white" : "bg-[var(--border)] text-[var(--text-muted)]"} px-1.5 py-0.5 rounded-full text-[10px] font-semibold`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Desktop Table ── */}
      <div className="flex-1 overflow-x-auto overflow-y-auto hidden lg:block scroll-smooth" onClick={() => setSelectedId(null)}>
        {loading && leads.length === 0 ? (
          <table className="w-full border-collapse" style={{ minWidth: "1000px" }}>
            <thead className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] z-10">
              <tr>
                {Array.from({ length: 9 }).map((_, i) => (
                  <th key={i} className="px-3 py-3">
                    <div className="h-3 rounded skeleton-shimmer" style={{ width: i === 0 ? 16 : i === 1 ? 60 : 80 }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={8} />
              ))}
            </tbody>
          </table>
        ) : sortedLeads.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-20">
              <div className="text-5xl mb-4 opacity-60">📭</div>
              <p className="font-semibold text-[var(--text)] mb-1">No leads found</p>
              {myLeadsOnly && !searchTerm ? (
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  No leads assigned to you yet.{" "}
                  <button onClick={() => setMyLeadsOnly(false)} className="text-amber-500 hover:underline font-medium">
                    View all leads
                  </button>
                </p>
              ) : searchTerm && currentTab !== "all" ? (
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  No results on this tab.{" "}
                  <button onClick={() => setCurrentTab("all")} className="text-amber-500 hover:underline font-medium">
                    Search all statuses
                  </button>
                </p>
              ) : (
                <p className="text-sm text-[var(--text-muted)] mt-1">Try adjusting your search or filters</p>
              )}
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse" style={{ minWidth: "1000px" }}>
            <thead className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] z-10">
              <tr>
                {/* Checkbox — always visible */}
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedLeads.size > 0 && selectedLeads.size === sortedLeads.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 accent-amber-500 cursor-pointer"
                  />
                </th>
                {/* Date */}
                {isColVisible("date") && (
                  <th className={thCls} onClick={() => handleSort("leadDate")} style={{ width: 90 }}>
                    Date <SortArrow col="leadDate" />
                  </th>
                )}
                {/* Name — always visible */}
                <th className={thCls} onClick={() => handleSort("name")} style={{ width: 160 }}>
                  Lead Name <SortArrow col="name" />
                </th>
                {/* Contact */}
                {isColVisible("phone") && (
                  <th className={thCls} onClick={() => handleSort("phone")} style={{ width: 130 }}>
                    <span className="flex items-center gap-1">
                      <Phone size={12} />
                      Contact <SortArrow col="phone" />
                    </span>
                  </th>
                )}
                {/* Address */}
                {isColVisible("address") && (
                  <th className={thStatic} style={{ width: 200 }}>
                    Address
                  </th>
                )}
                {/* Renter/Owner */}
                {isColVisible("ownership") && (
                  <th className={thCls} onClick={() => handleSort("ownership")} style={{ width: 110 }}>
                    Renter/Owner <SortArrow col="ownership" />
                  </th>
                )}
                {/* Superannuation */}
                {isColVisible("super") && (
                  <th className={thCls} onClick={() => handleSort("superannuation")} style={{ width: 120 }}>
                    Super <SortArrow col="superannuation" />
                  </th>
                )}
                {/* Last Contact Rep */}
                {isColVisible("lastContact") && (
                  <th className={thStatic} style={{ width: 130 }}>
                    Last Contact
                  </th>
                )}
                {/* Status */}
                {isColVisible("status") && (
                  <th className={thCls} onClick={() => handleSort("status")} style={{ width: 130 }}>
                    Status <SortArrow col="status" />
                  </th>
                )}
                {/* Notes */}
                {isColVisible("notes") && (
                  <th className={thStatic} style={{ width: 200 }}>
                    Notes
                  </th>
                )}
                {/* Last Call */}
                {isColVisible("lastCall") && (
                  <th className={thCls} onClick={() => handleSort("lastCall")} style={{ width: 100 }}>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      Last Call <SortArrow col="lastCall" />
                    </span>
                  </th>
                )}
                {/* Next Action — always visible, interactive */}
                <th className={thStatic} style={{ width: 130 }}>
                  Next Action
                </th>
                {/* Action — always visible */}
                <th className={thStatic} style={{ width: 180 }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {groupedLeads.map(({ dateKey, label, leads: groupLeadList }) => {
                const isCollapsed = collapsedGroups.has(dateKey);
                const selectedInGroup = groupLeadList.filter((l) => selectedLeads.has(l.id)).length;

                return (
                  <React.Fragment key={dateKey}>
                    {/* ── Date group header ── */}
                    <tr
                      onClick={() => toggleGroup(dateKey)}
                      className="cursor-pointer bg-[var(--hover)] dark:bg-[var(--surface)] hover:brightness-[0.97] transition border-t-2 border-[var(--border)]"
                    >
                      <td colSpan={totalCols} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight size={14} className="text-[var(--text-muted)] flex-shrink-0" />
                          ) : (
                            <ChevronDown size={14} className="text-[var(--text-muted)] flex-shrink-0" />
                          )}
                          <span className="font-semibold text-[var(--text)] text-sm">{label}</span>
                          <span className="text-xs text-[var(--text-muted)]">
                            ({groupLeadList.length} lead{groupLeadList.length !== 1 ? "s" : ""})
                          </span>
                          {selectedInGroup > 0 && (
                            <span className="ml-2 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                              {selectedInGroup} selected
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* ── Lead rows (capped at ROWS_PER_GROUP for performance) ── */}
                    {!isCollapsed &&
                      (() => {
                        const showingAll = groupShowAll.has(dateKey);
                        const displayedLeads = showingAll ? groupLeadList : groupLeadList.slice(0, ROWS_PER_GROUP);
                        const hiddenCount = groupLeadList.length - displayedLeads.length;
                        return (
                          <>
                            {displayedLeads.map((lead) => {
                              const effectiveLead = optimisticCallbackDates[lead.id] !== undefined
                                ? { ...lead, callbackDate: optimisticCallbackDates[lead.id] }
                                : lead;
                              const priority = getRowPriority(effectiveLead);
                              const rowAction = getNextAction(effectiveLead);
                              const hasAISignal = rowAction.priority !== "low";
                              return (
                                <tr
                                  key={lead.id}
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); setSelectedId(lead.id); onSelectLead(lead); }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { setSelectedId(lead.id); onSelectLead(lead); }
                                    if (e.key === "ArrowRight" && hasAISignal) { e.preventDefault(); setSelectedId(lead.id); onSelectLead(lead); }
                                  }}
                                  className={`border-b border-[var(--border)] hover:bg-[var(--surface-2,var(--hover))] hover:shadow-[inset_2px_0_0_var(--brass)] transition-all cursor-pointer group focus:outline-none ${selectedId === lead.id ? "bg-[var(--hover)] shadow-[inset_2px_0_0_var(--brass)] ring-1 ring-inset ring-[var(--border)]" : priority.bg} ${priority.border} ${flashedLeadId === lead.id ? "asg-row-flash" : ""}`}
                                >
                                  {/* Checkbox */}
                                  <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={selectedLeads.has(lead.id)}
                                      onChange={() => handleSelectLead(lead.id)}
                                      className="w-4 h-4 accent-amber-500 cursor-pointer"
                                    />
                                  </td>

                                  {/* Date */}
                                  {isColVisible("date") && (
                                    <td className="px-3 py-3.5 text-[var(--text-muted)] text-sm whitespace-nowrap">
                                      {formatShortDate(lead.leadDate)}
                                    </td>
                                  )}

                                  {/* Name — always visible */}
                                  <td className="px-3 py-3.5 font-medium text-[var(--text)]">
                                    <span className="truncate block max-w-[150px]">{lead.name}</span>
                                  </td>

                                  {/* Contact — tel: link */}
                                  {isColVisible("phone") && (
                                    <td className="px-3 py-3.5 text-[var(--text-muted)]">
                                      <a
                                        href={`tel:${lead.phone.replace(/\s/g, "")}`}
                                        className="text-amber-600 hover:underline text-sm"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {lead.phone}
                                      </a>
                                    </td>
                                  )}

                                  {/* Address */}
                                  {isColVisible("address") && (
                                    <td className="px-3 py-3.5 text-[var(--text-muted)] text-sm">
                                      <span className="block max-w-[190px] truncate" title={buildAddress(lead)}>
                                        {buildAddress(lead)}
                                      </span>
                                    </td>
                                  )}

                                  {/* Renter/Owner */}
                                  {isColVisible("ownership") && (
                                    <td className="px-3 py-3.5 text-[var(--text-muted)] text-sm whitespace-nowrap">
                                      {lead.ownership || "—"}
                                    </td>
                                  )}

                                  {/* Superannuation */}
                                  {isColVisible("super") && (
                                    <td className="px-3 py-3.5 text-[var(--text-muted)] text-sm whitespace-nowrap">
                                      {lead.superannuation || "—"}
                                    </td>
                                  )}

                                  {/* Last Contact Rep */}
                                  {isColVisible("lastContact") && (
                                    <td className="px-3 py-3.5 text-[var(--text-muted)] text-sm">
                                      <span className="truncate block max-w-[120px]" title={getLastContactRep(lead)}>
                                        {getLastContactRep(lead)}
                                      </span>
                                    </td>
                                  )}

                                  {/* Status */}
                                  {isColVisible("status") && (
                                    <td className="px-3 py-3.5 whitespace-nowrap">
                                      <div className="flex items-center gap-1.5">
                                        {(() => {
                                          const displayStatus = normalizeLeadStatus(
                                            optimisticStatuses[lead.id] ?? lead.status,
                                          );
                                          return (
                                        <span
                                          className={`inline-flex items-center justify-center min-w-[76px] px-2.5 py-1 rounded-full text-xs font-semibold ${conflictStatuses[lead.id] ? "ring-1 ring-offset-1 ring-yellow-400" : ""}`}
                                          style={statusBadgeStyle(
                                            getStatusColor(displayStatus, statusColors),
                                          )}
                                        >
                                          {displayStatus}
                                        </span>
                                          );
                                        })()}
                                        {hasAISignal && (
                                          <span
                                            role="button"
                                            tabIndex={-1}
                                            title={`AI: ${rowAction.label}`}
                                            onClick={(e) => { e.stopPropagation(); setSelectedId(lead.id); onSelectLead(lead); }}
                                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 bg-violet-400 dark:bg-violet-500 cursor-pointer hover:scale-110 transition-[opacity,transform] ${selectedId === lead.id ? "opacity-100" : "opacity-30 group-hover:opacity-60"}`}
                                          />
                                        )}
                                      </div>
                                    </td>
                                  )}

                                  {/* Notes (most recent call, truncated) */}
                                  {isColVisible("notes") && (
                                    <td className="px-3 py-3.5 text-[var(--text-muted)] text-sm">
                                      <span className="block max-w-[190px] truncate" title={getLastNotes(lead)}>
                                        {getLastNotes(lead)}
                                      </span>
                                    </td>
                                  )}

                                  {/* Last Call */}
                                  {isColVisible("lastCall") && (
                                    <td className="px-3 py-3.5 text-[var(--text-muted)] text-sm whitespace-nowrap">
                                      <span className="flex items-center gap-1">
                                        <Clock size={12} />
                                        {daysSinceCall(lead.lastCall)}
                                      </span>
                                    </td>
                                  )}

                                  {/* Next Action — always visible, clickable */}
                                  <td
                                    className="px-3 py-3.5 text-sm whitespace-nowrap"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onNextAction?.(lead);
                                    }}
                                  >
                                    {(() => {
                                      const action = getNextAction(effectiveLead);
                                      const colors = ACTION_COLORS[action.priority] ?? ACTION_COLORS.low;
                                      return (
                                        <div
                                          className="flex flex-col gap-0.5 cursor-pointer hover:opacity-80 transition"
                                          title={`Click to: ${action.label}`}
                                        >
                                          <span className={`font-bold text-[11px] ${colors.text}`}>{action.label}</span>
                                          <span className="text-[9px] text-gray-400 dark:text-gray-500 truncate max-w-[110px]">
                                            {action.reason}
                                          </span>
                                        </div>
                                      );
                                    })()}
                                  </td>

                                  {/* Action — always visible */}
                                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                      {/* Quick: No Answer */}
                                      <button
                                        title="Quick: No Answer"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOptimisticStatuses((prev) => ({ ...prev, [lead.id]: "No Answer" }));
                                          const now = new Date();
                                          onUpdateLead({
                                            ...lead,
                                            status: "No Answer",
                                            result: "no_answer",
                                            lastCall: now.toISOString(),
                                            callHistory: [
                                              ...(lead.callHistory ?? []),
                                              {
                                                date: now.toISOString().split("T")[0],
                                                time: now.toTimeString().slice(0, 5),
                                                rep:
                                                  reps.find((r) => r.id === (currentUserId ?? lead.dqRep))?.name ?? "",
                                                repId: currentUserId ?? lead.dqRep,
                                                result: "no_answer",
                                                notes: "",
                                              },
                                            ],
                                          });
                                        }}
                                        className="px-2 py-1 rounded text-xs font-medium bg-[var(--hover)] text-[var(--text-muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
                                      >
                                        NA
                                      </button>
                                      {/* Quick: Wrong Number */}
                                      <button
                                        title="Quick: Wrong Number"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOptimisticStatuses((prev) => ({ ...prev, [lead.id]: "Wrong Number" }));
                                          const now = new Date();
                                          onUpdateLead({
                                            ...lead,
                                            status: "Wrong Number",
                                            result: "wrong_number",
                                            lastCall: now.toISOString(),
                                            callHistory: [
                                              ...(lead.callHistory ?? []),
                                              {
                                                date: now.toISOString().split("T")[0],
                                                time: now.toTimeString().slice(0, 5),
                                                rep:
                                                  reps.find((r) => r.id === (currentUserId ?? lead.dqRep))?.name ?? "",
                                                repId: currentUserId ?? lead.dqRep,
                                                result: "wrong_number",
                                                notes: "",
                                              },
                                            ],
                                          });
                                        }}
                                        className="px-2 py-1 rounded text-xs font-medium bg-[var(--hover)] text-[var(--text-muted)] hover:bg-orange-100 hover:text-orange-600 dark:hover:bg-orange-900/30 dark:hover:text-orange-400 transition-colors"
                                      >
                                        WN
                                      </button>
                                      <button
                                        onClick={() => onAddCall(lead)}
                                        title="Log a call"
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-400 active:bg-amber-600 transition font-medium"
                                      >
                                        <Phone size={11} />
                                        <span>Call</span>
                                      </button>
                                      <button
                                        onClick={() => onSelectLead(lead)}
                                        title="View / edit lead"
                                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded-lg transition"
                                      >
                                        <Eye size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {hiddenCount > 0 && (
                              <tr>
                                <td
                                  colSpan={totalCols}
                                  className="px-4 py-2 text-center bg-gray-50 dark:bg-[var(--surface)]/50"
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setGroupShowAll((prev) => new Set([...prev, dateKey]));
                                    }}
                                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"
                                  >
                                    Show {hiddenCount} more lead{hiddenCount !== 1 ? "s" : ""} ↓
                                  </button>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })()}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        <div ref={sentinelDesktopRef} className="h-4" />
        {loadingMore && (
          <div className="flex justify-center py-3">
            <span className="w-4 h-4 rounded-full border-2 border-[var(--border)] border-t-amber-500 animate-spin" />
          </div>
        )}
        <div className={`flex justify-center py-3 transition-opacity duration-300 ${!hasMore && !loadingMore ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <span className="text-xs text-[var(--text-muted)]">You're all caught up</span>
        </div>
      </div>

      {/* ── Mobile Card list ── */}
      <div className="flex-1 overflow-y-auto lg:hidden scroll-smooth" onClick={() => setSelectedId(null)}>
        {loading && leads.length === 0 ? (
          <div>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : sortedLeads.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-20">
              <div className="text-5xl mb-4 opacity-60">📭</div>
              <p className="font-semibold text-[var(--text)] mb-1">No leads found</p>
              {myLeadsOnly && !searchTerm ? (
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  No leads assigned to you yet.{" "}
                  <button onClick={() => setMyLeadsOnly(false)} className="text-amber-500 hover:underline font-medium">
                    View all leads
                  </button>
                </p>
              ) : searchTerm && currentTab !== "all" ? (
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  No results on this tab.{" "}
                  <button onClick={() => setCurrentTab("all")} className="text-amber-500 hover:underline font-medium">
                    Search all statuses
                  </button>
                </p>
              ) : (
                <p className="text-sm text-[var(--text-muted)] mt-1">Try adjusting your search or filters</p>
              )}
            </div>
          </div>
        ) : (
          <div>
            {groupedLeads.map(({ dateKey, label, leads: groupLeadList }) => {
              const isCollapsed = collapsedGroups.has(dateKey);
              return (
                <div key={dateKey}>
                  {/* Mobile group header */}
                  <button
                    onClick={() => toggleGroup(dateKey)}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-[var(--hover)] dark:bg-[var(--surface)] border-b border-[var(--border)] text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={13} className="text-[var(--text-muted)] flex-shrink-0" />
                    ) : (
                      <ChevronDown size={13} className="text-[var(--text-muted)] flex-shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-[var(--text)]">{label}</span>
                    <span className="text-xs text-gray-400">({groupLeadList.length})</span>
                  </button>

                  {!isCollapsed &&
                    (() => {
                      const showingAll = groupShowAll.has(dateKey);
                      const displayedLeads = showingAll ? groupLeadList : groupLeadList.slice(0, ROWS_PER_GROUP);
                      const hiddenCount = groupLeadList.length - displayedLeads.length;
                      return (
                        <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                          {displayedLeads.map((lead) => {
                            const effectiveLead = optimisticCallbackDates[lead.id] !== undefined
                              ? { ...lead, callbackDate: optimisticCallbackDates[lead.id] }
                              : lead;
                            const priority = getRowPriority(effectiveLead);
                            return (
                              <li
                                key={lead.id}
                                onClick={() => onSelectLead(lead)}
                                className={`px-4 py-3 flex items-start gap-3 active:bg-gray-50 dark:active:bg-slate-800/60 cursor-pointer ${priority.bg} ${priority.border}`}
                              >
                                {/* Checkbox */}
                                <div className="-mt-2 -ml-2 w-11 h-11 flex items-center justify-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selectedLeads.has(lead.id)}
                                    onChange={() => handleSelectLead(lead.id)}
                                    className="w-4 h-4 accent-amber-500 cursor-pointer"
                                    aria-label={`Select ${lead.name}`}
                                  />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="font-semibold text-gray-900 dark:text-white truncate">
                                      {lead.name}
                                    </span>
                                    <span
                                      className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${conflictStatuses[lead.id] ? "ring-1 ring-offset-1 ring-yellow-400" : ""}`}
                                      style={statusBadgeStyle(
                                        getStatusColor(normalizeLeadStatus(optimisticStatuses[lead.id] ?? lead.status), statusColors),
                                      )}
                                    >
                                      {normalizeLeadStatus(optimisticStatuses[lead.id] ?? lead.status)}
                                    </span>
                                  </div>
                                  {/* Next Action */}
                                  {(() => {
                                    const action = getNextAction(effectiveLead);
                                    const colors = ACTION_COLORS[action.priority] ?? ACTION_COLORS.low;
                                    return (
                                      <div
                                        className="flex items-center gap-1.5 mb-1 cursor-pointer"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onNextAction?.(lead);
                                        }}
                                        title={`Click to: ${action.label}`}
                                      >
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${colors.badge}`}>
                                          {action.label}
                                        </span>
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                                          {action.reason}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
                                    {/* Feature 1: tel: link in mobile card */}
                                    <a
                                      href={`tel:${lead.phone.replace(/\s/g, "")}`}
                                      className="flex items-center gap-1 text-amber-600 hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Phone size={11} />
                                      {lead.phone}
                                    </a>
                                    <span>{buildAddress(lead)}</span>
                                    <span>{lead.ownership || ""}</span>
                                    <span>{getLastContactRep(lead)}</span>
                                    <span className="flex items-center gap-1">
                                      <Clock size={11} />
                                      {daysSinceCall(lead.lastCall)}
                                    </span>
                                  </div>
                                  {getLastNotes(lead) !== "—" && (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
                                      {getLastNotes(lead)}
                                    </p>
                                  )}
                                </div>

                                {/* Buttons */}
                                <div className="flex-shrink-0 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                                  {/* Quick: No Answer */}
                                  <button
                                    title="Quick: No Answer"
                                    aria-label={`Mark ${lead.name} as no answer`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOptimisticStatuses((prev) => ({ ...prev, [lead.id]: "No Answer" }));
                                      const now = new Date();
                                      onUpdateLead({
                                        ...lead,
                                        status: "No Answer",
                                        result: "no_answer",
                                        lastCall: now.toISOString(),
                                        callHistory: [
                                          ...(lead.callHistory ?? []),
                                          {
                                            date: now.toISOString().split("T")[0],
                                            time: now.toTimeString().slice(0, 5),
                                            rep: reps.find((r) => r.id === (currentUserId ?? lead.dqRep))?.name ?? "",
                                            repId: currentUserId ?? lead.dqRep,
                                            result: "no_answer",
                                            notes: "",
                                          },
                                        ],
                                      });
                                    }}
                                    className="min-w-11 min-h-11 px-2 py-1 rounded text-xs font-medium bg-[var(--hover)] text-[var(--text-muted)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
                                  >
                                    NA
                                  </button>
                                  {/* Quick: Wrong Number */}
                                  <button
                                    title="Quick: Wrong Number"
                                    aria-label={`Mark ${lead.name} as wrong number`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOptimisticStatuses((prev) => ({ ...prev, [lead.id]: "Wrong Number" }));
                                      const now = new Date();
                                      onUpdateLead({
                                        ...lead,
                                        status: "Wrong Number",
                                        result: "wrong_number",
                                        lastCall: now.toISOString(),
                                        callHistory: [
                                          ...(lead.callHistory ?? []),
                                          {
                                            date: now.toISOString().split("T")[0],
                                            time: now.toTimeString().slice(0, 5),
                                            rep: reps.find((r) => r.id === (currentUserId ?? lead.dqRep))?.name ?? "",
                                            repId: currentUserId ?? lead.dqRep,
                                            result: "wrong_number",
                                            notes: "",
                                          },
                                        ],
                                      });
                                    }}
                                    className="min-w-11 min-h-11 px-2 py-1 rounded text-xs font-medium bg-[var(--hover)] text-[var(--text-muted)] hover:bg-orange-100 hover:text-orange-600 dark:hover:bg-orange-900/30 dark:hover:text-orange-400 transition-colors"
                                  >
                                    WN
                                  </button>
                                  <button
                                    aria-label={`Call ${lead.name}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onAddCall(lead);
                                    }}
                                    className="min-w-11 min-h-11 px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-400 active:bg-amber-600 transition font-medium"
                                  >
                                    📞
                                  </button>
                                  <button
                                    aria-label={`Open ${lead.name}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectLead(lead);
                                    }}
                                    className="min-w-11 min-h-11 px-3 py-1.5 text-xs bg-[var(--hover)] text-[var(--text-muted)] rounded-lg hover:brightness-[0.96] transition font-medium"
                                  >
                                    <Eye size={12} className="mx-auto" />
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                          {hiddenCount > 0 && (
                            <li className="px-4 py-2.5 text-center bg-gray-50 dark:bg-[var(--surface)]/50">
                              <button
                                onClick={() => setGroupShowAll((prev) => new Set([...prev, dateKey]))}
                                className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"
                              >
                                Show {hiddenCount} more ↓
                              </button>
                            </li>
                          )}
                        </ul>
                      );
                    })()}
                </div>
              );
            })}
          </div>
        )}
        <div ref={sentinelMobileRef} className="h-4 lg:hidden" />
        {loadingMore && (
          <div className="flex justify-center py-3 lg:hidden">
            <span className="w-4 h-4 rounded-full border-2 border-[var(--border)] border-t-amber-500 animate-spin" />
          </div>
        )}
        {!hasMore && !loadingMore && (
          <div className="flex justify-center py-3 lg:hidden">
            <span className="text-xs text-[var(--text-muted)]">You're all caught up</span>
          </div>
        )}
      </div>

      {/* ── Footer / Bulk Actions ── */}
      <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-[var(--text-muted)]">
            {selectedVisibleLeads.length > 0
              ? `${selectedVisibleLeads.length} of ${sortedLeads.length} selected${selectionSummary ? `: ${selectionSummary}` : ""}`
              : `Showing ${sortedLeads.length} of ${leads.length} leads in view`}
          </p>

          {selectedVisibleLeads.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status */}
              <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">
                Status:
              </span>
              <select
                value={bulkStatus}
                onChange={(e) => {
                  setBulkStatus(e.target.value as LeadStatus);
                  setConfirmingDelete(false);
                }}
                onClick={(e) => e.stopPropagation()}
                className="px-2 py-1 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brass)]"
              >
                {LEAD_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkStatusUpdate}
                className="px-3 py-1 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-400 transition font-medium"
              >
                Apply
              </button>

              <span className="text-gray-300 dark:text-gray-500 text-sm">|</span>

              {/* Rep reassign */}
              <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">Rep:</span>
              <select
                value={bulkRep}
                onChange={(e) => {
                  setBulkRep(e.target.value ? Number(e.target.value) : "");
                  setConfirmingDelete(false);
                }}
                onClick={(e) => e.stopPropagation()}
                className="px-2 py-1 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--brass)]"
              >
                <option value="">Pick rep…</option>
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
              <button
                onClick={handleBulkRepUpdate}
                disabled={!bulkRep}
                className="px-3 py-1 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-40 transition font-medium"
              >
                Reassign
              </button>

              <span className="text-gray-300 dark:text-gray-500 text-sm">|</span>

              {/* Feature 5: Bulk Date */}
              <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">
                Date:
              </span>
              <input
                type="date"
                value={bulkDate}
                onChange={(e) => {
                  setBulkDate(e.target.value);
                  setConfirmingDelete(false);
                }}
                className="px-2 py-1 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none"
              />
              <button
                onClick={handleBulkDateUpdate}
                disabled={!bulkDate}
                className="px-3 py-1 text-sm bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-40 transition font-medium"
              >
                Set Date
              </button>

              <span className="text-gray-300 dark:text-gray-500 text-sm">|</span>

              <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">
                Callback:
              </span>
              <input
                type="date"
                value={bulkCallbackDate}
                onChange={(e) => {
                  setBulkCallbackDate(e.target.value);
                  setConfirmingDelete(false);
                }}
                className="px-2 py-1 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none"
              />
              <input
                type="time"
                value={bulkCallbackTime}
                onChange={(e) => {
                  setBulkCallbackTime(e.target.value);
                  setConfirmingDelete(false);
                }}
                className="px-2 py-1 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none w-24"
              />
              <button
                onClick={handleBulkCallbackUpdate}
                disabled={!bulkCallbackDate}
                className="px-3 py-1 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-500 disabled:opacity-40 transition font-medium"
              >
                Schedule
              </button>

              <span className="text-gray-300 dark:text-gray-500 text-sm">|</span>

              <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">
                Follow-up:
              </span>
              <input
                type="date"
                value={bulkFollowUpDate}
                onChange={(e) => {
                  setBulkFollowUpDate(e.target.value);
                  setConfirmingDelete(false);
                }}
                className="px-2 py-1 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none"
              />
              <button
                onClick={handleBulkFollowUpUpdate}
                disabled={!bulkFollowUpDate}
                className="px-3 py-1 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-500 disabled:opacity-40 transition font-medium"
              >
                Set Follow-up
              </button>

              <span className="text-gray-300 dark:text-gray-500 text-sm">|</span>

              {/* Feature 5: Bulk Suburb */}
              <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide">
                Suburb:
              </span>
              <input
                type="text"
                placeholder="New suburb…"
                value={bulkSuburb}
                onChange={(e) => {
                  setBulkSuburb(e.target.value);
                  setConfirmingDelete(false);
                }}
                className="px-2 py-1 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none w-28"
              />
              <button
                onClick={handleBulkSuburbUpdate}
                disabled={!bulkSuburb}
                className="px-3 py-1 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-40 transition font-medium"
              >
                Set Suburb
              </button>

              <span className="text-gray-300 dark:text-gray-500 text-sm">|</span>

              {/* Delete with confirmation */}
              {confirmingDelete ? (
                <>
                  <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                    Delete {selectedVisibleLeads.length} lead{selectedVisibleLeads.length !== 1 ? "s" : ""}?
                  </span>
                  <button
                    onClick={handleBulkDelete}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-semibold"
                  >
                    ✓ Confirm
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="px-3 py-1 text-sm bg-[var(--hover)] text-[var(--text-muted)] rounded-lg hover:brightness-[0.96] transition font-medium"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium"
                >
                  🗑 Delete ({selectedVisibleLeads.length})
                </button>
              )}

              {/* Feature 2: Undo button (visible for 5s after bulk status change) */}
              {undoSnapshot && (
                <button
                  onClick={() => {
                    undoSnapshot.forEach((l) => onUpdateLead(l));
                    setUndoSnapshot(null);
                    setUndoLabel("Bulk change");
                    clearUndoTimer();
                    showToast(`${undoLabel} undone`, "success");
                  }}
                  className="px-3 py-1 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition font-medium flex items-center gap-1"
                >
                  ↩ Undo
                </button>
              )}

              <button
                onClick={() => {
                  setSelectedLeads(new Set());
                  setConfirmingDelete(false);
                  setBulkRep("");
                  setBulkDate("");
                  setBulkCallbackDate("");
                  setBulkCallbackTime("09:00");
                  setBulkFollowUpDate("");
                  setBulkSuburb("");
                  setUndoSnapshot(null);
                  setUndoLabel("Bulk change");
                  clearUndoTimer();
                }}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition px-2"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DataTable;
