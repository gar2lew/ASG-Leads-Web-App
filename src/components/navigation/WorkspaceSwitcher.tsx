import type { Region } from "../../types";
import { getRegionIdentity, REGION_IDENTITIES } from "../../lib/regionIdentity";

interface WorkspaceSwitcherProps {
  activeRegion: Region;
  onRegionChange: (region: Region) => void;
}

export function WorkspaceSwitcher({ activeRegion, onRegionChange }: WorkspaceSwitcherProps) {
  const activeIdentity = getRegionIdentity(activeRegion);

  return (
    <div
      className="mt-3 rounded-xl border px-2.5 py-2"
      style={{
        background: "var(--region-accent-soft)",
        borderColor: "var(--region-accent-border)",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8e8e86]">Workspace</span>
        <span className="text-[10px] font-bold uppercase" style={{ color: "var(--region-accent)" }}>
          {activeIdentity.shortLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {(Object.keys(REGION_IDENTITIES) as Region[]).map((region) => {
          const identity = getRegionIdentity(region);
          const isActive = activeRegion === region;
          return (
            <button
              key={region}
              type="button"
              onClick={() => onRegionChange(region)}
              className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                isActive ? "shadow-sm" : "text-[#9a9a92] hover:bg-white/[0.06] hover:text-[#c8c8c4]"
              }`}
              style={
                isActive
                  ? {
                      background: identity.accent,
                      color: identity.textOnAccent,
                    }
                  : undefined
              }
              aria-pressed={isActive}
              aria-label={`Switch to ${identity.label} workspace`}
            >
              {identity.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
