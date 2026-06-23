/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Book, Highlight, SavedWord, ReaderSettings, ReaderTheme, ReaderFont } from "../../types";
import {
  getBookFile,
  saveBookMetadata,
  getBookHighlights,
  saveHighlight,
  getBookSavedWords,
  saveSavedWord,
  getReaderSettings,
  saveReaderSettings,
  getAllBooks,
  deleteHighlight,
} from "../../utils/db";
import { parseEpub, loadChapterContent, ParsedBook, ParsedChapter } from "../../utils/epubParser";
// No icons needed for text-only interface
import SelectionMenu from "./SelectionMenu";
import TypographyPanel from "./TypographyPanel";
import AIResponsePopover from "./AIResponsePopover";
import { triggerAIAction } from "../../utils/aiClient";

interface ReaderViewProps {
  bookId: string;
  onBackToLibrary: () => void;
}

export default function ReaderView({ bookId, onBackToLibrary }: ReaderViewProps) {
  // EPUB Parser States
  const [parsedBook, setParsedBook] = useState<ParsedBook | null>(null);
  const [currentBookMeta, setCurrentBookMeta] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<ParsedChapter[]>([]);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [chapterContent, setChapterContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Page Navigation States
  const [chapterPageIndex, setChapterPageIndex] = useState(0);
  const [totalChapterPages, setTotalChapterPages] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [pendingPageAction, setPendingPageAction] = useState<"first" | "last" | "restore" | null>("restore");
  const [suppressAnimation, setSuppressAnimation] = useState(true);
  const [layoutSettled, setLayoutSettled] = useState(false);
  const [showChapterBarPanel, setShowChapterBarPanel] = useState(false);
  const [showChapterLines, setShowChapterLines] = useState(false);

  // Reader HUD Control States
  const [hudVisible, setHudVisible] = useState(true);
  const [showTypography, setShowTypography] = useState(false);
  const [showChapterIndex, setShowChapterIndex] = useState(false);

  // Active highlights & Vocab
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);

  // Reader Settings
  const [settings, setSettings] = useState<ReaderSettings>(getReaderSettings());

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

  const handleGlobalClick = (e: React.MouseEvent) => {
    // Avoid entering fullscreen when clicking controls or back button
    const target = e.target as HTMLElement;
    if (
      target.closest("#btn-reader-back") || 
      target.closest("#btn-close-typo") || 
      target.closest("#btn-close-chapters") ||
      target.closest("#typo-panel-sec") ||
      target.closest("#chapters-drawer")
    ) {
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

  // Selection Menu states
  const [selectionActive, setSelectionActive] = useState(false);

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

  const containerRef = useRef<HTMLDivElement>(null);
  const currentBookMetaRef = useRef(currentBookMeta);
  useEffect(() => {
    currentBookMetaRef.current = currentBookMeta;
  }, [currentBookMeta]);

  const activeChapterRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (showChapterBarPanel && activeChapterRef.current) {
      requestAnimationFrame(() => {
        activeChapterRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
      });
    }
  }, [showChapterBarPanel, currentChapterIdx]);

  // Manage HUD show/hide timeouts
  const refreshHudTimeout = useCallback(() => {
    setHudVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    
    timerRef.current = setTimeout(() => {
      // Don't auto-hide HUD if configuration dialog or chapter list index is open
      if (!showTypography && !showChapterIndex && !aiState.visible) {
        setHudVisible(false);
      }
    }, 2500);
  }, [showTypography, showChapterIndex, aiState.visible]);

  useEffect(() => {
    refreshHudTimeout();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refreshHudTimeout]);

  // Handle Mouse Move anywhere to display HUD
  const handleMouseMove = () => {
    refreshHudTimeout();
  };

  // Trigger self-dismissing toast notifications
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
        const fileBytes = await getBookFile(bookId);
        if (!fileBytes) {
          throw new Error("Local book binary data file not found in database.");
        }

        // 2. Parse EPUB Structure
        const parsed = await parseEpub(fileBytes);
        setParsedBook(parsed);
        setChapters(parsed.chapters);

        // 3. Load Book Metadata (from IDB)
        const allMetadata = await getReaderSettings(); // fallback trigger
        const booksList = await getAllBooks();
        const thisBook = booksList.find((b) => b.id === bookId);

        if (thisBook) {
          setCurrentBookMeta(thisBook);
          // Restore last chapter index
          const lastIdx = thisBook.progress ? thisBook.progress.chapterIndex : 0;
          setCurrentChapterIdx(
            lastIdx >= 0 && lastIdx < parsed.chapters.length ? lastIdx : 0
          );
        } else {
          throw new Error("Metadata for selected book not found.");
        }

        // Update last opened timeline
        if (thisBook) {
          await saveBookMetadata({
            ...thisBook,
            lastOpenedAt: new Date().toISOString(),
          });
        }

        // 4. Load initial collections
        const dbHighlights = await getBookHighlights(bookId);
        setHighlights(dbHighlights);
        const dbWords = await getBookSavedWords(bookId);
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
  const loadHighlights = async () => {
    const dbHighlights = await getBookHighlights(bookId);
    setHighlights(dbHighlights);
  };

  const loadSavedWords = async () => {
    const dbWords = await getBookSavedWords(bookId);
    setSavedWords(dbWords);
  };

  // Load active chapter content when chapter index changes
  useEffect(() => {
    if (!parsedBook || chapters.length === 0) return;

    const loadChapter = async () => {
      try {
        setLoading(true);
        setLayoutSettled(false);
        setSuppressAnimation(true);
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
  }, [currentChapterIdx, parsedBook, chapters]);

  // Helper to save reading progress as percentage based on current page
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
      saveBookMetadata(updatedMeta).catch((e) => console.error("Auto progress save failed", e));
    }, 800);
  };

  // Centralized page turning handlers
  const handleNextPage = () => {
    if (chapterPageIndex < totalChapterPages - 1) {
      const nextP = chapterPageIndex + 1;
      setSuppressAnimation(false);
      setChapterPageIndex(nextP);
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

  const handlePrevPage = () => {
    if (chapterPageIndex > 0) {
      const prevP = chapterPageIndex - 1;
      setSuppressAnimation(false);
      setChapterPageIndex(prevP);
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

  // Recalculates horizontal scroll offset on window resize
  const recalculatePages = useCallback(() => {
    if (!containerRef.current) return;
    setSuppressAnimation(true);
    const container = containerRef.current;
    const w = container.clientWidth;
    const gap = 48;
    if (w <= 0) return;

    setViewportWidth(w);

    const scrollWidth = container.scrollWidth;
    const total = Math.max(1, Math.round((scrollWidth + gap) / (w + gap)));
    setTotalChapterPages(total);

    const savedPercent = currentBookMetaRef.current?.progress?.scrollPercent || 0;
    const targetPage = Math.min(total - 1, Math.max(0, Math.round((savedPercent / 100) * (total - 1))));
    setChapterPageIndex(targetPage);

    setTimeout(() => {
      setSuppressAnimation(false);
    }, 50);
  }, []);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      setSuppressAnimation(true);
      recalculatePages();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [recalculatePages]);

  // Recalculate pages and scroll position when chapter finishes loading or settings change
  useEffect(() => {
    if (loading || !chapterContent || !containerRef.current) return;

    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const container = containerRef.current;
      const w = container.clientWidth;
      const gap = 48;
      if (w <= 0) return;

      setViewportWidth(w);

      const scrollWidth = container.scrollWidth;
      const total = Math.max(1, Math.round((scrollWidth + gap) / (w + gap)));
      setTotalChapterPages(total);

      let targetPage = chapterPageIndex;
      if (pendingPageAction === "last") {
        targetPage = total - 1;
      } else if (pendingPageAction === "first") {
        targetPage = 0;
      } else {
        const savedPercent = currentBookMetaRef.current?.progress?.scrollPercent || 0;
        targetPage = Math.min(total - 1, Math.max(0, Math.round((savedPercent / 100) * (total - 1))));
      }

      setChapterPageIndex(targetPage);
      setPendingPageAction(null);
      
      // Save progress immediately
      const percent = total > 1 ? (targetPage / (total - 1)) * 100 : 0;
      const meta = currentBookMetaRef.current;
      if (meta) {
        const updatedMeta: Book = {
          ...meta,
          lastOpenedAt: new Date().toISOString(),
          progress: {
            chapterIndex: currentChapterIdx,
            scrollPercent: Number(percent.toFixed(2)),
          },
        };
        setCurrentBookMeta(updatedMeta);
        saveBookMetadata(updatedMeta).catch((e) => console.error("Auto progress save failed", e));
      }

      setLayoutSettled(true);
      setTimeout(() => {
        setSuppressAnimation(false);
      }, 50);
    }, 150);

    return () => clearTimeout(timer);
  }, [loading, chapterContent, pendingPageAction, settings, currentChapterIdx]);

  // Highlights injector implementation
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
  const handleChapterClick = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const highlightId = target.getAttribute("data-highlight-id");
    if (highlightId) {
      const existingHl = highlights.find((h) => h.id === highlightId);
      if (existingHl) {
        await deleteHighlight(highlightId);
        await loadHighlights();
        showToast("Highlight removed.", async () => {
          await saveHighlight(existingHl);
          await loadHighlights();
          showToast("Highlight restored.");
        });
      }
    }
  };

  // Text selection handler callbacks from floating SelectionMenu
  const handleSelectionAction = async (action: "define" | "explain" | "save" | "highlight", extra?: string) => {
    const selection = window.getSelection();
    if (!selection) return;

    const text = selection.toString().trim();
    if (!text) return;

    // Retrieve context node sentence
    const contextNode = selection.anchorNode?.parentNode;
    const sentenceContext = contextNode?.textContent || text;

    if (action === "highlight") {
      const colorClass = extra || "custom-highlight-yellow";
      const newHl: Highlight = {
        id: `hl_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        bookId,
        chapterIndex: currentChapterIdx,
        text,
        color: colorClass,
        createdAt: new Date().toISOString(),
      };

      await saveHighlight(newHl);
      await loadHighlights();
      showToast("Highlight added.");
      selection.removeAllRanges();

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

      await saveSavedWord(newSaved);
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
          await saveSavedWord({
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
        setAiState((prev) => ({ ...prev, loading: false, error: err.message || "An error occurred with Gemini." }));
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
        setAiState((prev) => ({ ...prev, loading: false, error: err.message || "An error occurred with Gemini." }));
      }
    }
  };

  // Keyboard Navigation & global listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes current overlays
      if (e.key === "Escape") {
        if (showTypography) setShowTypography(false);
        else if (showChapterIndex) setShowChapterIndex(false);
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
      } else if (e.key === "i" || e.key === "I") {
        // Toggle index list
        e.preventDefault();
        setShowChapterIndex((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showTypography, showChapterIndex, aiState.visible, currentChapterIdx, chapters, chapterPageIndex, totalChapterPages]);

  // Navigate chapters helpers
  const navigateChapter = (dir: number) => {
    const target = currentChapterIdx + dir;
    if (target >= 0 && target < chapters.length) {
      setSuppressAnimation(true);
      setCurrentChapterIdx(target);
    } else if (target < 0) {
      showToast("You are at the very beginning of the book.");
    } else {
      showToast("You have reached the end of the book.");
    }
  };

  // Chapter Summarization callback (from HUD sparking action)
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
  const handleSettingsChange = (newSettings: ReaderSettings) => {
    setSuppressAnimation(true);
    setSettings(newSettings);
    saveReaderSettings(newSettings);
  };

  // Theme map helper definitions
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

  const getFontClass = (f: ReaderFont) => {
    switch (f) {
      case "Literata":
        return "font-['Literata']";
      case "Newsreader":
        return "font-['Newsreader']";
      case "Source Serif":
        return "font-['Source_Serif_4']";
      case "Georgia":
        return "font-serif";
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
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const columnCount = settings.viewMode === "split" && !isMobile ? 2 : 1;
  const viewportMaxWidthStr = isMobile ? "calc(100vw - 32px)" : "calc(100vw - 96px)";
  const viewportTopClass = isFullscreen ? "top-6" : "top-16";
  const viewportBottomClass = isFullscreen ? "bottom-6" : "bottom-12";

  return (
    <div
      onMouseMove={handleMouseMove}
      onClick={handleGlobalClick}
      id="reader-hud-root"
      className={`relative w-full h-screen overflow-hidden select-text transition-colors duration-300 ${themeStyle.wrapper}`}
    >
      {/* 1. Header Toolbar HUD (Disappears on silence) */}
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
              {parsedBook?.title}
            </h4>
            <p className="font-sans text-[8px] text-black/45 dark:text-white/45 uppercase tracking-[0.2em] font-semibold mt-0.5">
              {activeChapter ? activeChapter.title : "Chapter Description"}
            </p>
          </div>
        </div>

        {/* Action buttons Row */}
        <div className="flex items-center gap-2">
          {/* AI Page Summary Spark button */}
          <button
            onClick={handleSummarizeChapter}
            id="btn-reader-summarize"
            title="Summarize chapter [Key: S]"
            className="px-2.5 py-1.5 rounded-sm border border-black/10 dark:border-white/10 text-black/80 dark:text-white/80 text-[9px] uppercase tracking-[0.15em] font-sans font-bold hover:border-black dark:hover:border-white transition-all cursor-pointer"
          >
            <span>Summarize</span>
          </button>

          <button
            onClick={() => {
              setShowChapterIndex(!showChapterIndex);
              setShowTypography(false);
            }}
            id="btn-reader-toc"
            title="Chapters list [Key: I]"
            className={`px-2.5 py-1.5 rounded-sm border text-[9px] uppercase tracking-[0.15em] font-sans font-bold transition-all cursor-pointer ${
              showChapterIndex
                ? "border-black dark:border-white bg-black dark:bg-white text-white dark:text-black"
                : "border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white"
            }`}
          >
            Index
          </button>

          <button
            onClick={() => {
              setShowTypography(!showTypography);
              setShowChapterIndex(false);
            }}
            id="btn-reader-typo"
            title="Typography settings [Key: T]"
            className={`px-2.5 py-1.5 rounded-sm border text-[9px] uppercase tracking-[0.15em] font-sans font-bold transition-all cursor-pointer ${
              showTypography
                ? "border-black dark:border-white bg-black dark:bg-white text-white dark:text-black"
                : "border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white"
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {/* 2. Side Panel drawers for Typography and Chapter indexes */}
      {showTypography && (
        <div className="absolute top-18 right-6 z-50 animate-in fade-in zoom-in-95 duration-150" id="typo-panel-sec">
          <TypographyPanel
            settings={settings}
            onChange={handleSettingsChange}
            onClose={() => setShowTypography(false)}
          />
        </div>
      )}

      {showChapterIndex && (
        <div className="absolute top-18 right-6 z-50 w-full max-w-sm rounded-sm shadow-2xl border border-black/10 dark:border-white/10 backdrop-blur-md bg-white/95 dark:bg-neutral-900/95 max-h-[75vh] flex flex-col p-6 animate-in fade-in zoom-in-95 duration-150" id="chapters-drawer">
          <div className="flex items-center justify-between mb-4 border-b pb-2 border-black/5 dark:border-white/5">
            <span className="font-sans font-bold text-[10px] uppercase tracking-[0.2em] text-black/60 dark:text-white/60">
              <span>Chapters Index</span>
            </span>
            <button
              onClick={() => setShowChapterIndex(false)}
              id="btn-close-chapters"
              className="text-[9px] uppercase tracking-[0.15em] font-sans font-bold text-black/40 hover:text-black dark:text-white/45 dark:hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
          <div className="overflow-y-auto flex-1 pr-1 space-y-1 no-scrollbar text-xs font-sans">
            {chapters.map((ch, idx) => (
              <button
                key={ch.id}
                id={`btn-chapter-select-${idx}`}
                onClick={() => {
                  setSuppressAnimation(true);
                  setCurrentChapterIdx(idx);
                  setShowChapterIndex(false);
                }}
                className={`w-full text-left p-2 rounded-sm transition-colors flex items-center justify-between cursor-pointer ${
                  idx === currentChapterIdx
                    ? "bg-black dark:bg-white text-white dark:text-black font-bold"
                    : "text-neutral-750 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <span className="truncate mr-3">{ch.title}</span>
                {idx === currentChapterIdx && <span className="text-[8px] uppercase tracking-wider font-bold opacity-60">(Active)</span>}
              </button>
            ))}
          </div>
        </div>
      )}

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
            else handleSelectionAction(aiState.type);
          }}
        />
      )}

      {/* 4. Selection Floating Menu Overlay */}
      <SelectionMenu
        onAction={handleSelectionAction}
        onClose={() => setSelectionActive(false)}
      />
      {/* 5. Clean Reader Column stage */}
      <div
        ref={containerRef}
        id="reader-scroll-viewport"
        style={{
          width: viewportMaxWidthStr,
        }}
        className={`absolute left-1/2 -translate-x-1/2 overflow-x-hidden overflow-y-hidden no-scrollbar transition-all duration-300 ${viewportTopClass} ${viewportBottomClass}`}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            transform: `translate3d(-${chapterPageIndex * (viewportWidth + 48)}px, 0, 0)`,
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
              columnCount: columnCount,
              columnGap: "48px",
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

      {/* 8. Custom Right Edge Chapter Scrollbar & Hover Drawer */}
      {chapters.length > 1 && (
        <div
          className={`fixed right-0 top-1/2 -translate-y-1/2 z-50 flex items-center pr-2 transition-all duration-300 ${
            showChapterBarPanel ? "pl-80 py-10" : "pl-10 py-10"
          }`}
          onMouseEnter={() => setShowChapterLines(true)}
          onMouseLeave={() => {
            setShowChapterLines(false);
            setShowChapterBarPanel(false);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Hover panel (chapter titles list) */}
          <div
            className={`mr-3 w-72 max-h-[60vh] overflow-y-auto rounded-xl p-3 shadow-2xl border transition-all duration-300 no-scrollbar ${
              showChapterBarPanel
                ? "opacity-100 translate-x-0 pointer-events-auto"
                : "opacity-0 translate-x-4 pointer-events-none"
            } ${
              settings.theme === "dark" || settings.theme === "muted"
                ? "bg-neutral-900/90 border-neutral-800 text-white"
                : "bg-white/90 border-neutral-200 text-black"
            }`}
          >
            <div className="space-y-1 font-sans">
              {chapters.map((ch, idx) => (
                <button
                  key={ch.id}
                  ref={idx === currentChapterIdx ? activeChapterRef : null}
                  onClick={() => {
                    setSuppressAnimation(true);
                    setCurrentChapterIdx(idx);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate transition-all cursor-pointer ${
                    idx === currentChapterIdx
                      ? (settings.theme === "dark" || settings.theme === "muted"
                          ? "bg-white/10 text-white font-bold"
                          : "bg-black/10 text-black font-bold")
                      : "opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  {ch.title}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollbar lines column */}
          <div
            className={`flex flex-col items-center justify-between py-2 px-1 cursor-pointer transition-all duration-300 ${
              showChapterLines ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none"
            }`}
            style={{ height: `${Math.min(350, chapters.length * 12)}px` }}
            onMouseEnter={() => setShowChapterBarPanel(true)}
          >
            {chapters.map((_, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setSuppressAnimation(true);
                  setCurrentChapterIdx(idx);
                }}
                className={`h-[2px] transition-all duration-200 rounded-full ${
                  idx === currentChapterIdx
                    ? "w-6 bg-black dark:bg-white"
                    : "w-3 bg-neutral-400 dark:bg-neutral-600 opacity-60 hover:opacity-100 hover:w-5"
                }`}
                title={`Jump to Chapter ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* 7. Combined Unified Footer HUD (Disappears on silence) */}
      <div
        id="reader-footer"
        className={`absolute bottom-0 left-0 right-0 h-12 border-t flex items-center justify-between px-6 z-40 backdrop-blur-sm transition-all duration-300 ${
          hudVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
        } ${themeStyle.footer}`}
      >
        {/* Thin reading progress bar line at the top border of the footer */}
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-black/5 dark:bg-white/5 overflow-hidden">
          <div
            className="h-full bg-black dark:bg-white transition-all duration-150"
            style={{ width: `${currentBookMeta?.progress?.scrollPercent || 0}%` }}
          />
        </div>

        {/* Left Column: Prev navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrevPage}
            id="btn-footer-prev"
            disabled={currentChapterIdx === 0 && chapterPageIndex === 0}
            className="text-[10px] uppercase tracking-[0.2em] font-sans font-bold text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white disabled:opacity-20 transition-colors cursor-pointer"
          >
            Prev
          </button>
          <span className="hidden sm:inline text-[9px] uppercase tracking-[0.15em] font-sans font-semibold text-neutral-400/80 dark:text-neutral-500/80 select-none">
            • Chapter {currentChapterIdx + 1}
          </span>
        </div>

        {/* Center Column: Clean X of Y page indicator (Muted gray sans-serif font) */}
        <div className="flex flex-col items-center justify-center">
          <span className="font-sans text-[13px] md:text-[14px] font-normal text-neutral-400 dark:text-neutral-500 tracking-wide select-none">
            {chapterPageIndex + 1} of {totalChapterPages}
          </span>
        </div>

        {/* Right Column: Next navigation & percentage */}
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-[9px] uppercase tracking-[0.15em] font-sans font-semibold text-neutral-400/80 dark:text-neutral-500/80 select-none">
            {currentBookMeta?.progress ? Math.round(currentBookMeta.progress.scrollPercent) : 0}% Read •
          </span>
          <button
            onClick={handleNextPage}
            id="btn-footer-next"
            disabled={currentChapterIdx === chapters.length - 1 && chapterPageIndex === totalChapterPages - 1}
            className="text-[10px] uppercase tracking-[0.2em] font-sans font-bold text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white disabled:opacity-20 transition-colors cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>

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
    </div>
  );
}
