import type { Lead, LeadStatus } from "../types";
import { normalizeLeadStatus } from "./statusConfig";

export type WorkflowQueueType = "call" | "callback" | "followup" | "booked" | "terminal" | "none";
export type OperationalLeadBucket = "new" | "contacted" | "qualified" | "booked" | "lost";
export type OperationalLeadFilter =
  | "no-contact"
  | "clients-no-fc"
  | "overdue-callbacks"
  | "overdue-followups"
  | "callbacks"
  | "followups"
  | "actionable-queue";

export interface WorkflowState {
  queueType: WorkflowQueueType;
  priority: "high" | "medium" | "low";
  label: string;
  reason: string;
  dueDate?: string;
  dueTime?: string;
  isActionable: boolean;
  isOverdue: boolean;
}

export interface WorkflowOptions {
  now?: number | Date;
}

export interface WorkflowItem {
  lead: Lead;
  state: WorkflowState;
}

export interface OperationalQueueSnapshot {
  items: WorkflowItem[];
  actionableItems: WorkflowItem[];
  callbackItems: WorkflowItem[];
  overdueCallbackItems: WorkflowItem[];
  followupItems: WorkflowItem[];
  overdueFollowupItems: WorkflowItem[];
  dueFollowupTodayItems: WorkflowItem[];
  counters: OperationalCounters;
}

export interface OperationalCounters {
  total: number;
  active: number;
  dq: number;
  new: number;
  contacted: number;
  qualified: number;
  booked: number;
  lost: number;
  revisit: number;
  callbacks: number;
  overdueCallbacks: number;
  followups: number;
  overdueFollowups: number;
  dueFollowupsToday: number;
  actionable: number;
  callNow: number;
  terminal: number;
}

const PERTH_TIME_ZONE = "Australia/Perth";
const DAY_MS = 86_400_000;

