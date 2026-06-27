/**
 * SheetsSyncModal — Google Sheets two-way sync
 *
 * Steps:
 *  1. Configure — enter sheet URL + tab name, authorise via GIS OAuth 2.0
 *  2. Map Columns — auto-detect headers, let user map sheet cols → Lead fields
 *  3. Sync — Pull (sheet → Firestore) | Push (Firestore → sheet) | Two-Way
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Lead, LeadStatus } from "../types";
import type { SyncConfig } from "../types";
import { useAppStore } from "../stores/appStore";
import { useSaveLead, useLeads, useAppSettings, useSaveSettings } from "../hooks/useFirebase";
import { useToast } from "../context/ToastContext";
import { normalizeAUPhone } from "../lib/utils";
import { LEAD_STATUS_OPTIONS, normalizeLeadStatus } from "../lib/statusConfig";
import { generateLeadId } from "../lib/idGenerator";
import {
  X,
  RefreshCw,
  Download,
  Upload,
  ArrowLeftRight,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Link2,
  GitCompareArrows,
} from "lucide-react";

// ── Config ────────────────────────────────────────────────────────────────────
const CLIENT_ID = "685269806752-qip9oh4413gd0r4p4emkis3dpb5lanjh.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY ?? import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

// ── Lead field definitions (what can be mapped from/to a sheet column) ────────
// NOTE: 'address' is a virtual field — on Push it combines houseNum+street+suburb+postcode
//       into one string; on Pull it splits back into components + extracts suburb for map.
//       Callback/booking dates and deal value are set via call logging, not imported.
const LEAD_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Contact Number" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" }, // virtual: combined on push, parsed on pull
  { key: "suburb", label: "Suburb" }, // kept separate for map/filter
  { key: "ownership", label: "Renter/Owner" },
  { key: "superannuation", label: "Superannuation" },
  { key: "dqRepName", label: "Rep Name" },
  { key: "status", label: "Lead Status" },
  { key: "result", label: "Call Result" },
  { key: "notes", label: "Notes" },
  { key: "leadDate", label: "Date" },
];

// ── Auto-match aliases ────────────────────────────────────────────────────────
const ALIASES: Record<string, string> = {
  // name
  "full name": "name",
  fullname: "name",
  customer: "name",
  client: "name",
  "lead name": "name",
  // phone
  phone: "phone",
  mobile: "phone",
  contact: "phone",
  "contact number": "phone",
  contactnumber: "phone",
  ph: "phone",
  tel: "phone",
  // email
  email: "email",
  "email address": "email",
  // address — single combined column
  address: "address",
  "full address": "address",
  "property address": "address",
  "street address": "address",
  street: "address",
  road: "address",
  // suburb — kept separate for map filtering
  suburb: "suburb",
  city: "suburb",
  town: "suburb",
  locality: "suburb",
  // rep
  rep: "dqRepName",
  "rep name": "dqRepName",
  repname: "dqRepName",
  "dq rep": "dqRepName",
  dqrep: "dqRepName",
  agent: "dqRepName",
  "assigned to": "dqRepName",
  // status
  status: "status",
  "lead status": "status",
  leadstatus: "status",
  // result
  result: "result",
  "call result": "result",
  callresult: "result",
  outcome: "result",
  // ownership
  ownership: "ownership",
  "owner/renter": "ownership",
  "renter/owner": "ownership",
  renter: "ownership",
  owner: "ownership",
  tenure: "ownership",
  // super
  superannuation: "superannuation",
  super: "superannuation",
  // dates
  date: "leadDate",
  "lead date": "leadDate",
  "dq date": "leadDate",
  // notes
  notes: "notes",
  note: "notes",
  comments: "notes",
  comment: "notes",
};

function autoMatch(header: string): string {
  const normalised = header.toLowerCase().trim();
  return ALIASES[normalised] ?? "";
}

// ── Normalise any date string to YYYY-MM-DD (mirrors DataTable logic) ─────────
function normalizeDateToISO(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  const s = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) return `${dmyDash[3]}-${dmyDash[2].padStart(2, "0")}-${dmyDash[1].padStart(2, "0")}`;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return new Date().toISOString().split("T")[0];
}

const IMPORT_STATUSES: LeadStatus[] = [...LEAD_STATUS_OPTIONS] as LeadStatus[];

// ── Normalise raw status string from sheet to a valid LeadStatus ──────────────
// Handles case differences, abbreviations and common aliases from external sheets.
function normalizeStatus(raw: string, fallback: LeadStatus): LeadStatus {
  return normalizeLeadStatus(raw, normalizeLeadStatus(fallback)) as LeadStatus;
}

// ── Extract spreadsheetId from URL ────────────────────────────────────────────
function extractSheetId(url: string): string | null {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// ── Parse a combined address string into components ────────────────────────────
// Used by both pullFromSheet (two-way) and importFromAnalysis (dedicated pull).
// rawSuburb comes from a mapped Suburb column — takes priority over parsed suburb.
function parseRowAddress(
  rawAddr: string,
  rawSuburb: string,
): {
  houseNum?: string;
  street?: string;
  suburb: string;
  postcode?: string;
} {
  let houseNum: string | undefined;
  let street: string | undefined;
  let suburb = rawSuburb;
  let postcode: string | undefined;
  if (rawAddr) {
    const parts = rawAddr.split(/\s+/);
    const hasHouseNum = parts.length > 1 && /^\d+[A-Za-z]?$/.test(parts[0]);
    const bodyParts = hasHouseNum ? parts.slice(1) : parts;
    houseNum = hasHouseNum ? parts[0] : undefined;
    if (bodyParts.length > 0) {
      const lastPart = bodyParts[bodyParts.length - 1];
      if (/^\d{4}$/.test(lastPart)) {
        postcode = lastPart;
        const withoutPostcode = bodyParts.slice(0, -1);
        if (!suburb && withoutPostcode.length > 0) {
          suburb = withoutPostcode[withoutPostcode.length - 1];
          street = withoutPostcode.slice(0, -1).join(" ") || undefined;
        } else {
          street = withoutPostcode.join(" ") || undefined;
        }
      } else {
        if (!suburb && bodyParts.length > 1) {
          suburb = bodyParts[bodyParts.length - 1];
          street = bodyParts.slice(0, -1).join(" ") || undefined;
        } else {
          street = bodyParts.join(" ") || undefined;
        }
      }
    }
  }
  return { houseNum, street, suburb, postcode };
}

// ── New types for two-phase pull (Analyse → Route → Import) ───────────────────
interface StatusGroup {
  rawValue: string; // raw status string from sheet ('' = no status cell / unmapped)
  count: number;
  updateCount: number; // rows that will UPDATE existing leads (phone already in CRM)
  rows: string[][]; // raw sheet rows belonging to this group
}

interface SheetAnalysis {
  groups: StatusGroup[]; // sorted by count desc
  totalRows: number; // after empty-row filtering (includes existing leads to update)
  updateTotal: number; // total existing-lead updates across all groups
  colIdx: Record<string, number>;
}

// ── TabScan: per-tab result of the Smart Sync scan phase ─────────────────────
interface TabScan {
  tabName: string;
  status: LeadStatus; // pre-filled from normalizeStatus(tabName, 'DQ')
  totalRows: number; // rows with at least a phone number
  newLeads: number; // phone not already in CRM
  updateLeads: number; // phone matches an existing CRM lead
  included: boolean; // user toggle — default true
  rows: string[][]; // raw sheet rows (data only, no header)
  colIdx: Record<string, number>; // column index map built from this tab's header row
}

// ── Types for Sync Updates (match by phone, diff & apply field changes) ────────
interface FieldChange {
  field: string;
  label: string;
  oldVal: string;
  newVal: string;
  /** For fields whose stored type differs from string (e.g. dqRep → number ID).
   *  When present, this value is written to Firestore instead of newVal. */
  resolvedVal?: unknown;
}

interface UpdatePreview {
  lead: Lead;
  changes: FieldChange[];
}

// Fields that can be updated from sheet (Name + Phone are identifiers, not updateable)
const UPDATE_FIELDS: { key: string; label: string }[] = [
  { key: "dqRepName", label: "DQ Rep" },
  { key: "status", label: "Status" },
  { key: "suburb", label: "Suburb" },
  { key: "email", label: "Email" },
  { key: "ownership", label: "Renter/Owner" },
  { key: "superannuation", label: "Superannuation" },
  { key: "notes", label: "Notes" },
];

// ── Declare google types (GIS loaded dynamically) ─────────────────────────────
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = "configure" | "mapping" | "sync";
type SyncAction = "pull" | "push" | "two-way";

