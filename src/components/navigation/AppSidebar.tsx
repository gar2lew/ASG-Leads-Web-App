import type { ReactNode } from "react";
import { X } from "lucide-react";
import { NAVIGATION_SECTIONS, type NavigationPageKey } from "../../lib/navigationConfig";
import type { Region, Rep } from "../../types";
import { SidebarItem } from "./SidebarItem";
import { SidebarSection } from "./SidebarSection";
import { SidebarUserCard } from "./SidebarUserCard";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

interface AppSidebarProps {
  activePage: NavigationPageKey;
  activeRegion: Region;
  currentUser: Rep;
  workspaceLabel: string;
  isAdmin: boolean;
  dark: boolean;
  uiScale: string;
  quickPulling: boolean;
  showQuickPull: boolean;
  actionableBadge: number;
  syncStatusIndicator: ReactNode;
  canSee: (pageKey: NavigationPageKey) => boolean;
  iconForPage: (pageKey: NavigationPageKey) => ReactNode;
  onNavigate: (pageKey: NavigationPageKey) => void;
  onLeadQueueIntent: () => void;
  onRegionChange: (region: Region) => void;
  onQuickPull: () => void;
  onToggleDark: () => void;
  onUiScaleChange: (value: string) => void;
  onSignOut: () => void;
  onClose?: () => void;
}

export function AppSidebar({
  activePage,
  activeRegion,
  currentUser,
  workspaceLabel,
  isAdmin,
  dark,
  uiScale,
  quickPulling,
  showQuickPull,
  actionableBadge,
  syncStatusIndicator,
  canSee,
  iconForPage,
  onNavigate,
  onLeadQueueIntent,
  onRegionChange,
  onQuickPull,
  onToggleDark,
  onUiScaleChange,
  onSignOut,
  onClose,
}: AppSidebarProps) {
  return (
    <div className="flex h-full flex-col bg-[#0B0B0C]">
      <div className="relative flex-shrink-0 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-3">
          <img
            src="/asg-circle.png"
            alt="ASG"
            className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
            style={{ border: "1.5px solid var(--region-accent-border)" }}
          />
          <div className="min-w-0">
            <p className="font-display text-sm font-bold leading-none tracking-tight text-white">ASG CRM</p>
            <p className="mt-0.5 truncate text-[10px] font-semibold" style={{ color: "var(--region-accent)" }}>
              {workspaceLabel} workspace
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-3 top-3 p-1.5 text-[#7a7a74] hover:text-white transition"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        )}
        <WorkspaceSwitcher activeRegion={activeRegion} onRegionChange={onRegionChange} />
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-none px-2 py-3 space-y-3">
        {NAVIGATION_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => {
            if (item.adminOnly && !isAdmin) return false;
            return canSee(item.pageKey);
          });
          if (visibleItems.length === 0) return null;

          return (
            <SidebarSection key={section.label ?? "top"} label={section.label}>
              {visibleItems.map((item) => {
                const badge = item.badge === "actionable" ? actionableBadge : undefined;
                return (
                  <SidebarItem
                    key={item.pageKey}
                    icon={iconForPage(item.pageKey)}
                    label={item.label}
                    active={activePage === item.pageKey}
                    badge={badge}
                    onClick={() => {
                      if (item.pageKey === "leads" && item.badge === "actionable" && actionableBadge > 0) {
                        onLeadQueueIntent();
                      }
                      onNavigate(item.pageKey);
                    }}
                  />
                );
              })}
            </SidebarSection>
          );
        })}
      </nav>

      <SidebarUserCard
        currentUser={currentUser}
        workspaceLabel={workspaceLabel}
        dark={dark}
        uiScale={uiScale}
        quickPulling={quickPulling}
        showQuickPull={showQuickPull}
        syncStatusIndicator={syncStatusIndicator}
        canSeeSettings={canSee("rep-settings")}
        settingsActive={activePage === "rep-settings"}
        onQuickPull={onQuickPull}
        onSettingsClick={onNavigate}
        onToggleDark={onToggleDark}
        onUiScaleChange={onUiScaleChange}
        onSignOut={onSignOut}
      />
    </div>
  );
}
