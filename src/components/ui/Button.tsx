import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--brass)] text-white hover:bg-[var(--brass-dark)] focus-visible:ring-[var(--brass)]",
  secondary:
    "border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[var(--hover)] focus-visible:ring-[var(--brass)]",
  ghost:
    "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[var(--hover)] focus-visible:ring-[var(--brass)]",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1.5 text-xs",
  md: "min-h-11 px-4 py-2 text-sm",
  lg: "min-h-12 px-5 py-2.5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = "",
      disabled,
      icon,
      isLoading = false,
      size = "md",
      type = "button",
      variant = "secondary",
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : (
          icon
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, className = "", label, size = "md", type = "button", variant = "ghost", ...props }, ref) => {
    const squareSize = {
      sm: "h-9 w-9",
      md: "h-11 w-11",
      lg: "h-12 w-12",
    }[size];

    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={`inline-flex items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${squareSize} ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
