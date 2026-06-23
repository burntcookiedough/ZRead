/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReaderSettings, ReaderTheme, ReaderFont } from "../../types";
import { X, Type, Minus, Plus, Maximize2, Minimize2 } from "lucide-react";

interface TypographyPanelProps {
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
  onClose: () => void;
}

export default function TypographyPanel({ settings, onChange, onClose }: TypographyPanelProps) {
  const themes: { id: ReaderTheme; label: string; bg: string; text: string; border: string }[] = [
    { id: "light", label: "Paper", bg: "bg-[#FAF9F7]", text: "text-[#111111]", border: "border-stone-300" },
    { id: "warm", label: "Warmth", bg: "bg-[#F4F0EA]", text: "text-[#2e2620]", border: "border-amber-200" },
    { id: "muted", label: "Muted", bg: "bg-[#2D3136]", text: "text-[#E3E3E3]", border: "border-stone-600" },
    { id: "dark", label: "Midnight", bg: "bg-[#111111]", text: "text-[#EAEAEA]", border: "border-stone-800" },
  ];

  const fonts: { id: ReaderFont; name: string }[] = [
    { id: "Literata", name: "Literata" },
    { id: "Newsreader", name: "Newsreader" },
    { id: "Source Serif", name: "Source Serif 4" },
    { id: "Georgia", name: "Georgia" },
  ];

  const updateSetting = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="p-6 w-full max-w-sm rounded-sm shadow-2xl border border-black/10 dark:border-white/10 backdrop-blur-md bg-white/95 dark:bg-neutral-900/95 max-h-[85vh] overflow-y-auto no-scrollbar">
      <div className="flex items-center justify-between mb-6 border-b border-black/5 dark:border-white/5 pb-3" id="typo-hdr">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-neutral-400" />
          <h3 className="font-sans font-bold text-[10px] uppercase tracking-[0.2em] text-black/60 dark:text-white/60">Typography Settings</h3>
        </div>
        <button
          onClick={onClose}
          id="btn-close-typo"
          className="text-[9px] uppercase tracking-[0.15em] font-sans font-bold text-black/40 hover:text-black dark:text-white/45 dark:hover:text-white transition-colors"
        >
          Close
        </button>
      </div>

      {/* Font Family selection */}
      <div className="mb-6" id="typo-family">
        <label className="block text-[9px] font-sans font-bold text-black/40 dark:text-white/40 uppercase tracking-[0.2em] mb-3">
          Typeface
        </label>
        <div className="grid grid-cols-2 gap-2">
          {fonts.map((f) => (
            <button
              key={f.id}
              id={`font-family-${f.id}`}
              onClick={() => updateSetting("fontFamily", f.id)}
              className={`px-3 py-2 text-xs text-left transition-all rounded-sm cursor-pointer border ${
                settings.fontFamily === f.id
                  ? "border-[#111111] dark:border-white bg-[#111111] dark:bg-white text-white dark:text-[#111111] font-semibold"
                  : "border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:border-black/30 dark:hover:border-white/30 bg-transparent"
              }`}
            >
              <span className={`block font-serif ${f.id === "Literata" ? "font-['Literata']" : f.id === "Newsreader" ? "font-['Newsreader']" : f.id === "Source Serif" ? "font-['Source_Serif_4']" : "font-serif"}`}>
                {f.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Font Size controls */}
      <div className="mb-6" id="typo-size">
        <div className="flex items-center justify-between mb-3">
          <label className="text-[9px] font-sans font-bold text-black/40 dark:text-white/40 uppercase tracking-[0.2em]">
            Font Size
          </label>
          <span className="text-[10px] text-neutral-450 font-mono tracking-wider font-semibold">{settings.fontSize}px</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => updateSetting("fontSize", Math.max(14, settings.fontSize - 1))}
            disabled={settings.fontSize <= 14}
            id="btn-font-dec"
            className="flex-1 py-1.5 flex justify-center items-center rounded-sm border border-black/10 dark:border-white/10 disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => updateSetting("fontSize", Math.min(28, settings.fontSize + 1))}
            disabled={settings.fontSize >= 28}
            id="btn-font-inc"
            className="flex-1 py-1.5 flex justify-center items-center rounded-sm border border-black/10 dark:border-white/10 disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Line Height controls */}
      <div className="mb-6" id="typo-lineheight">
        <div className="flex items-center justify-between mb-3">
          <label className="text-[9px] font-sans font-bold text-black/40 dark:text-white/40 uppercase tracking-[0.2em]">
            Line Spacing
          </label>
          <span className="text-[10px] text-neutral-455 font-mono tracking-wider font-semibold">{settings.lineHeight.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => updateSetting("lineHeight", Math.max(1.4, Number((settings.lineHeight - 0.1).toFixed(1))))}
            disabled={settings.lineHeight <= 1.4}
            id="btn-line-dec"
            className="flex-1 py-1.5 flex justify-center items-center rounded-sm border border-black/10 dark:border-white/10 disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => updateSetting("lineHeight", Math.min(2.4, Number((settings.lineHeight + 0.1).toFixed(1))))}
            disabled={settings.lineHeight >= 2.4}
            id="btn-line-inc"
            className="flex-1 py-1.5 flex justify-center items-center rounded-sm border border-black/10 dark:border-white/10 disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content Width controls */}
      <div className="mb-6" id="typo-width">
        <div className="flex items-center justify-between mb-3">
          <label className="text-[9px] font-sans font-bold text-black/40 dark:text-white/40 uppercase tracking-[0.2em]">
            Content Column
          </label>
          <span className="text-[10px] text-neutral-450 font-mono tracking-wider font-semibold">{settings.contentWidth}px</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => updateSetting("contentWidth", Math.max(600, settings.contentWidth - 40))}
            disabled={settings.contentWidth <= 600}
            id="btn-width-dec"
            className="flex-1 py-1.5 flex justify-center items-center rounded-sm border border-black/10 dark:border-white/10 disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => updateSetting("contentWidth", Math.min(960, settings.contentWidth + 40))}
            disabled={settings.contentWidth >= 960}
            id="btn-width-inc"
            className="flex-1 py-1.5 flex justify-center items-center rounded-sm border border-black/10 dark:border-white/10 disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-300 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Theme selection */}
      <div id="typo-theme">
        <label className="block text-[9px] font-sans font-bold text-black/40 dark:text-white/40 uppercase tracking-[0.2em] mb-3">
          App Theme
        </label>
        <div className="grid grid-cols-4 gap-2">
          {themes.map((t) => (
            <button
              key={t.id}
              id={`theme-btn-${t.id}`}
              onClick={() => updateSetting("theme", t.id)}
              title={t.label}
              className={`relative h-12 rounded-sm border flex flex-col justify-between items-center p-1.5 cursor-pointer transition-all ${t.bg} ${t.border} ${
                settings.theme === t.id
                  ? "ring-2 ring-black/20 scale-[1.03] border-[#111111] dark:border-white shadow-sm"
                  : "hover:scale-[1.01]"
              }`}
            >
              <div className="text-[10px] select-none font-semibold text-neutral-400/80 leading-none">Aa</div>
              <span className={`text-[8px] font-sans font-medium uppercase tracking-wider truncate w-full text-center ${t.text}`}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
