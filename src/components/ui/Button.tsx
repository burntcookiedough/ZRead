/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
  [key: string]: unknown;
}

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-sm border font-sans font-bold uppercase tracking-[0.14em] " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-focus-ring)] " +
  "disabled:pointer-events-none disabled:opacity-35";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-[var(--reader-control-border)] bg-[var(--reader-text)] text-[var(--reader-bg)] hover:bg-[var(--reader-text-muted)]",
  secondary:
    "border-[var(--reader-control-border)] bg-[var(--reader-control-bg)] text-[var(--reader-text)] hover:bg-[var(--reader-control-hover-bg)]",
  ghost:
    "border-transparent bg-transparent text-[var(--reader-text-muted)] hover:border-[var(--reader-control-border)] hover:text-[var(--reader-text)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-[9px]",
  md: "min-h-10 px-4 text-[10px]",
};

export default function Button({
  variant = "secondary",
  size = "md",
  icon,
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[baseClasses, variantClasses[variant], sizeClasses[size], className].filter(Boolean).join(" ")}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
