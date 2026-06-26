/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from "react";

interface SliderRowProps {
  label: string;
  value: number;
  valueLabel?: ReactNode;
  onChange: (value: number) => void;
  className?: string;
  [key: string]: unknown;
}

export default function SliderRow({
  label,
  value,
  valueLabel,
  onChange,
  className = "",
  ...props
}: SliderRowProps) {
  return (
    <label className={["block", className].filter(Boolean).join(" ")}>
      <span className="mb-2 flex items-center justify-between gap-4">
        <span className="font-sans text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--reader-text-muted)]">
          {label}
        </span>
        <span className="font-mono text-[10px] font-semibold text-[var(--reader-text)]">
          {valueLabel ?? value}
        </span>
      </span>
      <input
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="h-2 w-full accent-[var(--reader-progress)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-focus-ring)]"
        {...props}
      />
    </label>
  );
}
