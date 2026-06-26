/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  [key: string]: unknown;
}

export default function Panel({ title, actions, children, className = "", ...props }: PanelProps) {
  return (
    <section
      className={[
        "rounded-sm border border-[var(--reader-panel-border)] bg-[var(--reader-panel-bg)] text-[var(--reader-text)] shadow-2xl",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {(title || actions) && (
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--reader-panel-border)] px-4">
          {title && (
            <h2 className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--reader-text-muted)]">
              {title}
            </h2>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
