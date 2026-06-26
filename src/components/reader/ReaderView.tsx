/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Book, Highlight, SavedWord, ReaderSettings, ReaderTheme } from "../../types";
import { storage } from "@/features/storage";
import { parseEpub, loadChapterContent, ParsedBook, ParsedChapter } from "../../utils/epubParser";
// No icons needed for text-only interface
import SelectionMenu from "./SelectionMenu";
import AIResponsePopover from "./AIResponsePopover";
import { triggerAIAction } from "../../utils/aiClient";
import { ChapterRail, ReaderFooter, ReaderSettingsPanel, ReaderShell } from "./index";
import { useReaderLayout } from "./hooks/useReaderLayout";

interface ReaderViewProps {
  bookId: string;
  onBackToLibrary: () => void;
}

const COLUMN_GAP = 48;

/**
 * Renders an EPUB reading surface with paginated navigation, reader settings, annotations, and AI actions.
 */
export default function ReaderView({ bookId, onBackToLibrary }: ReaderViewProps) {
  // EPUB Parser States
  const [parsedBook, setParsedBook] = useState<ParsedBook | null>(null);
  const [currentBookMeta, setCurrentBookMeta] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<ParsedChapter[]>([]);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [chapterContent, setChapterContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reader navigation and layout states
  const [showChapterBarPanel, setShowChapterBarPanel] = useState(false);
  const [showChapterLines, setShowChapterLines] = useState(false);

  // Reader HUD Control States
  const [hudVisible, setHudVisible] = useState(true);
  const [showTypography, setShowTypography] = useState(false);

  // Active highlights & Vocab
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);

  // Reader Settings
  const [settings, setSettings] = useState<ReaderSettings>(storage.getReaderSettings());

  // Sync document root dark class list with theme setting
  useEffect(() => {
    if (settings.theme === "dark" || settings.theme === "muted") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [settings.theme]);

  // Fullscreen State and change listeners
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    // Initial sync
    handleFullscreenChange();
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Cleanup: exit fullscreen when leaving the reader view
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  /**
   * Detects controls and overlays whose clicks should not trigger immersive reader behavior.
   */
  const isInteractiveTarget = (target: HTMLElement) => {
    return !!target.closest(
      "button, input, textarea, select, a, " +
        "#reader-hud-header, #reader-footer, #typo-panel-sec, " +
        "#selection-floating-menu, #ai-response-popover, #chapter-edge-nav, #toast-notification"
    );
  };

  /**
   * Enters fullscreen only for direct reading-surface clicks, leaving controls interactive.
   */
  const handleGlobalClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (isInteractiveTarget(target)) {
      return;
    }

    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("Fullscreen request blocked or failed:", err);
      });
    }
  };

  // HUD disappear timers
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // AI Popover state
  const [aiState, setAiState] = useState<{
    visible: boolean;
    type: "define" | "explain" | "summarize";
    inputText: string;
    result: any;
    loading: boolean;
    error: string | null;
  }>({
    visible: false,
    type: "define",
    inputText: "",
    result: null,
    loading: false,
    error: null,
  });

  // Toast / Floating message notification
  const [notification, setNotification] = useState<{ text: string; onUndo?: () => void } | null>(null);
  const [toastTimeoutId, setToastTimeoutId] = useState<any>(null);

  const currentBookMetaRef = useRef(currentBookMeta);

  useEffect(() => {
    currentBookMetaRef.current = currentBookMeta;
  }, [currentBookMeta]);

  /**
   * Persists settled layout progress after measurement completes.
   */
  const saveSettledLayoutProgress = useCallback((unitIndex: number, unitCount: number) => {
    const meta = currentBookMetaRef.current;
    if (!meta) return;

    const percent = unitCount > 1 ? (unitIndex / (unitCount - 1)) * 100 : 0;
    const updatedMeta: Book = {
      ...meta,
      lastOpenedAt: new Date().toISOString(),
      progress: {
        chapterIndex: currentChapterIdx,
        scrollPercent: Number(percent.toFixed(2)),
      },
    };
    setCurrentBookMeta(updatedMeta);
    storage.saveBookMetadata(updatedMeta).catch((e) => console.error("Auto progress save failed", e));
  }, [currentChapterIdx]);

  const {
    containerRef,
    unitIndex,
    setUnitIndex,
    unitCount,
    viewportWidth,
    unitStride,
    unitsPerViewport,
    layoutSettled,
    suppressAnimation,
    setSuppressAnimation,
    setPendingPageAction,
    viewportWidthStyle,
    markLayoutUnsettled,
  } = useReaderLayout({
    loading,
    chapterContent,
    settings,
    currentChapterIdx,
    sourcePercent: currentBookMeta?.progress?.scrollPercent || 0,
    columnGap: COLUMN_GAP,
    onLayoutSettled: saveSettledLayoutProgress,
  });

  const chapterPageIndex = unitIndex;
  const totalChapterPages = unitCount;

  const activeChapterRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (showChapterBarPanel && activeChapterRef.current) {
      requestAnimationFrame(() => {
        activeChapterRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
      });
    }
  }, [showChapterBarPanel, currentChapterIdx]);

  // Manage HUD show/hide timeouts
  /**
   * Keeps the HUD visible during interaction and hides it after reader inactivity.
   */
  const refreshHudTimeout = useCallback(() => {
    setHudVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    
    timerRef.current = setTimeout(() => {
      // Don't auto-hide HUD if configuration dialog or AI result is open
      if (!showTypography && !aiState.visible) {
        setHudVisible(false);
      }
    }, 2500);
  }, [showTypography, aiState.visible]);

  useEffect(() => {
    refreshHudTimeout();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refreshHudTimeout]);

  // Handle Mouse Move anywhere to display HUD
  /**
   * Refreshes the HUD timer when the reader detects pointer movement.
   */
  const handleMouseMove = () => {
    refreshHudTimeout();
  };

  // Trigger self-dismissing toast notifications
  /**
   * Displays a temporary reader notification, optionally with a single undo action.
   */
  const showToast = (txt: string, onUndo?: () => void) => {
    if (toastTimeoutId) {
      clearTimeout(toastTimeoutId);
    }
    setNotification({ text: txt, onUndo });
    const timer = setTimeout(() => {
      setNotification(null);
    }, onUndo ? 5000 : 2800);
    setToastTimeoutId(timer);
  };

  // Fetch file & parse EPUB
  useEffect(() => {
    const initializeBook = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch raw binary file from IDB
        const fileBytes = await storage.getBookFile(bookId);
        if (!fileBytes) {
          throw new Error("Local book binary data file not found in database.");
        }

        // 2. Parse EPUB Structure
        const parsed = await parseEpub(fileBytes);

        // 3. Load Book Metadata (from IDB)
        const booksList = await storage.getAllBooks();
        const thisBook = booksList.find((b) => b.id === bookId);

        if (thisBook) {
          const lastIdx = thisBook.progress ? thisBook.progress.chapterIndex : 0;
          const restoredChapterIdx =
            lastIdx >= 0 && lastIdx < parsed.chapters.length ? lastIdx : 0;

          setParsedBook(parsed);
          setChapters(parsed.chapters);
          setCurrentBookMeta(thisBook);
          setCurrentChapterIdx(restoredChapterIdx);
        } else {
          throw new Error("Metadata for selected book not found.");
        }

        // Update last opened timeline
        if (thisBook) {
          await storage.saveBookMetadata({
            ...thisBook,
            lastOpenedAt: new Date().toISOString(),
          });
        }

        // 4. Load initial collections
        const dbHighlights = await storage.getBookHighlights(bookId);
        setHighlights(dbHighlights);
        const dbWords = await storage.getBookSavedWords(bookId);
        setSavedWords(dbWords);

      } catch (err: any) {
        console.error("Reader initialization failed:", err);
        setError(err.message || "An issue occurred while loading this EPUB reader engine.");
      } finally {
        setLoading(false);
      }
    };

    initializeBook();
  }, [bookId]);

  // Read raw highlights for the current book
  /**
   * Reloads persisted highlights for the active book after a highlight mutation.
   */
  const loadHighlights = async () => {
    const dbHighlights = await storage.getBookHighlights(bookId);
    setHighlights(dbHighlights);
  };

  /**
   * Reloads persisted saved vocabulary entries for the active book.
   */
  const loadSavedWords = async () => {
    const dbWords = await storage.getBookSavedWords(bookId);
    setSavedWords(dbWords);
  };

  // Load active chapter content when chapter index changes
  useEffect(() => {
    if (!parsedBook || chapters.length === 0) return;

    const loadChapter = async () => {
      try {
        setLoading(true);
        markLayoutUnsettled();
        const activeChapter = chapters[currentChapterIdx];
        
        // Load, rewrite images, scrape styles
        const html = await loadChapterContent(parsedBook.zipInstance, activeChapter.zipPath);
        setChapterContent(html);

        if (containerRef.current) {
          containerRef.current.scrollLeft = 0;
        }
      } catch (e) {
        console.error("Failed to load chapter content:", e);
        setChapterContent("<p class='error'>Failed loading chapter text. The page might be corrupted or missing.</p>");
      } finally {
        setLoading(false);
      }
    };

    loadChapter();
  }, [currentChapterIdx, parsedBook, chapters, markLayoutUnsettled, containerRef]);

  // Helper to save reading progress as percentage based on current page
  /**
   * Persists the reader's current chapter and page as percentage-based progress.
   */
  const saveReadingProgress = (pageIdx: number, totalPages: number) => {
    if (!currentBookMeta) return;
    const percent = totalPages > 1 ? (pageIdx / (totalPages - 1)) * 100 : 0;
    
    const updatedMeta: Book = {
      ...currentBookMeta,
      lastOpenedAt: new Date().toISOString(),
      progress: {
        chapterIndex: currentChapterIdx,
        scrollPercent: Number(percent.toFixed(2)),
      },
    };
    setCurrentBookMeta(updatedMeta);
    
    const timeoutId = (window as any)._dbSaveTimeout;
    if (timeoutId) clearTimeout(timeoutId);
    (window as any)._dbSaveTimeout = setTimeout(() => {
      storage.saveBookMetadata(updatedMeta).catch((e) => console.error("Auto progress save failed", e));
    }, 800);
  };

  // Centralized page turning handlers
  /**
   * Advances within the chapter or moves to the first page of the next chapter.
   */
  const handleNextPage = () => {
    if (chapterPageIndex < totalChapterPages - 1) {
      const nextP = chapterPageIndex + 1;
      setSuppressAnimation(false);
      setUnitIndex(nextP);
      saveReadingProgress(nextP, totalChapterPages);
    } else {
      if (currentChapterIdx < chapters.length - 1) {
        setSuppressAnimation(true);
        setPendingPageAction("first");
        setCurrentChapterIdx((prev) => prev + 1);
      } else {
        showToast("You have reached the end of the book.");
      }
    }
  };

  /**
   * Moves backward within the chapter or to the last page of the previous chapter.
   */
  const handlePrevPage = () => {
    if (chapterPageIndex > 0) {
      const prevP = chapterPageIndex - 1;
      setSuppressAnimation(false);
      setUnitIndex(prevP);
      saveReadingProgress(prevP, totalChapterPages);
    } else {
      if (currentChapterIdx > 0) {
        setSuppressAnimation(true);
        setPendingPageAction("last");
        setCurrentChapterIdx((prev) => prev - 1);
      } else {
        showToast("You are at the very beginning of the book.");
      }
    }
  };

  // Highlights injector implementation
  /**
   * Produces the chapter HTML with reader-managed highlights and the optional front-cover header.
   */
  const getRenderHtml = () => {
    let content = chapterContent;
    if (!content) return "";
    
    // Highlights applicable only for this chapter path
    const chapterHighlights = highlights.filter((h) => h.chapterIndex === currentChapterIdx);
    
    if (chapterHighlights.length > 0) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/html");
      
      // Sort highlights from longest text to shortest
      const sorted = [...chapterHighlights].sort((a, b) => b.text.length - a.text.length);
      
      const traverse = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || "";
          let parent = node.parentNode;
          if (
            !parent ||
            parent.nodeName === "SCRIPT" ||
            parent.nodeName === "STYLE" ||
            (parent instanceof HTMLElement && parent.getAttribute("data-highlight-id"))
          ) {
            return;
          }
          
          for (const h of sorted) {
            const index = text.toLowerCase().indexOf(h.text.toLowerCase());
            if (index !== -1) {
              const beforeText = text.substring(0, index);
              const matchText = text.substring(index, index + h.text.length);
              const afterText = text.substring(index + h.text.length);
              
              const fragment = document.createDocumentFragment();
              if (beforeText) {
                fragment.appendChild(document.createTextNode(beforeText));
              }
              
              const span = document.createElement("span");
              span.className = `${h.color} cursor-pointer relative py-0.5 select-all hover:opacity-95 transition-opacity`;
              span.setAttribute("data-highlight-id", h.id);
              span.title = "Delete highlight";
              span.appendChild(document.createTextNode(matchText));
              fragment.appendChild(span);
              
              if (afterText) {
                const remainingTextNode = document.createTextNode(afterText);
                fragment.appendChild(remainingTextNode);
                // Traverse subsequent text nodes
                traverse(remainingTextNode);
              }
              
              parent.replaceChild(fragment, node);
              break;
            }
          }
        } else {
          const children = Array.from(node.childNodes);
          for (const child of children) {
            traverse(child);
          }
        }
      };
      
      traverse(doc.body);
      content = doc.body.innerHTML;
    }

    // Prepend custom front cover header inside the columns for chapter 0
    if (currentChapterIdx === 0 && parsedBook) {
      const coverHtml = `
        <div class="mb-10 pb-6 border-b border-black/10 dark:border-white/10 text-center select-none animate-in fade-in duration-300" style="break-inside: avoid-column; break-after: auto;" id="book-front-cover">
          <h1 class="font-serif font-bold text-3xl md:text-4xl my-2 text-center leading-tight border-none pb-0">
            ${parsedBook.title}
          </h1>
          <p class="font-sans text-[10px] uppercase tracking-widest text-black/50 dark:text-white/50 font-bold mb-8">
            by ${parsedBook.author}
          </p>
        </div>
      `;
      content = coverHtml + content;
    }

    return content;
  };

  // Handle direct click on highlights within the XHTML document to delete them
  /**
   * Handles direct interactions inside chapter HTML, including highlight deletion.
   */
  const handleChapterClick = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const highlightId = target.getAttribute("data-highlight-id");
    if (highlightId) {
      const existingHl = highlights.find((h) => h.id === highlightId);
      if (existingHl) {
        await storage.deleteHighlight(highlightId);
        await loadHighlights();
        showToast("Highlight removed.", async () => {
          await storage.saveHighlight(existingHl);
          await loadHighlights();
          showToast("Highlight restored.");
        });
      }
    }
  };

  // Text selection handler callbacks from floating SelectionMenu
  /**
   * Formats optional-AI failures without implying that offline reading actions are broken.
   */
  const getAIErrorMessage = (err: any, actionLabel: string) => {
    const detail = err?.message ? `${err.message} ` : "";
    return `${detail}${actionLabel} is unavailable. Reading, copy, save, and highlight still work offline.`;
  };

  /**
   * Applies the selected-text command requested by the floating selection menu.
   */
  const handleSelectionAction = async (
    action: "copy" | "define" | "explain" | "save" | "highlight",
    extra?: string,
    selectedTextOverride?: string
  ) => {
    const selection = window.getSelection();

    const text = (selection?.toString() || selectedTextOverride || "").trim();
    if (!text) return;

    // Retrieve context node sentence
    const contextNode = selection?.anchorNode?.parentNode;
    const sentenceContext = contextNode?.textContent || text;

    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(text);
        showToast("Copied selected text.");
      } catch (err) {
        console.error("Copy selected text failed:", err);
        showToast("Copy failed. Use Ctrl+C while the text is selected.");
      } finally {
        selection?.removeAllRanges();
      }

    } else if (action === "highlight") {
      const colorClass = extra || "custom-highlight-yellow";
      const newHl: Highlight = {
        id: `hl_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        bookId,
        chapterIndex: currentChapterIdx,
        text,
        color: colorClass,
        createdAt: new Date().toISOString(),
      };

      await storage.saveHighlight(newHl);
      await loadHighlights();
      showToast("Highlight added.");
      selection?.removeAllRanges();

    } else if (action === "save") {
      // Save word callback (defines dynamically with AI behind the scenes!)
      const wordId = `word_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      const newSaved: SavedWord = {
        id: wordId,
        bookId,
        word: text,
        sentenceContext,
        createdAt: new Date().toISOString(),
      };

      await storage.saveSavedWord(newSaved);
      await loadSavedWords();
      showToast(`Saved "${text}" to vocabulary.`);

      // Lazily request definition for background enhancement!
      try {
        const enriched = await triggerAIAction({
          action: "define",
          word: text,
          context: sentenceContext,
          bookTitle: parsedBook?.title,
        });

        if (enriched) {
          await storage.saveSavedWord({
            ...newSaved,
            definition: enriched.definition,
            contextualMeaning: enriched.contextualMeaning,
            simpleExample: enriched.simpleExample,
          });
          await loadSavedWords();
        }
      } catch (err) {
        console.error("Failed to fetch vocabulary word description background enrichment:", err);
      }

    } else if (action === "define") {
      // Open AI Popover
      setAiState({
        visible: true,
        type: "define",
        inputText: text,
        result: null,
        loading: true,
        error: null,
      });

      try {
        const res = await triggerAIAction({
          action: "define",
          word: text,
          context: sentenceContext,
          bookTitle: parsedBook?.title,
        });

        setAiState((prev) => ({ ...prev, loading: false, result: res }));
      } catch (err: any) {
        setAiState((prev) => ({ ...prev, loading: false, error: getAIErrorMessage(err, "AI definition") }));
      }

    } else if (action === "explain") {
      setAiState({
        visible: true,
        type: "explain",
        inputText: text,
        result: null,
        loading: true,
        error: null,
      });

      try {
        const res = await triggerAIAction({
          action: "explain",
          text,
          bookTitle: parsedBook?.title,
        });

        setAiState((prev) => ({ ...prev, loading: false, result: res }));
      } catch (err: any) {
        setAiState((prev) => ({ ...prev, loading: false, error: getAIErrorMessage(err, "AI explanation") }));
      }
    }
  };

  // Keyboard Navigation & global listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes current overlays
      if (e.key === "Escape") {
        if (showTypography) setShowTypography(false);
        else if (aiState.visible) setAiState((prev) => ({ ...prev, visible: false }));
        return;
      }

      // Prev chapter on left arrow, next on right arrow (no input field overlay blocks active)
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }

      // Automatically request fullscreen on reading navigation keyboard interaction
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextPage();
      } else if (e.key === "t" || e.key === "T") {
        // Toggle settings
        e.preventDefault();
        setShowTypography((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showTypography, aiState.visible, currentChapterIdx, chapters, chapterPageIndex, totalChapterPages]);

  // Chapter Summarization callback (from HUD sparking action)
  /**
   * Sends the current chapter text to the optional AI summarizer and displays the result.
   */
  const handleSummarizeChapter = async () => {
    if (!chapterContent) return;
    
    // Scrape clean text nodes for summarizer context
    const cleanText = document.getElementById("reader-chapter-body")?.innerText || "Unknown text content.";
    
    setAiState({
      visible: true,
      type: "summarize",
      inputText: `Chapter ${currentChapterIdx + 1}: ${chapters[currentChapterIdx]?.title || 'Section'}`,
      result: null,
      loading: true,
      error: null,
    });

    try {
      const res = await triggerAIAction({
        action: "summarize",
        text: cleanText.slice(0, 8000), // safe length
        bookTitle: parsedBook?.title,
      });

      setAiState((prev) => ({ ...prev, loading: false, result: res }));
    } catch (err: any) {
      setAiState((prev) => ({ ...prev, loading: false, error: err.message || "An issue occurred invoking Gemini." }));
    }
  };

  // Change font sizes helper
  /**
   * Persists typography and layout settings while prompting pagination to settle again.
   */
  const handleSettingsChange = (newSettings: ReaderSettings) => {
    markLayoutUnsettled();
    setSettings(newSettings);
    storage.saveReaderSettings(newSettings);
  };

  // Theme map helper definitions
  /**
   * Maps the persisted reader theme to the wrapper, header, and footer class groups.
   */
  const getThemeClass = (t: ReaderTheme) => {
    switch (t) {
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
  };

  if (loading && !chapterContent) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-white dark:bg-black text-black dark:text-white" id="read-loader">
        <p className="text-[10px] font-sans uppercase tracking-widest font-bold animate-pulse">Opening reader workspace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center p-6 bg-white dark:bg-black text-center text-black dark:text-white" id="read-error">
        <h3 className="font-serif italic text-xl mb-2">Could not initialize book</h3>
        <p className="text-xs text-black/60 dark:text-white/60 max-w-sm mb-6 leading-relaxed">{error}</p>
        <button
          onClick={onBackToLibrary}
          id="btn-back-err"
          className="px-5 py-2 bg-black dark:bg-white text-white dark:text-black rounded-sm border border-black dark:border-white font-sans text-[10px] uppercase tracking-widest font-bold hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white transition-all cursor-pointer"
        >
          Return to Library
        </button>
      </div>
    );
  }

  const themeStyle = getThemeClass(settings.theme);
  const activeChapter = chapters[currentChapterIdx];
  const visiblePageCount = unitsPerViewport;
  const viewportTopClass = isFullscreen ? "top-6" : "top-16";
  const viewportBottomClass = isFullscreen ? "bottom-6" : "bottom-12";

  return (
    <ReaderShell
      hudVisible={hudVisible}
      themeStyle={themeStyle}
      bookTitle={parsedBook?.title}
      activeChapterTitle={activeChapter?.title}
      showSettings={showTypography}
      onMouseMove={handleMouseMove}
      onClick={handleGlobalClick}
      onBackToLibrary={onBackToLibrary}
      onSummarizeChapter={handleSummarizeChapter}
      onToggleSettings={() => setShowTypography(!showTypography)}
    >
      <ReaderSettingsPanel
        visible={showTypography}
        settings={settings}
        onChange={handleSettingsChange}
        onClose={() => setShowTypography(false)}
      />

      {/* 3. AI Side Popover */}
      {aiState.visible && (
        <AIResponsePopover
          type={aiState.type}
          inputText={aiState.inputText}
          result={aiState.result}
          loading={aiState.loading}
          error={aiState.error}
          onClose={() => setAiState((prev) => ({ ...prev, visible: false }))}
          onRetry={() => {
            if (aiState.type === "summarize") handleSummarizeChapter();
            else handleSelectionAction(aiState.type, undefined, aiState.inputText);
          }}
        />
      )}

      {/* 4. Selection Floating Menu Overlay */}
      <SelectionMenu
        onAction={handleSelectionAction}
        onClose={() => {}}
      />
      {/* 5. Clean Reader Column stage */}
      <div
        ref={containerRef}
        id="reader-scroll-viewport"
        style={{
          width: viewportWidthStyle,
        }}
        className={`absolute left-1/2 -translate-x-1/2 overflow-x-hidden overflow-y-hidden no-scrollbar transition-all duration-300 ${viewportTopClass} ${viewportBottomClass}`}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            transform: `translate3d(-${chapterPageIndex * unitStride}px, 0, 0)`,
            transition: suppressAnimation 
              ? "opacity 0.15s ease-in-out" 
              : "transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease-in-out",
            opacity: (loading || !layoutSettled) ? 0 : 1,
          }}
          className="mx-auto px-0 h-full py-2 relative"
          id="reader-column"
        >
          {/* Core Chapter HTML body render (Premium custom typographies binding) */}
          <div
            id="reader-chapter-body"
            onClick={handleChapterClick}
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              fontFamily: settings.fontFamily === "Source Serif" ? "'Source Serif 4', Georgia, serif" : `'${settings.fontFamily}', Georgia, serif`,
              columnCount: visiblePageCount,
              columnGap: `${COLUMN_GAP}px`,
              height: "100%",
              columnFill: "auto",
            }}
            className={`epub-content select-text font-serif leading-relaxed text-left antialiased focus:outline-none h-full`}
            dangerouslySetInnerHTML={{ __html: getRenderHtml() }}
          />

        </div>
      </div>

      {/* 6. Marginally subtle sidebar clickable columns to navigate (Invisible) */}
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

      {chapters.length > 1 && !showTypography && !aiState.visible && (
        <ChapterRail
          chapters={chapters}
          currentChapterIndex={currentChapterIdx}
          theme={settings.theme}
          showChapterBarPanel={showChapterBarPanel}
          showChapterLines={showChapterLines}
          activeChapterRef={activeChapterRef}
          onShowChapterLines={() => setShowChapterLines(true)}
          onHideRail={() => {
            setShowChapterLines(false);
            setShowChapterBarPanel(false);
          }}
          onShowChapterPanel={() => setShowChapterBarPanel(true)}
          onSelectChapter={(idx) => {
            setSuppressAnimation(true);
            setPendingPageAction("first");
            setCurrentChapterIdx(idx);
          }}
        />
      )}

      <ReaderFooter
        hudVisible={hudVisible}
        footerClassName={themeStyle.footer}
        currentChapterIndex={currentChapterIdx}
        currentPageIndex={chapterPageIndex}
        totalPages={totalChapterPages}
        totalChapters={chapters.length}
        progressPercent={currentBookMeta?.progress?.scrollPercent || 0}
        onPreviousPage={handlePrevPage}
        onNextPage={handleNextPage}
      />

      {/* 8. Self dismissed notification toast layout block */}
      {notification && (
        <div
          id="toast-notification"
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-sm border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 shadow-xl text-[10px] font-sans font-bold uppercase tracking-wider flex items-center justify-between gap-6 select-none animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-black dark:text-white">{notification.text}</span>
          </div>
          {notification.onUndo && (
            <button
              onClick={() => {
                if (notification.onUndo) {
                  notification.onUndo();
                }
                setNotification(null);
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
