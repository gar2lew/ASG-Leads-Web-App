export type NavigationPageKey =
  | "dashboard"
  | "leads"
  | "client-hub"
  | "dq-import"
  | "map"
  | "draps"
  | "commissions"
  | "admin"
  | "team-chat"
  | "knowledge-base"
  | "document-centre"
  | "deal-dashboard"
  | "reports"
  | "training"
  | "calendar"
  | "admin-guide"
  | "my-dashboard"
  | "rep-settings"
  | "pia"
  | "smsf"
  | "rep-dashboard"
  | "assistant"
  | "inbox";

export type NavigationBadgeKey = "actionable";

export interface NavigationItemConfig {
  pageKey: NavigationPageKey;
  label: string;
  badge?: NavigationBadgeKey;
  adminOnly?: boolean;
}

export interface NavigationSectionConfig {
  label?: string;
  items: NavigationItemConfig[];
}

export const NAVIGATION_SECTIONS: NavigationSectionConfig[] = [
  {
    items: [{ pageKey: "dashboard", label: "Dashboard" }],
  },
  {
    label: "Communication",
    items: [
      { pageKey: "inbox", label: "Inbox" },
      { pageKey: "team-chat", label: "Team Chat" },
      { pageKey: "assistant", label: "Assistant" },
    ],
  },
  {
    label: "Lead Operations",
    items: [
      { pageKey: "leads", label: "Leads", badge: "actionable" },
      { pageKey: "dq-import", label: "DQ Lead Import" },
      { pageKey: "draps", label: "Lead Stats" },
      { pageKey: "reports", label: "Reports" },
    ],
  },
  {
    label: "Sales Pipeline",
    items: [
      { pageKey: "client-hub", label: "Clients" },
      { pageKey: "deal-dashboard", label: "Deals" },
      { pageKey: "commissions", label: "Commission Calculator" },
    ],
  },
  {
    label: "Field Tools",
    items: [
      { pageKey: "map", label: "Map" },
      { pageKey: "calendar", label: "Calendar" },
      { pageKey: "document-centre", label: "Document Centre" },
    ],
  },
  {
    label: "Calculators",
    items: [
      { pageKey: "pia", label: "PIA Calculator" },
      { pageKey: "smsf", label: "SMSF Calculator" },
    ],
  },
  {
    label: "Training",
    items: [
      { pageKey: "training", label: "Training Hub" },
      { pageKey: "knowledge-base", label: "Knowledge Base" },
    ],
  },
  {
    label: "My Workspace",
    items: [
      { pageKey: "my-dashboard", label: "My Dashboard" },
      { pageKey: "rep-dashboard", label: "Rep Dashboard" },
    ],
  },
  {
    label: "Admin",
    items: [
      { pageKey: "admin", label: "Admin Console", adminOnly: true },
      { pageKey: "admin-guide", label: "Admin Guide", adminOnly: true },
    ],
  },
];

export const PAGE_LABELS: Record<NavigationPageKey, string> = {
  dashboard: "Dashboard",
  leads: "Leads",
  "client-hub": "Clients",
  calendar: "Calendar",
  "deal-dashboard": "Deals",
  reports: "Reports",
  training: "Training Hub",
  "dq-import": "DQ Lead Import",
  map: "Map",
  draps: "Lead Stats",
  commissions: "Commission Calculator",
  admin: "Admin Console",
  "team-chat": "Team Chat",
  "knowledge-base": "Knowledge Base",
  "document-centre": "Document Centre",
  "admin-guide": "Admin Guide",
  "my-dashboard": "My Dashboard",
  "rep-settings": "My Settings",
  pia: "PIA Calculator",
  smsf: "SMSF Calculator",
  "rep-dashboard": "Rep Dashboard",
  assistant: "Assistant",
  inbox: "Inbox",
};

export const PAGE_DESCRIPTIONS: Record<NavigationPageKey, string> = {
  dashboard: "Daily command centre for queues, callbacks, and team activity",
  leads: "Work leads, log calls, update status, and manage follow-ups",
  "client-hub": "Review client records, documents, appointments, and deal context",
  calendar: "Manage appointments and daily meeting flow",
  "deal-dashboard": "Track active opportunities and pipeline progress",
  reports: "Review performance, activity, and operational reporting",
  training: "Access learning material and staff guidance",
  "dq-import": "Import and review DQ lead data",
  map: "Plan location-aware lead and client work",
  draps: "Review lead statistics and conversion signals",
  commissions: "Estimate commission scenarios",
  admin: "Manage people, settings, controls, and audit surfaces",
  "team-chat": "Coordinate staff communication",
  "knowledge-base": "Find operational knowledge and reference material",
  "document-centre": "Manage client and workflow documents",
  "admin-guide": "Review admin operating guidance",
  "my-dashboard": "Plan personal work, notes, reminders, and daily tasks",
  "rep-settings": "Manage personal profile and workspace preferences",
  pia: "Calculate preliminary assessment scenarios",
  smsf: "Calculate SMSF lending scenarios",
  "rep-dashboard": "Review rep performance and coaching signals",
  assistant: "Use the CRM assistant for staff support",
  inbox: "Review messages and communication items",
};
