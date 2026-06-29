/**
 * useAppSettings.ts — Global Firestore settings hook
 *
 * Real-time onSnapshot listener on `appSettings/config`.
 * Deep-merges with hardcoded defaults so every field always exists.
 * Seeds the Firestore document with defaults on first run (idempotent).
 *
 * Usage:
 *   const { config, loading } = useAppSettings();
 *   const stuckDays = config.dealSettings.stuckDaysThreshold; // always a number
 */

import { useState, useEffect } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleError } from "../lib/errorHandler";
import { useFirebaseAuthUser } from "./useFirebaseAuthUser";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DealSettings {
  /** Days without an update before a deal is flagged as "stuck" */
  stuckDaysThreshold: number;
  /** Days until settlement — if stuck AND within this window → "at risk" */
  atRiskDaysThreshold: number;
}

export interface TrainingSettings {
  /** Target number of roleplay sessions per week */
  weeklyTargetSessions: number;
  /** Average score required to unlock Hard mode (0–40) */
  minimumScoreTarget: number;
}

export interface AISettings {
  /** Minimum artificial delay (ms) before AI speaks after its text appears */
  thinkingDelayMin: number;
  /** Maximum artificial delay (ms) before AI speaks */
  thinkingDelayMax: number;
  /** Minimum silence window (ms) before STT auto-stops */
  silenceTimeoutMin: number;
  /** Maximum silence window (ms) */
  silenceTimeoutMax: number;
  /** Whether pressing mic while AI speaks interrupts the AI */
  interruptionEnabled: boolean;
}

export interface FeatureFlags {
  /** Show/hide voice mode toggle in AI roleplay */
  enableVoiceMode: boolean;
  /** Show/hide session replay ("View" button) in dashboard */
  enableReplay: boolean;
  /** Failsafe: completely disable AI Training for all users */
  disableTraining: boolean;
  /** Failsafe: completely disable voice input/output (STT + TTS) */
  disableVoice: boolean;
  /** Failsafe: puts entire app into read-only mode (no writes) */
  readOnlyMode: boolean;
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

export interface IntegrationSettings {
  salestrail: SalestrailConfig;
}

export interface AppConfig {
  dealSettings: DealSettings;
  trainingSettings: TrainingSettings;
  aiSettings: AISettings;
  featureFlags: FeatureFlags;
  integrations: IntegrationSettings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults  (used as fallback + for first-run seeding)
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_APP_CONFIG: AppConfig = {
  dealSettings: {
    stuckDaysThreshold: 7,
    atRiskDaysThreshold: 7,
  },
  trainingSettings: {
    weeklyTargetSessions: 3,
    minimumScoreTarget: 28,
  },
  aiSettings: {
    thinkingDelayMin: 800,
    thinkingDelayMax: 1500,
    silenceTimeoutMin: 4000,
    silenceTimeoutMax: 6000,
    interruptionEnabled: true,
  },
  featureFlags: {
    enableVoiceMode: true,
    enableReplay: true,
    disableTraining: false,
    disableVoice: false,
    readOnlyMode: false,
  },
  integrations: {
    salestrail: {
      enabled: false,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      lastSyncCallCount: null,
      syncInProgress: false,
      syncStartedAt: null,
    },
  },
};

// Singleton doc reference — created once, reused by all hook instances
const CONFIG_DOC = doc(db, "appSettings", "config");

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseAppSettingsReturn {
  config: AppConfig;
  loading: boolean;
  error: string | null;
}

export function useAppSettings(): UseAppSettingsReturn {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      CONFIG_DOC,
      (snap) => {
        if (snap.exists()) {
          // Deep-merge with defaults so new fields added later always resolve
          const d = snap.data() as Partial<AppConfig>;
          setConfig({
            dealSettings:     { ...DEFAULT_APP_CONFIG.dealSettings,     ...(d.dealSettings ?? {}) },
            trainingSettings: { ...DEFAULT_APP_CONFIG.trainingSettings, ...(d.trainingSettings ?? {}) },
            aiSettings:       { ...DEFAULT_APP_CONFIG.aiSettings,       ...(d.aiSettings ?? {}) },
            featureFlags:     { ...DEFAULT_APP_CONFIG.featureFlags,     ...(d.featureFlags ?? {}) },
            integrations:     { ...DEFAULT_APP_CONFIG.integrations,     ...(d.integrations ?? {}) },
          });
        } else {
          // First run — seed Firestore with defaults (merge = idempotent)
          setDoc(CONFIG_DOC, DEFAULT_APP_CONFIG, { merge: true }).catch(console.error);
          setConfig(DEFAULT_APP_CONFIG);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[useAppSettings] Firestore error:", err);
        const appError = handleError(err, "useAppSettings");
        setError(appError.message);
        setLoading(false);
        // Keep the in-memory defaults — app still works without Firestore
      },
    );

    return () => unsubscribe();
  }, [authLoading, currentUser]);

  return { config, loading, error };
}

export default useAppSettings;
