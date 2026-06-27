import type { ReactNode } from "react";
import { LogOut, Moon, Settings, Sun } from "lucide-react";
import type { NavigationPageKey } from "../../lib/navigationConfig";
import type { Rep } from "../../types";

interface SidebarUserCardProps {
  currentUser: Rep;
  workspaceLabel: string;
  dark: boolean;
  uiScale: string;
  quickPulling: boolean;
  showQuickPull: boolean;
  syncStatusIndicator: ReactNode;
  canSeeSettings: boolean;
  settingsActive: boolean;
  onQuickPull: () => void;
  onSettingsClick: (page: NavigationPageKey) => void;
  onToggleDark: () => void;
  onUiScaleChange: (value: string) => void;
  onSignOut: () => void;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function roleLabel(role?: string) {
  if (!role) return "Rep";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function SidebarUserCard({
  currentUser,
  workspaceLabel,
  dark,
  uiScale,
  quickPulling,
  showQuickPull,
  syncStatusIndicator,
  canSeeSettings,
  settingsActive,
  onQuickPull,
  onSettingsClick,
  onToggleDark,
  onUiScaleChange,
  onSignOut,
}: SidebarUserCardProps) {
  return (
    <div className="flex-shrink-0 border-t border-white/[0.06] bg-[#09090A]">
      {showQuickPull && (
        <div className="px-3 pt-2">
          <button
            onClick={onQuickPull}
            disabled={quickPulling}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50 transition"
            title="Pull latest leads from Google Sheet"
          >
            {quickPulling ? (
              <>
                <svg
                  className="w-3 h-3 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Pulling...
              </>
            ) : (
              <>↓ Quick Pull</>
            )}
          </button>
        </div>
      )}
      {syncStatusIndicator}
      <div className="px-3 py-3 space-y-2">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.035] p-2.5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
              style={{ background: "var(--region-accent)", color: "var(--region-text-on-accent)" }}
            >
              {initials(currentUser.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#e7e7e2] truncate leading-none">{currentUser.name}</p>
              <p className="text-[10px] text-[#8e8e86] mt-1">
                {roleLabel(currentUser.role)} · {workspaceLabel}
              </p>
            </div>
          </div>
        </div>

        {canSeeSettings && (
          <button
            onClick={() => onSettingsClick("rep-settings")}
            className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
              settingsActive
                ? "bg-white/[0.08] text-[var(--region-accent)]"
                : "text-[#c8c8c4] hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            <Settings size={15} />
            <span className="flex-1 truncate">My Settings</span>
          </button>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleDark}
            title={dark ? "Light mode" : "Dark mode"}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#8e8e86] hover:bg-white/[0.06] hover:text-[#c8c8c4] transition"
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <select
            value={uiScale}
            onChange={(event) => onUiScaleChange(event.target.value)}
            title="Display zoom"
            className="h-8 flex-1 rounded-lg border border-white/10 bg-transparent px-2 text-[11px] text-[#8e8e86] outline-none hover:text-[#c8c8c4]"
          >
            <option value="auto" className="bg-[#0B0B0C]">
              Auto
            </option>
            <option value="0.85" className="bg-[#0B0B0C]">
              85%
            </option>
            <option value="0.90" className="bg-[#0B0B0C]">
              90%
            </option>
            <option value="0.95" className="bg-[#0B0B0C]">
              95%
            </option>
            <option value="1" className="bg-[#0B0B0C]">
              100%
            </option>
            <option value="1.1" className="bg-[#0B0B0C]">
              110%
            </option>
            <option value="1.2" className="bg-[#0B0B0C]">
              120%
            </option>
          </select>
          <button
            onClick={onSignOut}
            title="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-[#8e8e86] hover:bg-white/[0.06] hover:text-[#c8c8c4] transition"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
