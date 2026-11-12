import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { storage } from "@/features/storage";
import type { Book } from "../../../types";
import { clampSourcePercent } from "../readerLayout";

interface UseReaderProgressOptions {
  bookId: string;
  bookMeta: Book | null;
  setBookMeta: Dispatch<SetStateAction<Book | null>>;
  chapterIndex: number;
  layoutSettled: boolean;
  loading: boolean;
  settingsReady: boolean;
  getSourcePercent: () => number;
}

export function useReaderProgress({
  bookId,
  bookMeta,
  setBookMeta,
  chapterIndex,
  layoutSettled,
  loading,
  settingsReady,
  getSourcePercent,
}: UseReaderProgressOptions) {
  const bookMetaRef = useRef(bookMeta);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  bookMetaRef.current = bookMeta;

  const saveReadingProgress = useCallback((nextChapterIndex: number, sourcePercent: number) => {
    const currentBook = bookMetaRef.current;
    if (!currentBook || currentBook.id !== bookId) return;

    const updatedBook: Book = {
      ...currentBook,
      lastOpenedAt: new Date().toISOString(),
      progress: {
        chapterIndex: nextChapterIndex,
        scrollPercent: Number(clampSourcePercent(sourcePercent).toFixed(2)),
      },
    };
    bookMetaRef.current = updatedBook;
    setBookMeta(updatedBook);
    saveQueueRef.current = saveQueueRef.current
      .catch(() => {})
      .then(() => storage.saveBookMetadata(updatedBook))
      .catch((err) => console.error("Auto progress save failed", err));
  }, [bookId, setBookMeta]);

  useEffect(() => {
    if (!layoutSettled || loading || !settingsReady) return;
    saveReadingProgress(chapterIndex, getSourcePercent());
  }, [layoutSettled, getSourcePercent, chapterIndex, loading, settingsReady, bookId, saveReadingProgress]);

  const flushProgress = useCallback(() => saveQueueRef.current, []);

  return { saveReadingProgress, flushProgress };
}
