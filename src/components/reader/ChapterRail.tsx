/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ReaderTheme } from "../../types";
import { ParsedChapter } from "../../utils/epubParser";

interface ChapterRailProps {
  chapters: ParsedChapter[];
  currentChapterIndex: number;
  theme: ReaderTheme;
  showChapterBarPanel: boolean;
  showChapterLines: boolean;
  activeChapterRef: React.RefObject<HTMLButtonElement>;
  onShowChapterLines: () => void;
  onHideRail: () => void;
  onShowChapterPanel: () => void;
  onSelectChapter: (chapterIndex: number) => void;
}

export default function ChapterRail({
  chapters,
  currentChapterIndex,
  theme,
  showChapterBarPanel,
  showChapterLines,
  activeChapterRef,
  onShowChapterLines,
  onHideRail,
  onShowChapterPanel,
  onSelectChapter,
}: ChapterRailProps) {
  return (
    <div
      id="chapter-edge-nav"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="fixed right-3 top-20 z-50 lg:hidden">
        <button
          type="button"
          aria-expanded={showChapterBarPanel}
          aria-controls="chapter-mobile-panel"
          onClick={showChapterBarPanel ? onHideRail : onShowChapterPanel}
          className={`rounded-sm border px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] shadow-sm ${
            theme === "dark" || theme === "muted"
              ? "border-white/20 bg-black/90 text-white"
              : "border-black/20 bg-white/90 text-black"
          }`}
        >
          Chapters
        </button>
        {showChapterBarPanel && (
          <nav
            id="chapter-mobile-panel"
            aria-label="Book chapters"
            className={`absolute right-0 mt-2 max-h-[60dvh] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto rounded-sm border p-3 shadow-xl no-scrollbar ${
              theme === "dark" || theme === "muted"
                ? "border-neutral-800 bg-neutral-900/95 text-white"
                : "border-neutral-200 bg-white/95 text-black"
            }`}
          >
            <div className="space-y-1 font-sans">
              {chapters.map((chapter, idx) => (
                <button
                  type="button"
                  key={chapter.id}
                  onClick={() => onSelectChapter(idx)}
                  aria-current={idx === currentChapterIndex ? "location" : undefined}
                  className={`w-full rounded-sm px-3 py-2 text-left text-xs transition-colors ${
                    idx === currentChapterIndex
                      ? theme === "dark" || theme === "muted"
                        ? "bg-white/10 font-bold text-white"
                        : "bg-black/10 font-bold text-black"
                      : "opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
                  }`}
                >
                  {chapter.title}
                </button>
              ))}
            </div>
          </nav>
        )}
      </div>

      <div
        className={`fixed right-0 top-1/2 z-50 hidden -translate-y-1/2 items-center pr-2 transition-all duration-150 motion-reduce:transition-none lg:flex ${
          showChapterBarPanel ? "pl-72 py-8 xl:pl-80" : "pl-8 py-8"
        }`}
        onMouseEnter={onShowChapterLines}
        onMouseLeave={onHideRail}
      >
        <nav
          aria-label="Book chapters"
          inert={!showChapterBarPanel}
          className={`mr-3 w-64 max-h-[60dvh] overflow-y-auto rounded-sm p-3 shadow-xl border transition-all duration-150 motion-reduce:transition-none no-scrollbar xl:w-72 ${
            showChapterBarPanel
              ? "opacity-100 translate-x-0 pointer-events-auto"
              : "opacity-0 translate-x-4 pointer-events-none"
          } ${
          theme === "dark" || theme === "muted"
            ? "bg-neutral-900/90 border-neutral-800 text-white"
            : "bg-white/90 border-neutral-200 text-black"
        }`}
        >
          <div className="space-y-1 font-sans">
          {chapters.map((chapter, idx) => (
            <button
              type="button"
              key={chapter.id}
              ref={idx === currentChapterIndex ? activeChapterRef : null}
              onClick={() => onSelectChapter(idx)}
              aria-current={idx === currentChapterIndex ? "location" : undefined}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate transition-all cursor-pointer ${
                idx === currentChapterIndex
                  ? (theme === "dark" || theme === "muted"
                      ? "bg-white/10 text-white font-bold"
                      : "bg-black/10 text-black font-bold")
                  : "opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              {chapter.title}
            </button>
          ))}
          </div>
        </nav>

        <div
          inert={!showChapterLines}
          className={`flex flex-col items-center justify-between py-2 px-1 transition-all duration-150 motion-reduce:transition-none ${
            showChapterLines ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none"
          }`}
          style={{ height: `${Math.min(350, chapters.length * 12)}px` }}
          onMouseEnter={onShowChapterPanel}
        >
          {chapters.map((_, idx) => (
            <button
              type="button"
              key={idx}
              onClick={() => onSelectChapter(idx)}
              aria-label={`Jump to chapter ${idx + 1}`}
              aria-current={idx === currentChapterIndex ? "location" : undefined}
              className={`h-[2px] rounded-full transition-all duration-200 motion-reduce:transition-none ${
                idx === currentChapterIndex
                  ? "w-6 bg-black dark:bg-white"
                  : "w-3 bg-neutral-400 opacity-60 hover:w-5 hover:opacity-100 dark:bg-neutral-600"
              }`}
              title={`Jump to Chapter ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
