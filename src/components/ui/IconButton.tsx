/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from "react";

type IconButtonVariant = "default" | "ghost";
type IconButtonSize = "sm" | "md";

interface IconButtonProps {
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  className?: string;
  type?: "button" | "submit" | "reset";
  [key: string]: unknown;
}

const baseClasses =
  "inline-flex shrink-0 items-center justify-center rounded-sm border font-sans transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-focus-ring)] " +
  "disabled:pointer-events-none disabled:opacity-35";

const variantClasses: Record<IconButtonVariant, string> = {
  default:
    "border-[var(--reader-control-border)] bg-[var(--reader-control-bg)] text-[var(--reader-text)] hover:bg-[var(--reader-control-hover-bg)]",
  ghost:
    "border-transparent bg-transparent text-[var(--reader-text-muted)] hover:border-[var(--reader-control-border)] hover:text-[var(--reader-text)]",
};

const sizeClasses: Record<IconButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
};

export default function IconButton({
  label,
  icon,
  variant = "default",
  size = "md",
  className = "",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={[baseClasses, variantClasses[variant], sizeClasses[size], className].filter(Boolean).join(" ")}
      {...props}
    >
      {icon}
    </button>
  );
}
