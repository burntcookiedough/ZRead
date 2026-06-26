/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReaderSettings } from "../../types";
import TypographyPanel from "./TypographyPanel";

interface ReaderSettingsPanelProps {
  visible: boolean;
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
  onClose: () => void;
}

export default function ReaderSettingsPanel({ visible, settings, onChange, onClose }: ReaderSettingsPanelProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute top-[4.5rem] right-6 z-50 w-[min(24rem,calc(100vw-3rem))] animate-in fade-in zoom-in-95 duration-150"
      id="typo-panel-sec"
    >
      <TypographyPanel settings={settings} onChange={onChange} onClose={onClose} />
    </div>
  );
}
