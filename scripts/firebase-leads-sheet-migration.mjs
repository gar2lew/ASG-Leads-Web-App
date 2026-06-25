#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";


const LEADS_COLLECTION = "leads";
const DEFAULT_TAB = "LEADS";
const LEAD_TABS = ["LEADS", "DQ", "LIVE", "NO ANSWER", "REVISIT", "BOOKED", "NOT INTERESTED", "WRONG NUMBER"];
const BACKUP_DIR = "migration-backups/leads";
const REPORT_DIR = "migration-reports/leads";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const SHEETS_READ_TIMEOUT_MS = 30_000;
const FIRESTORE_READ_TIMEOUT_MS = 60_000;
const RELATED_SCAN_TIMEOUT_MS = 60_000;

const LEGACY_STATUSES = ["DQ", "Live", "Booked", "Revisit", "Not Interested", "Wrong Number", "No Answer"];
const CANONICAL_STATUSES = ["new", "contacted", "qualified", "booked", "lost"];
const ACCEPTED_STATUSES = [...LEGACY_STATUSES, ...CANONICAL_STATUSES];
const DEFAULT_STATUS = "DQ";
const DEFAULT_REGION = "brisbane";

const LEAD_FIELDS = [
  { key: "leadId", label: "LeadID" },
  { key: "name", label: "Name" },
  { key: "phone", label: "Contact Number" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "houseNum", label: "House Number" },
  { key: "street", label: "Street" },
  { key: "suburb", label: "Suburb" },
  { key: "postcode", label: "Postcode" },
  { key: "ownership", label: "Renter/Owner" },
  { key: "superannuation", label: "Superannuation" },
  { key: "employment", label: "Employment" },
  { key: "dqRepName", label: "Rep Name" },
  { key: "dqRep", label: "Rep ID" },
  { key: "status", label: "Lead Status" },
  { key: "result", label: "Call Result" },
  { key: "notes", label: "Notes" },
  { key: "leadDate", label: "Date" },
  { key: "callbackDate", label: "Callback Date" },
  { key: "callbackTime", label: "Callback Time" },
  { key: "bookingDate", label: "Booking Date" },
  { key: "bookingTime", label: "Booking Time" },
  { key: "region", label: "Region" },
];

const ALIASES = {
  leadid: "leadId",
  "lead id": "leadId",
  "firebase lead id": "leadId",
  "crm lead id": "leadId",
  id: "leadId",

  "full name": "name",
  fullname: "name",
  customer: "name",
  client: "name",
  "lead name": "name",
  name: "name",

  phone: "phone",
  mobile: "phone",
  contact: "phone",
  "contact number": "phone",
  contactnumber: "phone",
  ph: "phone",
  tel: "phone",

  email: "email",
  "email address": "email",

  address: "address",
  "full address": "address",
  "property address": "address",
  "street address": "address",

  "house num": "houseNum",
  "house number": "houseNum",
  "house #": "houseNum",
  housenum: "houseNum",
  "house no": "houseNum",

  street: "street",
  road: "street",
  suburb: "suburb",
  city: "suburb",
  town: "suburb",
  locality: "suburb",
  postcode: "postcode",
  "post code": "postcode",
  zip: "postcode",

  rep: "dqRepName",
  "rep name": "dqRepName",
  repname: "dqRepName",
  "dq rep": "dqRepName",
  dqrep: "dqRepName",
  agent: "dqRepName",
  "assigned to": "dqRepName",
  "rep id": "dqRep",
  dqRep: "dqRep",

  status: "status",
  "lead status": "status",
  leadstatus: "status",
  result: "result",
  "call result": "result",
  callresult: "result",
  outcome: "result",

  ownership: "ownership",
  "owner/renter": "ownership",
  "renter/owner": "ownership",
  renter: "ownership",
  owner: "ownership",
  tenure: "ownership",
  superannuation: "superannuation",
  super: "superannuation",
  employment: "employment",
  employed: "employment",

  date: "leadDate",
  "lead date": "leadDate",
  "dq date": "leadDate",
  notes: "notes",
  note: "notes",
  comments: "notes",
  comment: "notes",

  "callback date": "callbackDate",
  callbackdate: "callbackDate",
  "callback time": "callbackTime",
  callbacktime: "callbackTime",
  "booking date": "bookingDate",
  bookingdate: "bookingDate",
  "appointment date": "bookingDate",
  "booking time": "bookingTime",
  bookingtime: "bookingTime",
  "appointment time": "bookingTime",
  region: "region",
};

const PRESERVED_FIELDS = [
  "id",
  "dealId",
  "clientGroupId",
  "callHistory",
  "activities",
  "createdAt",
  "lastCall",
  "callingRep",
  "dealValue",
  "income",
  "balance",
  "deposit",
  "timelyAdded",
  "fcRep",
  "frRep",
  "psRep",
  "dnqFellOver",
  "dnqNotes",
  "dealStage",
  "fcAppt",
  "frAppt",
  "psAppt",
  "settlementDate",
  "dealCommissions",
  "dealComplete",
  "dealCompleteDate",
  "lat",
  "lng",
  "geocodeStatus",
  "knockResult",
  "callbackDate",
  "callbackTime",
  "nextContactDate",
  "bookingDate",
  "bookingTime",
  "appointmentDate",
  "appointmentTime",
];

const RELATED_COLLECTIONS = [
  { collection: "appointments", fields: ["linkedLeadId"] },
  { collection: "deals", fields: ["leadId"] },
  { collection: "clientNotes", fields: ["linkedLeadId", "clientId"] },
  { collection: "activityEvents", fields: ["leadId"] },
  { collection: "tasks", fields: ["leadId", "linkedLeadId"] },
  { collection: "dealDocuments", fields: ["clientId"] },
  { collection: "documentInstances", fields: ["clientId", "leadId"] },
  { collection: "piaReports", fields: ["clientId"] },
  { collection: "smsfReports", fields: ["clientId"] },
  { collection: "smsfFinancials", fields: ["clientId"] },
];
const LEAD_SUBCOLLECTIONS = ["notes", "files", "dealUpdates", "presence"];

