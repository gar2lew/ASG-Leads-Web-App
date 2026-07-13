/**
 * Zustand Global State Store
 */

import { create } from "zustand";
import { Lead, Rep, AppSettings, DrapsEntry, CommissionEntry, AuditEntry, DEFAULT_STATUS_COLORS, Region } from "../types";

interface AppState {
  leads: Lead[];
  reps: Rep[];
  currentUser: Rep | null;
  settings: AppSettings;
  statusColors: Record<string, string>; // hex per LeadStatus, synced from Firestore settings
  drapsEntries: DrapsEntry[];
  commissions: CommissionEntry[];
  auditLog: AuditEntry[];
  reportToLoad: Record<string, unknown> | null;
  piaPrefillClientId: string | null;
  piaPrefillClientName: string | null;
  activeRegion: Region;

  // Actions
  setLeads: (leads: Lead[]) => void;
  setReps: (reps: Rep[]) => void;
  setCurrentUser: (user: Rep | null) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  setStatusColors: (colors: Record<string, string>) => void;
  updateLead: (lead: Lead) => void;
  removeLead: (leadId: number) => void;
  setDrapsEntries: (entries: DrapsEntry[]) => void;
  setCommissions: (entries: CommissionEntry[]) => void;
  setAuditLog: (entries: AuditEntry[]) => void;
  setReportToLoad: (report: Record<string, unknown> | null) => void;
  setPiaPrefillContext: (clientId: string | null, clientName: string | null) => void;
  clearPiaPrefillContext: () => void;
  setActiveRegion: (region: Region) => void;
}

const defaultSettings: AppSettings = {
  commission: {
    dqRate: 0,
    fcRate: 0,
    frRate: 0,
  },
  repTargets: {},
  staleThresholdDays: 14,
};

// localStorage keys with namespace to avoid collisions
const STORAGE_KEYS = {
  REPS: "asg-crm:reps",
  DARK_MODE: "asg-crm:dark-mode",
  UI_SCALE: "asg-crm:ui-scale",
  USER_LOCATION: "asg-crm:user-location",
  ACTIVE_REGION: "asg-crm:active-region",
} as const;

const isRegion = (value: string | null): value is Region => value === "brisbane" || value === "perth";

const loadReps = (): Rep[] => {
  if (!import.meta.env.DEV) {
    return [];
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.REPS);
    if (stored) {
      const parsed = JSON.parse(stored);
      // If we have cached reps, return them
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    // Return empty array - reps will be loaded from Firestore
    return [];
  } catch {
    return [];
  }
};

const loadActiveRegion = (): Region => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ACTIVE_REGION);
    return isRegion(stored) ? stored : "brisbane";
  } catch {
    return "brisbane";
  }
};

export const useAppStore = create<AppState>((set) => ({
  leads: [],
  reps: loadReps(),
  currentUser: null,
  settings: defaultSettings,
  statusColors: { ...DEFAULT_STATUS_COLORS },
  drapsEntries: [],
  commissions: [],
  auditLog: [],
  reportToLoad: null,
  piaPrefillClientId: null,
  piaPrefillClientName: null,
  activeRegion: loadActiveRegion(),

  setLeads: (leads) => set({ leads }),

  setReps: (reps) => {
    if (import.meta.env.DEV) {
      localStorage.setItem(STORAGE_KEYS.REPS, JSON.stringify(reps));
    } else {
      localStorage.removeItem(STORAGE_KEYS.REPS);
    }
    set({ reps });
  },

  setCurrentUser: (currentUser) => set({ currentUser }),

  updateSettings: (newSettings) =>
    set((state) => ({
      settings: {
        ...state.settings,
        ...newSettings,
        commission: {
          ...state.settings.commission,
          ...(newSettings.commission || {}),
        },
      },
    })),

  setStatusColors: (statusColors) => set({ statusColors }),

  updateLead: (updatedLead) =>
    set((state) => ({
      leads: state.leads.map((l) => (l.id === updatedLead.id ? updatedLead : l)),
    })),

  removeLead: (leadId) =>
    set((state) => ({
      leads: state.leads.filter((l) => l.id !== leadId),
    })),

  setDrapsEntries: (drapsEntries) => set({ drapsEntries }),
  setCommissions: (commissions) => set({ commissions }),
  setAuditLog: (auditLog) => set({ auditLog }),
  setReportToLoad: (reportToLoad) => set({ reportToLoad }),

  setPiaPrefillContext: (clientId, clientName) =>
    set({ piaPrefillClientId: clientId, piaPrefillClientName: clientName }),

  clearPiaPrefillContext: () =>
    set({ piaPrefillClientId: null, piaPrefillClientName: null }),

  setActiveRegion: (activeRegion) => {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_REGION, activeRegion);
    } catch {
      // Region still updates for the current session if storage is unavailable.
    }
    set({ activeRegion });
  },
}));
