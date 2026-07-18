/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";
import { ReaderSettings } from "../../types";
import TypographyPanel from "./TypographyPanel";

interface ReaderSettingsPanelProps {
  visible: boolean;
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
  onClose: () => void;
}

export default function ReaderSettingsPanel({ visible, settings, onChange, onClose }: ReaderSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) panelRef.current?.focus();
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby="typography-settings-title"
      tabIndex={-1}
      className="fixed inset-x-3 bottom-3 z-50 w-auto animate-in fade-in slide-in-from-bottom-2 duration-150 sm:absolute sm:inset-auto sm:top-[4.5rem] sm:right-6 sm:w-[min(24rem,calc(100vw-3rem))] sm:zoom-in-95"
      id="typo-panel-sec"
    >
      <TypographyPanel settings={settings} onChange={onChange} onClose={onClose} />
    </div>
  );
}
