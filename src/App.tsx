/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { isTauriRuntime } from "@/app/runtime";
import { initializeDesktopStorage, storage } from "./features/storage";
import LibraryView from "./components/library/LibraryView";
import ReaderView from "./components/reader/ReaderView";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [theme, setTheme] = useState("dark");
  const [storageReady, setStorageReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const initializeStorage = async () => {
    setRetrying(true);
    setStartupError(null);
    setStorageReady(false);
    try {
      if (isTauriRuntime) await initializeDesktopStorage();
      const settings = await storage.getReaderSettings();
      // Validate the persisted library before the bookshelf can render an empty state.
      await storage.getAllBooks();
      setTheme(settings.theme);
      setStorageReady(true);
    } catch (error) {
      console.error("Could not initialize local ZRead storage:", error);
      setStartupError(getErrorMessage(error));
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    void initializeStorage();
  }, []);

  // Keep root theme class in sync with the persisted setting.
  useEffect(() => {
    if (theme === "dark" || theme === "muted") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Re-read settings when returning to the bookshelf after changing them in the reader.
  useEffect(() => {
    if (!storageReady) return;
    let active = true;
    storage.getReaderSettings().then((settings) => {
      if (active) setTheme(settings.theme);
    }).catch((error) => {
      if (!active) return;
      console.error("Could not reload local reader settings:", error);
      setStartupError(getErrorMessage(error));
      setStorageReady(false);
    });
    return () => { active = false; };
  }, [selectedBookId, storageReady]);

  // Monitor deep URL links or single-session resets.
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedBookId(params.get("book"));
    };

    window.addEventListener("popstate", handlePopState);
    const params = new URLSearchParams(window.location.search);
    const book = params.get("book");
    if (book) setSelectedBookId(book);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const selectBook = (id: string | null) => {
    setSelectedBookId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("book", id);
    else url.searchParams.delete("book");
    window.history.pushState({}, "", url.toString());
  };

  if (!storageReady) {
    return (
      <main className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex items-center justify-center p-6">
        <section className="w-full max-w-md border border-black/15 dark:border-white/15 p-7 text-center">
          {startupError ? (
            <>
              <h1 className="font-serif text-2xl italic mb-3">ZRead could not open its local library</h1>
              <p className="font-sans text-sm leading-relaxed text-black/65 dark:text-white/65 mb-3">
                Check that ZRead's local storage folder is writable and that your device has free space, then retry. Existing IndexedDB records are kept during migration.
              </p>
              <p className="font-sans text-xs leading-relaxed text-black/50 dark:text-white/50 mb-6 break-words">
                {startupError}
              </p>
              <button
                onClick={() => void initializeStorage()}
                disabled={retrying}
                className="px-5 py-2 border border-black dark:border-white bg-black dark:bg-white text-white dark:text-black text-[10px] uppercase tracking-widest font-bold disabled:opacity-50"
              >
                {retrying ? "Retrying…" : "Retry"}
              </button>
            </>
          ) : (
            <p className="font-sans text-[10px] uppercase tracking-widest font-bold animate-pulse">
              {isTauriRuntime ? "Preparing your local library…" : "Loading reader settings…"}
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
      {selectedBookId ? (
        <ReaderView
          bookId={selectedBookId}
          onBackToLibrary={() => selectBook(null)}
        />
      ) : (
        <LibraryView onBookSelect={(id) => selectBook(id)} />
      )}
    </div>
  );
}
