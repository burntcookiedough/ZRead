/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MouseEvent, ReactNode } from "react";

interface ReaderThemeClasses {
  wrapper: string;
  header: string;
}

interface ReaderShellProps {
  children: ReactNode;
  hudVisible: boolean;
  themeStyle: ReaderThemeClasses;
  bookTitle?: string;
  activeChapterTitle?: string;
  showSettings: boolean;
  onMouseMove: () => void;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  onBackToLibrary: () => void;
  onSummarizeChapter: () => void;
  onToggleSettings: () => void;
}

export default function ReaderShell({
  children,
  hudVisible,
  themeStyle,
  bookTitle,
  activeChapterTitle,
  showSettings,
  onMouseMove,
  onClick,
  onBackToLibrary,
  onSummarizeChapter,
  onToggleSettings,
}: ReaderShellProps) {
  return (
    <div
      onMouseMove={onMouseMove}
      onClick={onClick}
      id="reader-hud-root"
      className={`relative w-full h-screen overflow-hidden select-text transition-colors duration-300 ${themeStyle.wrapper}`}
    >
      <div
        id="reader-hud-header"
        className={`absolute top-0 left-0 right-0 h-16 border-b flex items-center justify-between px-6 z-40 backdrop-blur-sm transition-all duration-300 ${
          hudVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
        } ${themeStyle.header}`}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToLibrary}
            id="btn-reader-back"
            className="group flex items-center gap-1.5 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors cursor-pointer font-bold font-sans text-[10px] uppercase tracking-[0.2em]"
            title="Library Catalog"
          >
            <span>← Library</span>
          </button>

          <div className="h-4 w-px bg-black/10 dark:bg-white/10"></div>

          <div>
            <h4 className="font-serif font-bold text-xs max-w-[150px] md:max-w-[320px] truncate leading-tight italic">
              {bookTitle}
            </h4>
            <p className="font-sans text-[8px] text-black/45 dark:text-white/45 uppercase tracking-[0.2em] font-semibold mt-0.5">
              {activeChapterTitle || "Chapter Description"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSummarizeChapter}
            id="btn-reader-summarize"
            title="Summarize chapter [Key: S]"
            className="px-2.5 py-1.5 rounded-sm border border-black/10 dark:border-white/10 text-black/80 dark:text-white/80 text-[9px] uppercase tracking-[0.15em] font-sans font-bold hover:border-black dark:hover:border-white transition-all cursor-pointer"
          >
            <span>Summarize</span>
          </button>

          <button
            onClick={onToggleSettings}
            id="btn-reader-typo"
            title="Typography settings [Key: T]"
            className={`px-2.5 py-1.5 rounded-sm border text-[9px] uppercase tracking-[0.15em] font-sans font-bold transition-all cursor-pointer ${
              showSettings
                ? "border-black dark:border-white bg-black dark:bg-white text-white dark:text-black"
                : "border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white"
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {children}
    </div>
  );
}
