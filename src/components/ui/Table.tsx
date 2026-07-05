import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";

export function TableShell({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-[var(--surface)] ${className}`}
      {...props}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({ children, className = "", ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={`w-full text-sm ${className}`} {...props}>
      {children}
    </table>
  );
}

export function TableHead({ children, className = "", ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`bg-gray-50 dark:bg-white/[0.03] ${className}`} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ children, className = "", ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`divide-y divide-gray-200 dark:divide-white/[0.06] ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export function TableHeaderCell({ children, className = "", ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`px-3 py-2.5 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({ children, className = "", ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-3 py-2.5 text-gray-700 dark:text-gray-300 ${className}`} {...props}>
      {children}
    </td>
  );
}
