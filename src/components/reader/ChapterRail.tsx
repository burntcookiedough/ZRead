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
      className={`fixed right-0 top-1/2 -translate-y-1/2 z-50 flex items-center pr-2 transition-all duration-300 ${
        showChapterBarPanel ? "pl-80 py-10" : "pl-10 py-10"
      }`}
      onMouseEnter={onShowChapterLines}
      onMouseLeave={onHideRail}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`mr-3 w-72 max-h-[60vh] overflow-y-auto rounded-xl p-3 shadow-2xl border transition-all duration-300 no-scrollbar ${
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
              key={chapter.id}
              ref={idx === currentChapterIndex ? activeChapterRef : null}
              onClick={() => onSelectChapter(idx)}
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
      </div>

      <div
        className={`flex flex-col items-center justify-between py-2 px-1 cursor-pointer transition-all duration-300 ${
          showChapterLines ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none"
        }`}
        style={{ height: `${Math.min(350, chapters.length * 12)}px` }}
        onMouseEnter={onShowChapterPanel}
      >
        {chapters.map((_, idx) => (
          <div
            key={idx}
            onClick={() => onSelectChapter(idx)}
            className={`h-[2px] transition-all duration-200 rounded-full ${
              idx === currentChapterIndex
                ? "w-6 bg-black dark:bg-white"
                : "w-3 bg-neutral-400 dark:bg-neutral-600 opacity-60 hover:opacity-100 hover:w-5"
            }`}
            title={`Jump to Chapter ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