function parseArgs(argv) {
  const args = {
    mode: "dry-run",
    tab: process.env.GOOGLE_SHEET_TAB || DEFAULT_TAB,
    fallbackStatus: process.env.LEADS_IMPORT_DEFAULT_STATUS || DEFAULT_STATUS,
    defaultRegion: process.env.LEADS_IMPORT_DEFAULT_REGION || DEFAULT_REGION,
    dryRunLimit: 5,
    relatedScan: true,
    allTabs: false,
    confirmSingleTabReplace: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--dry-run") args.mode = "dry-run";
    else if (arg === "--backup-only") args.mode = "backup-only";
    else if (arg === "--import") args.mode = "import";
    else if (arg === "--full-replace") args.mode = "full-replace";
    else if (arg === "--confirm-full-replace") args.confirmFullReplace = true;
    else if (arg === "--confirm-single-tab-replace") args.confirmSingleTabReplace = true;
    else if (arg === "--all-tabs") args.allTabs = true;
    else if (arg === "--skip-related-scan") args.relatedScan = false;
    else if (arg === "--sheet-id") args.sheetId = requireValue(arg, next, i++);
    else if (arg === "--sheet-url") args.sheetUrl = requireValue(arg, next, i++);
    else if (arg === "--tab") args.tab = requireValue(arg, next, i++);
    else if (arg === "--project-id") args.projectId = requireValue(arg, next, i++);
    else if (arg === "--fallback-status") args.fallbackStatus = requireValue(arg, next, i++);
    else if (arg === "--default-region") args.defaultRegion = requireValue(arg, next, i++);
    else if (arg === "--backup-dir") args.backupDir = requireValue(arg, next, i++);
    else if (arg === "--report-dir") args.reportDir = requireValue(arg, next, i++);
    else if (arg === "--limit") args.dryRunLimit = Number(requireValue(arg, next, i++));
    else throw new Error(`Unknown argument: ${arg}`);
  }

  args.sheetId = args.sheetId || extractSheetId(args.sheetUrl || process.env.GOOGLE_SHEET_URL || "") || process.env.GOOGLE_SHEET_ID;
  args.backupDir = args.backupDir || process.env.LEADS_MIGRATION_BACKUP_DIR || BACKUP_DIR;
  args.reportDir = args.reportDir || process.env.LEADS_MIGRATION_REPORT_DIR || REPORT_DIR;
  if (!ACCEPTED_STATUSES.includes(args.fallbackStatus)) args.fallbackStatus = DEFAULT_STATUS;
  return args;
}

function requireValue(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`
ASG leads Google Sheet to Firestore migration

Default mode is dry-run. No Firestore writes happen unless --import or --full-replace is used.

Modes:
  --dry-run                Backup existing leads, read the LEADS tab, report planned writes only
  --backup-only            Backup existing leads and exit
  --import                 Backup existing leads, then create/update leads without deleting current leads
  --full-replace           Backup existing leads, delete top-level lead docs, then import sheet leads

Required for full replace:
  --confirm-full-replace
  --all-tabs               Required for normal full-replace runs so every lead status tab is imported

Single-tab full replace guard:
  --confirm-single-tab-replace
                           Required in addition to --confirm-full-replace when --full-replace is used without --all-tabs

Common options:
  --sheet-id <id>          Google spreadsheet ID
  --sheet-url <url>        Google spreadsheet URL
  --tab <name>             Sheet tab name, defaults to LEADS
  --all-tabs               Import all lead tabs: ${LEAD_TABS.join(", ")}
  --project-id <id>        Firebase project ID override
  --fallback-status <s>    Status for blank/unmapped status cells, defaults to DQ
  --default-region <r>     Region for rows without region, defaults to brisbane
  --skip-related-scan      Skip read-only scan of related collections

Auth:
  Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON file that has Firebase Admin
  access and has been shared onto the Google Sheet as a viewer.
`);
}

function extractSheetId(url) {
  const match = String(url || "").match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefined(v)]),
  );
}

function normalizeHeader(header) {
  return String(header || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function autoMatch(header) {
  const normalized = normalizeHeader(header);
  return ALIASES[normalized] ?? "";
}

function buildColumnIndex(headers) {
  const colIdx = {};
  headers.forEach((header, index) => {
    const matched = autoMatch(header);
    if (matched && colIdx[matched] === undefined) colIdx[matched] = index;
  });
  return colIdx;
}

function normalizeAUPhone(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("4")) return `0${digits}`;
  if (digits.length === 11 && digits.startsWith("614")) return `0${digits.slice(2)}`;
  if (digits.length === 12 && digits.startsWith("6104")) return `0${digits.slice(3)}`;
  if (digits.length === 10) return digits;
  return String(raw).trim();
}

function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

function normalizeName(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ");
}

function normalizeDateToISO(raw) {
  if (!raw) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) return `${dmyDash[3]}-${dmyDash[2].padStart(2, "0")}-${dmyDash[1].padStart(2, "0")}`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return undefined;
}

function normalizeTime(raw) {
  const s = String(raw || "").trim();
  if (!s) return undefined;
  const hhmm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hhmm) return `${hhmm[1].padStart(2, "0")}:${hhmm[2]}`;
  return s;
}

