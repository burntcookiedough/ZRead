/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Book } from "../../types";
import { storage } from "@/features/storage";
import { parseEpub } from "../../utils/epubParser";

interface LibraryViewProps {
  onBookSelect: (bookId: string) => void;
}

export default function LibraryView({ onBookSelect }: LibraryViewProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch all books on mount
  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    try {
      setLoading(true);
      const all = await storage.getAllBooks();
      setBooks(all);
    } catch (e) {
      console.error("Failed to load local books:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateAndProcessFile = async (file: File) => {
    if (!file) return;
    
    // Check if epub file format
    if (!file.name.endsWith(".epub") && file.type !== "application/epub+zip") {
      setUploadError("This reader currently only supports standard EPUB files. Please select a valid document.");
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      // 1. Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // 2. Parse EPUB metadata to ensure it's valid
      const parsed = await parseEpub(arrayBuffer);

      // 3. Create Book metadata item
      const bookId = `book_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const newBook: Book = {
        id: bookId,
        title: parsed.title,
        author: parsed.author,
        fileName: file.name,
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
        progress: {
          chapterIndex: 0,
          scrollPercent: 0,
        },
      };

      // 4. Save file & metadata to IndexedDB
      await storage.saveBookFile(bookId, arrayBuffer);
      await storage.saveBookMetadata(newBook);

      // 5. Reload book list
      await loadBooks();
      
      // Auto-open newly loaded book instantly
      onBookSelect(bookId);

    } catch (err: any) {
      console.error("EPUB upload parsing error:", err);
      setUploadError(err.message || "Could not successfully parse or save this book. The EPUB container might be corrupted.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await validateAndProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await validateAndProcessFile(e.target.files[0]);
    }
  };

  const triggerFileBrowser = () => {
    fileInputRef.current?.click();
  };

  const handleDeleteBook = (e: React.MouseEvent, book: Book) => {
    e.stopPropagation(); // Prevent card click opening triggers
    setBookToDelete(book);
  };

  const formatDateLabel = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-12 md:py-16 text-black dark:text-white min-h-screen flex flex-col justify-start" id="lib-root">
      <div>
        {/* Top Header Branding Row */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-10 border-b border-black/10 dark:border-white/10 pb-6 gap-4" id="lib-header">
          <div>
            <h1 className="font-serif font-bold text-3xl tracking-tight text-black dark:text-white leading-none mb-1">
              The Bookshelf
            </h1>
            <p className="font-sans text-[9px] text-black/50 dark:text-white/50 uppercase tracking-[0.25em] font-bold">
              PERSONAL LITERARY ARCHIVE
            </p>
          </div>

          <button
            onClick={triggerFileBrowser}
            id="btn-upload-nav"
            className="px-4 py-2 rounded-sm border border-black dark:border-white bg-black dark:bg-white text-white dark:text-black text-[9px] uppercase tracking-[0.15em] font-sans font-bold hover:bg-transparent hover:text-black dark:hover:bg-transparent dark:hover:text-white transition-all cursor-pointer"
          >
            Import Document
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub"
            onChange={handleFileInputChange}
            className="hidden"
            id="file-hidden-input"
          />
        </div>

        {uploadError && (
          <div className="mb-6 p-4 rounded-sm border border-black dark:border-white bg-black/5 dark:bg-white/5 text-black dark:text-white text-xs tracking-wider uppercase font-sans flex flex-col gap-1" id="upload-err">
            <span className="font-bold">Import failed</span>
            <span className="opacity-80 normal-case">{uploadError}</span>
          </div>
        )}

        {/* Dynamic upload loader */}
        {isUploading && (
          <div className="mb-6 p-4 rounded-sm border border-black dark:border-white bg-black/5 dark:bg-white/5 text-black dark:text-white text-xs font-sans animate-pulse" id="upload-spinner">
            <p className="font-bold uppercase tracking-widest text-[9px]">Parsing EPUB container...</p>
            <p className="opacity-80 font-normal">Extracting spine elements and parsing headings</p>
          </div>
        )}

        {/* Dynamic list rendering */}
        {loading ? (
          <div className="text-center py-16 text-black dark:text-white animate-pulse" id="lib-loading-anim">
            <p className="text-[9px] uppercase tracking-[0.2em] font-sans font-bold">Accessing library database...</p>
          </div>
        ) : books.length === 0 ? (
          /* Empty Library State with Dropzone */
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileBrowser}
            id="lib-dropzone"
            className={`p-12 md:p-16 text-center rounded-sm border border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
              dragActive
                ? "border-black dark:border-white bg-black/5 dark:bg-white/5"
                : "border-black/25 dark:border-white/25 bg-transparent hover:border-black dark:hover:border-white"
            }`}
          >
            <h3 className="font-serif italic text-2xl text-black dark:text-white mb-2 font-medium">Drop an EPUB to start reading</h3>
            <p className="font-sans text-[11px] tracking-wider text-black/60 dark:text-white/60 max-w-sm leading-relaxed mb-6">
              Documents are processed locally in your browser's IndexedDB sandbox database.
            </p>
            <span className="px-5 py-2 bg-black dark:bg-white text-white dark:text-black rounded-sm text-[9px] uppercase tracking-[0.2em] font-bold hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white border border-black dark:border-white transition-all">
              Select Book File
            </span>
          </div>
        ) : (
          /* Book lists Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="lib-books-grid">
            {books.map((book) => {
              const formattedProgress = book.progress ? Math.round(book.progress.scrollPercent || 0) : 0;
              return (
                <div
                  key={book.id}
                  id={`book-card-${book.id}`}
                  onClick={() => onBookSelect(book.id)}
                  className="group relative flex flex-col justify-between p-5 rounded-sm border border-black/10 dark:border-white/10 bg-transparent transition-all hover:bg-black/[0.02] dark:hover:bg-white/[0.02] hover:border-black dark:hover:border-white cursor-pointer"
                >
                  {/* Card top */}
                  <div className="space-y-2">
                    <h3 className="font-serif font-medium text-xl text-black dark:text-white leading-tight italic tracking-tight">
                      {book.title}
                    </h3>
                    <p className="font-sans text-[9px] text-black/60 dark:text-white/60 uppercase tracking-[0.15em] font-bold truncate">
                      {book.author}
                    </p>
                  </div>

                  {/* Card bottom footer detail */}
                  <div className="mt-6 pt-4 border-t border-black/5 dark:border-white/5 space-y-4">
                    {/* Progress slider bar representation */}
                    <div className="space-y-1.5" id={`progress-sec-${book.id}`}>
                      <div className="flex items-center justify-between text-[9px] font-sans font-bold uppercase tracking-widest text-black/50 dark:text-white/50">
                        <span>Progress</span>
                        <span>{formattedProgress}%</span>
                      </div>
                      <div className="w-full h-[1px] bg-black/10 dark:bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-black dark:bg-white transition-all duration-300"
                          style={{ width: `${formattedProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Metadata indicators */}
                    <div className="flex items-center justify-between text-[8px] font-sans uppercase tracking-widest text-black/50 dark:text-white/50 select-none">
                      <span>
                        Opened: {formatDateLabel(book.lastOpenedAt)}
                      </span>
                      <button
                        onClick={(e) => handleDeleteBook(e, book)}
                        id={`btn-del-book-${book.id}`}
                        title="Remove book"
                        className="px-2 py-0.5 rounded-sm border border-black/10 dark:border-white/10 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white transition-all cursor-pointer font-bold text-[8px] uppercase tracking-wider bg-transparent"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom delete validation modal */}
      {bookToDelete && (
        <div id="delete-confirm-modal" className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-neutral-900 p-6 rounded-sm border border-black dark:border-white shadow-2xl animate-in zoom-in-95 duration-150 text-black dark:text-white">
            <h4 className="font-sans font-bold text-[9px] uppercase tracking-[0.2em] text-black/60 dark:text-white/60 mb-3">Delete Book Confirmation</h4>
            <h3 className="font-serif font-semibold text-base text-black dark:text-white italic leading-snug mb-2">
              "{bookToDelete.title}"
            </h3>
            <p className="font-sans text-xs text-black/70 dark:text-white/70 leading-relaxed mb-6">
              Are you sure you want to remove this book? This will permanently delete the text, all highlights, progress, and saved vocabulary local records.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setBookToDelete(null)}
                id="btn-delete-cancel"
                className="flex-1 py-2 rounded-sm border border-black/20 dark:border-white/20 text-[9px] uppercase tracking-[0.15em] font-sans font-bold text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
              >
                Keep Book
              </button>
              <button
                onClick={async () => {
                  const targetId = bookToDelete.id;
                  setBookToDelete(null);
                  try {
                    await storage.deleteBook(targetId);
                    setBooks((prev) => prev.filter((b) => b.id !== targetId));
                  } catch (err) {
                    console.error("Delete book failed:", err);
                  }
                }}
                id="btn-delete-confirm"
                className="flex-1 py-2 rounded-sm bg-black dark:bg-white text-white dark:text-black text-[9px] uppercase tracking-[0.15em] font-sans font-bold hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white border border-black dark:border-white transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
