/**
 * SystemSettingsPanel.tsx — Admin control panel for global app settings
 *
 * Reads live settings via useAppSettings() (real-time Firestore listener).
 * Writes via updateAppSettings() (merge — only changed fields).
 * Changes propagate instantly across ALL components that use useAppSettings().
 *
 * Sections:
 *  1. Deal Settings       — stuck / at-risk day thresholds
 *  2. Training Settings   — weekly session target, score target
 *  3. AI Behaviour        — thinking delays, silence timeout, interruption
 *  4. Feature Flags       — voice mode, session replay
 */

import React, { useState, useEffect } from "react";
import {
  Settings,
  Save,
  RotateCcw,
  Zap,
  Brain,
  Target,
  ToggleLeft,
  ToggleRight,
  CheckCircle,
  AlertCircle,
  Loader,
  Info,
  ShieldAlert,
  Phone,
  Play,
  Database,
  Shield,
} from "lucide-react";
import { useAppSettings, DEFAULT_APP_CONFIG } from "../hooks/useAppSettings";
import type { AppConfig } from "../hooks/useAppSettings";
import { updateAppSettings } from "../lib/settingsService";
import { getActionableErrorMessage } from "../lib/operationalDiagnostics";
import { getEnvironmentLabel, getReleaseMetadata, isProductionEnvironment } from "../lib/releaseMetadata";
import { useAppStore } from "../stores/appStore";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Section wrapper
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="space-y-3 pt-1">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Number field
// ─────────────────────────────────────────────────────────────────────────────

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
        {suffix && <span className="text-[10px] text-gray-400 dark:text-gray-500">{suffix}</span>}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        min={min}
        max={max}
        step={step}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
      />
      {hint && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Toggle flag
// ─────────────────────────────────────────────────────────────────────────────

function ToggleField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
        {hint && <p className="text-[10px] text-gray-400 dark:text-gray-500">{hint}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`flex-shrink-0 transition ${value ? "text-amber-500" : "text-gray-400"}`}
        aria-label={value ? "Disable" : "Enable"}
      >
        {value ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function SystemSettingsPanel() {
  const { currentUser } = useAppStore();
  const { config, loading, error } = useAppSettings();
  const release = getReleaseMetadata();
  const environmentLabel = getEnvironmentLabel(release.environment);
  const productionEnvironment = isProductionEnvironment(release);
  const isAdmin = currentUser?.role === "admin";

  // Local draft — initialised from live Firestore settings
  const [draft, setDraft] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [remoteChanged, setRemoteChanged] = useState(false);

  // TODO: Remove after phone normalization migration is complete.
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<Record<string, unknown> | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [liveRunLoading, setLiveRunLoading] = useState(false);
  const [liveRunResult, setLiveRunResult] = useState<Record<string, unknown> | null>(null);
  const [liveRunError, setLiveRunError] = useState<string | null>(null);
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);

  // Sync draft from Firestore config (first load + external changes)
  useEffect(() => {
    if (!loading) {
      if (dirty) {
        setRemoteChanged(true);
        return;
      }
      setDraft(config);
      setDirty(false);
    }
  }, [config, dirty, loading]);

  // Generic updater helpers
  function setDeal<K extends keyof AppConfig["dealSettings"]>(key: K, val: AppConfig["dealSettings"][K]) {
    setDraft((d) => ({ ...d, dealSettings: { ...d.dealSettings, [key]: val } }));
    setDirty(true);
  }

  function setTraining<K extends keyof AppConfig["trainingSettings"]>(key: K, val: AppConfig["trainingSettings"][K]) {
    setDraft((d) => ({ ...d, trainingSettings: { ...d.trainingSettings, [key]: val } }));
    setDirty(true);
  }

  function setAI<K extends keyof AppConfig["aiSettings"]>(key: K, val: AppConfig["aiSettings"][K]) {
    setDraft((d) => ({ ...d, aiSettings: { ...d.aiSettings, [key]: val } }));
    setDirty(true);
  }

  function setFlag<K extends keyof AppConfig["featureFlags"]>(key: K, val: AppConfig["featureFlags"][K]) {
    setDraft((d) => ({ ...d, featureFlags: { ...d.featureFlags, [key]: val } }));
    setDirty(true);
  }

  // TODO: Remove after phone normalization migration is complete.
  const backfillCallable = React.useMemo(
    () => httpsCallable(functions, "backfillPhoneNormalization"),
    [],
  );

  async function handleDryRun() {
    setDryRunLoading(true);
    setDryRunResult(null);
    setDryRunError(null);
    try {
      const response = await backfillCallable({ dryRun: true });
      setDryRunResult(response.data as Record<string, unknown>);
    } catch (err) {
      setDryRunError(getActionableErrorMessage(err));
    } finally {
      setDryRunLoading(false);
    }
  }

  async function handleLiveRun() {
    setLiveRunLoading(true);
    setLiveRunResult(null);
    setLiveRunError(null);
    setShowLiveConfirm(false);
    try {
      const response = await backfillCallable({ dryRun: false });
      setLiveRunResult(response.data as Record<string, unknown>);
    } catch (err) {
      setLiveRunError(getActionableErrorMessage(err));
    } finally {
      setLiveRunLoading(false);
    }
  }

  // Save handler
  async function handleSave() {
    setSaving(true);
    setSaveStatus("idle");
    setSaveError(null);
    try {
      await updateAppSettings(draft, {
        userId:   currentUser?.id ?? null,
        userName: currentUser?.name ?? "Admin",
        before:   config,
      });
      setSaveStatus("success");
      setDirty(false);
      setRemoteChanged(false);
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      setSaveError(getActionableErrorMessage(err));
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  // Reset to Firestore values (discard unsaved edits)
  function handleReset() {
    setDraft(config);
    setDirty(false);
    setSaveStatus("idle");
    setSaveError(null);
    setRemoteChanged(false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader size={18} className="animate-spin mr-2" /> Loading settings…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
        <AlertCircle size={16} />
        Failed to load settings: {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Settings size={16} className="text-amber-500" /> System Settings
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Changes apply instantly across the entire app — no redeploy required.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
            >
              <RotateCcw size={12} /> Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader size={12} className="animate-spin" />
            ) : saveStatus === "success" ? (
              <CheckCircle size={12} />
            ) : (
              <Save size={12} />
            )}
            {saving ? "Saving…" : saveStatus === "success" ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Save error */}
      {saveStatus === "error" && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
          <AlertCircle size={13} /> {saveError ?? "Failed to save. Please try again."}
        </div>
      )}

      {remoteChanged && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
          <span>Live settings changed while you were editing. Keep editing, or discard to load the latest saved values.</span>
          <button
            onClick={handleReset}
            className="flex-shrink-0 px-3 py-1 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 transition"
          >
            Load latest
          </button>
        </div>
      )}

      {/* Live indicator */}
      <div className="flex items-center gap-2 text-[11px] text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg border border-green-200 dark:border-green-800/40">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Real-time sync active — changes propagate to all users instantly.
      </div>

      {/* ── 1. Deal Settings ── */}
      <Section
        icon={<Target size={14} />}
        title="Deal Settings"
        description="Thresholds that determine when deals are flagged as Stuck or At Risk in the Deals Dashboard."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NumberField
            label="Stuck Deal Threshold"
            value={draft.dealSettings.stuckDaysThreshold}
            onChange={(v) => setDeal("stuckDaysThreshold", v)}
            min={1}
            max={60}
            suffix="days"
            hint="Days without an update before a deal appears in the Chase list."
          />
          <NumberField
            label="At-Risk Threshold"
            value={draft.dealSettings.atRiskDaysThreshold}
            onChange={(v) => setDeal("atRiskDaysThreshold", v)}
            min={1}
            max={60}
            suffix="days"
            hint="Days until settlement — if a deal is stuck AND within this window, it's At Risk."
          />
        </div>
      </Section>

      {/* ── 2. Training Settings ── */}
      <Section
        icon={<Target size={14} />}
        title="Training Settings"
        description="Controls training progression targets shown in the AI Roleplay Dashboard."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NumberField
            label="Weekly Session Target"
            value={draft.trainingSettings.weeklyTargetSessions}
            onChange={(v) => setTraining("weeklyTargetSessions", v)}
            min={1}
            max={20}
            suffix="sessions / week"
            hint="Target shown in the weekly progress bar for each rep."
          />
          <NumberField
            label="Hard Mode Score Threshold"
            value={draft.trainingSettings.minimumScoreTarget}
            onChange={(v) => setTraining("minimumScoreTarget", v)}
            min={10}
            max={40}
            suffix="/ 40"
            hint="Average score required to unlock Hard difficulty (alongside 5 sessions)."
          />
        </div>
      </Section>

      {/* ── 3. AI Behaviour ── */}
      <Section
        icon={<Brain size={14} />}
        title="AI Behaviour"
        description="Controls the timing and realism of the AI roleplay engine. All values in milliseconds."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NumberField
            label="Thinking Delay — Min"
            value={draft.aiSettings.thinkingDelayMin}
            onChange={(v) => setAI("thinkingDelayMin", v)}
            min={0}
            max={5000}
            step={100}
            suffix="ms"
            hint="Minimum pause before the AI speaks its response in voice mode."
          />
          <NumberField
            label="Thinking Delay — Max"
            value={draft.aiSettings.thinkingDelayMax}
            onChange={(v) => setAI("thinkingDelayMax", v)}
            min={0}
            max={5000}
            step={100}
            suffix="ms"
            hint="Maximum pause (a random value between min–max is chosen each time)."
          />
          <NumberField
            label="Silence Timeout — Min"
            value={draft.aiSettings.silenceTimeoutMin}
            onChange={(v) => setAI("silenceTimeoutMin", v)}
            min={1000}
            max={15000}
            step={500}
            suffix="ms"
            hint="Minimum silence before STT auto-stops and sends the transcript."
          />
          <NumberField
            label="Silence Timeout — Max"
            value={draft.aiSettings.silenceTimeoutMax}
            onChange={(v) => setAI("silenceTimeoutMax", v)}
            min={1000}
            max={15000}
            step={500}
            suffix="ms"
            hint="Maximum silence window (adds natural variation)."
          />
        </div>
        <div className="pt-1 border-t border-gray-100 dark:border-white/[0.04]">
          <ToggleField
            label="AI Interruption"
            hint="When enabled, pressing the mic while the AI is speaking immediately cuts it off."
            value={draft.aiSettings.interruptionEnabled}
            onChange={(v) => setAI("interruptionEnabled", v)}
          />
        </div>
      </Section>

      {/* ── 4. Feature Flags ── */}
      <Section
        icon={<Zap size={14} />}
        title="Feature Flags"
        description="Enable or disable features across the app without a redeploy."
      >
        <ToggleField
          label="Voice Mode"
          hint="Shows the Chat / Voice toggle in AI Roleplay. When disabled, all users are locked to Chat mode."
          value={draft.featureFlags.enableVoiceMode}
          onChange={(v) => setFlag("enableVoiceMode", v)}
        />
        <div className="border-t border-gray-100 dark:border-white/[0.04] pt-3">
          <ToggleField
            label="Session Replay"
            hint='Shows the "View" button on session history rows in the Roleplay Dashboard.'
            value={draft.featureFlags.enableReplay}
            onChange={(v) => setFlag("enableReplay", v)}
          />
        </div>
      </Section>

      {/* ── 5. Failsafe Controls ── */}
      <Section
        icon={<ShieldAlert size={14} />}
        title="Failsafe Controls"
        description="Emergency kill-switches. Activating any of these immediately affects ALL users across the platform."
      >
        {/* Amber warning banner */}
        <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 rounded-lg border border-amber-200 dark:border-amber-700/40">
          <Info size={12} className="flex-shrink-0 mt-0.5" />
          <span>These controls bypass all user permissions. Changes take effect within seconds for every active session.</span>
        </div>

        <div className="space-y-1 pt-1">
          <ToggleField
            label="Disable AI Training (Global)"
            hint="Immediately blocks all reps from starting or resuming roleplay sessions. The Training tab stays visible but sessions cannot be started."
            value={draft.featureFlags.disableTraining}
            onChange={(v) => setFlag("disableTraining", v)}
          />
          <div className="border-t border-gray-100 dark:border-white/[0.04] pt-3">
            <ToggleField
              label="Disable Voice Input / Output (Global)"
              hint="Kills all STT and TTS functionality instantly. All users are forced into Chat mode regardless of their Voice Mode setting."
              value={draft.featureFlags.disableVoice}
              onChange={(v) => setFlag("disableVoice", v)}
            />
          </div>
          <div className="border-t border-gray-100 dark:border-white/[0.04] pt-3">
            <ToggleField
              label="Read-Only Mode (Global)"
              hint="Prevents ALL write operations across the entire app — no deal edits, no lead updates, no session saves. Use during maintenance windows."
              value={draft.featureFlags.readOnlyMode}
              onChange={(v) => setFlag("readOnlyMode", v)}
            />
          </div>
        </div>
      </Section>

      {/* ── Phone Normalisation Migration (TODO: remove after migration complete) ── */}
      {isAdmin && (
        <Section
          icon={<Phone size={14} />}
          title="Phone Normalization Migration"
          description="Required before Salestrail call matching. Run a dry-run first to preview changes, then execute the live migration to normalize all lead phone numbers."
        >
          <div className="space-y-3">
            {/* ── Dry Run ── */}
            <div className="border-b border-gray-100 dark:border-white/[0.06] pb-3">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Step 1: Dry Run</p>
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={handleDryRun}
                  disabled={dryRunLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {dryRunLoading ? (
                    <><Loader size={12} className="animate-spin" /> Scanning…</>
                  ) : (
                    <><Play size={12} /> Run Dry Run</>
                  )}
                </button>
              </div>

              {dryRunError && (
                <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 mt-2">
                  <AlertCircle size={12} />
                  {dryRunError}
                </div>
              )}

              {dryRunResult && (
                <div className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-3 space-y-1.5 text-xs mt-2">
                  <p className="font-semibold text-gray-700 dark:text-gray-200">
                    Dry Run Results {dryRunResult.success === false ? "(with errors)" : ""}
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600 dark:text-gray-400">
                    <span>Scanned:</span>
                    <span className="font-mono text-right">{String(dryRunResult.totalScanned ?? "-")}</span>
                    <span>Would update:</span>
                    <span className="font-mono text-right font-semibold text-amber-600 dark:text-amber-400">{String(dryRunResult.updated ?? "-")}</span>
                    <span>Already normalized:</span>
                    <span className="font-mono text-right">{String(dryRunResult.skippedAlreadyNormalized ?? "-")}</span>
                    <span>Empty phone:</span>
                    <span className="font-mono text-right">{String(dryRunResult.skippedEmptyPhone ?? "-")}</span>
                    <span>Invalid:</span>
                    <span className="font-mono text-right">{String(dryRunResult.skippedInvalidFormat ?? "-")}</span>
                    {dryRunResult.errors !== undefined && Number(dryRunResult.errors) > 0 && (
                      <>
                        <span>Errors:</span>
                        <span className="font-mono text-right text-red-500">{String(dryRunResult.errors)}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Live Migration ── */}
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Step 2: Live Migration</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
                This will update lead phone records in Firestore. A dry run must complete successfully first.
              </p>

              {!dryRunResult && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                  Complete Step 1 (Dry Run) to enable live migration.
                </p>
              )}

              {dryRunResult && !showLiveConfirm && (
                <button
                  onClick={() => setShowLiveConfirm(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500 transition"
                >
                  <Database size={12} /> Run Live Migration
                </button>
              )}

              {showLiveConfirm && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 space-y-3 mt-2">
                  <div className="flex items-start gap-2">
                    <Shield size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-300">Confirm Live Migration</p>
                      <p className="text-[10px] text-red-600 dark:text-red-400">
                        This will permanently update lead phone records in Firestore. The dry run
                        scanned <strong>{String(dryRunResult?.totalScanned)}</strong> leads and would update{" "}
                        <strong>{String(dryRunResult?.updated)}</strong>. This action cannot be undone. The original
                        phone value is preserved in the <code className="font-mono">phoneRaw</code> field.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleLiveRun}
                      disabled={liveRunLoading}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {liveRunLoading ? (
                        <><Loader size={12} className="animate-spin" /> Running…</>
                      ) : (
                        <>Yes, Run Live Migration</>
                      )}
                    </button>
                    <button
                      onClick={() => setShowLiveConfirm(false)}
                      disabled={liveRunLoading}
                      className="px-4 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {liveRunError && (
                <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 mt-2">
                  <AlertCircle size={12} />
                  {liveRunError}
                </div>
              )}

              {liveRunResult && (
                <div className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-3 space-y-1.5 text-xs mt-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-500" />
                    <p className="font-semibold text-green-700 dark:text-green-300">
                      Migration Complete
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600 dark:text-gray-400">
                    <span>Scanned:</span>
                    <span className="font-mono text-right">{String(liveRunResult.totalScanned ?? "-")}</span>
                    <span>Updated:</span>
                    <span className="font-mono text-right font-semibold text-green-600 dark:text-green-400">{String(liveRunResult.updated ?? "-")}</span>
                    <span>Already normalized:</span>
                    <span className="font-mono text-right">{String(liveRunResult.skippedAlreadyNormalized ?? "-")}</span>
                    <span>Empty phone:</span>
                    <span className="font-mono text-right">{String(liveRunResult.skippedEmptyPhone ?? "-")}</span>
                    <span>Invalid:</span>
                    <span className="font-mono text-right">{String(liveRunResult.skippedInvalidFormat ?? "-")}</span>
                    {liveRunResult.errors !== undefined && Number(liveRunResult.errors) > 0 && (
                      <>
                        <span>Errors:</span>
                        <span className="font-mono text-right text-red-500">{String(liveRunResult.errors)}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* Info footer */}
      <div className="space-y-3 px-1">
        <div className="flex items-start gap-2 text-[11px] text-gray-400 dark:text-gray-500">
          <Info size={12} className="flex-shrink-0 mt-0.5" />
          <span>
            Settings are stored in Firestore (<code className="font-mono">appSettings/config</code>) and broadcast via
            real-time listeners. All connected clients update within seconds of saving. These settings survive app
            redeployments — no environment variable changes required.
          </span>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-200">Release Metadata</span>
            <span>
              Environment:{" "}
              <strong
                className={
                  productionEnvironment
                    ? "text-green-600 dark:text-green-400"
                    : "text-amber-600 dark:text-amber-300"
                }
              >
                {environmentLabel}
              </strong>
            </span>
            <span>Version: {release.version}</span>
            <span>Commit: {release.commit}</span>
            <span>Deployed: {release.deployedAt}</span>
            <span>Firebase: {release.firebaseProjectId}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SystemSettingsPanel;
