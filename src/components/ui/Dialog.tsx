import type { HTMLAttributes, ReactNode } from "react";
import { IconButton } from "./Button";

interface DialogProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  labelledBy?: string;
  describedBy?: string;
}

export function Dialog({ children, className = "", describedBy, labelledBy, open, ...props }: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={`w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-900 shadow-2xl dark:border-white/[0.06] dark:bg-[var(--surface)] dark:text-white ${className}`}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

interface DialogHeaderProps extends HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
  closeLabel?: string;
}

export function DialogHeader({
  children,
  className = "",
  closeLabel = "Close dialog",
  onClose,
  ...props
}: DialogHeaderProps) {
  return (
    <div
      className={`flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-white/[0.06] ${className}`}
      {...props}
    >
      <div className="min-w-0">{children}</div>
      {onClose && (
        <IconButton label={closeLabel} size="sm" onClick={onClose}>
          <span aria-hidden="true">x</span>
        </IconButton>
      )}
    </div>
  );
}

export function DialogTitle({ children, className = "", ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={`text-base font-bold text-gray-900 dark:text-white ${className}`} {...props}>
      {children}
    </h2>
  );
}

export function DialogDescription({ children, className = "", ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`mt-1 text-sm text-gray-500 dark:text-gray-400 ${className}`} {...props}>
      {children}
    </p>
  );
}

export function DialogBody({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-5 py-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function DialogFooter({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-4 dark:border-white/[0.06] sm:flex-row sm:justify-end ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>;
}
