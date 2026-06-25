/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { isTauriRuntime } from "@/app/runtime";
import LibraryView from "./components/library/LibraryView";
import ReaderView from "./components/reader/ReaderView";
import { initializeDesktopDatabase } from "./features/storage/desktopSqliteStorage";

export default function App() {
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>(() => {
    try {
      const data = localStorage.getItem("epub-reader-settings");
      if (data) {
        return JSON.parse(data).theme || "dark";
      }
    } catch {}
    return "dark";
  });

  // Keep root dark class in sync with theme state
  useEffect(() => {
    if (theme === "dark" || theme === "muted") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    if (!isTauriRuntime) return;

    initializeDesktopDatabase()
      .then(() => console.info("Desktop SQLite health check passed."))
      .catch((err) => console.error("Desktop SQLite health check failed:", err));
  }, []);

  // Monitor deep URL links or single-session resets
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const book = params.get("book");
      setSelectedBookId(book);
    };

    window.addEventListener("popstate", handlePopState);
    
    // Initial parameter check
    const params = new URLSearchParams(window.location.search);
    const book = params.get("book");
    if (book) {
      setSelectedBookId(book);
    }

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Re-sync theme when selectedBookId changes (so when returning from reader to library)
  useEffect(() => {
    try {
      const data = localStorage.getItem("epub-reader-settings");
      if (data) {
        setTheme(JSON.parse(data).theme || "dark");
      }
    } catch {}
  }, [selectedBookId]);

  const selectBook = (id: string | null) => {
    setSelectedBookId(id);
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set("book", id);
    } else {
      url.searchParams.delete("book");
    }
    window.history.pushState({}, "", url.toString());
  };

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

