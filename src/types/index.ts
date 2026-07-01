/**
 * Core TypeScript types for ASG Leads CRM
 */

// ── Standardised Call Results ─────────────────────────────────────────────────

export type CallResult = "connected" | "no_answer" | "callback" | "booked" | "not_interested" | "wrong_number";

export type Region = "brisbane" | "perth";

export const effectiveRegion = (region?: Region): Region => region ?? "brisbane";

// ── Lead Statuses ─────────────────────────────────────────────────────────────
// Display/canonical values for writes. Legacy values are retained in the type
// for backward-compat with older Firestore documents and are normalized at app
// boundaries.

export type LeadStatus =
  // Legacy lowercase values still present in older workflow helpers
  | "new"
  | "contacted"
  | "qualified"
  | "booked"
  | "lost"
  // Canonical CRM display values
  | "DQ"
  | "Booked"
  | "Revisit"
  | "Not Interested"
  | "Wrong Number"
  | "No Answer"
  // Legacy alias — read-only backward-compat; normalize to Booked for display/writes
  | "Live";

// ── Deal Statuses (DealPipeline) ──────────────────────────────────────────────

export type DealStatus = "lead" | "conditional" | "unconditional" | "settled" | "lost";

// ── Deal Pipeline ─────────────────────────────────────────────────────────────

export type DealStage =
  | "Booked"
  | "Appointment Set"
  | "Appointment Done"
  | "Application In"
  | "Under Assessment"
  | "Approved"
  | "Settlement"
  | "Complete";

export interface DealUpdate {
  id: string;
  leadId: number;
  text: string;
  repId: number;
  repName: string;
  timestamp: number; // ms epoch, used for ordering
  type: "note" | "stage_change" | "system";
  stageFrom?: string; // set when type === 'stage_change'
  stageTo?: string;
}

export interface CallHistory {
  date: string;
  time: string;
  rep: string;
  repId?: number; // stored from Session 28+ for rename resilience
  result: CallResult | string;
  notes: string;
}

// ── Deal appointment records ──────────────────────────────────────────────────
export interface ApptDoc {
  name: string;
  url: string;
  storagePath: string;
  uploadedAt: number;
  uploadedBy: string;
}

export interface FCAppt {
  date?: string;
  repId?: number;
  result?: string; // 'Completed' | 'No Show' | 'Rescheduled' | 'Referred to SMSF - Mike' | 'Declined'
  notes?: string;
  docs?: ApptDoc[];
}

export interface FRAppt {
  date?: string;
  repId?: number;
  result?: string; // same options as FC
  notes?: string;
  docs?: ApptDoc[];
}

export interface PSAppt {
  date?: string;
  repId?: number;
  result?: string; // 'Application Submitted' | 'Approved' | 'Declined' | 'Pending'
  propertySold?: string;
  nextApptDate?: string;
  expectedSettlementDate?: string;
  notes?: string;
  docs?: ApptDoc[];
}

export interface RepPayment {
  repId: number;
  repName: string;
  amountOwed: number;
  paid?: boolean;
  paidDate?: string;
  paidBy?: string; // name of rep who marked as paid
  invoiceUrl?: string;
  invoiceName?: string;
  invoiceStoragePath?: string;
  adminApproved?: boolean;
  adminApprovedBy?: string;
  adminApprovedAt?: number;
}

export interface DealCommissions {
  receivedByRepId?: number; // the rep who received the lump sum
  totalAmount?: number; // total commission received
  repPayments?: RepPayment[]; // breakdown of what each involved rep is owed
  notes?: string;
}

export interface Lead {
  id: number;
  name: string;
  phone: string;
  email?: string;
  phoneRaw?: string; // original phone before normalization (migration safety field)

  // Address
  houseNum?: string;
  street?: string;
  suburb: string;
  postcode?: string;

  // Lead info
  ownership?: string;
  superannuation?: string;
  employment?: string;
  dqRep: number;
  status: LeadStatus | string;
  result?: CallResult | string;
  notes?: string;
  leadDate?: string;

  // Deal linkage
  dealId?: string; // Firestore doc ID in the 'deals' collection (set when result === 'booked')
  clientGroupId?: string;

  // Call tracking
  lastCall?: string;
  callingRep?: number;
  dealValue?: number;
  income?: number;
  balance?: number; // current financial balance for SMSF/investment planning
  deposit?: number;
  timelyAdded?: boolean;

