/**
 * Knowledge Base page
 *
 * - Left panel: category list + search + article list
 * - Right panel: article viewer (all users) or editor (admin only)
 * - Uses SimpleRichEditor (contenteditable + execCommand toolbar)
 * - Content stored as HTML in Firestore `knowledgeBase` collection
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import { KBArticle, KBCategory } from "../types";
import { useAppStore } from "../stores/appStore";
import { useKBArticles, useSaveKBArticle, useDeleteKBArticle, useIncrementKBViews } from "../hooks/useFirebase";
import { useToast } from "../context/ToastContext";
import { AICoachingPanel } from "../components/AICoachingPanel";
import {
  BookOpen,
  Search,
  Plus,
  Edit3,
  Trash2,
  Pin,
  X,
  ChevronRight,
  Eye,
  Clock,
  Save,
  Zap,
} from "lucide-react";

const KB_CATEGORIES: KBCategory[] = [
  "Getting Started",
  "Leads",
  "Calls",
  "DQ Import",
  "Map",
  "Team Chat",
  "Calendar",
  "Deal Dashboard",
  "Documents",
  "Admin",
  "Commissions",
  "Sync",
  "Client Hub",
  "Other",
];

const CATEGORY_ICONS: Record<KBCategory, string> = {
  "Getting Started": "🚀",
  Leads: "👥",
  Calls: "📞",
  "DQ Import": "📥",
  Map: "🗺️",
  "Team Chat": "💬",
  Calendar: "📅",
  "Deal Dashboard": "🏆",
  Documents: "📄",
  Admin: "⚙️",
  Commissions: "💰",
  Sync: "🔄",
  "Client Hub": "👤",
  Other: "📌",
};

const CATEGORY_COLORS: Record<KBCategory, string> = {
  "Getting Started": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Leads: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400",
  Calls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "DQ Import": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Map: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  "Team Chat": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  Calendar: "bg-gray-200 text-gray-800 dark:bg-gray-700/30 dark:text-gray-300",
  "Deal Dashboard": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Documents: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  Admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Commissions: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  Sync: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "Client Hub": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  Other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};

// ── Default seed articles ───────────────────────────────────────────────────
// Admin can click "Seed Default Articles" to populate the KB on first use.
const DEFAULT_ARTICLES: Omit<KBArticle, "id" | "createdAt" | "updatedAt" | "views" | "createdBy">[] = [
  {
    title: "Welcome to ASG Live Leads CRM",
    category: "Getting Started",
    pinned: true,
    tags: ["overview", "intro", "getting started"],
    content: `<h2>Welcome to ASG Live Leads CRM</h2>
<p>This is the central hub for managing all leads, bookings, appointments, commissions, and team activity for Amplify Solutions Group.</p>
<h3>Main Sections</h3>
<ul>
<li><strong>Dashboard</strong> — Live stats, callback queue, rep leaderboard and deal overview</li>
<li><strong>Team Chat</strong> — Group chat + direct messages, location sharing, status updates</li>
<li><strong>Leads</strong> — Full lead database with filtering, search, and call logging</li>
<li><strong>Client Hub</strong> — View all clients/bookings in one place</li>
<li><strong>Calendar</strong> — Appointment scheduling (FC, FR, PS, Coffee Runs, etc.)</li>
<li><strong>Deal Dashboard</strong> — FC/FR/PS pipeline for booked leads</li>
<li><strong>DQ Import</strong> — Bulk import new DQ leads from a spreadsheet</li>
<li><strong>Map</strong> — Visualise leads geographically, knock mode, zone drawing</li>
<li><strong>DRAPS &amp; Stats</strong> — Daily activity tracking (DQ, Refs, Appts, Presentations, Sold)</li>
<li><strong>Comms Calculator</strong> — Settlement tracking and invoice generation</li>
<li><strong>Documents</strong> — PDF form filler and template management</li>
<li><strong>Admin</strong> — Rep management, settings, sync config, data tools (admin only)</li>
</ul>
<h3>First-Time Setup</h3>
<ol>
<li>Select your name at the login screen and enter your PIN</li>
<li>If first time: enter access code <strong>9090</strong>, then set your email + PIN + backup password</li>
<li>Admins sign in through the normal staff login flow using their assigned profile and PIN</li>
</ol>
<p>Your session is remembered — you won't need to log in again on the same browser.</p>`,
  },
  {
    title: "How to Log a Call",
    category: "Calls",
    pinned: false,
    tags: ["calls", "call logger", "notes", "callback"],
    content: `<h2>Logging a Call</h2>
<p>Call logging is the most important daily action in the CRM. Every call must be logged so the team can see the latest status and notes.</p>
<h3>How to Log</h3>
<ol>
<li>Find the lead in the <strong>Leads</strong> table</li>
<li>Click the <strong>📞 Phone Call</strong> (amber) button on the row, or open the lead and click "Log Call"</li>
<li>Select the <strong>Call Result</strong> from the options</li>
<li>If "Revisit / Callback" — set the callback date and time</li>
<li>Add any <strong>Call Notes</strong> (optional but recommended)</li>
<li>Click <strong>Save Call</strong></li>
</ol>
<h3>Call Results</h3>
<ul>
<li><strong>Booked</strong> — Lead agreed to an appointment. Sets status to "Booked"</li>
<li><strong>Not Interested</strong> — Lead declined</li>
<li><strong>Revisit / Callback</strong> — Call back at a set date/time</li>
<li><strong>No Answer</strong> — No one picked up</li>
<li><strong>Wrong Number</strong> — Number is invalid or wrong person</li>
<li><strong>Back to DQ</strong> — Return the lead to the DQ pool</li>
</ul>
<h3>Callback Reminders</h3>
<p>If you set a callback date/time, the browser will show a notification reminder when that time arrives (requires browser notification permission).</p>`,
  },
  {
    title: "Adding and Managing Leads",
    category: "Leads",
    pinned: false,
    tags: ["leads", "add lead", "edit lead", "status", "sidebar"],
    content: `<h2>Managing Leads</h2>
<h3>Adding a New Lead</h3>
<ol>
<li>Click the <strong>+ Add Lead</strong> button in the top-right of the Leads page</li>
<li>Fill in Name, Phone, Address, and other details</li>
<li>Click <strong>Save Lead</strong></li>
</ol>
<h3>Editing a Lead</h3>
<p>Click any row in the table to open the <strong>Lead Sidebar</strong>. From there you can:</p>
<ul>
<li>Edit name, phone, email, address, ownership, superannuation</li>
<li>Change the lead status</li>
<li>Set callback date/time (for Revisit leads)</li>
<li>Add or update the Notes field (free text)</li>
<li>View call history timeline</li>
<li>Attach files or fill PDF forms</li>
</ul>
<p>Click <strong>Save Changes</strong> to persist edits, or <strong>Discard</strong> to revert.</p>
<h3>Status Types</h3>
<ul>
<li><strong>DQ</strong> — Uncontacted/new DQ lead</li>
<li><strong>Booked</strong> — Appointment set</li>
<li><strong>Revisit</strong> — Needs a follow-up call</li>
<li><strong>Not Interested</strong> — Declined</li>
<li><strong>Wrong Number / No Answer</strong> — Contact issues</li>
</ul>
<h3>Bulk Actions</h3>
<p>Select multiple leads using the checkboxes, then use the footer bar to: change status, reassign to a rep, or delete (with confirmation).</p>`,
  },
  {
    title: "Importing DQ Leads",
    category: "DQ Import",
    pinned: false,
    tags: ["dq", "import", "bulk", "spreadsheet"],
    content: `<h2>DQ Import</h2>
<p>Use the DQ Import page to bulk-import leads from a spreadsheet in one go.</p>
<h3>Steps</h3>
<ol>
<li>Navigate to <strong>DQ Import</strong> from the sidebar</li>
<li>Set the <strong>Lead Date</strong> (defaults to today) — all imported leads will get this date</li>
<li>Set the <strong>Import Status</strong> (defaults to DQ)</li>
<li>Paste or type leads into the rows: Name, Phone, Address, Suburb, Postcode</li>
<li>Select the <strong>DQ Rep</strong> for each row (defaults to your name)</li>
<li>Click <strong>Import N Leads</strong></li>
</ol>
<h3>Tips</h3>
<ul>
<li>Rows with duplicate addresses (already in the system) are highlighted in amber — you can still import them</li>
<li>Phone numbers are automatically formatted to Australian format (04XX XXX XXX)</li>
<li>Use <strong>Clear All</strong> to reset the form</li>
<li>Max 500 rows per import — split larger batches</li>
</ul>`,
  },
  {
    title: "Using the Map",
    category: "Map",
    pinned: false,
    tags: ["map", "knock mode", "geocode", "zones", "pins", "heatmap"],
    content: `<h2>Map</h2>
<p>The Map page visualises all geocoded leads as pins on a Google Map.</p>
<h3>Default View</h3>
<ul>
<li>Pins represent CRM leads, colour-coded by status</li>
<li>Click a pin to open the <strong>Pin Action Panel</strong> — update colour, open the lead profile, or log a call</li>
<li>Use the filter chips (DQ, Booked, etc.) to show/hide status layers</li>
<li>Use the <strong>Suburb</strong> filter to focus on one area</li>
</ul>
<h3>Knock Mode</h3>
<ol>
<li>Toggle <strong>🚪 Knock Mode</strong> to enter door-knock view</li>
<li>Tap anywhere on the map to drop a "Quick Pin" at that location</li>
<li>Fill in the address details and select a pin colour/result</li>
<li>Save to create the lead in the CRM with map coordinates</li>
</ol>
<h3>Zone Drawing</h3>
<ul>
<li>In Knock Mode, click <strong>Draw Zone</strong> and click the map to create polygon vertices</li>
<li>Click <strong>Finish Zone</strong> when done — assign a rep, date, and colour</li>
<li>Zones appear in the <strong>Zone Library</strong> panel</li>
</ul>
<h3>Heatmap</h3>
<p>Toggle the 🌡️ <strong>Heatmap</strong> button to see lead density by area. Use the date picker to filter the heatmap to a specific day.</p>
<h3>Geocoding</h3>
<p>Leads without coordinates show a count. Click <strong>Geocode All</strong> to batch-geocode them (rate-limited to avoid API quota).</p>`,
  },
  {
    title: "Team Chat & Direct Messages",
    category: "Team Chat",
    pinned: false,
    tags: ["chat", "team", "direct message", "dm", "location", "status"],
    content: `<h2>Team Chat</h2>
<p>Communicate with the whole team or individual reps without leaving the CRM.</p>
<h3>Group Channel</h3>
<ul>
<li>The <strong>#team</strong> channel is shared by everyone — use it for general updates, announcements, and questions</li>
<li>Type your message and press Enter or click Send</li>
<li>Attach a file using the 📎 paperclip icon (images, PDFs, docs)</li>
</ul>
<h3>Direct Messages</h3>
<ul>
<li>Click any rep's name in the left sidebar to open a direct message thread</li>
<li>Unread message counts show as amber badges on the rep's name</li>
<li>Browser notifications fire when a new DM arrives (requires permission)</li>
</ul>
<h3>Status Updates</h3>
<p>Click the <strong>🟢 Status</strong> button to post a quick status to the team channel:</p>
<ul>
<li>🚪 Out knocking</li>
<li>🚗 Driving between areas</li>
<li>☕ On a break</li>
<li>🏠 Back at office</li>
<li>📋 In a meeting</li>
</ul>
<h3>Location Sharing</h3>
<p>Click the 📍 <strong>Location</strong> button to share your current GPS coordinates as a Google Maps link. Requires location permission in the browser.</p>`,
  },
  {
    title: "Bookings Calendar",
    category: "Calendar",
    pinned: false,
    tags: ["calendar", "appointments", "fc", "fr", "booking", "timely"],
    content: `<h2>Bookings Calendar</h2>
<p>The Calendar replaces Timely for scheduling FC, FR, PS, SMSF, Coffee Runs, and other appointments.</p>
<h3>Views</h3>
<ul>
<li><strong>Day</strong> — Columns per service type (First Consult, Finance Run, etc.), time slots from 8am–7pm</li>
<li><strong>Week</strong> — Mon–Sun overview, click a day to drill into Day view</li>
<li><strong>Agenda</strong> — Date-grouped list of all upcoming appointments</li>
</ul>
<h3>Creating an Appointment</h3>
<ol>
<li>Click any empty time slot (Day view) or the <strong>+ New Appointment</strong> button</li>
<li>Select the client (type to search, or pick from recent bookings)</li>
<li>Choose a Service Type — duration is auto-set from the default</li>
<li>Pick the rep, date, start time, and status (Pencilled In / Confirmed)</li>
<li>Optionally link to a CRM lead</li>
<li>Click Save</li>
</ol>
<h3>Service Types</h3>
<p>Service types are managed by admin in <strong>Admin → Calendar Settings</strong>. Each type has a name, category (FC/FR/PS/etc.), colour, and default duration.</p>
<h3>Importing from Timely</h3>
<p>Click <strong>📥 Import Timely</strong> in the Calendar toolbar to import a CSV export from Timely. The wizard maps service types and rep names automatically.</p>
<h3>Lead Overlays</h3>
<p>Callback dates, booking dates, FC/FR appointment dates, and settlement dates from leads are shown as dashed-border overlays on the calendar. Click them to open the lead's profile.</p>`,
  },
  {
    title: "Deal Dashboard — FC/FR/PS Pipeline",
    category: "Deal Dashboard",
    pinned: false,
    tags: ["deal", "fc", "fr", "ps", "pipeline", "commissions"],
    content: `<h2>Deal Dashboard</h2>
<p>The Deal Dashboard tracks active deals through the FC → FR → PS pipeline and manages commissions once settled.</p>
<h3>Active Deals</h3>
<p>All Booked leads appear as deal cards. Each card has six accordion sections:</p>
<ul>
<li><strong>First Consult (FC)</strong> — date, rep, result, notes, document uploads</li>
<li><strong>Finance Run (FR)</strong> — date, rep, result, notes, document uploads</li>
<li><strong>Post-Settlement (PS)</strong> — property sold details, expected settlement date, documents</li>
<li><strong>Settlement Date</strong> — actual settlement date once confirmed</li>
<li><strong>Commissions</strong> — total received, allocation to DQ/FC/FR reps, mark paid</li>
<li><strong>Deal Chat</strong> — per-deal comments for the team</li>
</ul>
<h3>DNQ / Fell Over</h3>
<p>Toggle <strong>DNQ – Fell Over</strong> on any deal card and add a reason. This marks the deal as not proceeding without deleting the lead.</p>
<h3>Completed Deals</h3>
<p>Click <strong>Mark as Complete</strong> when a deal fully settles. It moves to the <strong>Completed</strong> tab where reps can upload invoices and admin can approve payments.</p>`,
  },
  {
    title: "Document Centre & PDF Forms",
    category: "Documents",
    pinned: false,
    tags: ["documents", "pdf", "forms", "templates", "filler"],
    content: `<h2>Document Centre</h2>
<p>Store, fill, and manage all client-facing PDF forms and documents.</p>
<h3>Template Library</h3>
<p>Admin can upload PDF templates (with or without AcroForm fields). Templates appear as cards with a page-1 thumbnail. Click <strong>Fill Form</strong> to open the PDF filler.</p>
<h3>Filling a Form</h3>
<ol>
<li>Click <strong>Fill Form</strong> on any template card</li>
<li>The PDF renders with text inputs overlaid on all form fields</li>
<li>Type in each field — date/time/currency fields are auto-detected</li>
<li>Add extra fields by clicking <strong>+ Add Field</strong> (drag to draw a box)</li>
<li>Optionally search and link to a client lead</li>
<li>Click <strong>Download to Device</strong> or <strong>Save to Client</strong></li>
</ol>
<h3>Signatures</h3>
<p>Scroll to the bottom of the filler to sign with a mouse/touch. A second client signature can be added by clicking <strong>Add Client 2 Signature</strong>.</p>
<h3>Photos</h3>
<p>Click the 📷 camera icon to attach a photo. Each photo becomes an additional page in the exported PDF with a header bar.</p>
<h3>Template Versions</h3>
<p>When a template PDF is replaced, the old version is archived. A version badge (v2, v3…) shows on the card. Previous versions are still accessible.</p>`,
  },
  {
    title: "Admin Panel Overview",
    category: "Admin",
    pinned: false,
    tags: ["admin", "settings", "reps", "permissions", "audit"],
    content: `<h2>Admin Panel</h2>
<p>The Admin panel (visible to admin role only) is the control centre for the entire app.</p>
<h3>Tabs</h3>
<ul>
<li><strong>Rep Roster</strong> — Add/edit/remove reps, set PINs, assign permissions (which pages each rep can see), financial fields (ABN, BSB, account #)</li>
<li><strong>Lead Stats</strong> — Status breakdown bars, leads per rep, top suburbs, recently added leads</li>
<li><strong>Rep Performance</strong> — Sortable leaderboard: calls, leads, booked, conversion rate vs targets</li>
<li><strong>Operations</strong> — Overdue callbacks, upcoming appointments, stale leads (no contact in X days)</li>
<li><strong>Sync</strong> — Configure the Google Sheet URL and tab, view last sync status, open sync modal</li>
<li><strong>Data Tools</strong> — Bulk status changes, bulk rep reassignment, archive old DQ leads, export CSV</li>
<li><strong>Settings</strong> — Commission rate defaults, stale lead threshold, rep activity targets, status colours</li>
<li><strong>Audit Log</strong> — Full history of all actions (filtered by user and action type, exportable)</li>
<li><strong>Calendar Settings</strong> — Manage service types for the Calendar (name, colour, duration, category)</li>
</ul>
<h3>Rep Permissions</h3>
<p>In Rep Roster, expand a rep and use the permissions checkboxes to restrict which pages they can access. Quick presets: <em>Full Access</em> or <em>Knock-Only</em> (Team Chat + Map only).</p>`,
  },
  {
    title: "Comms Calculator — Settlements & Invoices",
    category: "Commissions",
    pinned: false,
    tags: ["commissions", "settlements", "invoices", "perth", "brisbane"],
    content: `<h2>Comms Calculator</h2>
<p>Track settlements and generate invoices for ASG Perth and ASG Brisbane.</p>
<h3>Adding a Settlement</h3>
<ol>
<li>Click <strong>+ New Settlement</strong></li>
<li>Enter Client 1 &amp; 2 names, current address, property sold address</li>
<li>Set expected settlement date and select Office (Perth / Brisbane)</li>
<li>Toggle <strong>Settlement Reminder</strong> to get a browser notification 2 days before</li>
<li>Add rep allocations: DQ Rep, FC Rep, FR Rep — each with a commission amount</li>
<li>Click Save</li>
</ol>
<h3>Invoice Generation</h3>
<ol>
<li>Click <strong>Push to Invoice</strong> (top-right of the page)</li>
<li>Select who is invoicing (ASG, SJS, or an individual rep)</li>
<li>Fill in date, amount, client details. Link to a settlement to auto-fill</li>
<li>Click <strong>Download PDF</strong> — generates a formatted invoice with company details, ABN, and payment info</li>
<li>Click <strong>Save for Later</strong> to save a draft to Firestore</li>
</ol>
<h3>Monthly Report</h3>
<p>Click <strong>📊 Monthly Report</strong> to download a PDF summary of all settlements and rep allocations for the current month.</p>`,
  },
  {
    title: "Google Sheets Two-Way Sync",
    category: "Sync",
    pinned: false,
    tags: ["sync", "sheets", "google", "import", "export", "two-way"],
    content: `<h2>Google Sheets Sync</h2>
<p>Keep the CRM and a Google Sheet in sync — pull new leads from the sheet and push CRM data back.</p>
<h3>Setup (Admin)</h3>
<ol>
<li>Go to <strong>Admin → Sync</strong></li>
<li>Paste the Google Sheet URL and enter the tab name</li>
<li>Click <strong>Save Configuration</strong> — this persists across all devices</li>
</ol>
<h3>Syncing</h3>
<ol>
<li>Click the <strong>Sheets</strong> button in the topbar (or Admin → Sync → Open Sync Modal)</li>
<li>Click <strong>Authenticate with Google</strong> — you'll be prompted once per session</li>
<li>Map the sheet columns to CRM fields (auto-detected for common headers)</li>
<li>Choose a sync action:</li>
</ol>
<ul>
<li><strong>Pull</strong> — Reads the sheet, groups leads by status, lets you route each group to a target status. Existing leads are updated (status change); new leads are created</li>
<li><strong>Push</strong> — Writes all CRM leads back to the sheet (overwrites)</li>
<li><strong>Two-Way</strong> — Pull first, then Push (recommended)</li>
<li><strong>Sync Updates</strong> — Match by phone number and update selected fields only</li>
</ul>
<h3>Pull Behaviour</h3>
<p>The pull is smart about existing leads: if a lead's phone already exists in the CRM, it <strong>updates the status</strong> to match the sheet instead of creating a duplicate. New phone numbers create new leads.</p>`,
  },
  {
    title: "Client Hub",
    category: "Client Hub",
    pinned: false,
    tags: ["clients", "client hub", "booked", "appointments"],
    content: `<h2>Client Hub</h2>
<p>The Client Hub provides a dedicated view of all booked leads and clients — a clean, appointment-focused alternative to the full Leads table.</p>
<h3>Features</h3>
<ul>
<li>Shows all leads with Booked status or a set booking/appointment date</li>
<li>Grouped by date (newest first) with collapsible date headers</li>
<li>Quick search by name, phone, or suburb</li>
<li>Filter by rep</li>
<li>Click any client to open the full lead sidebar for editing</li>
</ul>
<h3>When to Use</h3>
<p>Use the Client Hub when you want to focus on existing clients rather than the full lead pool. It's useful for following up on booked appointments or managing post-booking communication.</p>`,
  },
  {
    title: "DRAPS & Stats — Daily Activity Tracking",
    category: "Other",
    pinned: false,
    tags: ["draps", "stats", "activity", "daily", "targets", "leaderboard"],
    content: `<h2>DRAPS &amp; Stats</h2>
<p>DRAPS tracks the team's daily activity numbers and compares them to targets.</p>
<h3>Daily Entry</h3>
<ol>
<li>Navigate to <strong>DRAPS &amp; Stats</strong></li>
<li>Select date, rep, and fill in the fields: DQ, Referrals, Appointments, Presentations, Sold</li>
<li>Expand the FC and FR sections for detailed sub-metrics</li>
<li>Click <strong>Save Entry</strong></li>
</ol>
<h3>Dashboard Sections</h3>
<ul>
<li><strong>Conversion Funnel</strong> — DQ → Refs → Appts → Presentations → Sold with % at each step</li>
<li><strong>Summary Cards</strong> — Row 1 field metrics, Row 2 FC/FR pipeline metrics</li>
<li><strong>Rep Leaderboard</strong> — Sortable table of per-rep totals with target progress bars</li>
<li><strong>Date-Grouped History</strong> — Collapsible entries by date with day totals</li>
</ul>
<h3>Filters</h3>
<p>Use the preset buttons (This Week, This Month, This Quarter, All Time, Custom) and the rep dropdown to slice the data. Custom range shows two date pickers.</p>
<h3>Export</h3>
<p>Click <strong>Export CSV</strong> to download filtered entries. The filename includes the rep name and date range automatically.</p>`,
  },
];

// ── Simple Rich Text Editor ─────────────────────────────────────────────────

interface ToolbarButtonProps {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}

function ToolbarButton({ title, onClick, children, active }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`px-2 py-1 rounded text-sm font-medium transition ${
        active
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[var(--hover)]"
      }`}
    >
      {children}
    </button>
  );
}

function SimpleRichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // Sync value when article changes (but not on every keystroke)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  const exec = (command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (ref.current) onChange(ref.current.innerHTML);
    ref.current?.focus();
  };

  const handleInput = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const insertLink = () => {
    const url = prompt("Enter URL:");
    if (url) exec("createLink", url);
  };

  return (
    <div className="border border-gray-300 dark:border-white/[0.08] rounded-xl overflow-hidden bg-white dark:bg-[var(--surface)]">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-white/[0.06] flex-wrap bg-gray-50 dark:bg-[var(--surface)]">
        <ToolbarButton title="Bold" onClick={() => exec("bold")}>
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton title="Italic" onClick={() => exec("italic")}>
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton title="Underline" onClick={() => exec("underline")}>
          <u>U</u>
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />
        <ToolbarButton title="Heading 2" onClick={() => exec("formatBlock", "H2")}>
          H2
        </ToolbarButton>
        <ToolbarButton title="Heading 3" onClick={() => exec("formatBlock", "H3")}>
          H3
        </ToolbarButton>
        <ToolbarButton title="Paragraph" onClick={() => exec("formatBlock", "P")}>
          ¶
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />
        <ToolbarButton title="Bullet List" onClick={() => exec("insertUnorderedList")}>
          • List
        </ToolbarButton>
        <ToolbarButton title="Numbered List" onClick={() => exec("insertOrderedList")}>
          1. List
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />
        <ToolbarButton title="Insert Link" onClick={insertLink}>
          🔗
        </ToolbarButton>
        <ToolbarButton title="Horizontal Rule" onClick={() => exec("insertHorizontalRule")}>
          ─
        </ToolbarButton>
        <ToolbarButton title="Remove Formatting" onClick={() => exec("removeFormat")}>
          ✕ fmt
        </ToolbarButton>
        <div className="flex-1" />
        <span className="text-xs text-gray-400 dark:text-gray-600">Rich Text</span>
      </div>
      {/* Editor area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className="min-h-[320px] p-4 text-sm text-gray-900 dark:text-white focus:outline-none leading-relaxed prose prose-sm max-w-none dark:prose-invert"
        style={{ whiteSpace: "pre-wrap" }}
      />
    </div>
  );
}

// ── Article Editor ──────────────────────────────────────────────────────────

interface EditorProps {
  initial: Partial<KBArticle> | null;
  onSave: (article: KBArticle) => void;
  onCancel: () => void;
}

function ArticleEditor({ initial, onSave, onCancel }: EditorProps) {
  const { currentUser } = useAppStore();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState<KBCategory>(initial?.category ?? "Getting Started");
  const [content, setContent] = useState(initial?.content ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [pinned, setPinned] = useState(initial?.pinned ?? false);

  const handleSave = () => {
    if (!title.trim()) return;
    const now = Date.now();
    const article: KBArticle = {
      id: initial?.id ?? `kb_${now}_${Math.floor(Math.random() * 9999)}`,
      title: title.trim(),
      category,
      content,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      pinned,
      createdAt: initial?.createdAt ?? now,
      createdBy: initial?.createdBy ?? currentUser?.name ?? "Admin",
      updatedAt: now,
      views: initial?.views ?? 0,
    };
    onSave(article);
  };

  const inp =
    "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition";

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {initial?.id ? "Edit Article" : "New Article"}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPinned((p) => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
              pinned
                ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                : "border-gray-300 dark:border-white/[0.08] text-gray-500 hover:border-amber-300"
            }`}
          >
            <Pin size={12} className={pinned ? "fill-amber-500 text-amber-500" : ""} />
            {pinned ? "Pinned" : "Pin"}
          </button>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] text-gray-400"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Title *</label>
        <input
          className={inp}
          placeholder="e.g. How to add a new lead"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Category + Tags */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Category</label>
          <select className={inp} value={category} onChange={(e) => setCategory(e.target.value as KBCategory)}>
            {KB_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_ICONS[c]} {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Tags (comma separated)
          </label>
          <input
            className={inp}
            placeholder="leads, import, tips"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
      </div>

      {/* Rich text editor */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Content</label>
        <SimpleRichEditor value={content} onChange={setContent} />
      </div>

      {/* Footer */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={!title.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition"
        >
          <Save size={14} /> Save Article
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-white/[0.08] text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Article Viewer ──────────────────────────────────────────────────────────

function ArticleViewer({
  article,
  isAdmin,
  onEdit,
  onDelete,
}: {
  article: KBArticle;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const clean = DOMPurify.sanitize(article.content, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "h1",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "a",
      "hr",
      "blockquote",
      "code",
      "pre",
      "span",
      "div",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
  });

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Article header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {article.pinned && <span className="text-amber-500 text-sm">📌</span>}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[article.category]}`}>
                {CATEGORY_ICONS[article.category]} {article.category}
              </span>
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-[var(--surface)] text-gray-500 dark:text-gray-400"
                >
                  #{tag}
                </span>
              ))}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{article.title}</h1>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.08] text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
              >
                <Edit3 size={12} /> Edit
              </button>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                >
                  <Trash2 size={12} /> Delete
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-red-500">Confirm?</span>
                  <button
                    onClick={onDelete}
                    className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-400"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-1 rounded-lg border border-gray-300 dark:border-white/[0.08] text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Clock size={11} /> Updated{" "}
            {new Date(article.updatedAt).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          <span>By {article.createdBy}</span>
          <span className="flex items-center gap-1">
            <Eye size={11} /> {article.views} view{article.views !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <hr className="border-gray-200 dark:border-white/[0.06] mb-6" />

      {/* Article content */}
      {article.content ? (
        <div
          className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-gray-900 dark:prose-headings:text-white prose-a:text-amber-600 dark:prose-a:text-amber-400 prose-strong:text-gray-900 dark:prose-strong:text-white leading-relaxed"
          dangerouslySetInnerHTML={{ __html: clean }}
        />
      ) : (
        <p className="text-gray-400 italic text-sm">No content yet. {isAdmin && "Click Edit to add content."}</p>
      )}
    </div>
  );
}

// ── Search helpers ──────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 dark:bg-amber-800 rounded">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Main Knowledge Base page ────────────────────────────────────────────────

export function KnowledgeBasePage() {
  const { currentUser } = useAppStore();
  const { articles, loading } = useKBArticles();
  const { save } = useSaveKBArticle();
  const { remove } = useDeleteKBArticle();
  const { increment: incrementViews } = useIncrementKBViews();
  const { showToast } = useToast();

  const isAdmin = currentUser?.role === "admin";

  // View mode: "articles" or "ai-coaching"
  const [viewMode, setViewMode] = useState<"articles" | "ai-coaching">("articles");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [newArticle, setNewArticle] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<KBCategory | "all">("all");

  const selectedArticle = articles.find((a) => a.id === selectedId) ?? null;

  // Filter articles — content search strips HTML before matching
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return articles.filter((a) => {
      if (filterCategory !== "all" && a.category !== filterCategory) return false;
      if (
        term &&
        !a.title.toLowerCase().includes(term) &&
        !stripHtml(a.content).toLowerCase().includes(term) &&
        !a.tags.some((t) => t.toLowerCase().includes(term))
      )
        return false;
      return true;
    });
  }, [articles, search, filterCategory]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, KBArticle[]>();
    filtered.forEach((a) => {
      if (!map.has(a.category)) map.set(a.category, []);
      map.get(a.category)!.push(a);
    });
    return map;
  }, [filtered]);

  // Auto-select first article on load
  useEffect(() => {
    if (!selectedId && articles.length > 0) {
      const first = articles.find((a) => a.pinned) ?? articles[0];
      setSelectedId(first.id);
    }
  }, [articles, selectedId]);

  const handleSelect = (article: KBArticle) => {
    setSelectedId(article.id);
    setEditing(false);
    setNewArticle(false);
    incrementViews(article.id);
  };

  const handleSave = async (article: KBArticle) => {
    const ok = await save(article);
    if (ok) {
      showToast(`✅ Article "${article.title}" saved`, "success");
      setSelectedId(article.id);
      setEditing(false);
      setNewArticle(false);
    } else {
      showToast("❌ Failed to save article", "error");
    }
  };

  const handleDelete = async () => {
    if (!selectedArticle) return;
    const ok = await remove(selectedArticle.id);
    if (ok) {
      showToast("🗑️ Article deleted", "success");
      setSelectedId(null);
      setEditing(false);
    } else {
      showToast("❌ Failed to delete article", "error");
    }
  };

  const [seeding, setSeeding] = useState(false);
  const handleSeedDefaults = async () => {
    if (!isAdmin) return;
    setSeeding(true);
    let count = 0;
    const now = Date.now();
    for (const a of DEFAULT_ARTICLES) {
      const article: KBArticle = {
        ...a,
        id: `kb_default_${a.title.toLowerCase().replace(/\W+/g, "_")}_${now}`,
        createdAt: now,
        updatedAt: now,
        views: 0,
        createdBy: currentUser?.name ?? "Admin",
      };
      const ok = await save(article);
      if (ok) count++;
      // small delay to avoid Firestore rate limiting
      await new Promise((r) => setTimeout(r, 60));
    }
    showToast(`✅ Seeded ${count} default articles`, "success");
    setSeeding(false);
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50 dark:bg-[var(--bg)]">
      {/* ── Left panel ── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)]">
        {/* View mode toggle */}
        <div className="p-3 border-b border-gray-200 dark:border-white/[0.06]">
          <div className="flex gap-1 bg-gray-100 dark:bg-white/5 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("articles")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                viewMode === "articles"
                  ? "bg-white dark:bg-[var(--surface)] text-gray-800 dark:text-gray-200 shadow-sm"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <BookOpen size={12} /> Articles
            </button>
            <button
              onClick={() => setViewMode("ai-coaching")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                viewMode === "ai-coaching"
                  ? "bg-white dark:bg-[var(--surface)] text-gray-800 dark:text-gray-200 shadow-sm"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <Zap size={12} /> AI Coaching
            </button>
          </div>
        </div>

        {viewMode === "ai-coaching" ? (
          /* AI Coaching panel in left sidebar */
          <div className="flex-1 overflow-y-auto p-3">
            <AICoachingPanel
              onLaunchScenario={(id) => {
                window.dispatchEvent(new CustomEvent("launch-scenario", { detail: id }));
              }}
              onUseResponse={(text) => {
                showToast(`Response ready: "${text.substring(0, 50)}…"`, "info");
              }}
            />
          </div>
        ) : (
          <>
            {/* Search + New button */}
            <div className="p-3 border-b border-gray-200 dark:border-white/[0.06] space-y-2">
              {/* Prominent full-text search */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search articles by title, content or tag…"
                  className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Result count when searching */}
              {search && (
                <p className="text-xs text-gray-500 dark:text-gray-400 px-0.5">
                  {filtered.length} result{filtered.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
                </p>
              )}

              {/* Category filter + New button */}
              <div className="flex items-center gap-2">
                <select
                  className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-[var(--surface)] text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value as KBCategory | "all")}
                >
                  <option value="all">All Categories</option>
                  {KB_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_ICONS[c]} {c}
                    </option>
                  ))}
                </select>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => {
                        setNewArticle(true);
                        setEditing(false);
                        setSelectedId(null);
                      }}
                      className="flex-shrink-0 w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-400 transition"
                      title="New Article"
                    >
                      <Plus size={14} />
                    </button>
                    {articles.length === 0 && (
                      <button
                        onClick={handleSeedDefaults}
                        disabled={seeding}
                        className="flex-shrink-0 px-2 py-1 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-500 disabled:opacity-50 transition whitespace-nowrap"
                        title="Populate with default articles for all features"
                      >
                        {seeding ? "Seeding…" : "✨ Seed"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Article list */}
            <div className="flex-1 overflow-y-auto py-2">
              {loading ? (
                <div className="px-4 py-8 text-center text-xs text-gray-400">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <BookOpen size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-xs text-gray-400">
                    {search ? "No articles match your search" : "No articles yet"}
                  </p>
                  {isAdmin && !search && (
                    <button
                      onClick={() => {
                        setNewArticle(true);
                        setEditing(false);
                        setSelectedId(null);
                      }}
                      className="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      Create your first article
                    </button>
                  )}
                </div>
              ) : (
                Array.from(grouped.entries()).map(([cat, catArticles]) => (
                  <div key={cat} className="mb-2">
                    <div className="px-3 py-1 text-xs font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wide">
                      {CATEGORY_ICONS[cat as KBCategory]} {cat}
                    </div>
                    {catArticles.map((article) => (
                      <button
                        key={article.id}
                        onClick={() => handleSelect(article)}
                        className={`w-full text-left px-3 py-2 flex items-start gap-2 transition ${
                          selectedId === article.id
                            ? "bg-amber-50 dark:bg-amber-900/20 border-r-2 border-amber-500"
                            : "hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                        }`}
                      >
                        {article.pinned && <span className="text-amber-400 text-xs mt-0.5 flex-shrink-0">📌</span>}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-xs font-medium truncate ${selectedId === article.id ? "text-amber-700 dark:text-amber-400" : "text-gray-700 dark:text-gray-300"}`}
                          >
                            <HighlightMatch text={article.title} query={search} />
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{article.views} views</p>
                        </div>
                        {selectedId === article.id && (
                          <ChevronRight size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Stats footer */}
            <div className="px-3 py-2 border-t border-gray-200 dark:border-white/[0.06] text-xs text-gray-400">
              {articles.length} article{articles.length !== 1 ? "s" : ""} ·{" "}
              {KB_CATEGORIES.filter((c) => articles.some((a) => a.category === c)).length} categories
            </div>
          </>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {newArticle || (editing && selectedArticle) ? (
          <ArticleEditor
            initial={newArticle ? null : selectedArticle}
            onSave={handleSave}
            onCancel={() => {
              setNewArticle(false);
              setEditing(false);
            }}
          />
        ) : selectedArticle ? (
          <ArticleViewer
            article={selectedArticle}
            isAdmin={isAdmin}
            onEdit={() => setEditing(true)}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <BookOpen size={48} className="text-gray-200 dark:text-gray-700 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Knowledge Base</h3>
            <p className="text-sm text-gray-400 max-w-sm">
              Step-by-step guides and SOPs to help reps use the platform effectively.
              {isAdmin && " Select an article to read it, or click + to create a new one."}
            </p>
            {isAdmin && articles.length === 0 && (
              <button
                onClick={() => setNewArticle(true)}
                className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition"
              >
                <Plus size={14} /> Create First Article
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default KnowledgeBasePage;
