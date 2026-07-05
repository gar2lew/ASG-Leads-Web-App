import type { HTMLAttributes } from "react";
import { SkeletonGroup } from "./Skeleton";

interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  label?: string;
}

export function Spinner({ className = "", label = "Loading", ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
      {...props}
    />
  );
}

interface LoadingBlockProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  lines?: number;
}

export function LoadingBlock({ className = "", lines = 3, title = "Loading", ...props }: LoadingBlockProps) {
  return (
    <div
      role="status"
      aria-label={title}
      className={`rounded-lg border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-[var(--surface)] ${className}`}
      {...props}
    >
      <SkeletonGroup count={lines} variant="line" gap="sm" />
    </div>
  );
}
