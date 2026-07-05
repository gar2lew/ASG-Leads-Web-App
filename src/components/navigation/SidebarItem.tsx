import type { ReactNode } from "react";

interface SidebarItemProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

export function SidebarItem({ icon, label, active, onClick, badge }: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--region-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0C] ${
        active
          ? "bg-white/[0.09] text-[var(--region-accent)] shadow-sm"
          : "text-[#c8c8c4] hover:bg-white/[0.06] hover:text-white"
      }`}
      style={
        active
          ? { borderLeft: "2px solid var(--region-accent)", paddingLeft: "10px" }
          : { borderLeft: "2px solid transparent" }
      }
    >
      <span className={active ? "text-[var(--region-accent)]" : "text-[#8f8f88] group-hover:text-[#c8c8c4]"}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ background: "var(--region-accent)", color: "var(--region-text-on-accent)" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
