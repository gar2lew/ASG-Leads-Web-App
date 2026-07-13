/**
 * EmptyState.tsx — Reusable empty state component
 * Displays friendly message when no data is available
 */

import React from "react";
import { Inbox, FileText, BarChart3, AlertCircle } from "lucide-react";
import { Button } from "./Button";

type EmptyStateIconKey = "inbox" | "document" | "chart" | "alert";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: EmptyStateIconKey | React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ title, description, icon = "inbox", action, className = "" }: EmptyStateProps) {
  const iconMap: Record<EmptyStateIconKey, React.ReactNode> = {
    inbox: <Inbox size={32} className="text-gray-300 dark:text-gray-600" />,
    document: <FileText size={32} className="text-gray-300 dark:text-gray-600" />,
    chart: <BarChart3 size={32} className="text-gray-300 dark:text-gray-600" />,
    alert: <AlertCircle size={32} className="text-gray-300 dark:text-gray-600" />,
  };

  const isIconKey = (value: string): value is EmptyStateIconKey => value in iconMap;
  const renderedIcon = typeof icon === "string" && isIconKey(icon) ? iconMap[icon] : icon;

  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}
    >
      <div className="mb-4">{renderedIcon}</div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mb-4">{description}</p>
      )}
      {action && (
        <Button size="sm" variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

interface EmptyCardProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyCard({ title, description, action }: EmptyCardProps) {
  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06]">
      <EmptyState
        title={title}
        description={description}
        action={action}
        icon="inbox"
      />
    </div>
  );
}
