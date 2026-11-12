/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from "react";

interface TooltipProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export default function Tooltip({ label, children, className = "" }: TooltipProps) {
  return (
    <span className={["group relative inline-flex", className].filter(Boolean).join(" ")}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-[var(--reader-panel-border)] bg-[var(--reader-panel-bg)] px-2 py-1 font-sans text-[10px] font-semibold text-[var(--reader-text)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