  // Booking
  bookingDate?: string;
  bookingTime?: string;
  appointmentDate?: string;
  appointmentTime?: string;

  // Booked lead rep assignments & outcome
  fcRep?: number; // FC (Financial Consultant) rep ID
  frRep?: number; // FR (Financial Representative) rep ID
  psRep?: number; // PS (Post-Settlement) rep ID
  dnqFellOver?: boolean; // true = this booking did not qualify / fell over
  dnqNotes?: string; // reason why it fell over / DNQ notes
  dealStage?: DealStage; // current stage in the deal pipeline

  // Structured deal appointment data
  fcAppt?: FCAppt;
  frAppt?: FRAppt;
  psAppt?: PSAppt;
  settlementDate?: string; // actual settlement date (YYYY-MM-DD)
  dealCommissions?: DealCommissions;
  dealComplete?: boolean;
  dealCompleteDate?: string;

  // Callback
  callbackDate?: string;
  callbackTime?: string;

  // Follow-up scheduling (independent of callback — used by Follow-Up Engine)
  nextContactDate?: string; // ISO date YYYY-MM-DD

  // Geocoded map coordinates
  lat?: number;
  lng?: number;
  /** "pending" = waiting to geocode, "success" = geocoded OK, "failed" = geocoding failed after retry */
  geocodeStatus?: "pending" | "success" | "failed";

  // Door knock outcome (set when lead created via knock mode)
  // Can be a built-in KnockResult value OR a custom pin type ID
  knockResult?: string;

  // Metadata
  createdAt?: number;
  updatedAt?: number;
  callHistory?: CallHistory[];
  activities?: Activity[];

  // Region partitioning — optional for backward compat; undefined treated as "brisbane"
  region?: Region;
}

export interface Activity {
  date: string;
  type: string;
  note: string;
  rep?: string;
}

// ── Lead Notes (subcollection: leads/{leadId}/notes/{noteId}) ─────────────────

export interface LeadNote {
  id: string;
  text: string;
  createdAt: number; // ms epoch
  createdBy: string; // rep name
  createdById?: number; // rep id — used for delete-own-note permission check
}

export interface Rep {
  id: number;
  name: string;
  active: boolean;
  role?: "rep" | "manager" | "admin";
  /**
   * Optional Firebase Auth linkage.
   * Existing workflows continue to use numeric rep IDs; this field is the
   * bridge Firestore rules/custom claims can use once reps are linked.
   */
  firebaseUid?: string;
  firebaseLinkedAt?: number;
  firebaseLinkedBy?: string;
  primaryRegion?: Region;
  allowedRegions?: Region[];
  email?: string;
  phone?: string;
  photo?: string; // Firebase Storage URL for profile photo
  // Financial fields for commissions
  abn?: string;
  bsb?: string;
  accountNumber?: string;
  // Auth credentials (PIN-based login)
  pin?: string; // 4–6 digit numeric PIN for daily login
  backupPassword?: string; // text password used if PIN is forgotten
  isSetup?: boolean; // false/undefined = first-time login required
  // Onboarding
  hasCompletedOnboarding?: boolean; // true = rep has finished the onboarding flow
  // Page access control (undefined / empty = full access; array = restricted to listed pages)
  permissions?: string[]; // e.g. ['map', 'team-chat'] for knock-only reps
  // Activity tracking
  lastLoginAt?: number; // ms epoch — set on every successful login
  color?: string; // hex e.g. "#6366f1" — used on calendar blocks and run sheet
  showOnCalendar?: boolean; // false = rep hidden from DayView column headers + legend
  availableForBookings?: boolean; // false = rep hidden from AppointmentModal rep dropdown
  allowedServiceTypes?: string[]; // undefined/empty = all types; array = restricted IDs
  // Performance alerts (Feature 4)
  alertsEnabled?: boolean; // true = rep receives in-app + push performance alerts
  teamId?: string;
}

// ── DRAPS (Daily Reporting & Performance Stats) ───────────────────────────────
export interface DrapsEntry {
  id: number;
  date: string; // YYYY-MM-DD
  repId: number;
  repName: string;

  // Field metrics
  dq: number; // DQ leads generated
  referrals: number;
  appointments: number;
  presentations: number;
  sold: number;

  // FC (Finance Consultant) metrics
  fcAppts: number;
  fcPresented: number;
  fcBooked: number;

  // FR (Financial Review) metrics
  frAppts: number;
  frPresented: number;
  frBooked: number;

