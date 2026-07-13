import { forwardRef } from "react";
import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface FieldProps {
  children: ReactNode;
  label: string;
  htmlFor?: string;
  helpText?: string;
  error?: string;
  className?: string;
}

export function Field({ children, className = "", error, helpText, htmlFor, label }: FieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : helpText ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{helpText}</p>
      ) : null}
    </div>
  );
}

export function Label({ children, className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`block text-xs font-semibold text-gray-700 dark:text-gray-300 ${className}`} {...props}>
      {children}
    </label>
  );
}

const controlClasses =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition focus:outline-none focus:ring-2 focus:ring-[var(--brass)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-[var(--surface)] dark:text-white";

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input ref={ref} className={`${controlClasses} ${className}`} {...props} />
  ),
);

TextInput.displayName = "TextInput";

export const SelectInput = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ children, className = "", ...props }, ref) => (
    <select ref={ref} className={`${controlClasses} ${className}`} {...props}>
      {children}
    </select>
  ),
);

SelectInput.displayName = "SelectInput";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea ref={ref} className={`${controlClasses} resize-y ${className}`} {...props} />
  ),
);

Textarea.displayName = "Textarea";
