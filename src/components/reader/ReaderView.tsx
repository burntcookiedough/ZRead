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
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  BookOpen,
  Bookmark,
  Share2,
  Trash2,
  Type,
  List,
  Compass,
  AlertCircle,
  Check,
  User,
  Clock,
  Loader
} from "lucide-react";
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

  // Reader HUD Control States
  const [hudVisible, setHudVisible] = useState(true);
  const [showTypography, setShowTypography] = useState(false);
  const [showChapterIndex, setShowChapterIndex] = useState(false);

  // Active highlights & Vocab
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);

  // Reader Settings
  const [settings, setSettings] = useState<ReaderSettings>(getReaderSettings());

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
        const activeChapter = chapters[currentChapterIdx];
        
        // Load, rewrite images, scrape styles
        const html = await loadChapterContent(parsedBook.zipInstance, activeChapter.zipPath);
        setChapterContent(html);

        // Scroll fully back to top on chapter transition
        if (containerRef.current) {
          containerRef.current.scrollTop = 0;
        }

        // Save progress to IDB
        if (currentBookMeta) {
          const updatedMeta: Book = {
            ...currentBookMeta,
            lastOpenedAt: new Date().toISOString(),
            progress: {
              chapterIndex: currentChapterIdx,
              scrollPercent: 0,
            },
          };
          await saveBookMetadata(updatedMeta);
          setCurrentBookMeta(updatedMeta);
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

  // Restore Scroll Progress once chapter loads
  useEffect(() => {
    if (!loading && containerRef.current && currentBookMeta) {
      const savedPercent = currentBookMeta.progress?.scrollPercent || 0;
      if (savedPercent > 0 && currentBookMeta.progress.chapterIndex === currentChapterIdx) {
        const timeout = setTimeout(() => {
          if (containerRef.current) {
            const container = containerRef.current;
            container.scrollTop = (savedPercent / 100) * (container.scrollHeight - container.clientHeight);
          }
        }, 120);
        return () => clearTimeout(timeout);
      }
    }
  }, [loading, currentChapterIdx]);

  // Scroll percent tracker & writer (debounced back to IndexDB space)
  const handleScroll = () => {
    // Hide HUD automatically upon starting scrolling to clear views
    if (hudVisible) {
      setHudVisible(false);
    }

    if (!containerRef.current || !currentBookMeta) return;

    const container = containerRef.current;
    if (container.scrollHeight - container.clientHeight <= 0) return;

    const percent = (container.scrollTop / (container.scrollHeight - container.clientHeight)) * 100;

    // Save scroll progress back to local memory dynamically (lazy persistent)
    const updatedMeta: Book = {
      ...currentBookMeta,
      progress: {
        chapterIndex: currentChapterIdx,
        scrollPercent: Number(percent.toFixed(2)),
      },
    };
    
    // Save to local metadata ref
    setCurrentBookMeta(updatedMeta);
    // Debounce save to database safely
    const timeoutId = (window as any)._dbSaveTimeout;
    if (timeoutId) clearTimeout(timeoutId);
    (window as any)._dbSaveTimeout = setTimeout(() => {
      saveBookMetadata(updatedMeta).catch((e) => console.error("Auto progress save failed", e));
    }, 800);
  };

  // Highlights injector implementation
  const getRenderHtml = () => {
    if (!chapterContent) return "";
    
    // Highlights applicable only for this chapter path
    const chapterHighlights = highlights.filter((h) => h.chapterIndex === currentChapterIdx);
    if (chapterHighlights.length === 0) return chapterContent;

    const parser = new DOMParser();
    const doc = parser.parseFromString(chapterContent, "text/html");
    
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
    return doc.body.innerHTML;
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

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateChapter(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateChapter(1);
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
  }, [showTypography, showChapterIndex, aiState.visible, currentChapterIdx, chapters]);

  // Navigate chapters helpers
  const navigateChapter = (dir: number) => {
    const target = currentChapterIdx + dir;
    if (target >= 0 && target < chapters.length) {
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
    setSettings(newSettings);
    saveReaderSettings(newSettings);
  };

  // Theme map helper definitions
  const getThemeClass = (t: ReaderTheme) => {
    switch (t) {
      case "light":
        return {
          wrapper: "bg-[#FAF9F7] text-[#111111]",
          card: "bg-white text-[#111111] border border-black/10 rounded-sm shadow-xl",
          header: "border-black/5 bg-[#FAF9F7]/90 text-[#111111]",
          footer: "border-black/5 bg-[#FAF9F7]/90 text-[#111111]",
        };
      case "warm":
        return {
          wrapper: "bg-[#F4F0EA] text-[#2e2620]",
          card: "bg-[#eae2d5] text-[#2e2620] border border-black/10 rounded-sm shadow-xl",
          header: "border-black/5 bg-[#F4F0EA]/90 text-[#2e2620]",
          footer: "border-black/5 bg-[#F4F0EA]/90 text-[#2e2620]",
        };
      case "muted":
        return {
          wrapper: "bg-[#2D3136] text-[#E3E3E3]",
          card: "bg-[#222529] text-[#E3E3E3] border border-white/5 rounded-sm shadow-xl",
          header: "border-white/5 bg-[#2D3136]/90 text-[#E3E3E3]",
          footer: "border-white/5 bg-[#2D3136]/90 text-[#E3E3E3]",
        };
      case "dark":
        return {
          wrapper: "bg-[#111111] text-[#EAEAEA]",
          card: "bg-[#181818] text-[#EAEAEA] border border-white/10 rounded-sm shadow-xl",
          header: "border-white/5 bg-[#111111]/90 text-[#EAEAEA]",
          footer: "border-white/5 bg-[#111111]/90 text-[#EAEAEA]",
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
      <div className="w-full h-screen flex flex-col items-center justify-center bg-stone-50 dark:bg-neutral-900" id="read-loader">
        <Loader className="w-8 h-8 animate-spin text-neutral-400 mb-3" />
        <p className="text-xs font-sans text-neutral-400 uppercase tracking-widest font-semibold">Opening local reader workspace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center p-6 bg-stone-50 dark:bg-neutral-900 text-center" id="read-error">
        <AlertCircle className="w-12 h-12 text-red-500 mb-3" />
        <h3 className="font-sans font-bold text-lg mb-1">Could not initialize book</h3>
        <p className="text-sm text-neutral-500 max-w-sm mb-6">{error}</p>
        <button
          onClick={onBackToLibrary}
          id="btn-back-err"
          className="px-5 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-sans text-sm font-semibold cursor-pointer"
        >
          Return to Library
        </button>
      </div>
    );
  }

  const themeStyle = getThemeClass(settings.theme);
  const activeChapter = chapters[currentChapterIdx];

  return (
    <div
      onMouseMove={handleMouseMove}
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
            className="group flex items-center gap-2 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
            title="Library Catalog"
          >
            <ArrowLeft className="w-4 h-4 stroke-[1.5]" />
            <span className="text-[10px] uppercase tracking-[0.2em] font-sans font-bold hidden md:inline">Library</span>
          </button>
          
          <div className="h-4 w-px bg-black/10 dark:bg-white/10 hidden md:block"></div>

          <div>
            <h4 className="font-serif font-semibold text-xs max-w-[150px] md:max-w-[320px] truncate leading-tight italic">
              {parsedBook?.title}
            </h4>
            <p className="font-sans text-[9px] text-black/40 dark:text-white/40 uppercase tracking-[0.2em] font-semibold mt-0.5">
              {activeChapter ? activeChapter.title : "Chapter Description"}
            </p>
          </div>
        </div>

        {/* Action icons Row */}
        <div className="flex items-center gap-3">
          {/* AI Page Summary Spark button */}
          <button
            onClick={handleSummarizeChapter}
            id="btn-reader-summarize"
            title="Summarize chapter [Key: S]"
            className="px-3 py-1.5 rounded-sm border border-black/10 dark:border-white/10 text-black/80 dark:text-white/80 bg-black/5 dark:bg-white/5 text-[9px] uppercase tracking-[0.15em] font-sans font-bold flex items-center gap-1.5 transition-all hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden md:inline">Summarize</span>
          </button>

          <button
            onClick={() => {
              setShowChapterIndex(!showChapterIndex);
              setShowTypography(false);
            }}
            id="btn-reader-toc"
            title="Chapters list [Key: I]"
            className={`p-2 rounded-sm transition-colors cursor-pointer ${
              showChapterIndex ? "bg-black/5 dark:bg-white/10 text-[#111111] dark:text-white" : "hover:bg-black/5 dark:hover:bg-white/5 text-black/60 dark:text-white/60"
            }`}
          >
            <List className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setShowTypography(!showTypography);
              setShowChapterIndex(false);
            }}
            id="btn-reader-typo"
            title="Typography settings [Key: T]"
            className={`p-2 rounded-sm transition-colors cursor-pointer ${
              showTypography ? "bg-black/5 dark:bg-white/10 text-[#111111] dark:text-white" : "hover:bg-black/5 dark:hover:bg-white/5 text-black/60 dark:text-white/60"
            }`}
          >
            <Type className="w-4 h-4" />
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
            <span className="font-sans font-bold text-[10px] uppercase tracking-[0.2em] text-black/60 dark:text-white/60 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-neutral-400" />
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
                  setCurrentChapterIdx(idx);
                  setShowChapterIndex(false);
                }}
                className={`w-full text-left p-2.5 rounded-sm transition-colors flex items-center justify-between cursor-pointer ${
                  idx === currentChapterIdx
                    ? "bg-[#111111] dark:bg-white text-white dark:text-[#111111] font-bold"
                    : "text-neutral-700 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <span className="truncate mr-3">{ch.title}</span>
                {idx === currentChapterIdx && <Check className="w-3.5 h-3.5" />}
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
        onScroll={handleScroll}
        id="reader-scroll-viewport"
        className="w-full h-full overflow-y-auto pt-24 pb-20 no-scrollbar"
      >
        <div
          style={{ maxWidth: `${settings.contentWidth}px` }}
          className="mx-auto px-6 md:px-8 py-4 relative"
          id="reader-column"
        >
          {/* Book Header title segment */}
          {currentChapterIdx === 0 && (
            <div className="mb-14 pb-8 border-b border-neutral-100 dark:border-neutral-850/60 text-center select-none" id="book-front-cover">
              <h1 className="font-serif font-black text-3.5xl md:text-5xl my-4 text-center leading-tight">
                {parsedBook?.title}
              </h1>
              <p className="font-sans text-xs uppercase tracking-widest text-neutral-400 dark:text-neutral-500 font-bold mb-14">
                by {parsedBook?.author}
              </p>
            </div>
          )}

          {/* Core Chapter HTML body render (Premium custom typographies binding) */}
          <div
            id="reader-chapter-body"
            onClick={handleChapterClick}
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
            }}
            className={`epub-content select-text font-serif leading-relaxed text-left antialiased focus:outline-none transition-all ${getFontClass(settings.fontFamily)}`}
            dangerouslySetInnerHTML={{ __html: getRenderHtml() }}
          />

          {/* End of chapter pagination buttons inside reading surface */}
          <div className="mt-16 pt-8 border-t border-neutral-100 dark:border-neutral-850/50 flex items-center justify-between select-none" id="reader-nav-footer">
            <button
              onClick={() => navigateChapter(-1)}
              id="btn-footer-prev"
              disabled={currentChapterIdx === 0}
              className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl hover:bg-neutral-500/10 disabled:opacity-20 text-xs font-sans font-bold uppercase transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev Chapter</span>
            </button>
            
            <span className="font-sans text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
              Chapter {currentChapterIdx + 1} of {chapters.length}
            </span>

            <button
              onClick={() => navigateChapter(1)}
              id="btn-footer-next"
              disabled={currentChapterIdx === chapters.length - 1}
              className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl hover:bg-neutral-500/10 disabled:opacity-20 text-xs font-sans font-bold uppercase transition-all cursor-pointer"
            >
              <span>Next Chapter</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 6. Marginally subtle sidebar clickable columns to navigate (Invisible) */}
      <div
        onClick={() => navigateChapter(-1)}
        id="side-prev-hotspot"
        className="absolute top-16 bottom-12 left-0 w-8 md:w-16 flex items-center justify-start pl-2 z-10 cursor-w-resize opacity-0 hover:opacity-15 text-neutral-400 transition-opacity"
        title="Previous Chapter"
      >
        <ChevronLeft className="w-8 h-8 hidden md:block" />
      </div>

      <div
        onClick={() => navigateChapter(1)}
        id="side-next-hotspot"
        className="absolute top-16 bottom-12 right-0 w-8 md:w-16 flex items-center justify-end pr-2 z-10 cursor-e-resize opacity-0 hover:opacity-15 text-neutral-400 transition-opacity"
        title="Next Chapter"
      >
        <ChevronRight className="w-8 h-8 hidden md:block" />
      </div>

      {/* 7. Footer bottom Progress bar HUD (Disappears on silence) */}
      <div
        id="reader-hud-footer"
        className={`absolute bottom-0 left-0 right-0 h-12 border-t flex items-center justify-between px-6 z-40 backdrop-blur-sm shadow-inner text-xs font-sans font-semibold text-neutral-400 dark:text-neutral-500 transition-all duration-300 ${
          hudVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
        } ${themeStyle.footer}`}
      >
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-neutral-400" />
          <span>Chapter {currentChapterIdx + 1}</span>
        </div>
        
        {/* Central percentage indicator */}
        <div className="w-1/3 md:w-1/4 h-1.5 bg-neutral-200/50 dark:bg-neutral-800/40 rounded-full overflow-hidden max-w-xs block mx-auto">
          <div
            className="h-full bg-neutral-900 dark:bg-white rounded-full transition-all duration-150"
            style={{ width: `${currentBookMeta?.progress?.scrollPercent || 0}%` }}
          />
        </div>

        <div>
          <span>{currentBookMeta?.progress ? Math.round(currentBookMeta.progress.scrollPercent) : 0}% Read</span>
        </div>
      </div>

      {/* 8. Self dismissed notification toast layout block */}
      {notification && (
        <div
          id="toast-notification"
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl border border-neutral-200/55 dark:border-neutral-800/60 bg-white/95 dark:bg-neutral-900/95 shadow-lg text-xs font-sans flex items-center justify-between gap-6 select-none animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <div className="w-2 h-2 rounded-full bg-neutral-900 dark:bg-white" />
            <span className="text-neutral-800 dark:text-neutral-200">{notification.text}</span>
          </div>
          {notification.onUndo && (
            <button
              onClick={() => {
                if (notification.onUndo) {
                  notification.onUndo();
                }
                setNotification(null);
              }}
              className="text-[#654321] dark:text-neutral-300 font-bold uppercase tracking-[0.1em] text-[9px] hover:underline cursor-pointer border-l border-black/10 dark:border-white/10 pl-2.5"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