  createdAt: number;
}

// ── Commissions ───────────────────────────────────────────────────────────────
export interface RepAllocation {
  repId: number;
  repName: string;
  amount: number;
  paid: boolean;
  paidAt?: string;
  role?: "DQ" | "FC" | "FR";
}

export interface CommissionEntry {
  id: string;
  client1: string; // required
  client2?: string; // optional second client
  currentAddress: string; // clients' current residence
  soldAddress: string; // property being settled
  settlementDate: string; // YYYY-MM-DD
  total: number;
  entity: "Perth" | "Brisbane";
  reminderEnabled?: boolean;
  repAllocations: RepAllocation[];
  notes?: string;
  createdAt: number;
  createdBy: string;
  // legacy compat
  client?: string;
  address?: string;
}

// ── Saved Invoice Drafts ──────────────────────────────────────────────────────
export interface InvoiceDraft {
  id: string;
  invoiceToType: "fixed" | "rep";
  invoiceToFixed: string;
  invoiceToRepId: number | "";
  invoiceDate: string;
  amount: string;
  clientName: string;
  clientAddress: string;
  linkedSettlement: string;
  repId: number | "";
  createdAt: number;
  createdBy: string;
  label?: string; // optional short name for the draft
}

// ── Audit Log ─────────────────────────────────────────────────────────────────
export interface AuditEntry {
  id: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  user: string; // rep name
  action: string; // e.g. 'lead_updated', 'call_logged', 'lead_deleted', 'lead_created'
  detail: string; // human-readable description
  leadId?: number;
  leadName?: string;
  region?: Region;
}

export interface RepTarget {
  weeklyDQ?: number;
  monthlyDQ?: number;
  weeklyBookings?: number;
  monthlyBookings?: number;
}

export interface SyncConfig {
  url: string;
  tab: string;
  autoSyncEnabled: boolean;
  autoSyncIntervalMins: number; // 5, 15, 30, 60
  lastSyncAt?: number; // epoch ms
  lastSyncResult?: "success" | "error" | "partial";
  lastSyncSummary?: string; // e.g. "↓12 imported, ↑2174 pushed"
}

export interface AppSettings {
  commission: {
    dqRate: number; // % of deal value going to DQ rep, default 0
    fcRate: number; // % going to FC rep
    frRate: number; // % going to FR rep
  };
  repTargets: Record<number, RepTarget>; // keyed by rep.id
  staleThresholdDays: number; // days without contact before a lead is "stale", default 14
  statusColors?: Record<string, string>; // hex colours per LeadStatus, persisted in Firestore
  sheets?: SyncConfig;
}

export interface FilterOptions {
  repId?: number;
  suburb?: string;
  status?: string;
}

/** Default hex colours for each LeadStatus — used as fallback when no custom colour is saved */
export const DEFAULT_STATUS_COLORS: Record<string, string> = {
  DQ: "#3b82f6",
  "No Answer": "#f59e0b",
  Revisit: "#8b5cf6",
  Booked: "#22c55e",
  "Not Interested": "#ef4444",
  "Wrong Number": "#6b7280",
};

// ── Knock Mode ────────────────────────────────────────────────────────────────

/** Outcome of a door knock — drives pin colour on the map */
export type KnockResult =
  | "not-interested" // Red    #ef4444
  | "no-answer" // Orange #f97316
  | "skipped" // Grey   #6b7280
  | "dq-complete" // Green  #22c55e
  | "parents-not-home"; // Blue   #3b82f6

/** A custom pin type created by an admin in the Pin Legend */
export interface CustomPinType {
  id: string; // `pin_${timestamp}_${rand}`
  name: string; // display name e.g. "Busy — Call Back"
  color: string; // hex colour
  createdAt: number;
  createdBy: string;
}

// ── Team Chat ─────────────────────────────────────────────────────────────────

export type ChatMessageType = "text" | "location" | "status" | "file";

export interface ChatMessage {
  id: string;
  repId: number;
  repName: string;
  text: string;
  type: ChatMessageType;
  lat?: number; // set when type === 'location'
  lng?: number;
  timestamp: number; // ms epoch — used for sorting + unread tracking
  createdAt: number;
  fileUrl?: string; // download URL for attached file
  fileName?: string; // original file name
  fileType?: string; // MIME type
  fileSize?: number; // bytes
  reactions?: Record<string, number[]>; // emoji → array of repIds who reacted
  updatedAt?: number; // ms epoch — set on status messages, used for 24h auto-clear
}

