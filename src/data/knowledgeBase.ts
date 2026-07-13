/**
 * Static knowledge base content for in-app guides.
 *
 * HTML strings in each section are authored here and rendered via
 * dangerouslySetInnerHTML. They are internal/trusted content —
 * never interpolate user input into these strings.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KBSection {
  id: string;
  title: string;
  emoji: string;
  content: string; // trusted HTML
}

// ── Admin Technical Guide Sections ───────────────────────────────────────────

export const ADMIN_GUIDE_SECTIONS: KBSection[] = [
  {
    id: 'overview',
    title: 'System Overview',
    emoji: '🏗️',
    content: `
<h2>System Overview</h2>
<p>
  ASG CRM is a single-page web application built with React (Vite + TypeScript) on the frontend
  and Google Firebase (Firestore + Cloud Functions v2) on the backend.
  It is hosted on Firebase Hosting and deployed via the Firebase CLI.
</p>
<p>
  There is no traditional server. All business logic runs either in the browser (React) or in
  serverless Firebase Cloud Functions. Real-time data sync is handled by Firestore's
  <code>onSnapshot</code> listeners — the UI updates automatically when any document changes.
</p>

<h3>Frontend</h3>
<ul>
  <li><strong>Framework:</strong> React 18 with TypeScript — strict mode enabled</li>
  <li><strong>Build tool:</strong> Vite — fast dev server and optimised production bundles</li>
  <li><strong>Styling:</strong> Tailwind CSS with a custom design token system (CSS variables for theming)</li>
  <li><strong>State management:</strong> Zustand (lightweight global store) for user session, reps, and status colours</li>
  <li><strong>Routing:</strong> No external router — tab-based navigation managed in <code>App.tsx</code></li>
  <li><strong>Code splitting:</strong> All pages except Leads are lazy-loaded via <code>React.lazy()</code> to minimise initial bundle</li>
</ul>

<h3>Backend</h3>
<ul>
  <li><strong>Database:</strong> Firestore (NoSQL, document-based) — all data lives here</li>
  <li><strong>Functions:</strong> Firebase Cloud Functions v2 (Node.js) — used for server-side operations</li>
  <li><strong>Storage:</strong> Firebase Storage — lead file attachments and profile photos</li>
  <li><strong>Auth model:</strong> PIN-based session login (not Firebase Auth) — rep PINs stored in Firestore reps collection</li>
</ul>

<h3>Data Flow</h3>
<ol>
  <li>Rep logs in → PIN verified against <code>reps</code> collection → session stored in Zustand</li>
  <li>App subscribes to <code>leads</code> collection in real-time — any change on any device appears instantly</li>
  <li>When a rep edits a lead, the component calls <code>useSaveLead()</code> which writes to Firestore using <code>setDoc</code> with merge</li>
  <li>Notes are stored in subcollections (<code>leads/{id}/notes</code>) — each has its own real-time listener, opened only when a lead is open</li>
  <li>Calendar appointments live in a top-level <code>appointments</code> collection — linked to leads via <code>linkedLeadId</code></li>
</ol>
`,
  },

  {
    id: 'data-structure',
    title: 'Data Structure',
    emoji: '🗄️',
    content: `
<h2>Data Structure</h2>

<h3>Leads — <code>leads/{leadId}</code></h3>
<p>Each lead is a Firestore document. The document ID is the lead's numeric ID as a string.</p>
<table>
  <thead>
    <tr><th>Field</th><th>Type</th><th>Purpose</th></tr>
  </thead>
  <tbody>
    <tr><td><code>id</code></td><td>number</td><td>Numeric ID — mirrors the document ID</td></tr>
    <tr><td><code>name</code></td><td>string</td><td>Lead's full name</td></tr>
    <tr><td><code>phone</code></td><td>string</td><td>Normalised Australian mobile number</td></tr>
    <tr><td><code>email</code></td><td>string?</td><td>Optional email address</td></tr>
    <tr><td><code>status</code></td><td>LeadStatus</td><td>Current pipeline status — see Status System</td></tr>
    <tr><td><code>dqRep</code></td><td>number</td><td>ID of the rep who DQ'd this lead</td></tr>
    <tr><td><code>suburb</code></td><td>string</td><td>Lead's suburb (used for map clustering)</td></tr>
    <tr><td><code>notes</code></td><td>string?</td><td>Single freeform note field — shown at top of sidebar</td></tr>
    <tr><td><code>callHistory</code></td><td>CallHistory[]</td><td>Array of structured call log entries</td></tr>
    <tr><td><code>lastCall</code></td><td>string?</td><td>ISO timestamp of most recent call — used for staleness checks</td></tr>
    <tr><td><code>callbackDate</code></td><td>string?</td><td>YYYY-MM-DD date for scheduled callback</td></tr>
    <tr><td><code>callbackTime</code></td><td>string?</td><td>HH:MM time for scheduled callback</td></tr>
    <tr><td><code>fcRep / frRep / psRep</code></td><td>number?</td><td>Rep IDs for FC, FR, and PS stages of the deal</td></tr>
    <tr><td><code>fcAppt / frAppt / psAppt</code></td><td>object?</td><td>Embedded appointment summary per stage (date, result, notes)</td></tr>
    <tr><td><code>dealStage</code></td><td>DealStage?</td><td>Current position in the deal pipeline</td></tr>
    <tr><td><code>createdAt</code></td><td>number?</td><td>ms epoch timestamp of creation</td></tr>
    <tr><td><code>leadDate</code></td><td>string?</td><td>YYYY-MM-DD date the lead was generated</td></tr>
    <tr><td><code>lat / lng</code></td><td>number?</td><td>Geocoded coordinates for the map view</td></tr>
  </tbody>
</table>
<p>
  <strong>Deleted leads:</strong> Soft-deleted leads have <code>status: "_deleted"</code>.
  They are hidden from all views but remain in Firestore for 5 seconds to allow undo.
  Hard delete follows automatically via <code>useDeleteLead()</code>.
</p>

<h3>Lead Notes — <code>leads/{leadId}/notes/{noteId}</code></h3>
<p>Notes are stored as a subcollection under each lead, not as a field on the lead document.</p>
<table>
  <thead>
    <tr><th>Field</th><th>Type</th><th>Purpose</th></tr>
  </thead>
  <tbody>
    <tr><td><code>id</code></td><td>string</td><td>Auto-generated Firestore document ID</td></tr>
    <tr><td><code>text</code></td><td>string</td><td>The note content</td></tr>
    <tr><td><code>createdAt</code></td><td>number</td><td>ms epoch — used for ordering (newest first)</td></tr>
    <tr><td><code>createdBy</code></td><td>string</td><td>Rep name at time of creation</td></tr>
    <tr><td><code>createdById</code></td><td>number?</td><td>Rep ID — used for delete-own-note permission check</td></tr>
  </tbody>
</table>
<p>
  The subcollection listener is opened only when a lead sidebar is open (<code>useLeadNotes(leadId)</code>),
  so there is no performance cost for closed leads.
</p>

<h3>Appointments — <code>appointments/{appointmentId}</code></h3>
<p>Calendar appointments are a top-level collection. They link to leads via a field — not a subcollection.</p>
<table>
  <thead>
    <tr><th>Field</th><th>Type</th><th>Purpose</th></tr>
  </thead>
  <tbody>
    <tr><td><code>id</code></td><td>string</td><td>Auto-generated Firestore document ID</td></tr>
    <tr><td><code>title</code></td><td>string</td><td>Display label (usually client name)</td></tr>
    <tr><td><code>serviceTypeId</code></td><td>string</td><td>FK → <code>calendarServiceTypes</code> collection</td></tr>
    <tr><td><code>repId</code></td><td>number</td><td>FK → Rep ID</td></tr>
    <tr><td><code>date</code></td><td>string</td><td>YYYY-MM-DD</td></tr>
    <tr><td><code>startTime</code></td><td>string</td><td>HH:MM 24-hour format</td></tr>
    <tr><td><code>status</code></td><td>AppointmentStatus</td><td>Current status</td></tr>
    <tr><td><code>linkedLeadId</code></td><td>number?</td><td>Links appointment to a lead — optional but recommended</td></tr>
    <tr><td><code>notes</code></td><td>string?</td><td>Free notes about the appointment</td></tr>
    <tr><td><code>createdBy</code></td><td>string</td><td>Rep name who created the appointment</td></tr>
    <tr><td><code>createdAt</code></td><td>number</td><td>ms epoch creation timestamp</td></tr>
  </tbody>
</table>

<h3>Other Collections</h3>
<ul>
  <li><code>reps</code> — Rep profiles, PINs, permissions, calendar visibility</li>
  <li><code>settings/main</code> — Single document holding commission rates, status colour overrides, rep targets, and Sheets sync config</li>
  <li><code>audit</code> — Timestamped log of all significant actions (lead created, call logged, etc.)</li>
  <li><code>calendarServiceTypes</code> — Appointment types (FC, FR, etc.) with colour and duration</li>
  <li><code>knowledgeBase</code> — KB articles with HTML content</li>
  <li><code>teamChat</code> — Group chat messages (capped at 150 by query)</li>
  <li><code>draps</code> — Daily performance stats entries</li>
  <li><code>commissions</code> — Settlement commission records</li>
  <li><code>leads/{id}/files</code> — File attachment metadata (actual files in Firebase Storage)</li>
  <li><code>leads/{id}/presence</code> — Live "who is viewing this lead" tracking (ephemeral)</li>
  <li><code>leads/{id}/dealUpdates</code> — Deal pipeline message board per lead</li>
</ul>
`,
  },

  {
    id: 'status-system',
    title: 'Status System',
    emoji: '🏷️',
    content: `
<h2>Status System</h2>

<h3>Where statuses are defined</h3>
<p>
  Lead statuses are defined as a TypeScript union type in <code>src/types/index.ts</code>:
</p>
<ul>
  <li>DQ, No Answer, Revisit, Booked, Not Interested, Wrong Number</li>
</ul>

<h3>Where colours are controlled</h3>
<p>Status colours work in two layers:</p>
<ol>
  <li>
    <strong>Default colours</strong> — defined in <code>DEFAULT_STATUS_COLORS</code> inside
    <code>src/types/index.ts</code>. These are the fallback colours used if no override exists.
  </li>
  <li>
    <strong>Admin overrides</strong> — stored in Firestore at <code>settings/main.statusColors</code>.
    Admins can change them in the Admin page → Status Colours section.
    On load, these are synced into the Zustand store via <code>useAppSettings()</code>.
  </li>
</ol>

<h3>The centralised helper — <code>src/lib/statusConfig.ts</code></h3>
<p>
  All status colour lookups should go through <code>getStatusColor(status, customColors)</code>
  exported from this file. This function resolves the correct colour in priority order:
  admin override → default → grey fallback. Never hardcode status hex values elsewhere.
</p>
<p>
  This file also exports <code>getStatusBadgeStyle()</code> which returns inline styles
  for a colour-tinted badge, and <code>LEAD_STATUS_OPTIONS</code> — the canonical ordered
  array of all status strings for dropdowns.
</p>

<h3>Adding a new status</h3>
<ol>
  <li>Add the new string to the <code>LeadStatus</code> union in <code>src/types/index.ts</code></li>
  <li>Add a default hex colour for it in <code>DEFAULT_STATUS_COLORS</code> in the same file</li>
  <li>Add it to <code>LEAD_STATUS_OPTIONS</code> in <code>src/lib/statusConfig.ts</code></li>
  <li>Rebuild and deploy — the Admin colour-picker will automatically pick it up</li>
</ol>
`,
  },

  {
    id: 'next-action',
    title: 'Next Action Engine',
    emoji: '⚡',
    content: `
<h2>Next Action Engine</h2>

<h3>What it does</h3>
<p>
  The Next Action Engine determines the single most important thing a rep should do with
  a lead right now. It runs as a pure function — no server calls, no AI, just deterministic
  rules applied to the data already in memory.
</p>

<h3>Where it lives</h3>
<p><code>src/lib/nextAction.ts</code> — <code>getNextAction(params)</code></p>

<h3>Inputs</h3>
<ul>
  <li><code>lead</code> — the lead document</li>
  <li><code>notesCount</code> — number of notes in the subcollection (pass 0 if not loaded)</li>
  <li><code>lastActivityAt</code> — ms epoch of most recent contact (optional — derived from lead if omitted)</li>
  <li><code>appointments</code> — linked calendar appointments (pass <code>[]</code> if not loaded)</li>
</ul>

<h3>Rule chain (first match wins)</h3>
<table>
  <thead>
    <tr><th>Rule</th><th>Condition</th><th>Output type</th><th>Priority</th></tr>
  </thead>
  <tbody>
    <tr><td>1</td><td>No notes AND no call history AND no appointments</td><td>call</td><td>high</td></tr>
    <tr><td>2</td><td>Status is Booked AND no linked appointments</td><td>book</td><td>high</td></tr>
    <tr><td>3</td><td>Any appointment has status <em>cancelled</em> or <em>no-show</em></td><td>reschedule</td><td>high</td></tr>
    <tr><td>4</td><td>Last activity was more than 3 days ago</td><td>follow-up</td><td>medium</td></tr>
    <tr><td>5</td><td>None of the above</td><td>none</td><td>low</td></tr>
  </tbody>
</table>

<h3>How to change the rules</h3>
<p>Open <code>src/lib/nextAction.ts</code> and modify the body of <code>getNextAction()</code>.</p>
<ul>
  <li>To change the staleness threshold: edit the <code>THREE_DAYS_MS</code> constant at the top of the file</li>
  <li>To add a new rule: insert a new <code>if</code> block in priority order — higher rules must come first</li>
  <li>To change labels: edit the <code>ACTION_LABEL</code> map exported from the same file</li>
</ul>
<p>
  <strong>Important:</strong> The function is pure — it does not read from Firestore.
  Changes to the logic take effect immediately on the next render with no deployment required
  (as long as you rebuild the frontend).
</p>

<h3>Where it appears in the UI</h3>
<ul>
  <li><strong>Lead Sidebar</strong> — coloured banner at the top of the scrollable body. Uses full data: notes count + linked appointments from Firestore.</li>
  <li><strong>Dashboard Priority Work Queue</strong> — per-lead rows sorted by priority. Uses call history only (no extra queries).</li>
</ul>
`,
  },

  {
    id: 'dashboard-logic',
    title: 'Dashboard Logic',
    emoji: '📊',
    content: `
<h2>Dashboard Logic</h2>

<h3>Stats</h3>
<p>
  All stats are computed client-side using <code>useMemo</code> from the
  <code>useLeads()</code> real-time snapshot. No separate queries are made.
</p>
<ul>
  <li><strong>Calls Today / This Week</strong> — count of call history entries where the normalised date matches today or this week's start</li>
  <li><strong>Booked / DQ / callback statuses</strong> — simple status filters over the leads array</li>
  <li><strong>Callbacks Due</strong> — leads where <code>callbackDate</code> is set, sorted by date; overdue = date is in the past</li>
  <li><strong>Conversion Rate</strong> — <code>(booked / total) * 100</code></li>
  <li><strong>Call Volume Chart</strong> — for each of the last 7 days, count calls from <code>callHistory</code> where the date matches</li>
</ul>

<h3>Action Required section</h3>
<p>The Action Required section shows three aggregate counts:</p>
<ul>
  <li>Clients needing FC booking → Booked leads where <code>fcAppt.date</code> is not set</li>
  <li>FC completed, needs FR → Leads where <code>fcAppt.result === "Completed"</code> and <code>frAppt.date</code> is not set</li>
  <li>Leads with no contact → Leads with an empty or missing <code>callHistory</code></li>
</ul>

<h3>Priority Work Queue</h3>
<p>
  The Priority Work Queue runs <code>getNextAction()</code> against every active lead using only
  the lead-level data (no notes or appointment sub-queries). It filters out
  <code>Not Interested</code> and <code>Wrong Number</code> leads, sorts by priority, and shows the top 15.
</p>
<p>
  <strong>Trade-off:</strong> Because the Dashboard does not load subcollection notes or calendar appointments
  to avoid extra Firestore reads, a Booked lead that has appointments booked may still show as "Book Appt"
  in the Queue. The Lead Sidebar shows the accurate action when you open the lead.
  The Queue is intended as a daily starting-point, not a pixel-perfect accuracy report.
</p>

<h3>Performance notes</h3>
<ul>
  <li>All stats and queue computations use <code>useMemo</code> — they only re-run when the leads array changes</li>
  <li>The dashboard makes exactly one Firestore listener (the <code>useLeads()</code> snapshot) — no additional queries</li>
  <li>Charts are rendered with inline SVG paths — no charting library dependency</li>
</ul>
`,
  },

  {
    id: 'troubleshooting',
    title: 'Common Issues & Fixes',
    emoji: '🔧',
    content: `
<h2>Common Issues &amp; Fixes</h2>

<h3>Notes not appearing in the sidebar</h3>
<p><strong>Cause A:</strong> The Firestore index for <code>leads/{id}/notes</code> ordered by
<code>createdAt desc</code> may not exist yet. Firestore will log an index error in the browser
console with a direct link to create it.</p>
<p><strong>Fix:</strong> Open the browser console, find the Firestore index error, click the link
to auto-create the index in the Firebase Console. Wait 1–2 minutes, then refresh.</p>

<p><strong>Cause B:</strong> The sidebar was opened before the Firestore listener had time to attach
(race condition on very slow connections).</p>
<p><strong>Fix:</strong> Close and reopen the lead sidebar. The listener re-attaches on each open.</p>

<hr />

<h3>Appointment not showing in lead sidebar</h3>
<p><strong>Cause:</strong> The appointment was created without linking a lead (the <em>Linked Lead</em>
field was left empty), or it was linked to the wrong lead ID.</p>
<p><strong>Fix:</strong> Open the appointment in the Calendar, edit it, and set the correct lead in the
<em>Linked Lead</em> field. The sidebar queries <code>appointments</code> where
<code>linkedLeadId === lead.id</code> — if this field is missing, nothing will show.</p>

<hr />

<h3>Lead status not updating after save</h3>
<p><strong>Cause A:</strong> The lead name field is empty. The auto-save debounce skips saving if
<code>form.name</code> is blank — this is a guard against corrupted data.</p>
<p><strong>Fix:</strong> Ensure the name field is filled in before changing other fields.</p>

<p><strong>Cause B:</strong> A Firestore write permission error. Check the browser console for a
Firebase permission-denied error.</p>
<p><strong>Fix:</strong> Review Firestore Security Rules in the Firebase Console. Ensure the
logged-in session has write access to the <code>leads</code> collection.</p>

<hr />

<h3>Data not refreshing in real time</h3>
<p><strong>Cause A:</strong> The Firestore <code>onSnapshot</code> listener has been silently closed
due to a permission error or network interruption.</p>
<p><strong>Fix:</strong> Refresh the page. The listeners re-initialise on mount. For persistent issues,
check the browser console for Firestore errors and verify the Firebase project's quota usage
(Spark plan has a 50K read limit per day).</p>

<p><strong>Cause B:</strong> The app is in offline mode (PWA cache serving stale content).</p>
<p><strong>Fix:</strong> Hard refresh: <kbd>Ctrl + Shift + R</kbd> (Windows) or <kbd>Cmd + Shift + R</kbd> (Mac).</p>

<hr />

<h3>Priority Work Queue showing unexpected leads</h3>
<p><strong>Cause:</strong> The Dashboard version of the Next Action Engine runs without notes or calendar
appointment data (only call history). A Booked lead with calendar appointments but no call history will
show as "book" because the Dashboard cannot see those appointments without an extra query.</p>
<p><strong>Fix:</strong> This is a deliberate trade-off to avoid extra Firestore reads on the Dashboard.
The Lead Sidebar shows the accurate action (with full notes + appointments loaded).</p>

<hr />

<h3>Rep not appearing in dropdowns</h3>
<p><strong>Cause:</strong> Rep's <code>active</code> field is <code>false</code> — inactive reps are
hidden from assignment dropdowns.</p>
<p><strong>Fix:</strong> Go to Admin → Reps → find the rep → toggle their Active status back on.</p>
`,
  },

  {
    id: 'safe-modifications',
    title: 'Safe Modifications Guide',
    emoji: '✏️',
    content: `
<h2>How to Safely Modify the System</h2>

<h3>Where to change the UI</h3>
<ul>
  <li><strong>Lead Sidebar</strong> → <code>src/components/LeadSidebar.tsx</code></li>
  <li><strong>Dashboard</strong> → <code>src/pages/Dashboard.tsx</code></li>
  <li><strong>Leads table</strong> → <code>src/components/DataTable.tsx</code></li>
  <li><strong>Calendar</strong> → <code>src/pages/Calendar.tsx</code></li>
  <li><strong>Admin settings</strong> → <code>src/pages/Admin.tsx</code></li>
  <li><strong>Global layout / nav</strong> → <code>src/App.tsx</code></li>
</ul>

<h3>Where to change business logic</h3>
<ul>
  <li><strong>Next Action rules</strong> → <code>src/lib/nextAction.ts</code> (pure function — safe to edit)</li>
  <li><strong>Status colours &amp; labels</strong> → <code>src/lib/statusConfig.ts</code> + Admin UI</li>
  <li><strong>Firebase read/write operations</strong> → <code>src/hooks/useFirebase.ts</code></li>
  <li><strong>Utility functions</strong> → <code>src/lib/utils.ts</code></li>
  <li><strong>Type definitions</strong> → <code>src/types/index.ts</code></li>
</ul>

<h3>Where to change data</h3>
<ul>
  <li><strong>Rep list and permissions</strong> → Admin page in the app (writes to Firestore <code>reps</code>)</li>
  <li><strong>Status colours</strong> → Admin page → Status Colours section</li>
  <li><strong>Commission rates</strong> → Admin page → Commission Settings</li>
  <li><strong>Service types (appointment types)</strong> → Admin page → Service Types</li>
</ul>

<h3>What NOT to touch</h3>
<ul>
  <li>Do not manually edit Firestore document IDs — lead IDs are numeric and must stay consistent</li>
  <li>Do not delete <code>settings/main</code> in Firestore — this will reset all admin-configured colours and rates</li>
  <li>Do not change the <code>leads/{id}/presence</code> subcollection logic — it tracks who is viewing a lead live and cleans up on unmount</li>
  <li>Do not remove the <code>stripUndefined()</code> call in <code>useFirebase.ts</code> — Firestore rejects <code>undefined</code> values and writes will silently fail without it</li>
  <li>Do not change the <code>status: "_deleted"</code> soft-delete pattern without updating all status filters — several pages filter this string to hide deleted leads</li>
</ul>

<h3>Adding a new page</h3>
<ol>
  <li>Create the component in <code>src/pages/</code></li>
  <li>Add a lazy import at the top of <code>App.tsx</code></li>
  <li>Add the page ID to the <code>Page</code> type union in <code>App.tsx</code></li>
  <li>Add a label to <code>PAGE_LABELS</code> in <code>App.tsx</code></li>
  <li>Add a <code>SidebarItem</code> in the <code>sidebarNav</code> function</li>
  <li>Add a render condition in the <code>&lt;main&gt;</code> block</li>
</ol>
`,
  },

  {
    id: 'deployment',
    title: 'Deployment Guide',
    emoji: '🚀',
    content: `
<h2>Deployment Guide</h2>

<h3>Prerequisites</h3>
<ul>
  <li>Node.js 18+ installed</li>
  <li>Firebase CLI installed globally: <code>npm install -g firebase-tools</code></li>
  <li>Logged in to Firebase: <code>firebase login</code></li>
</ul>

<p>
  Deployments are release-manager actions. Do not deploy from a feature branch or without explicit approval for the target Firebase project.
</p>

<h3>Prepare frontend (hosting)</h3>
<ol>
  <li>In the project root, run: <code>npm run build</code></li>
  <li>Confirm <code>git status --short</code>, current branch, and target Firebase project</li>
  <li>Ask the release manager to run the approved scoped hosting deploy</li>
</ol>
<p>
  The build script runs TypeScript compilation (<code>tsc</code>) first, then Vite's production bundler.
  If TypeScript finds errors, the build will abort. Fix all type errors before requesting deployment approval.
</p>

<h3>Backend functions</h3>
<p>Functions deploys require explicit approval and should be validated with emulator and callable tests first.</p>

<h3>Combined release</h3>
<p>Use the governed release process, not an ad hoc full deploy. Confirm deploy surfaces, rollback, and approval before any command is run.</p>

<h3>Firestore rules or indexes</h3>
<p>Rules and index deploys are production-sensitive. Run emulator access tests and get explicit approval before a release manager deploys them.</p>

<h3>Environment / config</h3>
<p>
  Firebase project config (API key, project ID, etc.) lives in <code>src/lib/firebase.ts</code>.
  Do not commit sensitive keys to a public repository. For a new environment, update this file
  with the new project's config from the Firebase Console.
</p>

<h3>TypeScript check before deploying</h3>
<p>Always run a type check before pushing to production:</p>
<pre><code>npx tsc --noEmit</code></pre>
<p>This catches type errors without producing output files. Fix all errors before building.</p>
`,
  },

  {
    id: 'future-expansion',
    title: 'Future Expansion',
    emoji: '🔮',
    content: `
<h2>Future Expansion Points</h2>
<p>These areas have been deliberately left as stubs or excluded from the current build. They are the natural next steps.</p>

<h3>Property Insights</h3>
<ul>
  <li>The Lead type has <code>lat</code> and <code>lng</code> fields already stored</li>
  <li>The Map page has suburb clustering and knock zone logic in place</li>
  <li>Could be extended with property value APIs (CoreLogic, Domain) linked to suburb/postcode</li>
</ul>

<h3>Map Intelligence</h3>
<ul>
  <li>Knock zones are already drawn and stored in <code>knockZones</code></li>
  <li>Heat-map overlays by suburb conversion rate are a natural extension of the existing <code>statusCounts</code> data</li>
  <li>Route planning between knock addresses could be added using the Google Maps Directions API</li>
</ul>

<h3>Automated Follow-ups</h3>
<ul>
  <li>Firebase Cloud Functions v2 can be triggered on Firestore writes — e.g. when a lead's <code>callbackDate</code> is set, schedule an email or push notification</li>
  <li>The <code>reminderEmailSent</code> and <code>reminderSmsSent</code> fields already exist on the <code>Appointment</code> type as scaffolding</li>
</ul>

<h3>Reporting &amp; Analytics</h3>
<ul>
  <li>The <code>audit</code> collection captures every meaningful action with timestamps — this is the raw data for a reporting layer</li>
  <li>BigQuery export from Firestore can feed a Power BI or Looker Studio dashboard without impacting the live app's read quota</li>
</ul>

<h3>SMS / Email Integration</h3>
<ul>
  <li>Twilio (SMS) or SendGrid (email) can be wired through Firebase Functions — triggered on status change or callback date</li>
  <li>The rep permission system already controls which reps can access which pages, so role-based notification routing is feasible</li>
</ul>

<h3>Firebase Auth Migration</h3>
<ul>
  <li>The current PIN-based auth is sufficient for an internal tool but does not support password resets, MFA, or SSO</li>
  <li>Migrating to Firebase Auth (email/password or Google SSO) would allow tighter Firestore Security Rules and reduce the attack surface</li>
  <li>The Zustand <code>currentUser</code> shape would remain the same — only the login flow and token generation would change</li>
</ul>
`,
  },
];
