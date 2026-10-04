import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "@/features/storage";
import type { Highlight, SavedWord } from "../../../types";

export function useReaderAnnotations(bookId: string) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [readyBookId, setReadyBookId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ bookId: string; message: string } | null>(null);
  const currentBookIdRef = useRef(bookId);
  currentBookIdRef.current = bookId;

  useEffect(() => {
    let active = true;
    setHighlights([]);
    setSavedWords([]);
    setReadyBookId(null);
    setLoadError(null);

    const load = async () => {
      try {
        const bookHighlights = await storage.getBookHighlights(bookId);
        if (!active) return;
        setHighlights(bookHighlights);

        const bookWords = await storage.getBookSavedWords(bookId);
        if (!active) return;
        setSavedWords(bookWords);
      } catch (err) {
        console.error("Reader annotations could not be loaded:", err);
        if (active) {
          setLoadError({
            bookId,
            message: err instanceof Error && err.message
              ? err.message
              : "An issue occurred while loading this EPUB reader engine.",
          });
        }
      } finally {
        if (active) setReadyBookId(bookId);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [bookId]);

  const loadHighlights = useCallback(async () => {
    const bookHighlights = await storage.getBookHighlights(bookId);
    if (currentBookIdRef.current === bookId) setHighlights(bookHighlights);
    return bookHighlights;
  }, [bookId]);

  const loadSavedWords = useCallback(async () => {
    const bookWords = await storage.getBookSavedWords(bookId);
    if (currentBookIdRef.current === bookId) setSavedWords(bookWords);
    return bookWords;
  }, [bookId]);

  const saveHighlight = useCallback(async (highlight: Highlight) => {
    await storage.saveHighlight(highlight);
    await loadHighlights();
  }, [loadHighlights]);

  const deleteHighlight = useCallback(async (highlightId: string) => {
    const existing = highlights.find((highlight) => highlight.id === highlightId);
    if (!existing) return null;
    await storage.deleteHighlight(highlightId);
    await loadHighlights();
    return existing;
  }, [highlights, loadHighlights]);

  const restoreHighlight = useCallback(async (highlight: Highlight) => {
    await storage.saveHighlight(highlight);
    await loadHighlights();
  }, [loadHighlights]);

  const saveSavedWord = useCallback(async (word: SavedWord) => {
    await storage.saveSavedWord(word);
    await loadSavedWords();
  }, [loadSavedWords]);

  const deleteSavedWord = useCallback(async (wordId: string) => {
    await storage.deleteSavedWord(wordId);
    await loadSavedWords();
  }, [loadSavedWords]);

  return {
    highlights,
    savedWords,
    ready: readyBookId === bookId,
    error: loadError?.bookId === bookId ? loadError.message : null,
    saveHighlight,
    deleteHighlight,
    restoreHighlight,
    saveSavedWord,
    deleteSavedWord,
  };
}