/** A knocked territory zone drawn on the map, assigned to one or more reps */
export interface KnockZone {
  id: string; // `zone_${timestamp}_${rand}`
  name?: string; // optional label e.g. "Block A North"
  // Multi-rep (new — preferred)
  repIds?: number[];
  repNames?: string[];
  // Legacy single-rep (backwards compat with older zone docs in Firestore)
  repId?: number;
  repName?: string;
  date: string; // YYYY-MM-DD
  polygon: Array<{ lat: number; lng: number }>;
  color: string; // hex colour
  createdAt: number;
  createdBy: string;
}

// ── Knowledge Base ──────────────────────────────────────────────────────────

export type KBCategory =
  | "Getting Started"
  | "Leads"
  | "Calls"
  | "DQ Import"
  | "Map"
  | "Team Chat"
  | "Calendar"
  | "Deal Dashboard"
  | "Documents"
  | "Admin"
  | "Commissions"
  | "Sync"
  | "Client Hub"
  | "Other";

export interface KBArticle {
  id: string;
  title: string;
  category: KBCategory;
  content: string; // HTML from rich text editor
  tags: string[];
  pinned: boolean;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  views: number;
}

// ── Document Centre ─────────────────────────────────────────────────────────

export interface DocFormField {
  id: string;
  label: string;
  type: "text" | "date" | "select";
  options?: string[];
  autoFill?: "leadName" | "leadAddress" | "leadPhone" | "repName" | "today";
}

export interface LibraryDocument {
  id: string;
  name: string;
  description: string;
  category: string;
  storagePath: string;
  downloadUrl: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: number;
  formFields?: DocFormField[];
  sortOrder?: number; // admin-controlled display order; lower = first
}

// ── Deal Documents ───────────────────────────────────────────────────────────

export type DealDocumentType = "oa" | "compliance" | "contract" | "other";

export interface DealDocument {
  id: string;
  dealId: string;
  clientId: string;
  name: string;
  type: DealDocumentType;
  fileUrl: string;
  storagePath: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: number;
}

// ── Document Instances (fillable PDF-backed documents) ──────────────────────

export type DocumentInstanceType = "offer-and-acceptance";
export type DocumentInstanceStatus = "draft" | "completed" | "signed" | "locked";

export interface OADocumentData {
  // Buyer details
  buyerName: string;
  buyerAddress: string;
  buyerPhone: string;
  buyerEmail: string;
  // Property details
  propertyAddress: string;
  propertyStreet: string;
  propertySuburb: string;
  propertyPostcode: string;
  propertyTitleRef: string;
  // Financials
  purchasePrice: string;
  depositAmount: string;
  depositPaidDate: string;
  balanceAmount: string;
  financeClause: string; // number of finance days
  settlementDays: string; // number of settlement days
  // GST / Compliance
  gstInclusive: boolean;
  complianceNotes: string;
  // Additional
  includedChattels: string;
  specialConditions: string;
  // Rep info (auto-filled)
  preparedByRep: string;
  preparedByRepId: number;
  preparedDate: string;
}