function normalizeStatus(raw, fallback = DEFAULT_STATUS) {
  const s = String(raw || "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  if (!s) return fallback;
  if (s === "dq" || s === "leads" || s === "new leads" || s === "new" || s === "fresh") return "DQ";
  if (s === "live" || s === "active" || s === "contacted") return "Live";
  if (s === "qualified") return "Live";
  if (s === "booked" || s === "appointment" || s === "appt" || s === "booking") return "Booked";
  if (["revisit", "callback", "call back", "cb", "follow up", "followup", "fu"].includes(s)) return "Revisit";
  if (["not interested", "ni", "not int", "n/i", "lost"].includes(s)) return "Not Interested";
  if (["wrong number", "wn", "wrong no", "wrong num"].includes(s)) return "Wrong Number";
  if (["no answer", "na", "no ans", "not answered", "no reply"].includes(s)) return "No Answer";
  const legacyMatch = LEGACY_STATUSES.find((status) => status.toLowerCase() === s);
  if (legacyMatch) return legacyMatch;
  const canonicalMatch = CANONICAL_STATUSES.find((status) => status.toLowerCase() === s);
  if (canonicalMatch) return canonicalMatch;
  return fallback;
}

function parseAddress(rawAddr, rawSuburb, explicit = {}) {
  let houseNum = explicit.houseNum || undefined;
  let street = explicit.street || undefined;
  let suburb = rawSuburb || "";
  let postcode = explicit.postcode || undefined;
  const raw = String(rawAddr || "").trim();
  if (!raw) return { houseNum, street, suburb, postcode };

  const parts = raw.split(/\s+/);
  const hasHouseNum = parts.length > 1 && /^\d+[A-Za-z]?$/.test(parts[0]);
  const bodyParts = hasHouseNum ? parts.slice(1) : parts;
  if (!houseNum && hasHouseNum) houseNum = parts[0];

  if (bodyParts.length > 0) {
    const lastPart = bodyParts[bodyParts.length - 1];
    if (!postcode && /^\d{4}$/.test(lastPart)) {
      postcode = lastPart;
      const withoutPostcode = bodyParts.slice(0, -1);
      if (!suburb && withoutPostcode.length > 0) {
        suburb = withoutPostcode[withoutPostcode.length - 1];
        if (!street) street = withoutPostcode.slice(0, -1).join(" ") || undefined;
      } else if (!street) {
        street = withoutPostcode.join(" ") || undefined;
      }
    } else if (!street || !suburb) {
      if (!suburb && bodyParts.length > 1) {
        suburb = bodyParts[bodyParts.length - 1];
        if (!street) street = bodyParts.slice(0, -1).join(" ") || undefined;
      } else if (!street) {
        street = bodyParts.join(" ") || undefined;
      }
    }
  }
  return { houseNum, street, suburb, postcode };
}

function generateLeadId(existingIds, seed) {
  let id = seed ? stableNumericId(seed) : Date.now() * 1000 + crypto.randomInt(0, 1000);
  while (existingIds.has(String(id))) {
    id += 1;
  }
  existingIds.add(String(id));
  return id;
}

function stableNumericId(seed) {
  const digest = crypto.createHash("sha256").update(`asg-lead:v1:${seed}`).digest("hex");
  return 100_000_000_000_000 + (Number.parseInt(digest.slice(0, 11), 16) % 800_000_000_000_000);
}

function stableIdSeed(candidate) {
  if (candidate.sheetLeadId) return `leadId:${candidate.sheetLeadId}`;
  const phone = normalizeAUPhone(candidate.phone);
  if (phone) return `phone:${phone}`;
  const email = normalizeEmail(candidate.email);
  if (email) return `email:${email}`;
  return `nameAddress:${normalizeName(candidate.name).toLowerCase()}|${normalizeAddressKey(candidate)}`;
}

function normalizedLeadId(raw) {
  return String(raw ?? "").trim();
}

function normalizeAddressKey(leadLike) {
  const parts = [
    leadLike.houseNum,
    leadLike.street,
    leadLike.suburb,
    leadLike.postcode,
  ]
    .map((part) => String(part ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
  return parts.join("|");
}

function strongDuplicateKeys(leadLike) {
  const keys = [];
  const leadId = normalizedLeadId(leadLike.sheetLeadId ?? leadLike.id ?? leadLike.__docId);
  const phone = normalizeAUPhone(leadLike.phone);
  const email = normalizeEmail(leadLike.email);
  const name = normalizeName(leadLike.name).toLowerCase();
  const address = normalizeAddressKey(leadLike);
  if (leadId) keys.push({ type: "leadId", value: leadId, key: `leadId:${leadId}` });
  if (phone) keys.push({ type: "phone", value: phone, key: `phone:${phone}` });
  if (email) keys.push({ type: "email", value: email, key: `email:${email}` });
  if (name && address) keys.push({ type: "nameAddress", value: `${name}|${address}`, key: `nameAddress:${name}|${address}` });
  return keys;
}

function buildExistingIndexes(leads) {
  const byDocId = new Map();
  const byAnyKey = new Map();
  const byPhone = new Map();
  const byLeadId = new Map();
  const ids = new Set();
  leads.forEach((lead) => {
    byDocId.set(String(lead.__docId), lead);
    ids.add(String(lead.id ?? lead.__docId));
    for (const item of strongDuplicateKeys(lead)) {
      if (!byAnyKey.has(item.key)) byAnyKey.set(item.key, lead);
      if (item.type === "phone" && !byPhone.has(item.value)) byPhone.set(item.value, lead);
      if (item.type === "leadId" && !byLeadId.has(item.value)) byLeadId.set(item.value, lead);
    }
  });
  return { byDocId, byAnyKey, byPhone, byLeadId, ids };
}

function findExistingLead(rowLead, indexes) {
  const leadId = normalizedLeadId(rowLead.sheetLeadId);
  if (leadId) {
    const hit = indexes.byLeadId.get(leadId) ?? indexes.byDocId.get(leadId);
    if (hit) return { lead: hit, match: `leadId:${leadId}`, duplicateKeyType: "leadId" };
  }
  const phone = normalizeAUPhone(rowLead.phone);
  if (phone && indexes.byPhone.has(phone)) return { lead: indexes.byPhone.get(phone), match: `phone:${phone}`, duplicateKeyType: "phone" };
  for (const item of strongDuplicateKeys(rowLead)) {
    const hit = indexes.byAnyKey.get(item.key);
    if (hit) return { lead: hit, match: item.key, duplicateKeyType: item.type };
  }
  return { lead: null, match: "", duplicateKeyType: "" };
}

function getCell(row, colIdx, key) {
  const idx = colIdx[key];
  if (idx === undefined || idx < 0) return "";
  return String(row[idx] ?? "").trim();
}

function mapSheetRows(rows, existingIndexes, repsByName, options) {
  const sourceTab = options.sourceTab || options.tab || DEFAULT_TAB;
  const blankStatusFallback = normalizeStatus(sourceTab, options.fallbackStatus);
  const headers = rows[0] ?? [];
  const dataRows = rows.slice(1);
  const colIdx = buildColumnIndex(headers);
  const requiredMapped = ["name", "phone"].filter((key) => colIdx[key] !== undefined);
  const issues = [];
  if (!requiredMapped.includes("phone")) issues.push('Required matching column "phone/contact number" was not mapped.');
  if (!requiredMapped.includes("name")) issues.push('Recommended column "name/full name" was not mapped.');

  const seenImportKeys = options.seenImportKeys ?? new Map();
  const nameOnly = options.nameOnlyMap ?? new Map();
  const importLeads = [];
  const skippedRows = [];
  const duplicates = [];
  const statusBreakdown = {};
  const unmappedStatuses = {};

  for (let index = 0; index < dataRows.length; index += 1) {
    const row = dataRows[index];
    const rowNumber = index + 2;
    const isEmpty = row.every((cell) => !String(cell ?? "").trim());
    if (isEmpty) {
      skippedRows.push({ sourceTab, rowNumber, reason: "blank row" });
      continue;
    }

    const rawName = getCell(row, colIdx, "name");
    const sheetLeadId = normalizedLeadId(getCell(row, colIdx, "leadId"));
    const rawPhone = getCell(row, colIdx, "phone");
    const phone = normalizeAUPhone(rawPhone);
    const email = normalizeEmail(getCell(row, colIdx, "email"));
    const rawStatus = getCell(row, colIdx, "status");
    const status = rawStatus ? normalizeStatus(rawStatus, options.fallbackStatus) : blankStatusFallback;
    if (rawStatus && status === options.fallbackStatus && !ACCEPTED_STATUSES.some((s) => s.toLowerCase() === rawStatus.toLowerCase())) {
      unmappedStatuses[rawStatus] = (unmappedStatuses[rawStatus] ?? 0) + 1;
    }

    const address = parseAddress(getCell(row, colIdx, "address"), getCell(row, colIdx, "suburb"), {
      houseNum: getCell(row, colIdx, "houseNum") || undefined,
      street: getCell(row, colIdx, "street") || undefined,
      postcode: getCell(row, colIdx, "postcode") || undefined,
    });
    const repFromId = Number(getCell(row, colIdx, "dqRep"));
    const repName = getCell(row, colIdx, "dqRepName");
    const dqRep = Number.isFinite(repFromId) && repFromId > 0 ? repFromId : repsByName.get(repName.toLowerCase()) ?? options.defaultRepId;
    const region = normalizeRegion(getCell(row, colIdx, "region") || options.defaultRegion);

    if (!rawName && !phone && !address.suburb) {
      skippedRows.push({ sourceTab, rowNumber, reason: "missing name, phone, and suburb" });
      continue;
    }
    if (!phone) {
      skippedRows.push({ sourceTab, rowNumber, reason: "missing phone/contact number", name: rawName });
      continue;
    }

    const candidate = stripUndefined({
      id: undefined,
      sheetLeadId: sheetLeadId || undefined,
      name: normalizeName(rawName) || "Unknown",
      phone,
      phoneRaw: rawPhone && rawPhone !== phone ? rawPhone : undefined,
      email: email || undefined,
      ...address,
      suburb: address.suburb || "",
      ownership: getCell(row, colIdx, "ownership") || undefined,
      superannuation: getCell(row, colIdx, "superannuation") || undefined,
      employment: getCell(row, colIdx, "employment") || undefined,
      dqRep,
      status,
      sourceTab,
      result: getCell(row, colIdx, "result") || undefined,
      notes: getCell(row, colIdx, "notes") || undefined,
      leadDate: normalizeDateToISO(getCell(row, colIdx, "leadDate")),
      callbackDate: normalizeDateToISO(getCell(row, colIdx, "callbackDate")),
      callbackTime: normalizeTime(getCell(row, colIdx, "callbackTime")),
      bookingDate: normalizeDateToISO(getCell(row, colIdx, "bookingDate")),
      bookingTime: normalizeTime(getCell(row, colIdx, "bookingTime")),
      region,
      callHistory: [],
    });

    const nameKey = normalizeName(candidate.name).toLowerCase();
    if (nameKey) {
      const existingNameRows = nameOnly.get(nameKey) ?? [];
      existingNameRows.push({
        sourceTab,
        rowNumber,
        name: candidate.name,
        phone: candidate.phone,
        address: normalizeAddressKey(candidate),
      });
      nameOnly.set(nameKey, existingNameRows);
    }

    const rowKeys = strongDuplicateKeys(candidate);
    const duplicate = rowKeys.find((item) => seenImportKeys.has(item.key));
    if (duplicate) {
      const first = seenImportKeys.get(duplicate.key);
      duplicates.push({
        rowNumber,
        sourceTab,
        reason: "duplicate within sheet",
        duplicateKey: duplicate.key,
        duplicateKeyType: duplicate.type,
        firstRowNumber: first.rowNumber,
        firstSourceTab: first.sourceTab,
        name: candidate.name,
        phone: candidate.phone,
      });
      skippedRows.push({
        sourceTab,
        rowNumber,
        reason: `duplicate within sheet: ${duplicate.key}`,
        duplicateKeyType: duplicate.type,
        name: candidate.name,
        phone: candidate.phone,
      });
      continue;
    }
    rowKeys.forEach((item) => seenImportKeys.set(item.key, { rowNumber, sourceTab, duplicateKeyType: item.type }));

    const existingMatch = findExistingLead(candidate, existingIndexes);
    const existing = existingMatch.lead;
    const idSource = existing ? "existing-match" : "stable-sheet-key";
    const numericSheetLeadId = Number(candidate.sheetLeadId);
    const id =
      existing?.id ??
      (Number.isFinite(numericSheetLeadId) && numericSheetLeadId > 0
        ? numericSheetLeadId
        : generateLeadId(existingIndexes.ids, stableIdSeed(candidate)));
    const preserved = preserveFields(existing);
    const createdAt = existing?.createdAt ?? Date.now();
    const { sheetLeadId: _sheetLeadId, ...candidateLeadFields } = candidate;
    const lead = stripUndefined({
      ...preserved,
      ...candidateLeadFields,
      id,
      createdAt,
      updatedAt: Date.now(),
      callHistory: preserved.callHistory ?? candidate.callHistory,
    });

    statusBreakdown[String(lead.status)] = (statusBreakdown[String(lead.status)] ?? 0) + 1;
    importLeads.push({
      sourceTab,
      rowNumber,
      lead,
      existingDocId: existing?.__docId,
      match: existingMatch.match,
      duplicateKeyType: existingMatch.duplicateKeyType,
      action: existing ? "update" : "create",
      idSource,
    });
  }

  const nameOnlySimilarities = Array.from(nameOnly.entries())
    .filter(([, items]) => items.length > 1)
    .map(([name, items]) => ({ name, count: items.length, rows: items }));

  return {
    headers,
    colIdx,
    mappedColumns: Object.fromEntries(Object.entries(colIdx).map(([key, idx]) => [key, headers[idx]])),
    totalSheetRows: dataRows.filter((row) => row.some((cell) => String(cell ?? "").trim())).length,
    importLeads,
    skippedRows,
    duplicates,
    nameOnlySimilarities,
    statusBreakdown,
    unmappedStatuses,
    issues,
  };
}

function mapSheetTabs(sheetTabs, existingIndexes, repsByName, options) {
  const seenImportKeys = new Map();
  const nameOnlyMap = new Map();
  const importLeads = [];
  const skippedRows = [];
  const duplicates = [];
  const statusBreakdown = {};
  const unmappedStatuses = {};
  const issues = [];
  const mappedColumns = {};
  const rowsPerTab = {};
  let totalSheetRows = 0;
  let nameOnlySimilarities = [];

  for (const tabRows of sheetTabs) {
    const tabName = tabRows.tab;
    const analysis = mapSheetRows(tabRows.rows, existingIndexes, repsByName, {
      ...options,
      sourceTab: tabName,
      seenImportKeys,
      nameOnlyMap,
    });

    importLeads.push(...analysis.importLeads);
    skippedRows.push(...analysis.skippedRows);
    duplicates.push(...analysis.duplicates);
    totalSheetRows += analysis.totalSheetRows;
    mappedColumns[tabName] = analysis.mappedColumns;
    issues.push(...analysis.issues.map((issue) => `${tabName}: ${issue}`));
    for (const [status, count] of Object.entries(analysis.statusBreakdown)) {
      statusBreakdown[status] = (statusBreakdown[status] ?? 0) + count;
    }
    for (const [status, count] of Object.entries(analysis.unmappedStatuses)) {
      unmappedStatuses[status] = (unmappedStatuses[status] ?? 0) + count;
    }
    rowsPerTab[tabName] = {
      sheetRowCount: analysis.totalSheetRows,
      validImportCount: analysis.importLeads.length,
      skippedRowCount: analysis.skippedRows.length,
      duplicateCount: analysis.duplicates.length,
    };
    nameOnlySimilarities = analysis.nameOnlySimilarities;
  }

  return {
    headers: sheetTabs[0]?.rows?.[0] ?? [],
    colIdx: {},
    mappedColumns,
    rowsPerTab,
    tabDiscovery: sheetTabs.discovery ?? null,
    totalSheetRows,
    importLeads,
    skippedRows,
    duplicates,
    nameOnlySimilarities,
    statusBreakdown,
    unmappedStatuses,
    issues,
  };
}

function preserveFields(existing) {
  if (!existing) return {};
  const preserved = {};
  for (const field of PRESERVED_FIELDS) {
    if (existing[field] !== undefined) preserved[field] = existing[field];
  }
  return preserved;
}

function normalizeRegion(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "perth") return "perth";
  if (s === "brisbane") return "brisbane";
  return DEFAULT_REGION;
}

function getCredentialPath() {
  return process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
}

function loadServiceAccount() {
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath || !existsSync(credentialPath)) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS must point to a readable service account JSON file.");
  }
  const serviceAccount = JSON.parse(readFileSync(credentialPath, "utf8"));
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Service account JSON must include client_email and private_key.");
  }
  return serviceAccount;
}

