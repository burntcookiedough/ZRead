import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "@/features/storage";
import type { Book } from "../../../types";
import { loadChapterContent, parseEpub, type ParsedBook, type ParsedChapter } from "../../../utils/epubParser";

export function useReaderBook(bookId: string) {
  const [parsedBook, setParsedBook] = useState<ParsedBook | null>(null);
  const [currentBookMeta, setCurrentBookMeta] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<ParsedChapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [chapterContent, setChapterContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentBookMetaRef = useRef(currentBookMeta);
  const currentChapterIndexRef = useRef(currentChapterIndex);
  currentBookMetaRef.current = currentBookMeta;
  currentChapterIndexRef.current = currentChapterIndex;

  useEffect(() => {
    currentBookMetaRef.current = null;
    currentChapterIndexRef.current = 0;
    setCurrentBookMeta(null);
    setParsedBook(null);
    setChapters([]);
    setCurrentChapterIndex(0);
    setChapterContent("");
    setLoading(true);
    setError(null);
  }, [bookId]);

  useEffect(() => {
    let active = true;

    const initializeBook = async () => {
      try {
        setLoading(true);
        setError(null);

        const fileBytes = await storage.getBookFile(bookId);
        if (!active) return;
        if (!fileBytes) throw new Error("Local book binary data file not found in database.");

        const parsed = await parseEpub(fileBytes);
        if (!active) return;

        const booksList = await storage.getAllBooks();
        if (!active) return;
        const thisBook = booksList.find((book) => book.id === bookId);
        if (!thisBook) throw new Error("Metadata for selected book not found.");

        const openedBook = { ...thisBook, lastOpenedAt: new Date().toISOString() };
        currentBookMetaRef.current = openedBook;
        setCurrentBookMeta(openedBook);

        const lastIndex = thisBook.progress?.chapterIndex ?? 0;
        const restoredChapter = lastIndex >= 0 && lastIndex < parsed.chapters.length ? lastIndex : 0;
        currentChapterIndexRef.current = restoredChapter;
        setCurrentChapterIndex(restoredChapter);
        setParsedBook(parsed);
        setChapters(parsed.chapters);
        await storage.saveBookMetadata(openedBook);
      } catch (err) {
        console.error("Reader initialization failed:", err);
        if (active) {
          setError(err instanceof Error && err.message
            ? err.message
            : "An issue occurred while loading this EPUB reader engine.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void initializeBook();
    return () => {
      active = false;
    };
  }, [bookId]);

  useEffect(() => {
    if (!parsedBook || chapters.length === 0) return;
    const activeChapter = chapters[currentChapterIndex];
    if (!activeChapter) return;

    let active = true;
    const imageUrls: string[] = [];

    const loadChapter = async () => {
      try {
        setLoading(true);
        const html = await loadChapterContent(parsedBook.zipInstance, activeChapter.zipPath, (url) => {
          if (active) imageUrls.push(url);
          else URL.revokeObjectURL(url);
        });
        if (!active) return;
        setChapterContent(html);
      } catch (err) {
        console.error("Failed to load chapter content:", err);
        if (active) {
          setChapterContent("<p class='error'>Failed loading chapter text. The page might be corrupted or missing.</p>");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadChapter();
    return () => {
      active = false;
      imageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [currentChapterIndex, parsedBook, chapters]);

  const getCurrentChapterIndex = useCallback(() => currentChapterIndexRef.current, []);

  const navigateToChapterIndex = useCallback((chapterIndex: number) => {
    currentChapterIndexRef.current = chapterIndex;
    setLoading(true);
    setCurrentChapterIndex(chapterIndex);
  }, []);

  return {
    parsedBook,
    currentBookMeta,
    setCurrentBookMeta,
    chapters,
    currentChapterIndex,
    chapterContent,
    loading,
    error,
    getCurrentChapterIndex,
    navigateToChapterIndex,
  };
}
