/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import LibraryView from "./components/library/LibraryView";
import ReaderView from "./components/reader/ReaderView";

export default function App() {
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

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
    <div className="min-h-screen bg-[#FAF9F7] dark:bg-[#111111] transition-colors duration-300">
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

