/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Book, Highlight, SavedWord, ReaderSettings, ReaderTheme } from "../../types";
import { DEFAULT_READER_SETTINGS, storage } from "@/features/storage";
import { parseEpub, loadChapterContent, ParsedBook, ParsedChapter } from "../../utils/epubParser";
// No icons needed for text-only interface
import SelectionMenu from "./SelectionMenu";
import AIResponsePopover from "./AIResponsePopover";
import VocabularyPanel from "./VocabularyPanel";
import { triggerAIAction } from "../../utils/aiClient";
import { captureHighlightAnchor, restoreHighlights } from "../../utils/highlightAnchors";
import { ChapterRail, ReaderFooter, ReaderSettingsPanel, ReaderShell } from "./index";
import { clampSourcePercent, READER_COLUMN_GAP, ReaderPositionAction } from "./readerLayout";
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
  const [settingsReady, setSettingsReady] = useState(false);

  const [showChapterBarPanel, setShowChapterBarPanel] = useState(false);
  const [showChapterLines, setShowChapterLines] = useState(false);

  // Reader HUD Control States
  const [hudVisible, setHudVisible] = useState(true);
  const [showTypography, setShowTypography] = useState(false);
  const [showVocabulary, setShowVocabulary] = useState(false);

  // Active highlights & Vocab
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);

  // Reader Settings
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_READER_SETTINGS);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
  const aiRequestControllerRef = useRef<AbortController | null>(null);

  const cancelAIRequest = useCallback(() => {
    aiRequestControllerRef.current?.abort();
    aiRequestControllerRef.current = null;
  }, []);

  useEffect(() => () => cancelAIRequest(), [cancelAIRequest]);

  useEffect(() => {
    let active = true;
    storage.getReaderSettings().then((storedSettings) => {
      if (active) setSettings(storedSettings);
    }).catch((err) => {
      console.error("Reader settings could not be loaded:", err);
      if (active) setError("Reader settings could not be loaded from local storage.");
    }).finally(() => {
      if (active) setSettingsReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const currentBookMetaRef = useRef(currentBookMeta);
  const currentChapterIndexRef = useRef(currentChapterIdx);
  currentBookMetaRef.current = currentBookMeta;
  currentChapterIndexRef.current = currentChapterIdx;

  const layout = useReaderLayout({
    contentReady: settingsReady && !loading && !error && !!chapterContent,
    contentKey: `${bookId}:${currentChapterIdx}`,
    layoutKey: [settings.fontFamily, settings.fontSize, settings.lineHeight, settings.contentWidth, settings.viewMode].join(":"),
    savedProgressPercent: currentBookMeta?.progress?.scrollPercent || 0,
  });

  useEffect(() => {
    layout.setNextPosition("restore");
    setLoading(true);
    setChapterContent("");
  }, [bookId, layout.setNextPosition]);

  // Sync document root dark class list with theme setting
  useEffect(() => {
    if (settings.theme === "dark" || settings.theme === "muted") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [settings.theme]);

  // Fullscreen State and change listeners
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

  // HUD disappear timers
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Toast / Floating message notification
  const [notification, setNotification] = useState<{ text: string; onUndo?: () => void } | null>(null);
  const [toastTimeoutId, setToastTimeoutId] = useState<any>(null);
  const progressSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const settingsSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const readerDisposedRef = useRef(false);

  useEffect(() => {
    readerDisposedRef.current = false;
    return () => {
      readerDisposedRef.current = true;
    };
  }, []);

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
      const focusedControl = document.activeElement instanceof HTMLElement &&
        !!document.activeElement.closest("button, input, textarea, select, a, [role='button']");
      if (!showTypography && !aiState.visible && !focusedControl) {
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

  useEffect(() => {
    document.addEventListener("focusin", refreshHudTimeout);
    document.addEventListener("focusout", refreshHudTimeout);
    return () => {
      document.removeEventListener("focusin", refreshHudTimeout);
      document.removeEventListener("focusout", refreshHudTimeout);
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
    let active = true;
    const initializeBook = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch raw binary file from IDB
        const fileBytes = await storage.getBookFile(bookId);
        if (!active) return;
        if (!fileBytes) {
          throw new Error("Local book binary data file not found in database.");
        }

        // 2. Parse EPUB Structure
        const parsed = await parseEpub(fileBytes);
        if (!active) return;
        setParsedBook(parsed);
        setChapters(parsed.chapters);

        // 3. Load Book Metadata (from IDB)
        const booksList = await storage.getAllBooks();
        if (!active) return;
        const thisBook = booksList.find((b) => b.id === bookId);

        if (thisBook) {
          const openedBook = { ...thisBook, lastOpenedAt: new Date().toISOString() };
          currentBookMetaRef.current = openedBook;
          setCurrentBookMeta(openedBook);
          // Restore last chapter index
          const lastIdx = thisBook.progress ? thisBook.progress.chapterIndex : 0;
          const restoredChapter = lastIdx >= 0 && lastIdx < parsed.chapters.length ? lastIdx : 0;
          currentChapterIndexRef.current = restoredChapter;
          setCurrentChapterIdx(restoredChapter);
          await storage.saveBookMetadata(openedBook);
        } else {
          throw new Error("Metadata for selected book not found.");
        }

        // 4. Load initial collections
        const dbHighlights = await storage.getBookHighlights(bookId);
        if (!active) return;
        setHighlights(dbHighlights);
        const dbWords = await storage.getBookSavedWords(bookId);
        if (!active) return;
        setSavedWords(dbWords);

      } catch (err: any) {
        console.error("Reader initialization failed:", err);
        if (active) setError(err.message || "An issue occurred while loading this EPUB reader engine.");
      } finally {
        if (active) setLoading(false);
      }
    };

    initializeBook();
    return () => {
      active = false;
    };
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

  const handleDeleteSavedWord = async (word: SavedWord) => {
    try {
      await storage.deleteSavedWord(word.id);
      await loadSavedWords();
      showToast("Saved word removed.");
    } catch (err) {
      console.error("Could not remove saved word:", err);
      showToast("Could not remove saved word.");
    }
  };

  // Load active chapter content when chapter index changes
  useEffect(() => {
    if (!parsedBook || chapters.length === 0) return;
    const activeChapter = chapters[currentChapterIdx];
    if (!activeChapter) return;
    let active = true;
    const imageUrls: string[] = [];

    const loadChapter = async () => {
      try {
        setLoading(true);
        // Load, rewrite images, scrape styles
        const html = await loadChapterContent(parsedBook.zipInstance, activeChapter.zipPath, url => {
          if (active) imageUrls.push(url);
          else URL.revokeObjectURL(url);
        });
        if (!active) return;
        setChapterContent(html);

        if (layout.containerRef.current) {
          layout.containerRef.current.scrollLeft = 0;
        }
      } catch (e) {
        console.error("Failed to load chapter content:", e);
        if (active) {
          setChapterContent("<p class='error'>Failed loading chapter text. The page might be corrupted or missing.</p>");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadChapter();
    return () => {
      active = false;
      imageUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [currentChapterIdx, parsedBook, chapters]);

  // Helper to save reading progress as a normalized chapter position
  /**
   * Persists the reader's current chapter and movement unit as normalized progress.
   */
  const saveReadingProgress = (chapterIndex: number, sourcePercent: number) => {
    const bookMeta = currentBookMetaRef.current;
    if (!bookMeta || bookMeta.id !== bookId) return;
    const updatedMeta: Book = {
      ...bookMeta,
      lastOpenedAt: new Date().toISOString(),
      progress: {
        chapterIndex,
        scrollPercent: Number(clampSourcePercent(sourcePercent).toFixed(2)),
      },
    };
    currentBookMetaRef.current = updatedMeta;
    setCurrentBookMeta(updatedMeta);
    progressSaveQueueRef.current = progressSaveQueueRef.current
      .catch(() => {})
      .then(() => readerDisposedRef.current ? undefined : storage.saveBookMetadata(updatedMeta))
      .catch((e) => console.error("Auto progress save failed", e));
  };

  useEffect(() => {
    if (!layout.layoutSettled || loading || !settingsReady) return;
    saveReadingProgress(currentChapterIdx, layout.getSourcePercent());
  }, [layout.layoutSettled, layout.getSourcePercent, currentChapterIdx, loading, settingsReady, bookId]);

  const navigateToChapter = (targetChapter: number, position: ReaderPositionAction) => {
    if (!chapters.length) return;
    const nextChapter = Math.min(chapters.length - 1, Math.max(0, targetChapter));
    if (nextChapter === currentChapterIndexRef.current) {
      layout.requestPosition(position);
      return;
    }

    saveReadingProgress(nextChapter, position === "last" ? 100 : 0);
    layout.setNextPosition(position);
    setLoading(true);
    currentChapterIndexRef.current = nextChapter;
    setCurrentChapterIdx(nextChapter);
  };

  const handleBackToLibrary = async () => {
    await progressSaveQueueRef.current;
    onBackToLibrary();
  };

  // Centralized page turning handlers
  /**
   * Advances within the chapter or moves to the first page of the next chapter.
   */
  const handleNextPage = () => {
    if (!layout.layoutSettled) return;
    const { unitIndex, unitCount } = layout.getPosition();
    if (unitIndex < unitCount - 1) {
      layout.goToUnit(unitIndex + 1);
      saveReadingProgress(currentChapterIndexRef.current, layout.getSourcePercent());
    } else {
      if (currentChapterIndexRef.current < chapters.length - 1) {
        navigateToChapter(currentChapterIndexRef.current + 1, "first");
      } else {
        showToast("You have reached the end of the book.");
      }
    }
  };

  /**
   * Moves backward within the chapter or to the last page of the previous chapter.
   */
  const handlePrevPage = () => {
    if (!layout.layoutSettled) return;
    const { unitIndex } = layout.getPosition();
    if (unitIndex > 0) {
      layout.goToUnit(unitIndex - 1);
      saveReadingProgress(currentChapterIndexRef.current, layout.getSourcePercent());
    } else {
      if (currentChapterIndexRef.current > 0) {
        navigateToChapter(currentChapterIndexRef.current - 1, "last");
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
    
    const chapterHighlights = highlights.filter((h) => h.chapterIndex === currentChapterIdx);
    if (chapterHighlights.length) content = restoreHighlights(content, chapterHighlights);

    // Prepend custom front cover header inside the columns for chapter 0
    if (currentChapterIdx === 0 && parsedBook) {
      const title = escapeHtml(parsedBook.title);
      const author = escapeHtml(parsedBook.author);
      const coverHtml = `
        <div class="mb-10 pb-6 border-b border-black/10 dark:border-white/10 text-center select-none animate-in fade-in duration-300" style="break-inside: avoid-column; break-after: auto;" id="book-front-cover">
          <h1 class="font-serif font-bold text-3xl md:text-4xl my-2 text-center leading-tight border-none pb-0">
            ${title}
          </h1>
          <p class="font-sans text-[10px] uppercase tracking-widest text-black/50 dark:text-white/50 font-bold mb-8">
            by ${author}
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
      const highlightRoot = layout.contentRef.current;
      const selectedRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const anchor = highlightRoot && selectedRange
        ? captureHighlightAnchor(highlightRoot, selectedRange)
        : {};
      const newHl: Highlight = {
        id: `hl_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        bookId,
        chapterIndex: currentChapterIdx,
        text,
        color: colorClass,
        createdAt: new Date().toISOString(),
        ...anchor,
      };

      await storage.saveHighlight(newHl);
      await loadHighlights();
      showToast("Highlight added.");
      selection?.removeAllRanges();

    } else if (action === "save") {
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

    } else if (action === "define") {
      setShowVocabulary(false);
      cancelAIRequest();
      const controller = new AbortController();
      aiRequestControllerRef.current = controller;
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
        }, { signal: controller.signal });

        if (aiRequestControllerRef.current === controller) {
          setAiState((prev) => ({ ...prev, loading: false, result: res }));
        }
      } catch (err: any) {
        if (!controller.signal.aborted && aiRequestControllerRef.current === controller) {
          setAiState((prev) => ({ ...prev, loading: false, error: getAIErrorMessage(err, "AI definition") }));
        }
      } finally {
        if (aiRequestControllerRef.current === controller) aiRequestControllerRef.current = null;
      }

    } else if (action === "explain") {
      setShowVocabulary(false);
      cancelAIRequest();
      const controller = new AbortController();
      aiRequestControllerRef.current = controller;
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
        }, { signal: controller.signal });

        if (aiRequestControllerRef.current === controller) {
          setAiState((prev) => ({ ...prev, loading: false, result: res }));
        }
      } catch (err: any) {
        if (!controller.signal.aborted && aiRequestControllerRef.current === controller) {
          setAiState((prev) => ({ ...prev, loading: false, error: getAIErrorMessage(err, "AI explanation") }));
        }
      } finally {
        if (aiRequestControllerRef.current === controller) aiRequestControllerRef.current = null;
      }
    }
  };

  // Keyboard Navigation & global listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes current overlays
      if (e.key === "Escape") {
        if (showTypography) setShowTypography(false);
        else if (aiState.visible) {
          cancelAIRequest();
          setAiState((prev) => ({ ...prev, visible: false }));
        } else if (showVocabulary) setShowVocabulary(false);
        return;
      }

      // Prev chapter on left arrow, next on right arrow (no input field overlay blocks active)
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
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
        setShowVocabulary(false);
        setShowTypography((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showTypography, aiState.visible, showVocabulary, cancelAIRequest, handlePrevPage, handleNextPage]);

  // Chapter Summarization callback (from HUD sparking action)
  /**
   * Sends the current chapter text to the optional AI summarizer and displays the result.
   */
  const handleSummarizeChapter = async () => {
    if (!chapterContent) return;
    setShowVocabulary(false);
    cancelAIRequest();
    const controller = new AbortController();
    aiRequestControllerRef.current = controller;
    
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
      }, { signal: controller.signal });

      if (aiRequestControllerRef.current === controller) {
        setAiState((prev) => ({ ...prev, loading: false, result: res }));
      }
    } catch (err: any) {
      if (!controller.signal.aborted && aiRequestControllerRef.current === controller) {
        setAiState((prev) => ({ ...prev, loading: false, error: getAIErrorMessage(err, "AI summary") }));
      }
    } finally {
      if (aiRequestControllerRef.current === controller) aiRequestControllerRef.current = null;
    }
  };

  // Change font sizes helper
  /**
   * Persists typography and layout settings while prompting pagination to settle again.
   */
  const handleSettingsChange = (newSettings: ReaderSettings) => {
    setSettings(newSettings);
    settingsSaveQueueRef.current = settingsSaveQueueRef.current
      .catch(() => {})
      .then(() => storage.saveReaderSettings(newSettings))
      .catch((err) => {
        console.error("Reader settings could not be saved:", err);
        if (!readerDisposedRef.current) showToast("Reader settings could not be saved.");
      });
  };

  const handleToggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (err) {
      console.warn("Fullscreen request blocked or failed:", err);
      showToast("Fullscreen could not be changed.");
    }
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

  if (!settingsReady || (loading && !chapterContent)) {
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
  const visiblePageCount = settings.viewMode === "split" && !layout.isNarrowViewport ? 2 : 1;
  const viewportMaxWidth = settings.contentWidth * visiblePageCount + (visiblePageCount - 1) * READER_COLUMN_GAP;
  const viewportWidthStr = layout.isNarrowViewport
    ? `min(calc(100vw - 32px), ${settings.contentWidth}px)`
    : `min(calc(100vw - 96px), ${viewportMaxWidth}px)`;
  const viewportTopClass = isFullscreen ? "top-6" : "top-16";
  const viewportBottomClass = isFullscreen ? "bottom-6" : "bottom-12";

  return (
    <ReaderShell
      hudVisible={hudVisible}
      themeStyle={themeStyle}
      bookTitle={parsedBook?.title}
      activeChapterTitle={activeChapter?.title}
      showSettings={showTypography}
      isFullscreen={isFullscreen}
      onMouseMove={handleMouseMove}
      onBackToLibrary={handleBackToLibrary}
      onSummarizeChapter={handleSummarizeChapter}
      onToggleSettings={() => {
        setShowVocabulary(false);
        setShowTypography(!showTypography);
      }}
      onToggleFullscreen={handleToggleFullscreen}
      showVocabulary={showVocabulary}
      onToggleVocabulary={() => {
        if (!showVocabulary) {
          setShowTypography(false);
          cancelAIRequest();
          setAiState((prev) => ({ ...prev, visible: false }));
        }
        setShowVocabulary((visible) => !visible);
      }}
    >
      <ReaderSettingsPanel
        visible={showTypography}
        settings={settings}
        onChange={handleSettingsChange}
        onClose={() => setShowTypography(false)}
      />

      {showVocabulary && (
        <VocabularyPanel
          words={savedWords}
          onClose={() => setShowVocabulary(false)}
          onDelete={handleDeleteSavedWord}
        />
      )}

      {/* 3. AI Side Popover */}
      {aiState.visible && !showVocabulary && (
        <AIResponsePopover
          type={aiState.type}
          inputText={aiState.inputText}
          result={aiState.result}
          loading={aiState.loading}
          error={aiState.error}
          onClose={() => {
            cancelAIRequest();
            setAiState((prev) => ({ ...prev, visible: false }));
          }}
          onRetry={() => {
            if (aiState.type === "summarize") handleSummarizeChapter();
            else handleSelectionAction(aiState.type, undefined, aiState.inputText);
          }}
        />
      )}

      {/* 4. Selection Floating Menu Overlay */}
      {!showVocabulary && <SelectionMenu onAction={handleSelectionAction} onClose={() => {}} />}
      {/* 5. Clean Reader Column stage */}
      <div
        ref={layout.containerRef}
        id="reader-scroll-viewport"
        style={{
          width: viewportWidthStr,
        }}
        className={`absolute left-1/2 -translate-x-1/2 overflow-x-hidden overflow-y-hidden no-scrollbar ${viewportTopClass} ${viewportBottomClass}`}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            transform: `translate3d(-${layout.unitIndex * layout.unitStride}px, 0, 0)`,
            transition: layout.suppressAnimation
              ? "opacity 0.15s ease-in-out" 
              : "transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease-in-out",
            opacity: (loading || !layout.layoutSettled) ? 0 : 1,
          }}
          className="mx-auto px-0 h-full py-2 relative"
          id="reader-column"
        >
          {/* Core Chapter HTML body render (Premium custom typographies binding) */}
          <div
            ref={layout.contentRef}
            id="reader-chapter-body"
        onClick={handleChapterClick}
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              fontFamily: settings.fontFamily === "Source Serif" ? "'Source Serif 4', Georgia, serif" : `'${settings.fontFamily}', Georgia, serif`,
              columnCount: visiblePageCount,
              columnGap: `${READER_COLUMN_GAP}px`,
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

      {chapters.length > 1 && !showTypography && !aiState.visible && !showVocabulary && (
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
          onSelectChapter={(idx) => navigateToChapter(idx, "first")}
        />
      )}

      <ReaderFooter
        hudVisible={hudVisible}
        footerClassName={themeStyle.footer}
        currentChapterIndex={currentChapterIdx}
        currentPageIndex={layout.unitIndex}
        totalPages={layout.unitCount}
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
