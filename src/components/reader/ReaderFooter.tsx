/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface ReaderFooterProps {
  hudVisible: boolean;
  footerClassName: string;
  currentChapterIndex: number;
  currentPageIndex: number;
  totalPages: number;
  totalChapters: number;
  progressPercent: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export default function ReaderFooter({
  hudVisible,
  footerClassName,
  currentChapterIndex,
  currentPageIndex,
  totalPages,
  totalChapters,
  progressPercent,
  onPreviousPage,
  onNextPage,
}: ReaderFooterProps) {
  return (
    <div
      id="reader-footer"
      className={`absolute bottom-0 left-0 right-0 h-12 border-t flex items-center justify-between px-6 z-40 backdrop-blur-sm transition-all duration-300 ${
        hudVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
      } ${footerClassName}`}
    >
      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-black/5 dark:bg-white/5 overflow-hidden">
        <div
          className="h-full bg-black dark:bg-white transition-all duration-150"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onPreviousPage}
          id="btn-footer-prev"
          disabled={currentChapterIndex === 0 && currentPageIndex === 0}
          className="text-[10px] uppercase tracking-[0.2em] font-sans font-bold text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white disabled:opacity-20 transition-colors cursor-pointer"
        >
          Prev
        </button>
        <span className="hidden sm:inline text-[9px] uppercase tracking-[0.15em] font-sans font-semibold text-neutral-400/80 dark:text-neutral-500/80 select-none">
          • Chapter {currentChapterIndex + 1}
        </span>
      </div>

      <div className="flex flex-col items-center justify-center">
        <span className="font-sans text-[13px] md:text-[14px] font-normal text-neutral-400 dark:text-neutral-500 tracking-wide select-none">
          {currentPageIndex + 1} of {totalPages}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden sm:inline text-[9px] uppercase tracking-[0.15em] font-sans font-semibold text-neutral-400/80 dark:text-neutral-500/80 select-none">
          {Math.round(progressPercent)}% Read •
        </span>
        <button
          onClick={onNextPage}
          id="btn-footer-next"
          disabled={currentChapterIndex === totalChapters - 1 && currentPageIndex === totalPages - 1}
          className="text-[10px] uppercase tracking-[0.2em] font-sans font-bold text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white disabled:opacity-20 transition-colors cursor-pointer"
        >
          Next
        </button>
      </div>
    </div>
  );
}
