import type { ReactNode } from "react";

interface SidebarSectionProps {
  label?: string;
  children: ReactNode;
}

export function SidebarSection({ label, children }: SidebarSectionProps) {
  return (
    <div className="space-y-1">
      {label && (
        <div className="px-3 pt-1">
          <p className="border-t border-white/[0.05] pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a7a74]">
            {label}
          </p>
        </div>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
