/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Highlight, ReaderTheme, SavedWord } from "../../types";
import { captureHighlightAnchor, restoreHighlights } from "../../utils/highlightAnchors";
import AIResponsePopover from "./AIResponsePopover";
import SelectionMenu from "./SelectionMenu";
import VocabularyPanel from "./VocabularyPanel";
import { ChapterRail, ReaderFooter, ReaderSettingsPanel, ReaderShell } from "./index";
import { READER_COLUMN_GAP, type ReaderPositionAction } from "./readerLayout";
import { useReaderAI } from "./hooks/useReaderAI";
import { useReaderAnnotations } from "./hooks/useReaderAnnotations";
import { useReaderBook } from "./hooks/useReaderBook";
import { useReaderChrome } from "./hooks/useReaderChrome";
import { useReaderKeyboard } from "./hooks/useReaderKeyboard";
import { useReaderProgress } from "./hooks/useReaderProgress";
import { useReaderSettings } from "./hooks/useReaderSettings";
import { useReaderLayout } from "./hooks/useReaderLayout";

interface ReaderViewProps {
  bookId: string;
  onBackToLibrary: () => void;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function getThemeClass(theme: ReaderTheme) {
  switch (theme) {
    case "light":
    case "warm":
      return {
        wrapper: "bg-white text-black",
        card: "bg-white text-black border border-black/10 rounded-sm shadow-md",
        header: "border-black/10 bg-white/95 text-black",
        footer: "border-black/10 bg-white/95 text-black",
      };
    case "dark":
    case "muted":
    default:
      return {
        wrapper: "bg-black text-white",
        card: "bg-neutral-900 text-white border border-white/10 rounded-sm shadow-md",
        header: "border-white/10 bg-black/95 text-white",
        footer: "border-white/10 bg-black/95 text-white",
      };
  }
}

/** Renders the EPUB reading surface and connects its focused reader hooks. */
export default function ReaderView({ bookId, onBackToLibrary }: ReaderViewProps) {
  const [showChapterBarPanel, setShowChapterBarPanel] = useState(false);
  const [showChapterLines, setShowChapterLines] = useState(false);
  const [showTypography, setShowTypography] = useState(false);
  const [showVocabulary, setShowVocabulary] = useState(false);
  const activeChapterRef = useRef<HTMLButtonElement>(null);

  const ai = useReaderAI();
  const chrome = useReaderChrome(showTypography || showVocabulary || ai.state.visible);
  const settings = useReaderSettings(chrome.showToast);
  const book = useReaderBook(bookId);
  const annotations = useReaderAnnotations(bookId);

  const readerError = book.error || settings.error || annotations.error;
  const layout = useReaderLayout({
    contentReady: settings.settingsReady && annotations.ready && !book.loading && !readerError && !!book.chapterContent,
    contentKey: `${bookId}:${book.currentChapterIndex}`,
    layoutKey: [
      settings.settings.fontFamily,
      settings.settings.fontSize,
      settings.settings.lineHeight,
      settings.settings.contentWidth,
      settings.settings.viewMode,
    ].join(":"),
    savedProgressPercent: book.currentBookMeta?.progress?.scrollPercent || 0,
  });

  const progress = useReaderProgress({
    bookId,
    bookMeta: book.currentBookMeta,
    setBookMeta: book.setCurrentBookMeta,
    chapterIndex: book.currentChapterIndex,
    layoutSettled: layout.layoutSettled,
    loading: book.loading,
    settingsReady: settings.settingsReady && annotations.ready,
    getSourcePercent: layout.getSourcePercent,
  });

  useEffect(() => {
    layout.setNextPosition("restore");
  }, [bookId, layout.setNextPosition]);

  useEffect(() => {
    const isDark = settings.settings.theme === "dark" || settings.settings.theme === "muted";
    document.documentElement.classList.toggle("dark", isDark);
  }, [settings.settings.theme]);

  useEffect(() => {
    if (book.chapterContent && layout.containerRef.current) {
      layout.containerRef.current.scrollLeft = 0;
    }
  }, [book.chapterContent, layout.containerRef]);

  useEffect(() => {
    if (showChapterBarPanel && activeChapterRef.current) {
      requestAnimationFrame(() => {
        activeChapterRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
      });
    }
  }, [showChapterBarPanel, book.currentChapterIndex]);

  const renderedChapterHtml = useMemo(() => {
    if (!book.chapterContent) return "";

    const chapterHighlights = annotations.highlights.filter(
      (highlight) => highlight.chapterIndex === book.currentChapterIndex,
    );
    let content = chapterHighlights.length
      ? restoreHighlights(book.chapterContent, chapterHighlights)
      : book.chapterContent;

    if (book.currentChapterIndex === 0 && book.parsedBook) {
      const title = escapeHtml(book.parsedBook.title);
      const author = escapeHtml(book.parsedBook.author);
      content = `
        <div class="mb-10 pb-6 border-b border-black/10 dark:border-white/10 text-center select-none animate-in fade-in duration-300" style="break-inside: avoid-column; break-after: auto;" id="book-front-cover">
          <h1 class="font-serif font-bold text-3xl md:text-4xl my-2 text-center leading-tight border-none pb-0">${title}</h1>
          <p class="font-sans text-[10px] uppercase tracking-widest text-black/50 dark:text-white/50 font-bold mb-8">by ${author}</p>
        </div>
      ` + content;
    }

    return content;
  }, [
    book.chapterContent,
    book.currentChapterIndex,
    book.parsedBook?.author,
    book.parsedBook?.title,
    annotations.highlights,
  ]);

  const navigateToChapter = useCallback((target: number, position: ReaderPositionAction) => {
    if (!book.chapters.length) return;
    const nextChapter = Math.min(book.chapters.length - 1, Math.max(0, target));
    if (nextChapter === book.getCurrentChapterIndex()) {
      layout.requestPosition(position);
      return;
    }

    progress.saveReadingProgress(nextChapter, position === "last" ? 100 : 0);
    layout.setNextPosition(position);
    book.navigateToChapterIndex(nextChapter);
  }, [book.chapters.length, book.getCurrentChapterIndex, book.navigateToChapterIndex, layout.requestPosition, layout.setNextPosition, progress.saveReadingProgress]);

  const handleBackToLibrary = useCallback(async () => {
    await Promise.all([progress.flushProgress(), settings.flushSettings()]);
    onBackToLibrary();
  }, [onBackToLibrary, progress.flushProgress, settings.flushSettings]);

  const handleNextPage = useCallback(() => {
    if (!layout.layoutSettled) return;
    const { unitIndex, unitCount } = layout.getPosition();
    const chapterIndex = book.getCurrentChapterIndex();
    if (unitIndex < unitCount - 1) {
      layout.goToUnit(unitIndex + 1);
      progress.saveReadingProgress(chapterIndex, layout.getSourcePercent());
    } else if (chapterIndex < book.chapters.length - 1) {
      navigateToChapter(chapterIndex + 1, "first");
    } else {
      chrome.showToast("You have reached the end of the book.");
    }
  }, [book.chapters.length, book.getCurrentChapterIndex, chrome.showToast, layout.getPosition, layout.getSourcePercent, layout.goToUnit, layout.layoutSettled, navigateToChapter, progress.saveReadingProgress]);

  const handlePrevPage = useCallback(() => {
    if (!layout.layoutSettled) return;
    const { unitIndex } = layout.getPosition();
    const chapterIndex = book.getCurrentChapterIndex();
    if (unitIndex > 0) {
      layout.goToUnit(unitIndex - 1);
      progress.saveReadingProgress(chapterIndex, layout.getSourcePercent());
    } else if (chapterIndex > 0) {
      navigateToChapter(chapterIndex - 1, "last");
    } else {
      chrome.showToast("You are at the very beginning of the book.");
    }
  }, [book.getCurrentChapterIndex, chrome.showToast, layout.getPosition, layout.getSourcePercent, layout.goToUnit, layout.layoutSettled, navigateToChapter, progress.saveReadingProgress]);

  const handleChapterClick = useCallback(async (event: React.MouseEvent) => {
    const highlightId = (event.target as HTMLElement).getAttribute("data-highlight-id");
    if (!highlightId) return;

    try {
      const existing = await annotations.deleteHighlight(highlightId);
      if (!existing) return;
      chrome.showToast("Highlight removed.", async () => {
        await annotations.restoreHighlight(existing);
        chrome.showToast("Highlight restored.");
      });
    } catch (error) {
      console.error("Could not remove highlight:", error);
      chrome.showToast("Could not remove highlight.");
    }
  }, [annotations.deleteHighlight, annotations.restoreHighlight, chrome.showToast]);

  const handleSelectionAction = useCallback(async (
    action: "copy" | "define" | "explain" | "save" | "highlight",
    extra?: string,
    selectedTextOverride?: string,
  ) => {
    const selection = window.getSelection();
    const text = (selection?.toString() || selectedTextOverride || "").trim();
    if (!text) return;

    const sentenceContext = selection?.anchorNode?.parentNode?.textContent || text;
    try {
      if (action === "copy") {
        try {
          await navigator.clipboard.writeText(text);
          chrome.showToast("Copied selected text.");
        } catch (error) {
          console.error("Copy selected text failed:", error);
          chrome.showToast("Copy failed. Use Ctrl+C while the text is selected.");
        } finally {
          selection?.removeAllRanges();
        }
        return;
      }

      if (action === "highlight") {
        const root = layout.contentRef.current;
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        const anchor = root && range ? captureHighlightAnchor(root, range) : {};
        const highlight: Highlight = {
          id: `hl_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          bookId,
          chapterIndex: book.currentChapterIndex,
          text,
          color: extra || "custom-highlight-yellow",
          createdAt: new Date().toISOString(),
          ...anchor,
        };
        await annotations.saveHighlight(highlight);
        chrome.showToast("Highlight added.");
        selection?.removeAllRanges();
        return;
      }

      if (action === "save") {
        const word: SavedWord = {
          id: `word_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          bookId,
          word: text,
          sentenceContext,
          createdAt: new Date().toISOString(),
        };
        await annotations.saveSavedWord(word);
        chrome.showToast(`Saved "${text}" to vocabulary.`);
        return;
      }

      setShowVocabulary(false);
      if (action === "define") {
        void ai.request({
          action,
          word: text,
          context: sentenceContext,
          bookTitle: book.parsedBook?.title,
        }, text);
      } else {
        void ai.request({ action, text, bookTitle: book.parsedBook?.title }, text);
      }
    } catch (error) {
      console.error(`Could not ${action} selected text:`, error);
      chrome.showToast(action === "highlight" ? "Could not save highlight." : "Could not save vocabulary entry.");
    }
  }, [ai.request, annotations.saveHighlight, annotations.saveSavedWord, book.currentChapterIndex, book.parsedBook?.title, bookId, chrome.showToast, layout.contentRef]);

  const handleSummarizeChapter = useCallback(() => {
    if (!book.chapterContent) return;
    setShowVocabulary(false);
    const chapterText = document.getElementById("reader-chapter-body")?.innerText || "Unknown text content.";
    const chapterTitle = book.chapters[book.currentChapterIndex]?.title || "Section";
    void ai.request({
      action: "summarize",
      text: chapterText.slice(0, 8000),
      bookTitle: book.parsedBook?.title,
    }, `Chapter ${book.currentChapterIndex + 1}: ${chapterTitle}`);
  }, [ai.request, book.chapterContent, book.chapters, book.currentChapterIndex, book.parsedBook?.title]);

  const handleDeleteSavedWord = useCallback(async (word: SavedWord) => {
    try {
      await annotations.deleteSavedWord(word.id);
      chrome.showToast("Saved word removed.");
    } catch (error) {
      console.error("Could not remove saved word:", error);
      chrome.showToast("Could not remove saved word.");
    }
  }, [annotations.deleteSavedWord, chrome.showToast]);

  const closeTopmostOverlay = useCallback(() => {
    if (showTypography) setShowTypography(false);
    else if (ai.state.visible) ai.close();
    else if (showVocabulary) setShowVocabulary(false);
  }, [ai.close, ai.state.visible, showTypography, showVocabulary]);

  const handleToggleSettings = useCallback(() => {
    setShowVocabulary(false);
    setShowTypography((visible) => !visible);
  }, []);

  useReaderKeyboard({
    closeTopmostOverlay,
    onPreviousPage: handlePrevPage,
    onNextPage: handleNextPage,
    onToggleSettings: handleToggleSettings,
  });

  if (!settings.settingsReady || !annotations.ready || (book.loading && !book.chapterContent)) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-white dark:bg-black text-black dark:text-white" id="read-loader">
        <p className="text-[10px] font-sans uppercase tracking-widest font-bold animate-pulse">Opening reader workspace...</p>
      </div>
    );
  }

  if (readerError) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center p-6 bg-white dark:bg-black text-center text-black dark:text-white" id="read-error">
        <h3 className="font-serif italic text-xl mb-2">Could not initialize book</h3>
        <p className="text-xs text-black/60 dark:text-white/60 max-w-sm mb-6 leading-relaxed">{readerError}</p>
        <button
          onClick={() => void handleBackToLibrary()}
          id="btn-back-err"
          className="px-5 py-2 bg-black dark:bg-white text-white dark:text-black rounded-sm border border-black dark:border-white font-sans text-[10px] uppercase tracking-widest font-bold hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-all cursor-pointer"
        >
          Return to Library
        </button>
      </div>
    );
  }

  const settingsValue = settings.settings;
  const themeStyle = getThemeClass(settingsValue.theme);
  const activeChapter = book.chapters[book.currentChapterIndex];
  const visiblePageCount = settingsValue.viewMode === "split" && !layout.isNarrowViewport ? 2 : 1;
  const viewportMaxWidth = settingsValue.contentWidth * visiblePageCount + (visiblePageCount - 1) * READER_COLUMN_GAP;
  const viewportWidth = layout.isNarrowViewport
    ? `min(calc(100vw - 32px), ${settingsValue.contentWidth}px)`
    : `min(calc(100vw - 96px), ${viewportMaxWidth}px)`;
  const viewportTop = chrome.isFullscreen ? "top-6" : "top-16";
  const viewportBottom = chrome.isFullscreen ? "bottom-6" : "bottom-12";

  return (
    <ReaderShell
      hudVisible={chrome.hudVisible}
      themeStyle={themeStyle}
      bookTitle={book.parsedBook?.title}
      activeChapterTitle={activeChapter?.title}
      showSettings={showTypography}
      isFullscreen={chrome.isFullscreen}
      onMouseMove={chrome.refreshHudTimeout}
      onBackToLibrary={() => void handleBackToLibrary()}
      onSummarizeChapter={handleSummarizeChapter}
      onToggleSettings={handleToggleSettings}
      onToggleFullscreen={() => void chrome.toggleFullscreen()}
      showVocabulary={showVocabulary}
      onToggleVocabulary={() => {
        if (!showVocabulary) {
          setShowTypography(false);
          ai.close();
        }
        setShowVocabulary((visible) => !visible);
      }}
    >
      <ReaderSettingsPanel
        visible={showTypography}
        settings={settingsValue}
        onChange={settings.updateSettings}
        onClose={() => setShowTypography(false)}
      />

      {showVocabulary && (
        <VocabularyPanel
          words={annotations.savedWords}
          onClose={() => setShowVocabulary(false)}
          onDelete={handleDeleteSavedWord}
        />
      )}

      {ai.state.visible && !showVocabulary && (
        <AIResponsePopover
          type={ai.state.type}
          inputText={ai.state.inputText}
          result={ai.state.result}
          loading={ai.state.loading}
          error={ai.state.error}
          onClose={ai.close}
          onRetry={() => void ai.retry()}
        />
      )}

      {!showVocabulary && <SelectionMenu onAction={handleSelectionAction} onClose={() => {}} />}

      <div
        ref={layout.containerRef}
        id="reader-scroll-viewport"
        style={{ width: viewportWidth }}
        className={`absolute left-1/2 -translate-x-1/2 overflow-x-hidden overflow-y-hidden no-scrollbar ${viewportTop} ${viewportBottom}`}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            transform: `translate3d(-${layout.unitIndex * layout.unitStride}px, 0, 0)`,
            transition: layout.suppressAnimation
              ? "opacity 0.15s ease-in-out"
              : "transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease-in-out",
            opacity: (book.loading || !layout.layoutSettled) ? 0 : 1,
          }}
          className="mx-auto px-0 h-full py-2 relative"
          id="reader-column"
        >
          <div
            ref={layout.contentRef}
            id="reader-chapter-body"
            onClick={(event) => void handleChapterClick(event)}
            style={{
              fontSize: `${settingsValue.fontSize}px`,
              lineHeight: settingsValue.lineHeight,
              fontFamily: settingsValue.fontFamily === "Source Serif" ? "'Source Serif 4', Georgia, serif" : `'${settingsValue.fontFamily}', Georgia, serif`,
              columnCount: visiblePageCount,
              columnGap: `${READER_COLUMN_GAP}px`,
              height: "100%",
              columnFill: "auto",
            }}
            className="epub-content select-text font-serif leading-relaxed text-left antialiased focus:outline-none h-full"
            dangerouslySetInnerHTML={{ __html: renderedChapterHtml }}
          />
        </div>
      </div>

      <div
        onClick={handlePrevPage}
        id="side-prev-hotspot"
        className="absolute top-16 bottom-12 left-0 w-8 md:w-16 flex items-center justify-start pl-2 z-10 cursor-w-resize opacity-0 hover:opacity-15 text-neutral-400 transition-opacity"
        title="Previous Page"
      >
        <span className="hidden md:block">←</span>
      </div>

      <div
        onClick={handleNextPage}
        id="side-next-hotspot"
        className="absolute top-16 bottom-12 right-0 w-8 md:w-16 flex items-center justify-end pr-2 z-10 cursor-e-resize opacity-0 hover:opacity-15 text-neutral-400 transition-opacity"
        title="Next Page"
      >
        <span className="hidden md:block">→</span>
      </div>

      {book.chapters.length > 1 && !showTypography && !ai.state.visible && !showVocabulary && (
        <ChapterRail
          chapters={book.chapters}
          currentChapterIndex={book.currentChapterIndex}
          theme={settingsValue.theme}
          showChapterBarPanel={showChapterBarPanel}
          showChapterLines={showChapterLines}
          activeChapterRef={activeChapterRef}
          onShowChapterLines={() => setShowChapterLines(true)}
          onHideRail={() => {
            setShowChapterLines(false);
            setShowChapterBarPanel(false);
          }}
          onShowChapterPanel={() => setShowChapterBarPanel(true)}
          onSelectChapter={(index) => navigateToChapter(index, "first")}
        />
      )}

      <ReaderFooter
        hudVisible={chrome.hudVisible}
        footerClassName={themeStyle.footer}
        currentChapterIndex={book.currentChapterIndex}
        currentPageIndex={layout.unitIndex}
        totalPages={layout.unitCount}
        totalChapters={book.chapters.length}
        progressPercent={book.currentBookMeta?.progress?.scrollPercent || 0}
        onPreviousPage={handlePrevPage}
        onNextPage={handleNextPage}
      />

      {chrome.notification && (
        <div
          id="toast-notification"
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-sm border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 shadow-xl text-[10px] font-sans font-bold uppercase tracking-wider flex items-center justify-between gap-6 select-none animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-black dark:text-white">{chrome.notification.text}</span>
          </div>
          {chrome.notification.onUndo && (
            <button
              onClick={() => {
                void chrome.notification?.onUndo?.();
                chrome.dismissNotification();
              }}
              className="text-black dark:text-white font-bold hover:underline cursor-pointer border-l border-black/15 dark:border-white/15 pl-2.5"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </ReaderShell>
  );
}