function detectProjectId(serviceAccount, args) {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_PROJECT_ID ||
    serviceAccount.project_id ||
    ""
  );
}

function logStartup({ args, credentialPath, credentialExists, serviceAccount, projectId }) {
  console.log("Migration startup");
  console.log("-----------------");
  console.log(`Credential file path: ${credentialPath || "(not set)"}`);
  console.log(`Credential file exists: ${credentialExists ? "yes" : "no"}`);
  console.log(`Detected projectId: ${projectId || "(not detected)"}`);
  console.log(`Detected client_email: ${serviceAccount?.client_email || "(not detected)"}`);
  console.log(`Detected sheet URL: ${args.sheetUrl || process.env.GOOGLE_SHEET_URL || "(not set)"}`);
  console.log(`Detected sheet ID: ${args.sheetId || "(not set)"}`);
  console.log("");
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function duplicateGroupCount(duplicates) {
  return new Set(duplicates.map((duplicate) => duplicate.duplicateKey || `${duplicate.name}|${duplicate.phone}`)).size;
}

async function initFirebase(serviceAccount, projectId) {
  if (!projectId) {
    throw new Error(
      "Project ID not found. Set FIREBASE_PROJECT_ID, GOOGLE_CLOUD_PROJECT, GCLOUD_PROJECT, GOOGLE_PROJECT_ID, or serviceAccount.project_id.",
    );
  }
  void FieldValue;
  void Timestamp;
  console.log("Initializing Firebase Admin...");
  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
  }
  console.log("Firebase Admin initialized.");
  console.log("Initializing Firestore...");
  const db = getFirestore();
  console.log("Firestore initialized.");
  return db;
}

