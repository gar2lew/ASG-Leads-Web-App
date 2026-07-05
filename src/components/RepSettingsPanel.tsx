/**
 * RepSettingsPanel.tsx — Rep-level settings panel
 *
 * Settings:
 *  A. Theme (Light / Dark / System)
 *  B. UI Scale (90% / 95% / 100% / 110% / 125% / Auto)
 *  C. Notifications (enable/disable non-critical alerts)
 *  D. Training defaults (default mode, default difficulty)
 *  E. Audio settings (mic device, volume)
 *
 * All changes apply instantly, no reload required.
 * Persisted to Firestore: users/{userId}/repSettings/main
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../stores/appStore";
import { useRepSettings } from "../hooks/useDashboard";
import { useToast } from "../context/ToastContext";
import {
  Moon,
  Sun,
  Monitor,
  ZoomIn,
  Bell,
  Mic,
  Volume2,
  GraduationCap,
  Settings,
  Check,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import type { RepSettings } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────

const SECTION = "bg-white dark:bg-[#16161A] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden shadow-sm";
const SECTION_HEADER = "px-5 py-3 border-b border-gray-100 dark:border-white/5 text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2";
const ROW = "flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4";
const ROW_LABEL = "flex flex-col";
const ROW_TITLE = "text-sm font-medium text-gray-800 dark:text-white";
const ROW_DESC = "text-xs text-gray-400 dark:text-gray-500 mt-0.5";

// Segmented control
function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center bg-gray-100 dark:bg-white/5 rounded-lg p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex min-h-9 items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8933a]/50 ${
            value === opt.value
              ? "bg-white dark:bg-[#2a2a30] text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Toggle
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#b8933a]/40 ${
        value ? "bg-[#b8933a]" : "bg-gray-200 dark:bg-white/10"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out ${
          value ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Microphone device selector (uses MediaDevices API)
// ─────────────────────────────────────────────────────────────────────────────

function MicSelector({
  value,
  onChange,
}: {
  value?: string;
  onChange: (deviceId: string) => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devs) => setDevices(devs.filter((d) => d.kind === "audioinput")))
      .catch(() => {});
  }, []);

  if (devices.length === 0) {
    return <span className="text-xs text-gray-400">No microphones detected</span>;
  }

  return (
    <div className="relative">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-10 appearance-none w-full max-w-[220px] rounded-lg border border-gray-200 bg-white px-3 py-1.5 pr-8 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#b8933a]/40 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
      >
        <option value="">System default</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

export function RepSettingsPanel() {
  const { currentUser } = useAppStore();
  const { settings, save } = useRepSettings(currentUser?.id);
  const { showToast } = useToast();

  // Apply settings immediately on change
  const apply = useCallback(
    async (patch: Partial<RepSettings>) => {
      const merged = {
        ...settings,
        ...patch,
        training: { ...settings.training, ...(patch.training ?? {}) },
        audio: { ...settings.audio, ...(patch.audio ?? {}) },
      };

      // Apply theme
      if (patch.theme !== undefined) {
        const dark =
          merged.theme === "dark" ||
          (merged.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.classList.toggle("dark", dark);
        localStorage.setItem("asg-crm:dark-mode", String(dark));
      }

      // Apply UI scale
      if (patch.uiScale !== undefined) {
        localStorage.setItem("asg-crm:ui-scale", merged.uiScale);
        const numeric =
          merged.uiScale === "auto"
            ? parseFloat(getAutoScale())
            : parseFloat(merged.uiScale);
        document.documentElement.style.fontSize = `${numeric * 16}px`;
      }

      await save(merged);
      showToast("Settings saved", "success");
    },
    [settings, save, showToast],
  );

  if (!currentUser) return null;

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg)] p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Header */}
        <div className="mb-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#16161A]">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Settings size={22} className="text-[#b8933a]" />
            My Settings
          </h1>
          <p className="text-sm text-gray-400 mt-1">Personalise your experience. Changes apply instantly.</p>
        </div>

        {/* A. Theme */}
        <div className={SECTION}>
          <div className={SECTION_HEADER}>
            <Sun size={15} className="text-[#b8933a]" />
            Appearance
          </div>
          <div className={ROW}>
            <div className={ROW_LABEL}>
              <span className={ROW_TITLE}>Theme</span>
              <span className={ROW_DESC}>Choose your preferred colour scheme</span>
            </div>
            <Segment<RepSettings["theme"]>
              options={[
                { value: "light", label: "Light", icon: <Sun size={11} /> },
                { value: "dark", label: "Dark", icon: <Moon size={11} /> },
                { value: "system", label: "System", icon: <Monitor size={11} /> },
              ]}
              value={settings.theme}
              onChange={(theme) => apply({ theme })}
            />
          </div>
        </div>

        {/* B. UI Scale */}
        <div className={SECTION}>
          <div className={SECTION_HEADER}>
            <ZoomIn size={15} className="text-[#b8933a]" />
            Display Scale
          </div>
          <div className={ROW}>
            <div className={ROW_LABEL}>
              <span className={ROW_TITLE}>UI Scale</span>
              <span className={ROW_DESC}>Adjust the size of all text and interface elements</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap sm:justify-end">
              {(["auto", "0.90", "0.95", "1", "1.10", "1.25"] as RepSettings["uiScale"][]).map((v) => (
                <button
                  key={v}
                  onClick={() => apply({ uiScale: v })}
                  className={`min-h-9 px-2.5 py-1 rounded-lg text-xs font-medium transition border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8933a]/50 ${
                    settings.uiScale === v
                      ? "bg-[#b8933a] text-white border-[#b8933a]"
                      : "border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-[#b8933a]/50"
                  }`}
                >
                  {v === "auto" ? "Auto" : v === "1" ? "100%" : `${Math.round(parseFloat(v) * 100)}%`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* C. Notifications */}
        <div className={SECTION}>
          <div className={SECTION_HEADER}>
            <Bell size={15} className="text-[#b8933a]" />
            Notifications
          </div>
          <div className={ROW}>
            <div className={ROW_LABEL}>
              <span className={ROW_TITLE}>Performance alerts</span>
              <span className={ROW_DESC}>
                In-app banners for activity milestones, targets, and reminders
              </span>
            </div>
            <Toggle
              value={settings.notificationsEnabled}
              onChange={(v) => apply({ notificationsEnabled: v })}
            />
          </div>
        </div>

        {/* D. AI Guidance */}
        <div className={SECTION}>
          <div className={SECTION_HEADER}>
            <Sparkles size={15} className="text-[#b8933a]" />
            AI Guidance
          </div>
          <div className={ROW}>
            <div className={ROW_LABEL}>
              <span className={ROW_TITLE}>Client profile guidance</span>
              <span className={ROW_DESC}>
                Show contextual sales tips and suggested scripts in client profiles. Rule-based only — no external API calls.
              </span>
            </div>
            <Toggle
              value={settings.aiGuidanceEnabled !== false}
              onChange={(v) => apply({ aiGuidanceEnabled: v })}
            />
          </div>
        </div>

        {/* E. Training Defaults */}
        <div className={SECTION}>
          <div className={SECTION_HEADER}>
            <GraduationCap size={15} className="text-[#b8933a]" />
            Training Defaults
          </div>
          <div className={ROW + " border-b border-gray-100 dark:border-white/5"}>
            <div className={ROW_LABEL}>
              <span className={ROW_TITLE}>Default mode</span>
              <span className={ROW_DESC}>How sessions start by default</span>
            </div>
            <Segment<RepSettings["training"]["defaultMode"]>
              options={[
                { value: "chat", label: "Chat" },
                { value: "voice", label: "Voice" },
                { value: "natural", label: "Natural" },
              ]}
              value={settings.training.defaultMode}
              onChange={(defaultMode) => apply({ training: { ...settings.training, defaultMode } })}
            />
          </div>
          <div className={ROW}>
            <div className={ROW_LABEL}>
              <span className={ROW_TITLE}>Default difficulty</span>
              <span className={ROW_DESC}>Starting difficulty for AI roleplay sessions</span>
            </div>
            <Segment<RepSettings["training"]["defaultDifficulty"]>
              options={[
                { value: "easy", label: "Easy" },
                { value: "medium", label: "Medium" },
                { value: "hard", label: "Hard" },
              ]}
              value={settings.training.defaultDifficulty}
              onChange={(defaultDifficulty) => apply({ training: { ...settings.training, defaultDifficulty } })}
            />
          </div>
        </div>

        {/* F. Audio Settings */}
        <div className={SECTION}>
          <div className={SECTION_HEADER}>
            <Mic size={15} className="text-[#b8933a]" />
            Audio
          </div>
          <div className={ROW + " border-b border-gray-100 dark:border-white/5"}>
            <div className={ROW_LABEL}>
              <span className={ROW_TITLE}>Microphone</span>
              <span className={ROW_DESC}>Select your preferred input device</span>
            </div>
            <MicSelector
              value={settings.audio.preferredMicId}
              onChange={(preferredMicId) => apply({ audio: { ...settings.audio, preferredMicId } })}
            />
          </div>
          <div className={ROW}>
            <div className={ROW_LABEL}>
              <span className={ROW_TITLE}>AI voice volume</span>
              <span className={ROW_DESC}>Volume of AI speech in voice mode ({Math.round(settings.audio.volume * 100)}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <Volume2 size={14} className="text-gray-400 flex-shrink-0" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.audio.volume}
                onChange={(e) => {
                  const volume = parseFloat(e.target.value);
                  // Apply to speechSynthesis immediately
                  if ("speechSynthesis" in window) {
                    window.speechSynthesis.cancel(); // cancel current
                  }
                  apply({ audio: { ...settings.audio, volume } });
                }}
                className="w-28 accent-[#b8933a] cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Save confirmation */}
        <div className="text-xs text-gray-400 text-center pb-4">
          <Check size={12} className="inline mr-1 text-green-500" />
          All changes are saved automatically to your profile.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getAutoScale(): string {
  const w = window.innerWidth;
  if (w < 375) return "0.75";
  if (w < 414) return "0.80";
  if (w < 480) return "0.85";
  if (w < 640) return "0.88";
  if (w < 768) return "0.90";
  if (w < 1024) return "0.92";
  if (w < 1280) return "0.95";
  if (w < 1440) return "0.97";
  return "1";
}