interface SyncResult {
  action: SyncAction;
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

interface SheetsSyncModalProps {
  onClose: () => void;
}

// ── Shared input class ────────────────────────────────────────────────────────
const inp =
  "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

// ── Main component ────────────────────────────────────────────────────────────
export function SheetsSyncModal({ onClose }: SheetsSyncModalProps) {
  const { reps, currentUser } = useAppStore();
  const { leads } = useLeads(); // live Firestore subscription — never []
  const { save: saveLead } = useSaveLead();
  const { showToast } = useToast();
  const { settings } = useAppSettings();
  const { save: saveSettings } = useSaveSettings();

  // ── Mount tracking (prevents state updates after unmount during geocoding) ──
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── Config state ──────────────────────────────────────────────────────────
  const [sheetUrl, setSheetUrl] = useState(() => localStorage.getItem("asgSheetUrl") ?? "");
  const [tabName, setTabName] = useState(() => localStorage.getItem("asgSheetTab") ?? "Sheet1");
  const [step, setStep] = useState<Step>("configure");

  // ── Auth state ────────────────────────────────────────────────────────────
  const [gisReady, setGisReady] = useState(false);
  // Restore cached token from sessionStorage (valid ~1h per Google OAuth spec)
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    try {
      const cached = sessionStorage.getItem("asgSheetsToken");
      const ts = Number(sessionStorage.getItem("asgSheetsTokenTs") ?? 0);
      if (cached && Date.now() - ts < 55 * 60 * 1000) return cached; // use if < 55 min old
    } catch {
      /* ignore */
    }
    return null;
  });
  const tokenClientRef = useRef<{ requestAccessToken: () => void } | null>(null);

  // ── Tab list state ────────────────────────────────────────────────────────
  const [sheetTabs, setSheetTabs] = useState<string[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(false);

  // ── Headers / mapping state ───────────────────────────────────────────────
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // leadField → colHeader
  const [loadingHeaders, setLoadingHeaders] = useState(false);

  // ── Sync state ────────────────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<LeadStatus>("DQ");

  // ── Analyse → Route → Import state (dedicated Pull flow) ──────────────────
  const [analysis, setAnalysis] = useState<SheetAnalysis | null>(null);
  const [routingMap, setRoutingMap] = useState<Record<string, LeadStatus>>({});
  // key = rawValue (or '__none__' for rows with empty/unmapped status)
  const [analysing, setAnalysing] = useState(false);
  const [importing, setImporting] = useState(false);

  // ── Smart Sync (multi-tab scan + sync) state ──────────────────────────────
  const [tabScans, setTabScans] = useState<TabScan[]>([]);
  const [scanning, setScanning] = useState(false);
  const [smartSyncing, setSmartSyncing] = useState(false);
  const [smartSyncResult, setSmartSyncResult] = useState<{ added: number; updated: number; tabs: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  // ── Sync Updates state (match by phone, diff & apply field changes) ─────────
  const [updateFields, setUpdateFields] = useState<Record<string, boolean>>({
    dqRepName: true,
    status: true,
    suburb: true,
    email: true,
    ownership: true,
    superannuation: true,
    notes: true,
  });
  const [updatePreview, setUpdatePreview] = useState<UpdatePreview[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ updated: number; unchanged: number; errors: string[] } | null>(
    null,
  );

  // ── Sync sheet config from Firestore settings when available ──────────────
  // Overrides localStorage so config is shared across devices
  useEffect(() => {
    if (settings?.sheets?.url) {
      setSheetUrl(settings.sheets.url);
      localStorage.setItem("asgSheetUrl", settings.sheets.url);
    }
    if (settings?.sheets?.tab) {
      setTabName(settings.sheets.tab);
      localStorage.setItem("asgSheetTab", settings.sheets.tab);
    }
  }, [settings?.sheets?.url, settings?.sheets?.tab]);

  // ── Load GIS script ───────────────────────────────────────────────────────
  useEffect(() => {
    if (window.google?.accounts?.oauth2) {
      setGisReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => setGisReady(true);
    document.head.appendChild(script);
  }, []);

  // ── Initialise token client when GIS is ready ──────────────────────────────
  useEffect(() => {
    if (!gisReady || !window.google) return;
    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.access_token) {
          setAccessToken(response.access_token);
          // Cache token so Quick Pull + repeat modal opens work without re-auth
          try {
            sessionStorage.setItem("asgSheetsToken", response.access_token);
            sessionStorage.setItem("asgSheetsTokenTs", String(Date.now()));
          } catch {
            /* ignore */
          }
        } else {
          showToast("Google sign-in failed: " + (response.error ?? "unknown error"), "error");
        }
      },
    });
  }, [gisReady, showToast]);

  const requestAuth = useCallback(() => {
    tokenClientRef.current?.requestAccessToken();
  }, []);

  // ── Fetch sheet tab names ──────────────────────────────────────────────────
  const fetchSheetTabs = useCallback(async (token: string, sid: string) => {
    setLoadingTabs(true);
    try {
      const res = await fetch(`${SHEETS_API}/${sid}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${token}` },
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      if (!res.ok) return; // silently fall back to text input
      const data = await res.json();
      const tabs: string[] = (data.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title);
      setSheetTabs(tabs);
      // If the saved tab name isn't in the list, default to the first tab
      setTabName((prev) => (tabs.includes(prev) ? prev : (tabs[0] ?? prev)));
    } catch {
      // silently fall back — text input remains usable
    } finally {
      setLoadingTabs(false);
    }
  }, []);

  // Auto-fetch tabs whenever we have a token + valid URL (and are on configure step)
  useEffect(() => {
    const sid = extractSheetId(sheetUrl);
    if (accessToken && sid && step === "configure") {
      fetchSheetTabs(accessToken, sid);
    } else if (!extractSheetId(sheetUrl)) {
      setSheetTabs([]); // reset if URL becomes invalid
    }
  }, [accessToken, sheetUrl, step, fetchSheetTabs]);

  // ── Load sheet headers ─────────────────────────────────────────────────────
  // Requires OAuth Bearer token — the Maps API key is restricted to Maps APIs only.
  const loadHeaders = useCallback(async () => {
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      showToast("Invalid Google Sheets URL", "error");
      return;
    }
    if (!accessToken) {
      showToast("Please sign in with Google first", "error");
      return;
    }
    const range = encodeURIComponent(`${tabName}!1:1`);
    setLoadingHeaders(true);
    try {
      const res = await fetch(`${SHEETS_API}/${sheetId}/values/${range}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "Failed to read sheet");
      }
      const data = await res.json();
      const row: string[] = data.values?.[0] ?? [];
      setHeaders(row);

      // Auto-map
      const autoMapped: Record<string, string> = {};
      LEAD_FIELDS.forEach(({ key }) => {
        const match = row.find((h) => autoMatch(h) === key);
        if (match) autoMapped[key] = match;
      });
      setMapping(autoMapped);

      localStorage.setItem("asgSheetUrl", sheetUrl);
      localStorage.setItem("asgSheetTab", tabName);
      // Persist to Firestore so config is shared across devices
      saveSettings({
        sheets: {
          url: sheetUrl,
          tab: tabName,
          autoSyncEnabled: settings?.sheets?.autoSyncEnabled ?? false,
          autoSyncIntervalMins: settings?.sheets?.autoSyncIntervalMins ?? 15,
        } as SyncConfig,
      }).catch(() => {}); // non-fatal
      setStep("mapping");
    } catch (e: unknown) {
      showToast("Error loading headers: " + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setLoadingHeaders(false);
    }
  }, [sheetUrl, tabName, showToast, saveSettings, settings, accessToken]);

  // ── Auto-advance to sync step when sheet is already configured ──────────────
  // If modal opens with a saved URL+tab AND a cached OAuth token, skip straight
  // to the sync step. Without a token we stay on configure so the user can sign in.
  useEffect(() => {
    if (settings?.sheets?.url && settings?.sheets?.tab && step === "configure") {
      const sid = extractSheetId(settings.sheets.url);
      if (sid) {
        setSheetUrl(settings.sheets.url);
        setTabName(settings.sheets.tab);
        if (accessToken) {
          // Token cached from sessionStorage — load headers and jump straight to sync
          loadHeaders()
            .then(() => setStep("sync"))
            .catch(() => {});
        }
        // If no token: stay on configure; user clicks "Connect" → OAuth → loadHeaders auto-fires
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only run once on mount

  // Auto-load headers when OAuth token arrives (e.g. after clicking Connect)
  useEffect(() => {
    if (accessToken && sheetUrl && step === "configure") {
      loadHeaders()
        .then(() => setStep("sync"))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]); // run whenever token is newly set

  const handleConnect = () => {
    if (!sheetUrl.trim()) {
      showToast("Please enter a Google Sheets URL", "error");
      return;
    }
    if (accessToken) {
      // Already have a cached token — load headers directly
      loadHeaders();
    } else {
      // No token — trigger Google OAuth popup; loadHeaders will fire automatically once token arrives
      if (!gisReady || !tokenClientRef.current) {
        showToast("Google sign-in is loading, please try again in a moment", "error");
        return;
      }
      tokenClientRef.current.requestAccessToken();
    }
  };

  // ── Build reps lookup ──────────────────────────────────────────────────────
  const repsByName = useCallback(
    (name: string): number => {
      if (!name) return currentUser?.id ?? 1;
      const lower = name.toLowerCase().trim();
      const rep = reps.find((r) => r.name.toLowerCase() === lower);
      return rep?.id ?? currentUser?.id ?? 1;
    },
    [reps, currentUser],
  );

  const repName = useCallback(
    (id: number): string => {
      return reps.find((r) => r.id === id)?.name ?? "";
    },
    [reps],
  );

  // ── Sheet ID helper ────────────────────────────────────────────────────────
  const sheetId = extractSheetId(sheetUrl) ?? "";

  // ── SMART SYNC — Phase 1: Scan all sheet tabs ─────────────────────────────
  // Fetches every tab in sheetTabs, builds a ColIdx per tab (using the same
  // ALIASES mapping), counts new vs updating leads, lets user toggle inclusion
  // and override the target LeadStatus per tab before syncing.
  const scanAllTabs = useCallback(async () => {
    if (!accessToken || !sheetId) {
      showToast("Please connect to Google first", "error");
      return;
    }
    const tabsToScan = sheetTabs.length > 0 ? sheetTabs : [tabName];
    if (tabsToScan.length === 0) {
      showToast("No sheet tabs found — go back to Step 1 and connect first", "error");
      return;
    }
    setScanning(true);
    setTabScans([]);
    setSmartSyncResult(null);

    // Build a phone set from existing CRM leads for new vs update classification
    const existingPhones = new Set(leads.map((l) => normalizeAUPhone(l.phone ?? "")));

    const scans: TabScan[] = [];

    for (const tab of tabsToScan) {
      try {
        // 1. Fetch header row to build colIdx for this tab
        const headerRange = encodeURIComponent(`${tab}!1:1`);
        const hRes = await fetch(`${SHEETS_API}/${sheetId}/values/${headerRange}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          referrerPolicy: "strict-origin-when-cross-origin",
        });
        if (!hRes.ok) continue; // skip tabs we can't read

        const hData = await hRes.json();
        const tabHeaders: string[] = hData.values?.[0] ?? [];

        // Auto-build colIdx using ALIASES (same logic as loadHeaders)
        const colIdx: Record<string, number> = {};
        tabHeaders.forEach((h, i) => {
          const field = autoMatch(h);
          if (field && !(field in colIdx)) colIdx[field] = i;
        });
        // Also apply user-configured mapping as override/supplement
        LEAD_FIELDS.forEach(({ key }) => {
          const mappedHeader = mapping[key];
          if (mappedHeader) {
            const idx = tabHeaders.indexOf(mappedHeader);
            if (idx !== -1) colIdx[key] = idx;
          }
        });

        // Rate-limit between tab fetches
        await new Promise((r) => setTimeout(r, 200));

        // 2. Fetch all data rows for this tab
        const dataRange = encodeURIComponent(`${tab}!A:Z`);
        const dRes = await fetch(`${SHEETS_API}/${sheetId}/values/${dataRange}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          referrerPolicy: "strict-origin-when-cross-origin",
        });
        if (!dRes.ok) continue;

        const dData = await dRes.json();
        const allRows: string[][] = dData.values ?? [];
        const dataRows = allRows.length > 1 ? allRows.slice(1) : [];

        // 3. Count new vs updating rows (must have phone to be countable)
        let newLeads = 0;
        let updateLeads = 0;
        const validRows: string[][] = [];
        for (const row of dataRows) {
          const rawPhone = (row[colIdx["phone"] ?? -1] ?? "").trim();
          if (!rawPhone) continue; // skip rows without a phone number
          const phone = normalizeAUPhone(rawPhone);
          validRows.push(row);
          if (existingPhones.has(phone)) {
            updateLeads++;
          } else {
            newLeads++;
          }
        }

        // 4. Pre-fill status from tab name
        const tabStatus = normalizeStatus(tab, "DQ");

        scans.push({
          tabName: tab,
          status: tabStatus,
          totalRows: validRows.length,
          newLeads,
          updateLeads,
          included: true,
          rows: validRows,
          colIdx,
        });
      } catch {
        // silently skip tabs that error
      }

      // Rate-limit between tab fetches
      await new Promise((r) => setTimeout(r, 200));
    }

    setTabScans(scans);
    setScanning(false);

    const totalNew = scans.reduce((s, t) => s + t.newLeads, 0);
    const totalUpdate = scans.reduce((s, t) => s + t.updateLeads, 0);
    showToast(
      `Scanned ${scans.length} tab${scans.length !== 1 ? "s" : ""} — ${totalNew} new, ${totalUpdate} to update`,
      "success",
    );
  }, [accessToken, sheetId, sheetTabs, tabName, leads, mapping, showToast]);

  // ── SMART SYNC — Phase 2: Sync included tabs ──────────────────────────────
  // For each included TabScan: update existing leads (by phone) or create new.
  // Updates: sets status + name, address, email, suburb, postcode, notes, dqRepName.
  // Creates: new lead with status = tab's mapped status, leadDate = today if absent.
  const syncFromScans = useCallback(async () => {
    if (tabScans.length === 0) return;
    const included = tabScans.filter((t) => t.included);
    if (included.length === 0) {
      showToast("No tabs selected — toggle at least one tab to include", "error");
      return;
    }
    setSmartSyncing(true);
    setSmartSyncResult(null);
    setGeocoding(false);

    // Build phone → lead map for fast update lookups
    const phoneToLead = new Map<string, Lead>();
    leads.forEach((l) => {
      const p = normalizeAUPhone(l.phone ?? "");
      if (p) phoneToLead.set(p, l);
    });

    // Track phones processed this run to avoid double-saves across tabs
    const processedPhones = new Set<string>();
    let totalAdded = 0;
    let totalUpdated = 0;
    // Collect new leads that have an address for post-sync geocoding
    const newLeadsToGeocode: Lead[] = [];

    for (const scan of included) {
      const { colIdx, status: targetStatus, rows } = scan;
      const get = (row: string[], key: string) => (row[colIdx[key] ?? -1] ?? "").trim();

      for (const row of rows) {
        const phone = normalizeAUPhone(get(row, "phone"));
        if (!phone) continue;
        if (processedPhones.has(phone)) continue;
        processedPhones.add(phone);

        const name = get(row, "name");
        const rawDate = get(row, "leadDate");
        const resolvedDate = rawDate ? normalizeDateToISO(rawDate) : new Date().toISOString().split("T")[0];
        const rawAddr = get(row, "address");
        const rawSuburb = get(row, "suburb");
        const { houseNum, street, suburb, postcode } = parseRowAddress(rawAddr, rawSuburb);
        const dqRepName = get(row, "dqRepName");
        const email = get(row, "email");
        const notes = get(row, "notes");
        const ownership = get(row, "ownership");
        const superannuation = get(row, "superannuation");

        const existingLead = phoneToLead.get(phone);

        if (existingLead) {
          // UPDATE existing lead
          const patch: Partial<Lead> = { status: targetStatus };
          if (name && name !== existingLead.name) patch.name = name;
          if (email && email !== existingLead.email) patch.email = email;
          if (notes && notes !== existingLead.notes) patch.notes = notes;
          if (ownership && ownership !== existingLead.ownership) patch.ownership = ownership;
          if (superannuation && superannuation !== existingLead.superannuation) patch.superannuation = superannuation;
          if (houseNum && houseNum !== existingLead.houseNum) patch.houseNum = houseNum;
          if (street && street !== existingLead.street) patch.street = street;
          if (suburb && suburb !== existingLead.suburb) patch.suburb = suburb;
          if (postcode && postcode !== existingLead.postcode) patch.postcode = postcode;
          if (dqRepName) {
            const resolvedId = repsByName(dqRepName);
            if (resolvedId !== existingLead.dqRep) patch.dqRep = resolvedId;
          }
          try {
            await saveLead({ ...existingLead, ...patch });
            totalUpdated++;
          } catch {
            /* skip on error */
          }
        } else {
          // CREATE new lead
          const lead: Lead = {
            id: generateLeadId(),
            name: name || "Unknown",
            phone,
            email: email || undefined,
            houseNum: houseNum || undefined,
            street: street || undefined,
            suburb: suburb || "",
            postcode: postcode || undefined,
            ownership: ownership || undefined,
            superannuation: superannuation || undefined,
            dqRep: repsByName(dqRepName),
            status: targetStatus,
            notes: notes || undefined,
            leadDate: resolvedDate,
            createdAt: Date.now(),
            callHistory: [],
          };
          try {
            await saveLead(lead);
            totalAdded++;
            // Queue for geocoding if it has enough address data
            if (lead.suburb || lead.street) {
              newLeadsToGeocode.push(lead);
            }
          } catch {
            /* skip on error */
          }
        }
      }
    }

    const result = { added: totalAdded, updated: totalUpdated, tabs: included.length };
    setSmartSyncResult(result);
    setSmartSyncing(false);
    showToast(
      `✅ Synced ${included.length} tab${included.length !== 1 ? "s" : ""} — ${totalAdded} added, ${totalUpdated} updated`,
      "success",
    );

    // ── Post-sync geocoding ─────────────────────────────────────────────────
    // Geocode newly added leads so they appear on the map immediately.
    // Runs as a background IIFE after the sync result is shown.
    if (newLeadsToGeocode.length > 0) {
      if (isMountedRef.current) setGeocoding(true);
      showToast(
        `📍 Geocoding ${newLeadsToGeocode.length} new lead${newLeadsToGeocode.length !== 1 ? "s" : ""} for the map…`,
        "info",
      );
      (async () => {
        let geocoded = 0;
        for (const lead of newLeadsToGeocode) {
          if (!isMountedRef.current) break; // stop if modal was closed
          try {
            const addressStr = [lead.houseNum, lead.street, lead.suburb, lead.postcode, "WA", "Australia"]
              .filter(Boolean)
              .join(" ");
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressStr)}&key=${GOOGLE_API_KEY}`;
            const res = await fetch(url, { referrerPolicy: "strict-origin-when-cross-origin" });
            const data = await res.json();
            if (data.status === "OK" && data.results?.[0]) {
              const { lat, lng } = data.results[0].geometry.location as { lat: number; lng: number };
              await saveLead({ ...lead, lat, lng });
              geocoded++;
            }
          } catch {
            /* skip geocoding errors */
          }
          // Rate-limit: 200ms between requests to stay within Google's free tier limits
          await new Promise((r) => setTimeout(r, 200));
        }
        if (isMountedRef.current) {
          setGeocoding(false);
          if (geocoded > 0) {
            showToast(`📍 Geocoded ${geocoded} lead${geocoded !== 1 ? "s" : ""} — map is ready`, "success");
          }
        }
      })();
    }
  }, [tabScans, leads, repsByName, saveLead, showToast]);

  // ── ANALYSE: fetch + group by status (no Firestore writes) ────────────────
  // Phase 1 of the dedicated Pull flow. Groups sheet rows by their raw status
  // string and pre-fills the routing map with normalised target statuses.
  const analyseSheet = useCallback(async () => {
    setAnalysing(true);
    setAnalysis(null);
    setSyncResult(null);
    try {
      const range = encodeURIComponent(`${tabName}!A:Z`);
      // Uses API key — no OAuth required for read access on a viewable sheet
      const res = await fetch(`${SHEETS_API}/${sheetId}/values/${range}?key=${GOOGLE_API_KEY}`, {
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error?.message ?? "Read failed");
      }
      const data = await res.json();
      const allRows: string[][] = data.values ?? [];
      if (allRows.length < 2) {
        showToast("Sheet has no data rows to analyse", "error");
        return;
      }

      const sheetHeaders = allRows[0];
      const dataRows = allRows.slice(1);

      // Build column index map from current mapping
      const colIdx: Record<string, number> = {};
      LEAD_FIELDS.forEach(({ key }) => {
        const colHeader = mapping[key];
        if (colHeader) {
          const idx = sheetHeaders.indexOf(colHeader);
          if (idx !== -1) colIdx[key] = idx;
        }
      });

      const existingPhones = new Set(leads.map((l) => normalizeAUPhone(l.phone ?? "")));
      // Map: mapKey → { rows: all rows, updateRows: rows that match existing CRM leads }
      const groupMap = new Map<string, { rows: string[][]; updateRows: Set<number> }>();

      for (const row of dataRows) {
        const get = (key: string) => (row[colIdx[key] ?? -1] ?? "").trim();
        const name = get("name");
        const phone = normalizeAUPhone(get("phone"));
        const suburb = get("suburb");
        // Skip fully empty rows
        if (!name && !phone && !suburb) continue;

        const rawStatus = get("status");
        const mapKey = rawStatus || "__none__";
        if (!groupMap.has(mapKey)) groupMap.set(mapKey, { rows: [], updateRows: new Set() });
        const group = groupMap.get(mapKey)!;
        const localIdx = group.rows.length;
        group.rows.push(row);
        // Track whether this row will UPDATE an existing lead vs create a new one
        if (phone && existingPhones.has(phone)) {
          group.updateRows.add(localIdx);
        }
      }

      // Build sorted groups (highest count first, '__none__' always last)
      const groups: StatusGroup[] = Array.from(groupMap.entries())
        .map(([mapKey, { rows, updateRows }]) => ({
          rawValue: mapKey === "__none__" ? "" : mapKey,
          count: rows.length,
          updateCount: updateRows.size,
          rows,
        }))
        .sort((a, b) => {
          if (!a.rawValue) return 1;
          if (!b.rawValue) return -1;
          return b.count - a.count;
        });

      const updateTotal = groups.reduce((s, g) => s + g.updateCount, 0);
      const newAnalysis: SheetAnalysis = {
        groups,
        totalRows: groups.reduce((s, g) => s + g.count, 0),
        updateTotal,
        colIdx,
      };
      setAnalysis(newAnalysis);

      // Pre-fill routing map: normalise each raw status → valid LeadStatus
      const newRouting: Record<string, LeadStatus> = {};
      groups.forEach((g) => {
        const key = g.rawValue || "__none__";
        newRouting[key] = g.rawValue ? normalizeStatus(g.rawValue, defaultStatus) : defaultStatus;
      });
      setRoutingMap(newRouting);

      if (updateTotal > 0) {
        showToast(
          `ℹ️ ${updateTotal} existing lead${updateTotal !== 1 ? "s" : ""} will have their status updated`,
          "info",
        );
      }
    } catch (e: unknown) {
      showToast("Analysis failed: " + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setAnalysing(false);
    }
  }, [tabName, sheetId, mapping, leads, defaultStatus, showToast]);

  // ── IMPORT FROM ANALYSIS: save grouped rows using the routing map ──────────
  // Phase 2 of the dedicated Pull flow. Uses routingMap to assign each group's
  // rows to the correct target status before saving to Firestore.
  const importFromAnalysis = useCallback(async () => {
    if (!analysis) return;
    setImporting(true);
    setSyncResult(null);
    // Build a phone → lead map for fast lookups when updating existing leads
    const phoneToLead = new Map<string, Lead>();
    leads.forEach((l) => {
      const p = normalizeAUPhone(l.phone ?? "");
      if (p) phoneToLead.set(p, l);
    });
    // Track phones we've already processed this run to avoid double-saves
    const processedPhones = new Set<string>();
    let added = 0,
      updated = 0,
      skipped = 0;
    const errors: string[] = [];

    for (const group of analysis.groups) {
      const routingKey = group.rawValue || "__none__";
      const targetStatus: LeadStatus = routingMap[routingKey] ?? defaultStatus;

      for (const row of group.rows) {
        const get = (key: string) => (row[analysis.colIdx[key] ?? -1] ?? "").trim();
        const name = get("name");
        const phone = normalizeAUPhone(get("phone"));

        // Skip if we already processed this phone in this import run
        if (phone && processedPhones.has(phone)) {
          skipped++;
          continue;
        }

        const dqRepName = get("dqRepName");
        const rawDate = get("leadDate");
        const resolvedDate = rawDate ? normalizeDateToISO(rawDate) : undefined;
        const { houseNum, street, suburb, postcode } = parseRowAddress(get("address"), get("suburb"));

        const existingLead = phone ? phoneToLead.get(phone) : undefined;

        if (existingLead) {
          // UPDATE existing lead: change status to what the sheet says
          // Only update if status actually changed
          if (String(existingLead.status) !== String(targetStatus)) {
            try {
              await saveLead({ ...existingLead, status: targetStatus });
              updated++;
            } catch (e: unknown) {
              errors.push(`Update ${name}: ${e instanceof Error ? e.message : String(e)}`);
            }
          } else {
            skipped++; // same status, no change needed
          }
        } else {
          // CREATE new lead
          const lead: Lead = {
            id: generateLeadId(),
            name: name || "Unknown",
            phone: get("phone"),
            email: get("email") || undefined,
            houseNum: houseNum || undefined,
            street: street || undefined,
            suburb: suburb || "",
            postcode: postcode || undefined,
            ownership: get("ownership") || undefined,
            superannuation: get("superannuation") || undefined,
            dqRep: repsByName(dqRepName),
            status: targetStatus,
            result: get("result") || undefined,
            notes: get("notes") || undefined,
            leadDate: resolvedDate,
            createdAt: Date.now(),
            callHistory: [],
          };
          try {
            await saveLead(lead);
            added++;
          } catch (e: unknown) {
            errors.push(`Row: ${name} — ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        if (phone) processedPhones.add(phone);
      }
    }

    const result: SyncResult = { action: "pull", added, updated, skipped, errors };
    setSyncResult(result);
    const msgs: string[] = [];
    if (added > 0) msgs.push(`${added} new`);
    if (updated > 0) msgs.push(`${updated} updated`);
    if (skipped > 0) msgs.push(`${skipped} skipped`);
    showToast(`✅ Import complete — ${msgs.join(", ") || "no changes"}`, "success");
    // Persist sync status to Firestore settings
    const summary = `↓${added} new, ${updated} updated`;
    saveSettings({
      sheets: {
        ...(settings?.sheets ?? { url: sheetUrl, tab: tabName, autoSyncEnabled: false, autoSyncIntervalMins: 15 }),
        lastSyncAt: Date.now(),
        lastSyncResult: errors.length > 0 ? "partial" : "success",
        lastSyncSummary: summary,
      } as SyncConfig,
    }).catch(() => {}); // non-fatal
    setAnalysis(null); // reset so they can re-analyse if needed
    setImporting(false);
  }, [
    analysis,
    routingMap,
    defaultStatus,
    leads,
    repsByName,
    saveLead,
    showToast,
    saveSettings,
    settings,
    sheetUrl,
    tabName,
  ]);

  // ── SYNC UPDATES: match by phone, diff enabled fields, preview ────────────
  const previewUpdates = useCallback(async () => {
    if (!accessToken) return;
    // Phone must be mapped — it's the matching key
    if (!mapping["phone"]) {
      showToast('Map the "Contact Number" column first so leads can be matched by phone', "error");
      return;
    }
    setPreviewing(true);
    setUpdatePreview(null);
    setUpdateResult(null);
    try {
      const range = encodeURIComponent(`${tabName}!A:Z`);
      const res = await fetch(`${SHEETS_API}/${sheetId}/values/${range}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error?.message ?? "Read failed");
      }
      const data = await res.json();
      const allRows: string[][] = data.values ?? [];
      if (allRows.length < 2) {
        showToast("Sheet has no data rows", "error");
        return;
      }

      const sheetHeaders = allRows[0];
      const dataRows = allRows.slice(1);

      // Build column index from current mapping
      const colIdx: Record<string, number> = {};
      LEAD_FIELDS.forEach(({ key }) => {
        const colHeader = mapping[key];
        if (colHeader) {
          const idx = sheetHeaders.indexOf(colHeader);
          if (idx !== -1) colIdx[key] = idx;
        }
      });

      // Build phone → lead lookup map from CRM leads
      const phoneMap = new Map<string, Lead>();
      leads.forEach((l) => {
        const phone = (l.phone ?? "").replace(/\s/g, "");
        if (phone) phoneMap.set(phone, l);
      });

      const previews: UpdatePreview[] = [];

      for (const row of dataRows) {
        const get = (key: string) => (row[colIdx[key] ?? -1] ?? "").trim();
        const sheetPhone = get("phone").replace(/\s/g, "");
        if (!sheetPhone) continue;

        // Find matching CRM lead by phone
        const existingLead = phoneMap.get(sheetPhone);
        if (!existingLead) continue; // no match — this is a new lead, not an update

        const changes: FieldChange[] = [];

        // Parse address to extract suburb if address column is mapped but suburb isn't
        let parsedSuburb = "";
        if (colIdx["address"] !== undefined) {
          const { suburb } = parseRowAddress(get("address"), get("suburb"));
          parsedSuburb = suburb;
        }

        // Diff each enabled field
        for (const { key, label } of UPDATE_FIELDS) {
          if (!updateFields[key]) continue;

          let sheetVal = "";
          if (key === "dqRepName") {
            // Rep name → resolve to ID, compare against existing dqRep
            const rawRepName = colIdx["dqRepName"] !== undefined ? get("dqRepName") : "";
            if (!rawRepName) continue;
            const resolvedId = repsByName(rawRepName);
            if (resolvedId !== existingLead.dqRep) {
              const oldName = repName(existingLead.dqRep) || String(existingLead.dqRep);
              // resolvedVal stores the actual numeric ID; newVal is the human-readable name for display
              changes.push({ field: "dqRep", label, oldVal: oldName, newVal: rawRepName, resolvedVal: resolvedId });
            }
            continue; // handled — skip generic string comparison below
          } else if (key === "suburb") {
            // Prefer explicit suburb column; fall back to address-parsed suburb
            sheetVal = colIdx["suburb"] !== undefined ? get("suburb") : parsedSuburb;
          } else if (key === "status") {
            const rawStatus = colIdx["status"] !== undefined ? get("status") : "";
            sheetVal = rawStatus ? (normalizeStatus(rawStatus, existingLead.status as LeadStatus) as string) : "";
          } else {
            sheetVal = colIdx[key] !== undefined ? get(key) : "";
          }

          if (!sheetVal) continue; // blank cell — don't overwrite with empty

          const crmVal = String((existingLead as unknown as Record<string, unknown>)[key] ?? "").trim();
          if (sheetVal !== crmVal) {
            changes.push({ field: key, label, oldVal: crmVal || "(empty)", newVal: sheetVal });
          }
        }

        if (changes.length > 0) {
          previews.push({ lead: existingLead, changes });
        }
      }

      setUpdatePreview(previews);
      if (previews.length === 0) {
        showToast("✅ No differences found — all matched leads are already up to date", "success");
      }
    } catch (e: unknown) {
      showToast("Preview failed: " + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setPreviewing(false);
    }
  }, [accessToken, sheetId, tabName, mapping, leads, updateFields, showToast]);

  // ── SYNC UPDATES: apply previewed changes ──────────────────────────────────
  const applyUpdates = useCallback(async () => {
    if (!updatePreview || updatePreview.length === 0) return;
    setUpdating(true);
    let updated = 0,
      unchanged = 0;
    const errors: string[] = [];

    for (const { lead, changes } of updatePreview) {
      const patch: Partial<Lead> = {};
      changes.forEach(({ field, newVal, resolvedVal }) => {
        // Use resolvedVal when the field type differs from string (e.g. dqRep is a number)
        (patch as Record<string, unknown>)[field] = resolvedVal !== undefined ? resolvedVal : newVal;
      });
      try {
        await saveLead({ ...lead, ...patch });
        updated++;
      } catch (e: unknown) {
        unchanged++;
        errors.push(`${lead.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    setUpdateResult({ updated, unchanged, errors });
    setUpdatePreview(null);
    showToast(
      `✅ Updates applied — ${updated} lead${updated !== 1 ? "s" : ""} updated${errors.length > 0 ? `, ${errors.length} error(s)` : ""}`,
      errors.length > 0 ? "error" : "success",
    );
    setUpdating(false);
  }, [updatePreview, saveLead, showToast]);
  void analysing;
  void importing;
  void geocoding;
  void previewing;
  void analyseSheet;
  void importFromAnalysis;
  void previewUpdates;
  void applyUpdates;

  // ── PULL UPDATES: one-pass match → diff → apply (no preview step) ──────────
  const pullAndApplyUpdates = useCallback(async () => {
    if (!accessToken) return;
    if (!mapping["phone"]) {
      showToast('Map the "Contact Number" column first so leads can be matched by phone', "error");
      return;
    }
    setUpdating(true);
    setUpdateResult(null);
    setUpdatePreview(null);
    try {
      const range = encodeURIComponent(`${tabName}!A:Z`);
      const res = await fetch(`${SHEETS_API}/${sheetId}/values/${range}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error?.message ?? "Read failed");
      }
      const data = await res.json();
      const allRows: string[][] = data.values ?? [];
      if (allRows.length < 2) {
        showToast("Sheet has no data rows", "error");
        return;
      }

      const sheetHeaders = allRows[0];
      const dataRows = allRows.slice(1);

      // Build column index from current mapping
      const colIdx: Record<string, number> = {};
      LEAD_FIELDS.forEach(({ key }) => {
        const colHeader = mapping[key];
        if (colHeader) {
          const idx = sheetHeaders.indexOf(colHeader);
          if (idx !== -1) colIdx[key] = idx;
        }
      });

      // Phone → lead lookup
      const phoneMap = new Map<string, Lead>();
      leads.forEach((l) => {
        const phone = (l.phone ?? "").replace(/\s/g, "");
        if (phone) phoneMap.set(phone, l);
      });

      let updated = 0,
        unchanged = 0;
      const errors: string[] = [];

      for (const row of dataRows) {
        const get = (key: string) => (row[colIdx[key] ?? -1] ?? "").trim();
        const sheetPhone = get("phone").replace(/\s/g, "");
        if (!sheetPhone) continue;

        const existingLead = phoneMap.get(sheetPhone);
        if (!existingLead) continue; // new lead, not an update

        // Parse address for suburb fallback
        let parsedSuburb = "";
        if (colIdx["address"] !== undefined) {
          const { suburb } = parseRowAddress(get("address"), get("suburb"));
          parsedSuburb = suburb;
        }

        const patch: Partial<Lead> = {};
        for (const { key } of UPDATE_FIELDS) {
          if (!updateFields[key]) continue;
          if (key === "dqRepName") {
            // Rep name → resolve to numeric ID, compare against existing dqRep
            const rawRepName = colIdx["dqRepName"] !== undefined ? get("dqRepName") : "";
            if (!rawRepName) continue;
            const resolvedId = repsByName(rawRepName);
            if (resolvedId !== existingLead.dqRep) patch.dqRep = resolvedId;
            continue;
          }
          let sheetVal = "";
          if (key === "suburb") {
            sheetVal = colIdx["suburb"] !== undefined ? get("suburb") : parsedSuburb;
          } else if (key === "status") {
            const rawStatus = colIdx["status"] !== undefined ? get("status") : "";
            sheetVal = rawStatus ? (normalizeStatus(rawStatus, existingLead.status as LeadStatus) as string) : "";
          } else {
            sheetVal = colIdx[key] !== undefined ? get(key) : "";
          }
          if (!sheetVal) continue; // blank cell — never overwrite with empty
          const crmVal = String((existingLead as unknown as Record<string, unknown>)[key] ?? "").trim();
          if (sheetVal !== crmVal) (patch as Record<string, unknown>)[key] = sheetVal;
        }

        if (Object.keys(patch).length === 0) {
          unchanged++;
          continue;
        }
        try {
          await saveLead({ ...existingLead, ...patch });
          updated++;
        } catch (e) {
          errors.push(`${existingLead.name}: ${e instanceof Error ? e.message : "save failed"}`);
        }
      }

      setUpdateResult({ updated, unchanged, errors });
      showToast(
        updated > 0
          ? `✅ ${updated} lead${updated !== 1 ? "s" : ""} updated from sheet`
          : "✅ All matched leads are already up to date",
        errors.length > 0 ? "error" : "success",
      );
    } catch (e: unknown) {
      showToast("Pull failed: " + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setUpdating(false);
    }
  }, [accessToken, sheetId, tabName, mapping, leads, updateFields, saveLead, showToast]);

  // ── PULL: sheet → Firestore ────────────────────────────────────────────────
  const pullFromSheet = useCallback(async (): Promise<SyncResult> => {
    if (!accessToken) throw new Error("Not authenticated");
    const range = encodeURIComponent(`${tabName}!A:Z`);
    const res = await fetch(`${SHEETS_API}/${sheetId}/values/${range}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error?.message ?? "Read failed");
    }
    const data = await res.json();
    const rows: string[][] = data.values ?? [];
    if (rows.length < 2) return { action: "pull", added: 0, updated: 0, skipped: 0, errors: [] };

    const sheetHeaders = rows[0];
    const dataRows = rows.slice(1);

    // Build col index map
    const colIdx: Record<string, number> = {};
    LEAD_FIELDS.forEach(({ key }) => {
      const colHeader = mapping[key];
      if (colHeader) {
        const idx = sheetHeaders.indexOf(colHeader);
        if (idx !== -1) colIdx[key] = idx;
      }
    });

    const existingPhones = new Set(leads.map((l) => normalizeAUPhone(l.phone ?? "")));
    let added = 0,
      skipped = 0;
    const errors: string[] = [];

    for (const row of dataRows) {
      const get = (key: string) => (row[colIdx[key] ?? -1] ?? "").trim();
      const name = get("name");
      const phone = normalizeAUPhone(get("phone"));

      // ── Parse combined address field ────────────────────────────────────────
      // Sheet stores: "15 Smith St Bentleigh 3204" (House # + Street + Suburb + Postcode)
      // Split them back into components and extract suburb for map filtering
      let houseNum: string | undefined;
      let street: string | undefined;
      let suburb = get("suburb"); // prefer an explicit Suburb column if mapped
      let postcode: string | undefined;

      const rawAddr = get("address");
      if (rawAddr) {
        const parts = rawAddr.split(/\s+/);
        // Detect leading house number (digits, optionally followed by a letter e.g. "12A")
        const hasHouseNum = parts.length > 1 && /^\d+[A-Za-z]?$/.test(parts[0]);
        const bodyParts = hasHouseNum ? parts.slice(1) : parts;
        houseNum = hasHouseNum ? parts[0] : undefined;

        if (bodyParts.length > 0) {
          const lastPart = bodyParts[bodyParts.length - 1];
          // Last token is 4-digit postcode (Australian)
          if (/^\d{4}$/.test(lastPart)) {
            postcode = lastPart;
            const withoutPostcode = bodyParts.slice(0, -1);
            // Token before postcode is the suburb (if suburb not already mapped)
            if (!suburb && withoutPostcode.length > 0) {
              suburb = withoutPostcode[withoutPostcode.length - 1];
              street = withoutPostcode.slice(0, -1).join(" ") || undefined;
            } else {
              street = withoutPostcode.join(" ") || undefined;
            }
          } else {
            // No postcode — last word is suburb (if suburb not already mapped)
            if (!suburb && bodyParts.length > 1) {
              suburb = bodyParts[bodyParts.length - 1];
              street = bodyParts.slice(0, -1).join(" ") || undefined;
            } else {
              street = bodyParts.join(" ") || undefined;
            }
          }
        }
      }

      if (!name && !phone && !suburb) continue; // empty row

      // Skip if phone already exists
      if (phone && existingPhones.has(phone)) {
        skipped++;
        continue;
      }

      const dqRepName = get("dqRepName");
      // Determine status: normalise sheet value (handles case/aliases), fall back to default
      const rawSheetStatus = get("status");
      const resolvedStatus: LeadStatus = rawSheetStatus
        ? normalizeStatus(rawSheetStatus, defaultStatus)
        : defaultStatus;
      // Normalise date: convert DD/MM/YYYY and other formats → YYYY-MM-DD before saving.
      // If the sheet has no date for this row, leave leadDate undefined (shows as "No Date" group)
      // rather than defaulting to today (which would falsely group undated leads as imported today).
      const rawDate = get("leadDate");
      const resolvedDate = rawDate ? normalizeDateToISO(rawDate) : undefined;
      const lead: Lead = {
        id: generateLeadId(),
        name: name || "Unknown",
        phone: get("phone"),
        email: get("email") || undefined,
        houseNum: houseNum || undefined,
        street: street || undefined,
        suburb: suburb || "",
        postcode: postcode || undefined,
        ownership: get("ownership") || undefined,
        superannuation: get("superannuation") || undefined,
        dqRep: repsByName(dqRepName),
        status: resolvedStatus,
        result: get("result") || undefined,
        notes: get("notes") || undefined,
        leadDate: resolvedDate,
        createdAt: Date.now(),
        callHistory: [],
      };

      try {
        await saveLead(lead);
        existingPhones.add(phone);
        added++;
      } catch (e: unknown) {
        errors.push(`Row: ${name} — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { action: "pull", added, updated: 0, skipped, errors };
  }, [accessToken, sheetId, tabName, mapping, leads, repsByName, saveLead, defaultStatus]);

  // ── PUSH: Firestore → sheet ────────────────────────────────────────────────
  const pushToSheet = useCallback(async (): Promise<SyncResult> => {
    if (!accessToken) throw new Error("Not authenticated");

    // Build header row from active mapping
    const activeMappings = LEAD_FIELDS.filter(({ key }) => mapping[key]);
    const headerRow = activeMappings.map(({ key }) => mapping[key]);
    const dataRows = leads.map((lead) =>
      activeMappings.map(({ key }) => {
        // Virtual 'address' key — combine split fields into one string for the sheet
        if (key === "address") {
          return [lead.houseNum, lead.street, lead.suburb, lead.postcode].filter(Boolean).join(" ");
        }
        if (key === "dqRepName") return repName(lead.dqRep);
        const val = (lead as unknown as Record<string, unknown>)[key];
        return val !== undefined && val !== null ? String(val) : "";
      }),
    );

    const body = { values: [headerRow, ...dataRows] };
    const range = encodeURIComponent(`${tabName}!A1`);

    // Clear first
    await fetch(`${SHEETS_API}/${sheetId}/values/${encodeURIComponent(tabName)}:clear`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      referrerPolicy: "strict-origin-when-cross-origin",
    });

    // Write
    const res = await fetch(`${SHEETS_API}/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error?.message ?? "Write failed");
    }

    return { action: "push", added: 0, updated: leads.length, skipped: 0, errors: [] };
  }, [accessToken, sheetId, tabName, mapping, leads, repName]);

  // ── Run sync ───────────────────────────────────────────────────────────────
  const runSync = useCallback(
    async (action: SyncAction) => {
      setSyncing(true);
      setSyncResult(null);
      try {
        let result: SyncResult;
        if (action === "pull") {
          result = await pullFromSheet();
        } else if (action === "push") {
          result = await pushToSheet();
        } else {
          const pullResult = await pullFromSheet();
          const pushResult = await pushToSheet();
          result = {
            action: "two-way",
            added: pullResult.added,
            updated: pushResult.updated,
            skipped: pullResult.skipped,
            errors: [...pullResult.errors, ...pushResult.errors],
          };
        }
        setSyncResult(result);
        const msgs: string[] = [];
        if (result.added > 0) msgs.push(`${result.added} added`);
        if (result.updated > 0) msgs.push(`${result.updated} pushed`);
        if (result.skipped > 0) msgs.push(`${result.skipped} skipped`);
        showToast(`✅ Sync complete — ${msgs.join(", ") || "no changes"}`, "success");
        // Persist sync status to Firestore settings
        const summary = `↓${result.added ?? 0} added, ↑${result.updated ?? 0} updated`;
        saveSettings({
          sheets: {
            ...(settings?.sheets ?? { url: sheetUrl, tab: tabName, autoSyncEnabled: false, autoSyncIntervalMins: 15 }),
            lastSyncAt: Date.now(),
            lastSyncResult: (result.errors?.length ?? 0) > 0 ? "partial" : "success",
            lastSyncSummary: summary,
          } as SyncConfig,
        }).catch(() => {}); // non-fatal
      } catch (e: unknown) {
        showToast("Sync error: " + (e instanceof Error ? e.message : String(e)), "error");
      } finally {
        setSyncing(false);
      }
    },
    [pullFromSheet, pushToSheet, showToast, saveSettings, settings, sheetUrl, tabName],
  );

  // ── Mapped fields count ────────────────────────────────────────────────────
  const mappedCount = LEAD_FIELDS.filter(({ key }) => mapping[key]).length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-2">
              <ArrowLeftRight size={18} className="text-amber-500" />
              <span className="font-bold text-gray-900 dark:text-white text-lg">Google Sheets Sync</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded-lg transition"
            >
              <X size={18} />
            </button>
          </div>

          {/* Step tabs */}
          <div className="flex border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
            {(["configure", "mapping", "sync"] as Step[]).map((s, i) => (
              <button
                key={s}
                onClick={() => {
                  if (s === "mapping" && headers.length === 0) return;
                  if (s === "sync" && headers.length === 0) return;
                  setStep(s);
                }}
                className={`flex-1 py-3 text-sm font-medium transition border-b-2 ${
                  step === s
                    ? "border-amber-500 text-amber-600 dark:text-amber-400"
                    : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                } ${s !== "configure" && headers.length === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* ── Step 1: Configure ── */}
            {step === "configure" && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Google Sheets URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      className={inp + " flex-1"}
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/…"
                    />
                    {sheetUrl && extractSheetId(sheetUrl) && (
                      <a
                        href={sheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border border-gray-300 dark:border-white/[0.08] rounded-lg transition"
                        title="Open sheet"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>
                  {sheetUrl && !extractSheetId(sheetUrl) && (
                    <p className="text-xs text-red-500 mt-1">Not a valid Google Sheets URL</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                    Tab / Sheet Name
                    {loadingTabs && <Loader2 size={12} className="animate-spin text-gray-400" />}
                  </label>
                  {sheetTabs.length > 0 ? (
                    <select className={inp} value={tabName} onChange={(e) => setTabName(e.target.value)}>
                      {sheetTabs.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={inp}
                      value={tabName}
                      onChange={(e) => setTabName(e.target.value)}
                      placeholder="Sheet1"
                    />
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {sheetTabs.length > 0
                      ? `${sheetTabs.length} tab${sheetTabs.length !== 1 ? "s" : ""} found in this spreadsheet.`
                      : "Connect to Google to load available tabs, or type the tab name manually."}
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/20 rounded-xl p-4 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  <p className="font-medium flex items-center gap-1.5">
                    <Link2 size={14} />
                    How it works
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    <li>You'll be asked to sign in with Google to grant read/write access to this sheet.</li>
                    <li>Only this spreadsheet is accessed — no other data is read.</li>
                    <li>
                      <strong>Pull</strong> imports new rows from the sheet into the CRM (skips duplicates by phone).
                    </li>
                    <li>
                      <strong>Push</strong> exports all CRM leads to the sheet (overwrites tab contents).
                    </li>
                    <li>
                      <strong>Two-Way</strong> does Pull then Push.
                    </li>
                  </ul>
                </div>

                {!gisReady && (
                  <p className="text-xs text-gray-400 flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Loading Google Sign-In…
                  </p>
                )}

                {accessToken && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle size={14} />
                    Authenticated with Google
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Column Mapping ── */}
            {step === "mapping" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Map sheet columns to CRM fields.{" "}
                    <span className="font-medium text-gray-900 dark:text-white">{mappedCount}</span> of{" "}
                    {LEAD_FIELDS.length} mapped.
                    <span className="text-xs text-gray-400 ml-2">
                      (Callback/booking dates are set via call logging)
                    </span>
                  </p>
                  <button
                    onClick={() => {
                      const autoMapped: Record<string, string> = {};
                      LEAD_FIELDS.forEach(({ key }) => {
                        const match = headers.find((h) => autoMatch(h) === key);
                        if (match) autoMapped[key] = match;
                      });
                      setMapping(autoMapped);
                    }}
                    className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw size={11} /> Re-auto-detect
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {LEAD_FIELDS.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span
                        className="text-xs text-gray-500 dark:text-gray-400 w-28 flex-shrink-0 truncate"
                        title={label}
                      >
                        {label}
                      </span>
                      <select
                        value={mapping[key] ?? ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                        className="flex-1 px-2 py-1 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <option value="">(not mapped)</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                  <p>
                    <strong>Tip:</strong> At minimum, map <em>Name</em> or <em>Suburb</em> for a usable import.{" "}
                    <em>Contact Number</em> is used for duplicate detection.
                  </p>
                </div>
              </div>
            )}

            {/* ── Step 3: Sync ── */}
            {step === "sync" && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Choose a sync direction. CRM has{" "}
                    <strong className="text-gray-900 dark:text-white">{leads.length}</strong> leads. Sheet:{" "}
                    <strong className="text-gray-900 dark:text-white">{tabName}</strong>
                    {accessToken && (
                      <span className="ml-2 text-green-600 dark:text-green-400 text-xs">● Connected</span>
                    )}
                  </p>
                  {/* Fallback status — used when a row has no status column mapped or an unrecognised value */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      Fallback status
                    </span>
                    <select
                      value={defaultStatus}
                      onChange={(e) => setDefaultStatus(e.target.value as LeadStatus)}
                      className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      {IMPORT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ── Smart Sync — scan all tabs, then sync ── */}
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/20 overflow-hidden">
                  {/* Card header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 flex-shrink-0">
                      <Download size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                        Smart Sync — All Tabs → CRM
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Scans every tab at once. Each tab's name is matched to a CRM status automatically.
                      </p>
                    </div>
                    {/* Action buttons in header */}
                    {tabScans.length === 0 && !smartSyncResult && (
                      <button
                        onClick={scanAllTabs}
                        disabled={scanning || !accessToken}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-600 text-white text-xs font-semibold hover:bg-gray-500 disabled:opacity-50 transition flex-shrink-0"
                      >
                        {scanning ? (
                          <>
                            <Loader2 size={12} className="animate-spin" /> Scanning…
                          </>
                        ) : (
                          <>🔍 Scan All Sheet Tabs</>
                        )}
                      </button>
                    )}
                    {(tabScans.length > 0 || smartSyncResult) && (
                      <button
                        onClick={() => {
                          setTabScans([]);
                          setSmartSyncResult(null);
                        }}
                        className="text-xs text-blue-500 dark:text-blue-400 hover:underline flex-shrink-0"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  {/* Scanning spinner */}
                  {scanning && (
                    <div className="flex items-center justify-center gap-2 px-4 py-5 text-blue-600 dark:text-blue-400">
                      <Loader2 size={18} className="animate-spin" />
                      <span className="text-sm">Scanning sheet tabs…</span>
                    </div>
                  )}

                  {/* Phase 2: Tab routing table (shown after scan) */}
                  {tabScans.length > 0 && !smartSyncing && !smartSyncResult && (
                    <div className="px-4 py-3 space-y-3">
                      <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wide">
                        {tabScans.length} tab{tabScans.length !== 1 ? "s" : ""} found — review and confirm:
                      </p>

                      <div className="rounded-lg overflow-hidden border border-blue-200 dark:border-blue-700 bg-white dark:bg-[var(--surface)]">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-700/50 text-left">
                              <th className="px-3 py-2 text-xs font-semibold text-gray-200">Tab</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-200">Status Maps To</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-200 text-right">New</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-200 text-right">Updates</th>
                              <th className="px-3 py-2 text-xs font-semibold text-gray-200 text-center">Include</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tabScans.map((scan, i) => (
                              <tr
                                key={scan.tabName}
                                className={`border-t border-gray-100 dark:border-white/[0.06] ${
                                  !scan.included ? "opacity-50" : ""
                                } ${i % 2 === 1 ? "bg-gray-50 dark:bg-[var(--surface)]/30" : ""}`}
                              >
                                {/* Tab name */}
                                <td className="px-3 py-2">
                                  <span className="font-medium text-gray-800 dark:text-gray-200 text-xs">
                                    {scan.tabName}
                                  </span>
                                </td>
                                {/* Status dropdown */}
                                <td className="px-3 py-2">
                                  <select
                                    value={scan.status}
                                    onChange={(e) =>
                                      setTabScans((prev) =>
                                        prev.map((s, idx) =>
                                          idx === i ? { ...s, status: e.target.value as LeadStatus } : s,
                                        ),
                                      )
                                    }
                                    className="w-full px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  >
                                    {IMPORT_STATUSES.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                {/* New count */}
                                <td className="px-3 py-2 text-right">
                                  {scan.newLeads > 0 ? (
                                    <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                                      {scan.newLeads}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </td>
                                {/* Update count */}
                                <td className="px-3 py-2 text-right">
                                  {scan.updateLeads > 0 ? (
                                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                      {scan.updateLeads}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </td>
                                {/* Include checkbox */}
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={scan.included}
                                    onChange={(e) =>
                                      setTabScans((prev) =>
                                        prev.map((s, idx) => (idx === i ? { ...s, included: e.target.checked } : s)),
                                      )
                                    }
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-[var(--surface)]/50">
                              <td className="px-3 py-2 text-xs text-gray-500 font-medium">
                                {tabScans.filter((s) => s.included).length} of {tabScans.length} included
                              </td>
                              <td />
                              <td className="px-3 py-2 text-right">
                                <span className="text-xs font-bold text-green-600 dark:text-green-400">
                                  {tabScans.filter((s) => s.included).reduce((sum, s) => sum + s.newLeads, 0)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                                  {tabScans.filter((s) => s.included).reduce((sum, s) => sum + s.updateLeads, 0)}
                                </span>
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Sync button */}
                      {(() => {
                        const includedScans = tabScans.filter((s) => s.included);
                        const totalLeads = includedScans.reduce((sum, s) => sum + s.totalRows, 0);
                        return (
                          <button
                            onClick={syncFromScans}
                            disabled={smartSyncing || includedScans.length === 0}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50 transition"
                          >
                            {smartSyncing ? (
                              <>
                                <Loader2 size={14} className="animate-spin" /> Syncing…
                              </>
                            ) : (
                              <>
                                <Download size={14} /> Sync {totalLeads} Lead{totalLeads !== 1 ? "s" : ""} from{" "}
                                {includedScans.length} Tab{includedScans.length !== 1 ? "s" : ""}
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  )}

                  {/* Syncing spinner */}
                  {smartSyncing && (
                    <div className="flex items-center justify-center gap-2 px-4 py-5 text-blue-600 dark:text-blue-400">
                      <Loader2 size={18} className="animate-spin" />
                      <span className="text-sm">Syncing leads from all tabs…</span>
                    </div>
                  )}

                  {/* Result */}
                  {smartSyncResult && (
                    <div className="px-4 py-3">
                      <div className="rounded-lg p-3 border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle size={14} className="text-green-600 dark:text-green-400" />
                          <span className="text-xs font-semibold text-gray-900 dark:text-white">
                            Sync complete — {smartSyncResult.tabs} tab{smartSyncResult.tabs !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-300">
                          {smartSyncResult.added > 0 && (
                            <span className="text-green-700 dark:text-green-300">
                              +{smartSyncResult.added} added to CRM
                            </span>
                          )}
                          {smartSyncResult.updated > 0 && (
                            <span className="text-amber-700 dark:text-amber-300">
                              {smartSyncResult.updated} updated
                            </span>
                          )}
                          {smartSyncResult.added === 0 && smartSyncResult.updated === 0 && (
                            <span className="text-gray-500">No changes needed</span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setTabScans([]);
                            setSmartSyncResult(null);
                          }}
                          className="mt-2 text-xs text-blue-500 hover:underline"
                        >
                          Scan again
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Auth hint when not connected */}
                  {!accessToken && !scanning && tabScans.length === 0 && !smartSyncResult && (
                    <div className="px-4 py-3">
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        ⚠️ Sign in with Google (below) to enable tab scanning.
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Pull Updates from Sheet ── */}
                <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-3 border-b border-violet-200 dark:border-violet-800">
                    <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 flex-shrink-0 mt-0.5">
                      <GitCompareArrows size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">
                        Pull Updates from Sheet
                      </p>
                      <p className="text-xs text-violet-600 dark:text-violet-400">
                        Matches existing leads by phone number and applies any changes from the sheet. Only updates
                        fields that have changed — never creates new leads.
                      </p>
                    </div>
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    {!updateResult && (
                      <>
                        {/* Fields to update */}
                        <p className="text-xs font-semibold text-violet-800 dark:text-violet-300 uppercase tracking-wide">
                          Fields to update:
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {UPDATE_FIELDS.map(({ key, label }) => {
                            const isMapped = key === "suburb" ? mapping["suburb"] || mapping["address"] : mapping[key];
                            return (
                              <label
                                key={key}
                                className={`flex items-center gap-2 cursor-pointer ${!isMapped ? "opacity-40" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={updateFields[key] ?? false}
                                  disabled={!isMapped}
                                  onChange={(e) => setUpdateFields((prev) => ({ ...prev, [key]: e.target.checked }))}
                                  className="rounded border-gray-300 text-violet-600 focus:ring-violet-400"
                                />
                                <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
                                {!isMapped && <span className="text-xs text-gray-400">(not mapped)</span>}
                              </label>
                            );
                          })}
                        </div>

                        {!mapping["phone"] && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            ⚠️ Map the "Contact Number" column in Step 2 to enable lead matching.
                          </p>
                        )}

                        <button
                          onClick={pullAndApplyUpdates}
                          disabled={updating || !mapping["phone"]}
                          title={!mapping["phone"] ? "Map the Contact Number column first" : undefined}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 disabled:opacity-50 transition"
                        >
                          {updating ? (
                            <>
                              <Loader2 size={14} className="animate-spin" /> Pulling updates…
                            </>
                          ) : (
                            <>
                              <GitCompareArrows size={14} /> Pull Updates from Sheet
                            </>
                          )}
                        </button>
                      </>
                    )}

                    {/* Result */}
                    {updateResult && (
                      <div
                        className={`rounded-lg p-3 border ${updateResult.errors.length > 0 ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700" : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {updateResult.errors.length > 0 ? (
                            <AlertCircle size={14} className="text-amber-600" />
                          ) : (
                            <CheckCircle size={14} className="text-green-600" />
                          )}
                          <span className="text-xs font-semibold text-gray-900 dark:text-white">
                            {updateResult.updated > 0
                              ? `${updateResult.updated} lead${updateResult.updated !== 1 ? "s" : ""} updated`
                              : "All leads already up to date"}
                          </span>
                        </div>
                        {updateResult.unchanged > 0 && (
                          <p className="text-xs text-gray-500">
                            {updateResult.unchanged} leads already matched — no changes needed
                          </p>
                        )}
                        {updateResult.errors.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {updateResult.errors.slice(0, 3).map((e, i) => (
                              <p key={i} className="text-xs text-red-600 dark:text-red-400">
                                {e}
                              </p>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => setUpdateResult(null)}
                          className="mt-2 text-xs text-violet-500 hover:underline"
                        >
                          Run again
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Push + Two-Way cards (require OAuth sign-in for write access) ── */}
                {!accessToken && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      <strong>Push</strong> and <strong>Two-Way</strong> require Google sign-in to write to the sheet.
                    </p>
                    <button
                      onClick={requestAuth}
                      disabled={!gisReady}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-500 disabled:opacity-50 transition"
                    >
                      <Link2 size={12} /> Sign in with Google
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Push */}
                  <SyncCard
                    icon={<Upload size={20} />}
                    title="Push"
                    subtitle="CRM → Sheet"
                    description="Export all CRM leads to the sheet. Overwrites the tab contents."
                    color="amber"
                    disabled={syncing || !accessToken}
                    loading={syncing}
                    onClick={() => (accessToken ? runSync("push") : requestAuth())}
                  />
                  {/* Two-Way */}
                  <SyncCard
                    icon={<ArrowLeftRight size={20} />}
                    title="Two-Way"
                    subtitle="Pull then Push"
                    description="Pulls new leads using the fallback status, then pushes all CRM leads back."
                    color="green"
                    disabled={syncing || !accessToken}
                    loading={syncing}
                    onClick={() => (accessToken ? runSync("two-way") : requestAuth())}
                  />
                </div>

                {/* Result */}
                {syncResult && (
                  <div
                    className={`rounded-xl p-4 border ${syncResult.errors.length > 0 ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700" : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {syncResult.errors.length > 0 ? (
                        <AlertCircle size={16} className="text-amber-600 dark:text-amber-400" />
                      ) : (
                        <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
                      )}
                      <span className="font-semibold text-sm text-gray-900 dark:text-white capitalize">
                        {syncResult.action} complete
                      </span>
                    </div>
                    <div className="flex gap-4 text-sm">
                      {syncResult.added > 0 && (
                        <span className="text-green-700 dark:text-green-300">+{syncResult.added} added to CRM</span>
                      )}
                      {syncResult.updated > 0 && (
                        <span className="text-blue-700 dark:text-blue-300">
                          {syncResult.updated} rows pushed to sheet
                        </span>
                      )}
                      {syncResult.skipped > 0 && (
                        <span className="text-gray-500 dark:text-gray-400">
                          {syncResult.skipped} skipped (duplicates)
                        </span>
                      )}
                    </div>
                    {syncResult.errors.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {syncResult.errors.slice(0, 5).map((e, i) => (
                          <p key={i} className="text-xs text-red-600 dark:text-red-400">
                            {e}
                          </p>
                        ))}
                        {syncResult.errors.length > 5 && (
                          <p className="text-xs text-gray-400">…and {syncResult.errors.length - 5} more errors</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {syncing && (
                  <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 py-4">
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-sm">Syncing…</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-white/[0.06] flex-shrink-0 gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
            >
              Close
            </button>

            <div className="flex gap-2">
              {step === "configure" && (
                <button
                  onClick={handleConnect}
                  disabled={loadingHeaders || !sheetUrl.trim()}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition"
                >
                  {loadingHeaders ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Loading headers…
                    </>
                  ) : (
                    <>
                      <Link2 size={14} /> Load Columns
                    </>
                  )}
                </button>
              )}
              {step === "mapping" && (
                <>
                  <button
                    onClick={() => setStep("configure")}
                    className="px-4 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => setStep("sync")}
                    disabled={mappedCount === 0}
                    className="px-5 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition"
                  >
                    Next: Sync →
                  </button>
                </>
              )}
              {step === "sync" && (
                <button
                  onClick={() => setStep("mapping")}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
                >
                  ← Back
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── SyncCard sub-component ────────────────────────────────────────────────────
function SyncCard({
  icon,
  title,
  subtitle,
  description,
  color,
  disabled,
  loading,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  color: "blue" | "amber" | "green";
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const colorMap = {
    blue: {
      bg: "bg-blue-50 dark:bg-blue-900/20",
      border: "border-blue-200 dark:border-blue-700",
      icon: "text-blue-600 dark:text-blue-400",
      btn: "bg-blue-600 hover:bg-blue-500",
    },
    amber: {
      bg: "bg-amber-50 dark:bg-amber-900/20",
      border: "border-amber-200 dark:border-amber-700",
      icon: "text-amber-600 dark:text-amber-400",
      btn: "bg-amber-500 hover:bg-amber-400",
    },
    green: {
      bg: "bg-green-50 dark:bg-green-900/20",
      border: "border-green-200 dark:border-green-700",
      icon: "text-green-600 dark:text-green-400",
      btn: "bg-green-600 hover:bg-green-500",
    },
  }[color];

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${colorMap.bg} ${colorMap.border}`}>
      <div className={`${colorMap.icon}`}>{icon}</div>
      <div>
        <p className="font-bold text-gray-900 dark:text-white text-sm">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400 flex-1">{description}</p>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2 ${colorMap.btn}`}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
        {title}
      </button>
    </div>
  );
}

export default SheetsSyncModal;
