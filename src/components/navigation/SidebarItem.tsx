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
      className={`group w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all ${
        active
          ? "bg-white/[0.08] text-[var(--region-accent)] shadow-sm"
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
          className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
          style={{ background: "var(--region-accent)", color: "var(--region-text-on-accent)" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