export interface DocumentInstance {
  id: string;
  type: DocumentInstanceType;
  clientId: string;
  clientName: string;
  dealId: string;
  data: OADocumentData;
  status: DocumentInstanceStatus;
  editable?: boolean;
  pdfUrl?: string;
  pdfStoragePath?: string;
  signedUrl?: string;
  signedAt?: number;
  envelopeId?: string;
  viewingUrl?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Client Notes (centralized across appointments, calls, deals) ─────────────

export type NoteSource = "appointment" | "call" | "deal" | "manual";
export type AppointmentNoteType = "FC" | "FR" | "Discovery";

export interface ClientNote {
  id: string;
  clientId: string;
  content: string;
  createdBy: string;
  repName: string;
  source: NoteSource;
  sourceId?: string;
  appointmentType?: AppointmentNoteType;
  appointmentDate?: string; // YYYY-MM-DD (kept for backward compat)
  isImportant?: boolean;
  createdAt: number;
  createdAtTs?: import("firebase/firestore").Timestamp; // serverTimestamp (new)
}

// ── Fillable Form Templates ──────────────────────────────────────────────────

export type FormFieldType = "text" | "textarea" | "date" | "select" | "checkbox" | "signature";

export type FormFieldAutoFill =
  | "leadName"
  | "leadPhone"
  | "leadEmail"
  | "leadAddress"
  | "leadSuburb"
  | "leadPostcode"
  | "leadOwnership"
  | "repName"
  | "today";

export interface FormTemplateField {
  id: string;
  label: string;
  type: FormFieldType;
  options?: string[]; // for 'select' type
  required?: boolean;
  autoFill?: FormFieldAutoFill;
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  /** 'builder' = custom field-builder form (default/legacy), 'pdf' = uploaded AcroForm PDF */
  type?: "builder" | "pdf";
  fields: FormTemplateField[];
  /** Optional structured-document schema. Legacy templates continue to use fields as the compatibility source. */
  schema?: import("../lib/documentSchema").DocumentTemplateSchema;
  /** Firebase Storage download URL — only set when type === 'pdf' */
  pdfUrl?: string;
  /** Firebase Storage path — only set when type === 'pdf', used for deletion */
  pdfStoragePath?: string;
  /** Version number — starts at 1, increments on each PDF replacement */
  version?: number;
  /** History of replaced PDF versions */
  versionHistory?: Array<{
    version: number;
    pdfUrl: string;
    pdfStoragePath: string;
    replacedAt: number;
    replacedBy: string;
  }>;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  sortOrder?: number; // admin-controlled display order; lower = first
}

// ── Lead File Attachments ───────────────────────────────────────────────────

export interface LeadFile {
  id: string;
  name: string;
  storagePath: string;
  downloadUrl: string;
  fileType: string;
  fileSize: number;
  type: "document" | "photo" | "file";
  uploadedBy: string;
  uploadedAt: number;
  linkedDocumentId?: string;
}

// ── Calendar / Appointments ─────────────────────────────────────────────────

export interface ServiceType {
  id: string;
  name: string; // "Finance Run", "Contract Signing"
  category: string; // "Finance" | "Property Sale" | "General"
  color: string; // hex e.g. "#6366f1"
  defaultDuration: number; // minutes (30/60/90/120)
  sortOrder?: number;
}

export type AppointmentStatus =
  | "pencilled-in" // Not yet confirmed (default new appt)
  | "confirmed" // Confirmed with client
  | "arrived" // Client arrived
  | "started" // In progress
  | "completed" // Done (generic outcome)
  | "no-show" // Client didn't show
  | "cancelled" // Cancelled
  | "rebook-fc" // ReBook - First Consult (FC)
  | "rebook-fr" // ReBook - Finance Run (FR)
  | "fc-complete-fr-booked" // FC Complete - FR Booked
  | "stopped-at-door" // Stopped At Door (SAD)
  | "presented-no-sale" // Presented No Sale (PNS)
  | "did-not-qualify"; // Did Not Qualify (DNQ)

export interface Appointment {
  id: string;
  title: string; // client name display label
  serviceTypeId: string; // FK → ServiceType.id
  repId: number; // FK → Rep.id
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM 24-hour
  endTime?: string;
  durationMins?: number; // pre-computed for Day view block height
  status: AppointmentStatus;
  notes?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  linkedLeadId?: number; // optional link to Lead
  createdBy: string;
  createdAt: number; // ms epoch
  // Future scaffold — stored in Firestore, not rendered in UI yet:
  reminderEmailSent?: boolean;
  reminderSmsSent?: boolean;
  confirmationSent?: boolean;
}

// ── AI Roleplay / Training Sessions ─────────────────────────────────────────

export type RoleplayScenario = "cold_call" | "objection_handling" | "closing" | "follow_up" | "discovery";

export interface RoleplayScores {
  objectionHandling: number; // 0–15
  questioning: number; // 0–15
  closing: number; // 0–10
  total: number; // 0–40
}

// ── Session message (stored inside trainingSessions docs) ────────────────────

export interface SessionMessage {
  // v2 canonical fields
  sender: "rep" | "ai";
  content: string;
  timestamp: number; // ms epoch
  // v1 legacy fields (kept for backward compat with older Firestore docs)
  role?: "user" | "ai" | "system";
  text?: string;
}

// ── Section-level scores (v3) ─────────────────────────────────────────────────

export interface SectionScores {
  opening: number; // 0–10
  rapport: number; // 0–10
  qualification: number; // 0–10
  valueDelivery: number; // 0–10
  closing: number; // 0–10
}

// ── Structured feedback (v3) ──────────────────────────────────────────────────

export interface StructuredFeedback {
  strengths: string[];
  improvements: string[];
  missedOpportunities: string[];
}

// ── Settings Version History ──────────────────────────────────────────────────

export interface SettingsVersionEntry {
  id: string; // Firestore doc ID
  previousSettings: unknown; // full AppConfig snapshot before change
  newSettings: unknown; // what was written (full or partial)
  changedBy: number; // Rep.id
  changedByName: string;
  action: "update" | "rollback";
  timestamp: number; // ms epoch (client-side estimate; server timestamp stored separately)
}

export interface RoleplaySession {
  id: string; // Firestore doc ID
  // Preferred fields (written by updated AIRoleplay.tsx)
  repId: number;
  repName: string;
  // Legacy fields (written by older sessions — kept for backward compat)
  userId?: string; // stringified repId from older saves
  userName?: string;
  // Scores — stored as `score` object in Firestore
  score: RoleplayScores;
  // Scenario info
  scenarioType: RoleplayScenario | string;
  difficulty?: "easy" | "medium" | "hard";
  personaType?: string;
  feedback?: string; // plain-text coaching feedback (v1/v2)
  completedAt: number; // ms epoch
  // ── v2 analysis fields ───────────────────────────────────────────────────
  questionsAsked?: number;
  hesitations?: number;
  ignoredObjections?: number;
  closingAttemptExchange?: number;
  scriptId?: string | null;
  voiceMode?: boolean;
  // ── v3 session recording fields ──────────────────────────────────────────
  messages?: SessionMessage[]; // full conversation transcript
  startedAt?: number; // ms epoch — session start
  endedAt?: number; // ms epoch — session end
  durationSeconds?: number;
  talkTimeRepPercent?: number; // % of total content from rep
  talkTimeAiPercent?: number;
  sectionScores?: SectionScores; // granular section breakdown
  structuredFeedback?: StructuredFeedback; // strengths / improvements / missed
  partial?: boolean; // true if saved mid-session (early exit)
  scriptType?: string; // scenario category alias (for UI display)
}

// ── Daily Stats (aggregated performance per rep per day) ──────────────────────

export interface DailyStatsMetrics {
  calls: number;
  appointments: number;
  dealsCreated: number;
  dealsClosed: number;
  commissionEarned: number;
  trainingSessions: number;
  avgTrainingScore: number;
}

export interface DailyStatsDraps {
  dials: number;
  responses: number;
  appointments: number;
  presentations: number;
  sales: number;
}

export interface DailyStats {
  id?: string;
  repId: number;
  repName: string;
  date: string; // "YYYY-MM-DD"
  metrics: DailyStatsMetrics;
  draps: DailyStatsDraps;
  createdAt?: number;
  updatedAt?: number;
}

// ── User Devices (FCM push notification tokens) ───────────────────────────────

export interface UserDevice {
  id?: string;
  userId: number;
  token: string;
  platform: "web" | "android" | "ios";
  createdAt: number;
  updatedAt: number;
}

// ── Performance Alerts ────────────────────────────────────────────────────────

export type PerfAlertType =
  | "no_activity" // No calls logged by midday
  | "low_activity" // Behind on calls by 3 PM
  | "target_nearing" // >= 80% of daily target reached
  | "missed_target"; // End of day, still under target

export interface PerfAlert {
  type: PerfAlertType;
  message: string;
  severity: "info" | "warning" | "error";
  timestamp: number;
}

// ── Training Library ──────────────────────────────────────────────────────────

export type TrainingDocCategory = "Scripts" | "SOPs" | "Compliance" | "Product" | "General";

export interface TrainingDocument {
  id: string;
  title: string;
  description?: string;
  category: TrainingDocCategory | string;
  fileUrl: string;
  storagePath: string;
  fileType: string; // MIME type
  fileSize: number;
  uploadedBy: string;
  uploadedById: number;
  createdAt: number;
  pinnedByReps?: number[]; // rep IDs who pinned this
}

export type TrainingVideoSource = "youtube" | "upload";

export interface TrainingVideo {
  id: string;
  title: string;
  description?: string;
  category?: string;
  source: TrainingVideoSource;
  // YouTube: embed URL / upload: storage URL
  videoUrl: string;
  thumbnailUrl?: string;
  durationMins?: number;
  uploadedBy: string;
  uploadedById: number;
  createdAt: number;
  pinnedByReps?: number[];
}

export interface TrainingRecording {
  id: string;
  sessionId: string; // FK → trainingSessions doc
  repId: number;
  repName: string;
  scenarioType: string;
  difficulty?: string;
  score?: number; // 0–40
  audioUrl?: string; // Firebase Storage URL if audio was captured
  storagePath?: string;
  transcript?: string; // Full conversation transcript as text
  durationSeconds?: number;
  createdAt: number;
}

// ── My Dashboard ──────────────────────────────────────────────────────────────

export type DashboardWidgetType =
  | "performance_snapshot"
  | "pinned_resources"
  | "quick_notes"
  | "today_panel"
  | "focus_panel"
  | "todo_list"
  | "weekly_planner"
  | "affirmations"
  | "checklist"
  | "notice_board"
  | "team_board";

export interface UserNote {
  id: string;
  userId: string;
  content: string;
  type: "note" | "todo" | "link";
  pinned: boolean;
  createdAt: number;
}

export type ResetPolicy = "daily" | "persistent" | "manual";

export interface DashboardWidgetConfig {
  id: DashboardWidgetType;
  enabled: boolean;
  order: number;
  resetPolicy: ResetPolicy;
  // Widget-specific settings (open-ended)
  settings?: Record<string, unknown>;
}

export interface QuickNote {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  isTemporary?: boolean; // if true, reset on daily reset
  linkedLeadId?: number; // if set, this note is linked to a specific lead
  linkedLeadName?: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  dueDate?: string; // YYYY-MM-DD
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface DashboardLayout {
  widgets: DashboardWidgetConfig[];
  pinnedItems: Array<{
    id: string;
    type: "document" | "video" | "script";
    title: string;
    resourceId: string;
  }>;
  notes: QuickNote[];
  todoItems: TodoItem[];
  checklistItems: ChecklistItem[];
  affirmations: string[];
  weeklyPlan: Record<string, string>; // "mon" | "tue" | ... → text
  lastResetDate: string; // YYYY-MM-DD
  updatedAt: number;
}

// ── Client Group ─────────────────────────────────────────────────────────────

export interface ClientGroup {
  id: string;
  clientIds: string[];
  createdAt: number;
  createdBy: string;
}

// ── Rep Settings ──────────────────────────────────────────────────────────────

export type TrainingDefaultMode = "chat" | "voice" | "natural";
export type TrainingDefaultDifficulty = "easy" | "medium" | "hard";

export interface RepSettings {
  theme: "light" | "dark" | "system";
  uiScale: "0.90" | "0.95" | "1" | "1.10" | "1.25" | "auto";
  notificationsEnabled: boolean;
  /** Show AI-generated guidance cards in Client Profile. Defaults to true. */
  aiGuidanceEnabled?: boolean;
  training: {
    defaultMode: TrainingDefaultMode;
    defaultDifficulty: TrainingDefaultDifficulty;
  };
  audio: {
    preferredMicId?: string; // deviceId from navigator.mediaDevices
    volume: number; // 0–1
  };
  updatedAt: number;
}

// ── Salestrail Integration ────────────────────────────────────────────────────

export interface SalestrailCallDoc {
  salestrailCallId: string;
  callerNumber: string;
  callerNumberNormalized: string;
  calleeNumber: string;
  calleeNumberNormalized: string;
  callerName: string | null;
  userEmail: string;
  userName: string;
  direction: "inbound" | "outbound" | "internal" | null;
  callType: string | null;
  durationSeconds: number | null;
  sourceCreatedAt: number;
  sourceUpdatedAt: number | null;
  recordingAvailable: boolean;
  recordingReference: string | null;
  matchedLeadId: string | null;
  matchedPhoneNumber: string | null;
  matchedOn: "caller" | "callee" | null;
  matchConfidence: "exact" | "partial" | "none";
  assignedRepId: number | null;
  region: "brisbane" | "perth" | null;
  importBatchId: string;
  importStatus: "new" | "matched" | "unmatched" | "error";
  importedAt: number;
  rawPayload?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface SyncResult {
  success: boolean;
  dryRun: boolean;
  fullSync: boolean;
  fetchedCount: number;
  wouldImportCount: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
  batchId: string;
}

export interface SalestrailConfig {
  enabled: boolean;
  lastSyncAt: number | null;
  lastSyncStatus: "success" | "error" | "in_progress" | null;
  lastSyncError: string | null;
  lastSyncCallCount: number | null;
  syncInProgress: boolean;
  syncStartedAt: number | null;
}