export function todayInPerth(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: PERTH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function currentPerthDate(options: WorkflowOptions = {}): string {
  const date = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  return todayInPerth(date);
}

export function isValidIsoDate(date?: string | null): date is string {
  return !!date && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function isTerminalLeadStatus(status?: string | null): boolean {
  const normalized = normalizeLeadStatus(status);
  return ["_deleted", "lost"].includes(status ?? "") || normalized === "Not Interested" || normalized === "Wrong Number";
}

export function isDqLeadStatus(status?: string | null): boolean {
  return normalizeLeadStatus(status) === "DQ";
}

export function isBookedLeadStatus(status?: string | null): boolean {
  return normalizeLeadStatus(status) === "Booked";
}

export function getOperationalLeadBucket(lead: Lead): OperationalLeadBucket {
  if (isTerminalLeadStatus(lead.status) || lead.dnqFellOver) return "lost";
  if (isBookedLeadStatus(lead.status)) return "booked";
  const normalized = normalizeLeadStatus(lead.status);
  if (normalized === "Revisit" || normalized === "No Answer") return "contacted";
  return "new";
}

export function isOperationallyActiveLead(lead: Lead): boolean {
  const state = getWorkflowState(lead);
  return state.queueType !== "terminal";
}

export function hasContactHistory(lead: Lead): boolean {
  return (lead.callHistory?.length ?? 0) > 0 || !!lead.lastCall;
}

export function getLastContactAt(lead: Lead): number | undefined {
  const candidates: number[] = [];
  if (lead.lastCall) {
    const parsed = new Date(lead.lastCall).getTime();
    if (!Number.isNaN(parsed)) candidates.push(parsed);
  }
  for (const call of lead.callHistory ?? []) {
    const isDateOnly = isValidIsoDate(call.date);
    const parsed = isDateOnly ? new Date(`${call.date}T${call.time || "00:00"}`).getTime() : new Date(call.time || call.date).getTime();
    if (!Number.isNaN(parsed)) candidates.push(parsed);
  }
  return candidates.length > 0 ? Math.max(...candidates) : undefined;
}

export function getWorkflowState(lead: Lead, options: WorkflowOptions = {}): WorkflowState {
  const today = currentPerthDate(options);
  const nowMs = options.now instanceof Date ? options.now.getTime() : options.now ?? Date.now();

  if (isTerminalLeadStatus(lead.status) || lead.dnqFellOver) {
    return {
      queueType: "terminal",
      priority: "low",
      label: lead.dnqFellOver ? "Lost" : "Closed",
      reason: lead.dnqFellOver ? "Did not qualify" : "Terminal lead status",
      isActionable: false,
      isOverdue: false,
    };
  }

  if (lead.status === "settled" || lead.settlementDate || lead.dealComplete) {
    return {
      queueType: "terminal",
      priority: "low",
      label: "Settled",
      reason: lead.settlementDate ? `Settled ${lead.settlementDate}` : "Deal settled",
      isActionable: false,
      isOverdue: false,
    };
  }

  if (isBookedLeadStatus(lead.status)) {
    const appointmentDate = lead.fcAppt?.date ?? lead.appointmentDate ?? lead.bookingDate;
    return {
      queueType: "booked",
      priority: "low",
      label: "Booked",
      reason: appointmentDate ? `Appointment on ${appointmentDate}` : "Awaiting appointment",
      dueDate: appointmentDate,
      dueTime: lead.appointmentTime ?? lead.bookingTime,
      isActionable: false,
      isOverdue: false,
    };
  }

  if (isValidIsoDate(lead.callbackDate)) {
    const overdue = lead.callbackDate < today;
    const dueToday = lead.callbackDate === today;
    return {
      queueType: "callback",
      priority: overdue || dueToday ? "high" : "medium",
      label: overdue ? "Overdue callback" : lead.callbackTime ? `Call at ${lead.callbackTime}` : "Scheduled callback",
      reason: lead.callbackTime
        ? `Callback ${overdue ? "was due" : "scheduled"} ${lead.callbackDate} at ${lead.callbackTime}`
        : `Callback ${overdue ? "was due" : "scheduled for"} ${lead.callbackDate}`,
      dueDate: lead.callbackDate,
      dueTime: lead.callbackTime,
      isActionable: true,
      isOverdue: overdue,
    };
  }

  if (isValidIsoDate(lead.nextContactDate)) {
    const overdue = lead.nextContactDate < today;
    const dueToday = lead.nextContactDate === today;
    if (overdue || dueToday) {
      return {
        queueType: "followup",
        priority: overdue ? "high" : "medium",
        label: overdue ? "Overdue follow-up" : "Follow up today",
        reason: overdue ? `Follow-up was due ${lead.nextContactDate}` : "Follow-up due today",
        dueDate: lead.nextContactDate,
        isActionable: true,
        isOverdue: overdue,
      };
    }
  }

  if (!hasContactHistory(lead)) {
    return {
      queueType: "call",
      priority: "high",
      label: isDqLeadStatus(lead.status) ? "DQ call now" : "Call now",
      reason: isDqLeadStatus(lead.status) ? "DQ lead has no contact made yet" : "No contact made yet",
      isActionable: true,
      isOverdue: false,
    };
  }

  const lastContactAt = getLastContactAt(lead);
  const daysSinceContact = lastContactAt ? (nowMs - lastContactAt) / DAY_MS : 0;
  if (daysSinceContact > 2) {
    const days = Math.floor(daysSinceContact);
    return {
      queueType: "followup",
      priority: "high",
      label: "Follow up",
      reason: days === 3 ? "No contact in 3 days" : `No contact in ${days} days`,
      isActionable: true,
      isOverdue: true,
    };
  }

  return {
    queueType: "none",
    priority: "low",
    label: "Up to date",
    reason: "No action needed right now",
    isActionable: false,
    isOverdue: false,
  };
}

export function isWorkflowQueueLead(lead: Lead, options: WorkflowOptions = {}): boolean {
  return getWorkflowState(lead, options).isActionable;
}

export function buildWorkflowItems(leads: Lead[], options: WorkflowOptions = {}): WorkflowItem[] {
  return leads.map((lead) => ({ lead, state: getWorkflowState(lead, options) }));
}

export function getActionableWorkflowItems(leads: Lead[], options: WorkflowOptions = {}): WorkflowItem[] {
  return sortWorkflowQueue(buildWorkflowItems(leads, options).filter((item) => item.state.isActionable));
}

export function deriveOperationalQueueSnapshot(
  leads: Lead[],
  options: WorkflowOptions = {},
): OperationalQueueSnapshot {
  const today = currentPerthDate(options);
  const counters: OperationalCounters = {
    total: leads.length,
    active: 0,
    dq: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    booked: 0,
    lost: 0,
    revisit: 0,
    callbacks: 0,
    overdueCallbacks: 0,
    followups: 0,
    overdueFollowups: 0,
    dueFollowupsToday: 0,
    actionable: 0,
    callNow: 0,
    terminal: 0,
  };
  const items: WorkflowItem[] = [];
  const actionableItems: WorkflowItem[] = [];
  const callbackItems: WorkflowItem[] = [];
  const overdueCallbackItems: WorkflowItem[] = [];
  const followupItems: WorkflowItem[] = [];
  const overdueFollowupItems: WorkflowItem[] = [];
  const dueFollowupTodayItems: WorkflowItem[] = [];

  for (const lead of leads) {
    const state = getWorkflowState(lead, options);
    const item = { lead, state };
    items.push(item);

    const bucket = getOperationalLeadBucket(lead);
    counters[bucket] += 1;
    if (isDqLeadStatus(lead.status)) counters.dq += 1;
    if (lead.status === "Revisit" || state.queueType === "callback") counters.revisit += 1;
    if (state.queueType === "terminal") counters.terminal += 1;
    else counters.active += 1;

    if (state.isActionable) {
      counters.actionable += 1;
      actionableItems.push(item);
    }
    if (state.queueType === "call") counters.callNow += 1;
    if (state.queueType === "callback") {
      counters.callbacks += 1;
      callbackItems.push(item);
      if (state.isOverdue) {
        counters.overdueCallbacks += 1;
        overdueCallbackItems.push(item);
      }
    }
    if (state.queueType === "followup") {
      counters.followups += 1;
      followupItems.push(item);
      if (state.isOverdue) {
        counters.overdueFollowups += 1;
        overdueFollowupItems.push(item);
      }
      if (state.dueDate === today) {
        counters.dueFollowupsToday += 1;
        dueFollowupTodayItems.push(item);
      }
    }
  }

  return {
    items,
    actionableItems: sortWorkflowQueue(actionableItems),
    callbackItems: sortWorkflowQueue(callbackItems),
    overdueCallbackItems: sortWorkflowQueue(overdueCallbackItems),
    followupItems: sortWorkflowQueue(followupItems),
    overdueFollowupItems: sortWorkflowQueue(overdueFollowupItems),
    dueFollowupTodayItems: sortWorkflowQueue(dueFollowupTodayItems),
    counters,
  };
}

export function sortWorkflowQueue<T extends { lead: Lead; state: WorkflowState }>(items: T[]): T[] {
  const priority = { high: 0, medium: 1, low: 2 };
  const queue = { callback: 0, followup: 1, call: 2, booked: 3, terminal: 4, none: 5 };
  return [...items].sort((a, b) => {
    const p = priority[a.state.priority] - priority[b.state.priority];
    if (p !== 0) return p;
    const due = (a.state.dueDate ?? "9999-12-31").localeCompare(b.state.dueDate ?? "9999-12-31");
    if (due !== 0) return due;
    return (queue[a.state.queueType] ?? 9) - (queue[b.state.queueType] ?? 9);
  });
}

export function filterOperationalLeads(
  leads: Lead[],
  filter: OperationalLeadFilter | string | null | undefined,
  options: WorkflowOptions = {},
): Lead[] {
  if (!filter) return leads;
  const items = buildWorkflowItems(leads, options);

  switch (filter) {
    case "no-contact":
      return items
        .filter(({ state }) => state.queueType === "call")
        .map(({ lead }) => lead);
    case "clients-no-fc":
      return leads.filter((lead) => isBookedLeadStatus(lead.status) && !lead.fcAppt?.date);
    case "overdue-callbacks":
      return sortWorkflowQueue(items.filter(({ state }) => state.queueType === "callback" && state.isOverdue)).map(
        ({ lead }) => lead,
      );
    case "overdue-followups":
      return sortWorkflowQueue(items.filter(({ state }) => state.queueType === "followup" && state.isOverdue)).map(
        ({ lead }) => lead,
      );
    case "callbacks":
      return sortWorkflowQueue(items.filter(({ state }) => state.queueType === "callback")).map(({ lead }) => lead);
    case "followups":
      return sortWorkflowQueue(items.filter(({ state }) => state.queueType === "followup")).map(({ lead }) => lead);
    case "actionable-queue":
      return sortWorkflowQueue(items.filter(({ state }) => state.isActionable)).map(({ lead }) => lead);
    default:
      return leads;
  }
}

export function deriveOperationalCounters(leads: Lead[], options: WorkflowOptions = {}): OperationalCounters {
  const today = currentPerthDate(options);
  const counters: OperationalCounters = {
    total: leads.length,
    active: 0,
    dq: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    booked: 0,
    lost: 0,
    revisit: 0,
    callbacks: 0,
    overdueCallbacks: 0,
    followups: 0,
    overdueFollowups: 0,
    dueFollowupsToday: 0,
    actionable: 0,
    callNow: 0,
    terminal: 0,
  };

  for (const item of buildWorkflowItems(leads, options)) {
    const { lead, state } = item;
    const bucket = getOperationalLeadBucket(lead);
    counters[bucket] += 1;
    if (isDqLeadStatus(lead.status)) counters.dq += 1;
    if (lead.status === "Revisit" || state.queueType === "callback") counters.revisit += 1;
    if (state.queueType === "terminal") {
      counters.terminal += 1;
    } else {
      counters.active += 1;
    }
    if (state.isActionable) counters.actionable += 1;
    if (state.queueType === "call") counters.callNow += 1;
    if (state.queueType === "callback") {
      counters.callbacks += 1;
      if (state.isOverdue) counters.overdueCallbacks += 1;
    }
    if (state.queueType === "followup") {
      counters.followups += 1;
      if (state.isOverdue) counters.overdueFollowups += 1;
      if (state.dueDate === today) counters.dueFollowupsToday += 1;
    }
  }

  return counters;
}

export function deriveStatusTabCounts(leads: Lead[]): Record<OperationalLeadBucket | "all", number> {
  const counts: Record<OperationalLeadBucket | "all", number> = {
    all: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    booked: 0,
    lost: 0,
  };
  leads.forEach((lead) => {
    if (lead.status === "_deleted") return;
    counts[getOperationalLeadBucket(lead)] += 1;
  });
  counts.all = counts.new + counts.contacted + counts.qualified + counts.booked + counts.lost;
  return counts;
}

export function matchesStatusTab(lead: Lead, tab: LeadStatus | "all"): boolean {
  if (lead.status === "_deleted") return false;
  if (tab === "all") return true;
  return normalizeLeadStatus(lead.status) === normalizeLeadStatus(tab);
}

export function buildInboxDonePatch(lead: Lead, options: WorkflowOptions = {}): Lead {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const date = todayInPerth(now);
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: PERTH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return {
    ...lead,
    status: "contacted",
    lastCall: now.toISOString(),
    callbackDate: null as unknown as string | undefined,
    callbackTime: null as unknown as string | undefined,
    nextContactDate: null as unknown as string | undefined,
    callHistory: [
      ...(lead.callHistory ?? []),
      {
        date,
        time,
        rep: "Inbox",
        result: "connected",
        notes: "Completed from Inbox",
      },
    ],
  };
}
