/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from "react";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

export default function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: SegmentedControlProps<T>) {
  return (
    <div className={className}>
      <div className="mb-2 font-sans text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--reader-text-muted)]">
        {label}
      </div>
      <div className="flex gap-1 rounded-sm border border-[var(--reader-control-border)] bg-[var(--reader-control-bg)] p-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={[
                "min-h-8 flex-1 rounded-sm px-2 font-sans text-[10px] font-bold uppercase tracking-[0.12em] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-focus-ring)] disabled:pointer-events-none disabled:opacity-35",
                selected
                  ? "bg-[var(--reader-text)] text-[var(--reader-bg)]"
                  : "text-[var(--reader-text-muted)] hover:bg-[var(--reader-control-hover-bg)] hover:text-[var(--reader-text)]",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
