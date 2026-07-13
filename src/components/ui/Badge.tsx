import type { HTMLAttributes } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  brand: "bg-[var(--brass)]/10 text-[var(--brass)] dark:bg-[var(--brass)]/20",
};

export function Badge({ children, className = "", tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

interface StatusIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  pulse?: boolean;
}

const dotClasses: Record<BadgeTone, string> = {
  neutral: "bg-gray-400",
  success: "bg-green-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
  brand: "bg-[var(--brass)]",
};

export function StatusIndicator({
  children,
  className = "",
  pulse = false,
  tone = "neutral",
  ...props
}: StatusIndicatorProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${className}`} {...props}>
      <span className={`h-2 w-2 rounded-full ${dotClasses[tone]} ${pulse ? "animate-pulse" : ""}`} />
      {children}
    </span>
  );
}