async function loadReps(db) {
  const snap = await withTimeout(db.collection("reps").get(), FIRESTORE_READ_TIMEOUT_MS, "Reading Firebase reps");
  const reps = snap.docs.map((doc) => ({ __docId: doc.id, ...doc.data() }));
  const active = reps.filter((rep) => rep.active !== false);
  const byName = new Map();
  for (const rep of reps) {
    if (rep.name) byName.set(String(rep.name).trim().toLowerCase(), Number(rep.id ?? rep.__docId));
  }
  const defaultRepId = Number(active[0]?.id ?? reps[0]?.id ?? 1);
  return { reps, byName, defaultRepId };
}

async function loadExistingLeads(db) {
  const snap = await withTimeout(db.collection(LEADS_COLLECTION).get(), FIRESTORE_READ_TIMEOUT_MS, "Reading existing Firebase leads");
  return snap.docs.map((doc) => ({ __docId: doc.id, ...doc.data() }));
}

function writeJson(dir, name, payload) {
  ensureDir(dir);
  const filePath = path.resolve(dir, name);
  writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

function backupLeads(leads, args, ts) {
  return writeJson(args.backupDir, `leads-backup-${ts}.json`, {
    createdAt: new Date().toISOString(),
    projectId: args.projectId ?? null,
    collection: LEADS_COLLECTION,
    count: leads.length,
    leads,
  });
}

function quoteSheetTabName(tab) {
  const s = String(tab).trim();
  // Only quote when the name contains characters that require it.
  if (/[\s,!'"]/.test(s)) return `'${s.replace(/'/g, "''")}'`;
  return s;
}

function normalizeTabTitle(title) {
  return String(title || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function leadHeaderScore(headers) {
  const mapped = new Set(headers.map(autoMatch).filter(Boolean));
  const strong = ["leadId", "name", "phone", "status", "result"].filter((key) => mapped.has(key));
  return {
    score: strong.length,
    mapped: Array.from(mapped),
    isLeadLike: mapped.has("phone") && (mapped.has("name") || mapped.has("leadId") || mapped.has("status") || mapped.has("result")),
  };
}

async function createSheetsClient(args, serviceAccount) {
  if (!args.sheetId) throw new Error("Provide --sheet-id, --sheet-url, GOOGLE_SHEET_ID, or GOOGLE_SHEET_URL.");
  let google;
  try {
    console.log("Loading Google Sheets client library...");
    ({ google } = await import("googleapis"));
    console.log("Google Sheets client library loaded.");
  } catch {
    throw new Error('Missing dependency "googleapis". Install it before running the Sheets migration script.');
  }
  console.log("Initializing Google Sheets auth...");
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: [SHEETS_SCOPE],
  });
  const sheets = google.sheets({ version: "v4", auth });
  console.log("Google Sheets auth initialized.");
  return sheets;
}

async function listSheetTitles(sheets, args) {
  console.log("Listing Google Sheet tabs...");
  const res = await withTimeout(
    sheets.spreadsheets.get({
      spreadsheetId: args.sheetId,
      fields: "sheets.properties.title",
    }),
    SHEETS_READ_TIMEOUT_MS,
    "Listing Google Sheet tabs",
  );
  const titles = (res.data.sheets ?? []).map((sheet) => sheet.properties?.title).filter(Boolean);
  console.log(`Available sheet titles: ${titles.join(", ") || "(none)"}`);
  return titles;
}

async function readSheetRows(args, serviceAccount) {
  if (!args.sheetId) throw new Error("Provide --sheet-id, --sheet-url, GOOGLE_SHEET_ID, or GOOGLE_SHEET_URL.");
  const sheets = await createSheetsClient(args, serviceAccount);
  const res = await withTimeout(
    sheets.spreadsheets.values.get({
      spreadsheetId: args.sheetId,
      range: `${quoteSheetTabName(args.tab)}!A:Z`,
    }),
    SHEETS_READ_TIMEOUT_MS,
    `Reading Google Sheet ${args.tab} range`,
  );
  return res.data.values ?? [];
}

async function readAllLeadTabs(args, serviceAccount) {
  if (!args.sheetId) throw new Error("Provide --sheet-id, --sheet-url, GOOGLE_SHEET_ID, or GOOGLE_SHEET_URL.");
  const sheets = await createSheetsClient(args, serviceAccount);
  const availableSheetTitles = await listSheetTitles(sheets, args);
  const actualByNormalizedTitle = new Map();
  for (const title of availableSheetTitles) {
    const normalized = normalizeTabTitle(title);
    if (!actualByNormalizedTitle.has(normalized)) actualByNormalizedTitle.set(normalized, title);
  }

  const missingExpectedTabs = [];
  const candidateTabs = [];
  const candidateTitleSet = new Set();
  for (const expectedTab of LEAD_TABS) {
    const actualTitle = actualByNormalizedTitle.get(normalizeTabTitle(expectedTab));
    if (actualTitle) {
      candidateTabs.push({ tab: actualTitle, expectedTab, discovery: "expected-title" });
      candidateTitleSet.add(actualTitle);
    } else {
      missingExpectedTabs.push(expectedTab);
      console.warn(`Warning: expected lead tab "${expectedTab}" was not found; continuing.`);
    }
  }

  const skippedNonLeadTabs = [];
  for (const title of availableSheetTitles) {
    if (candidateTitleSet.has(title)) continue;
    console.log(`Checking header for possible lead tab ${title}...`);
    const headerRes = await withTimeout(
      sheets.spreadsheets.values.get({
        spreadsheetId: args.sheetId,
        range: `${quoteSheetTabName(title)}!1:1`,
      }),
      SHEETS_READ_TIMEOUT_MS,
      `Reading Google Sheet ${title} header`,
    );
    const headers = headerRes.data.values?.[0] ?? [];
    const headerMatch = leadHeaderScore(headers);
    if (headerMatch.isLeadLike) {
      console.log(`Header discovery matched lead tab ${title}: ${headerMatch.mapped.join(", ")}`);
      candidateTabs.push({ tab: title, expectedTab: null, discovery: "header", headerMatch });
      candidateTitleSet.add(title);
    } else {
      skippedNonLeadTabs.push({ tab: title, mappedHeaders: headerMatch.mapped });
    }
  }

  console.log(`Matched lead tabs: ${candidateTabs.map((item) => item.tab).join(", ") || "(none)"}`);
  console.log(`Missing expected tabs: ${missingExpectedTabs.join(", ") || "(none)"}`);
  console.log(`Skipped non-lead tabs: ${skippedNonLeadTabs.map((item) => item.tab).join(", ") || "(none)"}`);

  const tabResults = [];
  for (const candidate of candidateTabs) {
    console.log(`Reading Google Sheet ${candidate.tab} range...`);
    const res = await withTimeout(
      sheets.spreadsheets.values.get({
        spreadsheetId: args.sheetId,
        range: `${quoteSheetTabName(candidate.tab)}!A:Z`,
      }),
      SHEETS_READ_TIMEOUT_MS,
      `Reading Google Sheet ${candidate.tab} range`,
    );
    const rows = res.data.values ?? [];
    console.log(`Google Sheet ${candidate.tab} read complete: ${rows.length} rows`);
    tabResults.push({ ...candidate, rows });
  }
  tabResults.discovery = {
    availableSheetTitles,
    matchedLeadTabs: candidateTabs.map(({ tab, expectedTab, discovery }) => ({ tab, expectedTab, discovery })),
    missingExpectedTabs,
    skippedNonLeadTabs,
  };
  return tabResults;
}

async function scanRelatedReferences(db, leads) {
  const numericIds = new Set(leads.map((lead) => Number(lead.id ?? lead.__docId)).filter(Number.isFinite));
  const stringIds = new Set(leads.flatMap((lead) => [String(lead.id ?? ""), String(lead.__docId ?? "")]).filter(Boolean));
  const results = [];

  for (const candidate of RELATED_COLLECTIONS) {
    console.log(`Checking related collection ${candidate.collection}...`);
    const snap = await withTimeout(
      db.collection(candidate.collection).get(),
      RELATED_SCAN_TIMEOUT_MS,
      `Checking related collection ${candidate.collection}`,
    );
    let referenced = 0;
    const samples = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      const hitFields = candidate.fields.filter((field) => {
        const value = data[field];
        if (value === undefined || value === null) return false;
        return numericIds.has(Number(value)) || stringIds.has(String(value));
      });
      if (hitFields.length > 0) {
        referenced += 1;
        if (samples.length < 5) samples.push({ id: doc.id, fields: hitFields });
      }
    }
    if (referenced > 0) results.push({ collection: candidate.collection, referenced, sampleDocs: samples });
  }

  const subcollectionResults = [];
  for (const lead of leads.slice(0, 2000)) {
    const leadId = String(lead.__docId ?? lead.id);
    for (const subcollection of LEAD_SUBCOLLECTIONS) {
      const snap = await withTimeout(
        db.collection(LEADS_COLLECTION).doc(leadId).collection(subcollection).limit(1).get(),
        RELATED_SCAN_TIMEOUT_MS,
        `Checking leads/${leadId}/${subcollection}`,
      );
      if (!snap.empty) {
        const found = subcollectionResults.find((item) => item.subcollection === subcollection);
        if (found) found.sampleLeadIds.push(leadId);
        else subcollectionResults.push({ subcollection, sampleLeadIds: [leadId] });
      }
    }
  }

  return { topLevel: results, subcollections: subcollectionResults };
}

function buildReport({ args, existingLeads, sheetAnalysis, backupPath, relatedReferences, writeSummary, verification }) {
  const created = sheetAnalysis.importLeads.filter((item) => item.action === "create").length;
  const updated = sheetAnalysis.importLeads.filter((item) => item.action === "update").length;
  const missingRequired = [];
  for (const item of sheetAnalysis.importLeads) {
    const missing = ["id", "name", "phone", "suburb", "dqRep", "status"].filter((field) => item.lead[field] === undefined || item.lead[field] === "");
    if (missing.length > 0) missingRequired.push({ rowNumber: item.rowNumber, id: item.lead.id, missing });
  }
  return {
    createdAt: new Date().toISOString(),
    mode: args.mode,
    projectId: args.projectId ?? null,
    sheetId: args.sheetId,
    tab: args.tab,
    allTabs: args.allTabs,
    tabs: args.allTabs ? Object.keys(sheetAnalysis.rowsPerTab ?? {}) : [args.tab],
    tabDiscovery: sheetAnalysis.tabDiscovery ?? null,
    availableSheetTitles: sheetAnalysis.tabDiscovery?.availableSheetTitles ?? [],
    matchedLeadTabs: sheetAnalysis.tabDiscovery?.matchedLeadTabs ?? [],
    missingExpectedTabs: sheetAnalysis.tabDiscovery?.missingExpectedTabs ?? [],
    skippedNonLeadTabs: sheetAnalysis.tabDiscovery?.skippedNonLeadTabs ?? [],
    collection: LEADS_COLLECTION,
    backupPath,
    existingLeadCount: existingLeads.length,
    sheetRowCount: sheetAnalysis.totalSheetRows,
    totalRowsAcrossTabs: sheetAnalysis.totalSheetRows,
    rowsPerTab: sheetAnalysis.rowsPerTab ?? {
      [args.tab]: {
        sheetRowCount: sheetAnalysis.totalSheetRows,
        validImportCount: sheetAnalysis.importLeads.length,
        skippedRowCount: sheetAnalysis.skippedRows.length,
        duplicateCount: sheetAnalysis.duplicates.length,
      },
    },
    validImportCount: sheetAnalysis.importLeads.length,
    skippedRowCount: sheetAnalysis.skippedRows.length,
    duplicateCount: sheetAnalysis.duplicates.length,
    statusBreakdown: sheetAnalysis.statusBreakdown,
    plannedCreatedCount: created,
    plannedUpdatedCount: updated,
    idStrategy: {
      leadIdEqualsFirestoreDocId: true,
      existingMatchesKeepCurrentId: true,
      newRowsUseDeterministicSheetKey: true,
      deterministicSeedPriority: ["LeadID", "normalized phone", "normalized email", "normalized name + address"],
      existingMatchCount: sheetAnalysis.importLeads.filter((item) => item.idSource === "existing-match").length,
      stableSheetKeyCount: sheetAnalysis.importLeads.filter((item) => item.idSource === "stable-sheet-key").length,
    },
    deletedCount: writeSummary?.deleted ?? 0,
    createdCount: writeSummary?.created ?? 0,
    updatedCount: writeSummary?.updated ?? 0,
    mappedColumns: sheetAnalysis.mappedColumns,
    unmappedStatuses: sheetAnalysis.unmappedStatuses,
    mappingIssues: sheetAnalysis.issues,
    skippedRows: sheetAnalysis.skippedRows.slice(0, 100),
    duplicates: sheetAnalysis.duplicates.slice(0, 100),
    nameOnlySimilarities: sheetAnalysis.nameOnlySimilarities.slice(0, 100),
    missingRequiredFields: missingRequired.slice(0, 100),
    relatedReferences,
    verification,
    sampleImports: sheetAnalysis.importLeads.slice(0, 5).map((item) => ({
      rowNumber: item.rowNumber,
      sourceTab: item.sourceTab,
      action: item.action,
      match: item.match,
      duplicateKeyType: item.duplicateKeyType,
      idSource: item.idSource,
      lead: {
        id: item.lead.id,
        name: item.lead.name,
        phone: item.lead.phone,
        email: item.lead.email,
        suburb: item.lead.suburb,
        status: item.lead.status,
        sourceTab: item.lead.sourceTab,
        dqRep: item.lead.dqRep,
        region: item.lead.region,
      },
    })),
  };
}

function printReport(report) {
  console.log("");
  console.log("ASG Leads Sheet Migration Report");
  console.log("--------------------------------");
  console.log(`Mode: ${report.mode}`);
  console.log(`Firebase project: ${report.projectId ?? "(admin default)"}`);
  console.log(`Collection: ${report.collection}`);
  console.log(`Sheet tab: ${report.allTabs ? report.tabs.join(", ") : report.tab}`);
  console.log(`Existing Firebase lead count: ${report.existingLeadCount}`);
  console.log(`Sheet row count: ${report.sheetRowCount}`);
  if (report.allTabs) {
    console.log(`Available sheet titles: ${JSON.stringify(report.availableSheetTitles)}`);
    console.log(`Matched lead tabs: ${JSON.stringify(report.matchedLeadTabs)}`);
    console.log(`Missing expected tabs: ${JSON.stringify(report.missingExpectedTabs)}`);
    console.log(`Skipped non-lead tabs: ${JSON.stringify(report.skippedNonLeadTabs)}`);
    console.log(`Total rows across all tabs: ${report.totalRowsAcrossTabs}`);
    console.log(`Rows per tab: ${JSON.stringify(report.rowsPerTab)}`);
  }
  console.log(`Valid import count: ${report.validImportCount}`);
  console.log(`Skipped row count: ${report.skippedRowCount}`);
  console.log(`Duplicate count: ${report.duplicateCount}`);
  console.log(`Name-only similarities: ${report.nameOnlySimilarities?.length ?? 0}`);
  console.log(`Status breakdown: ${JSON.stringify(report.statusBreakdown)}`);
  console.log(`Created count: ${report.createdCount} (${report.plannedCreatedCount} planned)`);
  console.log(`Updated count: ${report.updatedCount} (${report.plannedUpdatedCount} planned)`);
  console.log(`Deleted count: ${report.deletedCount}`);
  console.log(`Backup file path: ${report.backupPath}`);
  if (Object.keys(report.unmappedStatuses ?? {}).length > 0) {
    console.log(`Unmapped statuses using fallback: ${JSON.stringify(report.unmappedStatuses)}`);
  }
  if (report.relatedReferences?.topLevel?.length || report.relatedReferences?.subcollections?.length) {
    console.log("");
    console.log("Related data references detected. These were not deleted or changed:");
    for (const item of report.relatedReferences.topLevel ?? []) {
      console.log(`- ${item.collection}: ${item.referenced} docs reference lead IDs`);
    }
    for (const item of report.relatedReferences.subcollections ?? []) {
      console.log(`- leads/{id}/${item.subcollection}: present on sample leads ${item.sampleLeadIds.slice(0, 5).join(", ")}`);
    }
  }
  if (report.verification) {
    console.log("");
    console.log("Verification:");
    console.log(`Final lead count: ${report.verification.finalLeadCount}`);
    console.log(`Final status breakdown: ${JSON.stringify(report.verification.statusBreakdown)}`);
    console.log(`Sample imported records: ${JSON.stringify(report.verification.sampleImportedRecords)}`);
    if (report.verification.missingRequiredFields.length) {
      console.log(`Missing required fields: ${JSON.stringify(report.verification.missingRequiredFields)}`);
    }
  }
}

async function writeImport(db, existingLeads, sheetAnalysis, args) {
  let deleted = 0;
  let created = 0;
  let updated = 0;

  if (args.mode === "full-replace") {
    if (!args.confirmFullReplace) {
      throw new Error("Full replace requires --confirm-full-replace.");
    }
    const deleteChunks = chunks(existingLeads, 450);
    for (let index = 0; index < deleteChunks.length; index += 1) {
      const chunk = deleteChunks[index];
      console.log(`Deleting lead batch ${index + 1}/${deleteChunks.length}...`);
      const batch = db.batch();
      chunk.forEach((lead) => batch.delete(db.collection(LEADS_COLLECTION).doc(String(lead.__docId ?? lead.id))));
      await batch.commit();
      console.log(`Lead delete batch ${index + 1}/${deleteChunks.length} complete.`);
      deleted += chunk.length;
    }
  }

  const importChunks = chunks(sheetAnalysis.importLeads, 450);
  for (let index = 0; index < importChunks.length; index += 1) {
    const chunk = importChunks[index];
    console.log(`Writing lead batch ${index + 1}/${importChunks.length}...`);
    const batch = db.batch();
    for (const item of chunk) {
      const docId = String(item.lead.id);
      const ref = db.collection(LEADS_COLLECTION).doc(docId);
      batch.set(ref, stripUndefined(item.lead), { merge: args.mode !== "full-replace" });
      if (item.action === "create" || args.mode === "full-replace") created += 1;
      else updated += 1;
    }
    await batch.commit();
    console.log(`Lead write batch ${index + 1}/${importChunks.length} complete.`);
  }

  return { deleted, created, updated };
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function verifyImport(db, importedItems) {
  const leads = await loadExistingLeads(db);
  const statusBreakdown = {};
  const missingRequiredFields = [];
  for (const lead of leads) {
    statusBreakdown[String(lead.status ?? "(missing)")] = (statusBreakdown[String(lead.status ?? "(missing)")] ?? 0) + 1;
    const missing = ["id", "name", "phone", "suburb", "dqRep", "status"].filter((field) => lead[field] === undefined || lead[field] === "");
    if (missing.length > 0 && missingRequiredFields.length < 100) {
      missingRequiredFields.push({ docId: lead.__docId, id: lead.id, missing });
    }
  }
  const sampleImportedRecords = [];
  for (const item of importedItems.slice(0, 5)) {
    console.log(`Reading verification sample lead ${item.lead.id}...`);
    const doc = await withTimeout(
      db.collection(LEADS_COLLECTION).doc(String(item.lead.id)).get(),
      FIRESTORE_READ_TIMEOUT_MS,
      `Reading verification sample lead ${item.lead.id}`,
    );
    console.log(`Verification sample lead ${item.lead.id} read complete.`);
    if (doc.exists) {
      const data = doc.data();
      sampleImportedRecords.push({
        docId: doc.id,
        name: data.name,
        phone: data.phone,
        suburb: data.suburb,
        status: data.status,
        dqRep: data.dqRep,
        region: data.region,
      });
    }
  }
  return { finalLeadCount: leads.length, statusBreakdown, sampleImportedRecords, missingRequiredFields };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.mode === "full-replace" && !args.confirmFullReplace) {
    throw new Error("Refusing full replace without --confirm-full-replace.");
  }
  if (args.mode === "full-replace" && !args.allTabs && !args.confirmSingleTabReplace) {
    throw new Error(
      "Refusing single-tab full replace. This would delete all current leads and import only one tab. Add --all-tabs, or add --confirm-single-tab-replace if this single-tab reset is intentional.",
    );
  }
  if (!["dry-run", "backup-only", "import", "full-replace"].includes(args.mode)) {
    throw new Error(`Invalid mode: ${args.mode}`);
  }

  const ts = timestamp();
  const credentialPath = getCredentialPath();
  const credentialExists = !!credentialPath && existsSync(credentialPath);
  if (!credentialExists) {
    logStartup({ args, credentialPath, credentialExists, serviceAccount: null, projectId: "" });
  }
  const serviceAccount = loadServiceAccount();
  const projectId = detectProjectId(serviceAccount, args);
  args.projectId = projectId;
  if (credentialExists) {
    logStartup({ args, credentialPath, credentialExists, serviceAccount, projectId });
  }

  const db = await initFirebase(serviceAccount, projectId);

  let rows = [];
  let sheetTabs = [];
  if (args.mode !== "backup-only") {
    if (args.allTabs) {
      console.log(`Reading all lead tabs: ${LEAD_TABS.join(", ")}...`);
      sheetTabs = await readAllLeadTabs(args, serviceAccount);
      const totalRowsIncludingHeaders = sheetTabs.reduce((sum, tab) => sum + tab.rows.length, 0);
      console.log(`Google Sheet all-tabs read complete: ${totalRowsIncludingHeaders} rows including headers`);
      if (sheetTabs.length === 0) throw new Error("No lead tabs were discovered in the Google Sheet.");
      const emptyTabs = sheetTabs.filter((tab) => tab.rows.length < 2).map((tab) => tab.tab);
      if (emptyTabs.length > 0) throw new Error(`Sheet tab(s) with no data rows: ${emptyTabs.join(", ")}`);
    } else {
      console.log(`Reading Google Sheet ${args.tab} range...`);
      rows = await readSheetRows(args, serviceAccount);
      console.log(`Google Sheet read complete: ${rows.length} rows`);
      if (rows.length < 2) throw new Error(`Sheet tab "${args.tab}" has no data rows.`);
    }
  }

  console.log("Reading existing Firebase leads...");
  const existingLeads = await loadExistingLeads(db);
  console.log(`Existing Firebase leads read complete: ${existingLeads.length} leads`);

  const backupPath = backupLeads(existingLeads, args, ts);

  if (args.mode === "backup-only") {
    const report = {
      mode: args.mode,
      projectId: args.projectId ?? null,
      collection: LEADS_COLLECTION,
      existingLeadCount: existingLeads.length,
      sheetRowCount: 0,
      validImportCount: 0,
      skippedRowCount: 0,
      duplicateCount: 0,
      statusBreakdown: {},
      plannedCreatedCount: 0,
      plannedUpdatedCount: 0,
      deletedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      backupPath,
    };
    printReport(report);
    return;
  }

  console.log("Reading Firebase reps...");
  const reps = await loadReps(db);
  console.log(`Firebase reps read complete: ${reps.reps.length} reps`);

  console.log("Matching existing leads...");
  const existingIndexes = buildExistingIndexes(existingLeads);
  console.log("Existing lead matching complete");

  console.log("Mapping Sheet rows...");
  console.log("Checking duplicates...");
  const sheetAnalysis = args.allTabs
    ? mapSheetTabs(sheetTabs, existingIndexes, reps.byName, { ...args, defaultRepId: reps.defaultRepId })
    : mapSheetRows(rows, existingIndexes, reps.byName, { ...args, sourceTab: args.tab, defaultRepId: reps.defaultRepId });
  console.log(`Mapping complete: ${sheetAnalysis.importLeads.length} valid, ${sheetAnalysis.skippedRows.length} skipped`);
  console.log(`Duplicate check complete: ${duplicateGroupCount(sheetAnalysis.duplicates)} duplicate groups`);

  let relatedReferences = null;
  console.log("Checking related collections...");
  if (args.relatedScan) {
    relatedReferences = await withTimeout(
      scanRelatedReferences(db, existingLeads),
      RELATED_SCAN_TIMEOUT_MS,
      "Related collection scan",
    );
  } else {
    console.log("Related collection scan skipped by --skip-related-scan.");
  }
  console.log("Related collections check complete");

  let writeSummary = { deleted: 0, created: 0, updated: 0 };
  let verification = null;
  if (args.mode === "import" || args.mode === "full-replace") {
    console.log("Writing Firebase leads...");
    writeSummary = await writeImport(db, existingLeads, sheetAnalysis, args);
    console.log(`Firebase lead write complete: ${writeSummary.created} created, ${writeSummary.updated} updated, ${writeSummary.deleted} deleted`);
    console.log("Verifying Firebase leads...");
    verification = await verifyImport(db, sheetAnalysis.importLeads);
    console.log(`Firebase verification complete: ${verification.finalLeadCount} final leads`);
  }

  if (args.mode === "dry-run") {
    console.log("Generating dry-run report...");
  } else {
    console.log("Generating migration report...");
  }
  const report = buildReport({ args, existingLeads, sheetAnalysis, backupPath, relatedReferences, writeSummary, verification });
  const reportPath = writeJson(args.reportDir, `leads-${args.mode}-report-${ts}.json`, report);
  if (args.mode === "dry-run") {
    console.log("Dry-run report complete");
  } else {
    console.log("Migration report complete");
  }
  printReport(report);
  console.log(`Report file path: ${reportPath}`);

  if (args.mode === "dry-run") {
    console.log("");
    console.log("Dry run only. No Firestore writes were performed.");
    console.log("Review the report before running --import or --full-replace --confirm-full-replace.");
  }
}

export { buildExistingIndexes, mapSheetRows, mapSheetTabs, strongDuplicateKeys, normalizeAUPhone, normalizeTabTitle, leadHeaderScore, quoteSheetTabName };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("");
    console.error(`Migration failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
