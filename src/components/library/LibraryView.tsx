/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Book } from "../../types";
import { getAllBooks, saveBookMetadata, saveBookFile, deleteBookMetadata, deleteBookFile } from "../../utils/db";
import { parseEpub } from "../../utils/epubParser";
import { UploadCloud, BookOpen, Trash2, Calendar, Layout, Loader } from "lucide-react";

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
      const all = await getAllBooks();
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
      await saveBookFile(bookId, arrayBuffer);
      await saveBookMetadata(newBook);

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
    <div className="w-full max-w-6xl mx-auto px-6 py-12 md:py-16 text-neutral-905 dark:text-neutral-100 min-h-screen flex flex-col justify-between" id="lib-root">
      <div>
        {/* Top Header Branding Row */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 border-b border-black/5 dark:border-white/5 pb-8 gap-4" id="lib-header">
          <div>
            <h1 className="font-serif font-black text-4xl md:text-5xl tracking-tight text-[#111111] dark:text-white leading-none mb-3 italic">
              The Bookshelf
            </h1>
            <p className="font-sans text-[10px] text-black/65 dark:text-white/60 uppercase tracking-[0.25em] font-semibold flex items-center gap-1.5">
              <Layout className="w-3.5 h-3.5" /> PERSONAL LITERARY ARCHIVE
            </p>
          </div>

          <button
            onClick={triggerFileBrowser}
            id="btn-upload-nav"
            className="px-5 py-2.5 rounded-sm border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 text-[10px] uppercase tracking-[0.15em] font-sans font-bold shadow-sm hover:bg-black/5 dark:hover:bg-white/5 active:scale-99 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 text-neutral-400" />
            <span>Import Document</span>
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
          <div className="mb-8 p-4 rounded-sm border border-red-250/20 bg-red-500/5 text-red-600 dark:text-red-400 text-xs tracking-wider uppercase font-sans flex flex-col gap-1" id="upload-err">
            <span className="font-bold">Import failed</span>
            <span className="opacity-80 normal-case">{uploadError}</span>
          </div>
        )}

        {/* Dynamic upload loader */}
        {isUploading && (
          <div className="mb-8 p-6 rounded-sm border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-neutral-800 dark:text-neutral-200 text-xs font-sans flex items-center gap-3 animate-pulse" id="upload-spinner">
            <Loader className="w-5 h-5 animate-spin text-neutral-500" />
            <div>
              <p className="font-bold uppercase tracking-widest text-[9px] opacity-60">Parsing EPUB container...</p>
              <p className="text-neutral-500 dark:text-neutral-400 font-normal">Extracting spine elements and parsing headings</p>
            </div>
          </div>
        )}

        {/* Dynamic list rendering */}
        {loading ? (
          <div className="text-center py-20" id="lib-loading-anim">
            <Loader className="w-10 h-10 animate-spin text-neutral-300 mx-auto mb-4" />
            <p className="text-[10px] uppercase tracking-[0.2em] font-sans opacity-45">Accessing database spaces...</p>
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
            className={`p-12 md:p-20 text-center rounded-sm border border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
              dragActive
                ? "border-black dark:border-white bg-black/5 dark:bg-white/5"
                : "border-black/20 dark:border-white/20 bg-transparent hover:border-black/40 dark:hover:border-white/40"
            }`}
          >
            <UploadCloud className={`w-12 h-12 mb-4 text-black/30 dark:text-white/30 transition-transform ${dragActive ? "scale-110 rotate-1" : ""}`} />
            <h3 className="font-serif italic text-2xl text-[#111111] dark:text-white mb-2 font-medium">Drop an EPUB to start reading</h3>
            <p className="font-sans text-xs tracking-wider text-black/50 dark:text-white/50 max-w-sm leading-relaxed mb-6">
              Dragged documents are parsed and saved completely inside your browser's IndexedDB offline sandbox database.
            </p>
            <span className="px-5 py-2.5 bg-[#111111] dark:bg-white text-white dark:text-[#111111] rounded-sm text-[10px] uppercase tracking-[0.2em] font-bold shadow-md hover:opacity-85 transition-opacity">
              Select Book File
            </span>
          </div>
        ) : (
          /* Book lists Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" id="lib-books-grid">
            {books.map((book) => {
              const formattedProgress = book.progress ? Math.round(book.progress.scrollPercent || 0) : 0;
              return (
                <div
                  key={book.id}
                  id={`book-card-${book.id}`}
                  onClick={() => onBookSelect(book.id)}
                  className="group relative flex flex-col justify-between p-6 rounded-sm border border-black/10 dark:border-white/10 bg-white/50 dark:bg-neutral-900/40 transition-all hover:bg-white dark:hover:bg-neutral-900 shadow-sm hover:shadow-md cursor-pointer hover:border-black/30 dark:hover:border-white/30"
                >
                  {/* Card top */}
                  <div className="space-y-4">
                    {/* Cover placeholder icon with elegant serif text */}
                    <div className="w-10 h-10 rounded-sm bg-black/5 dark:bg-white/5 flex items-center justify-center text-black/40 dark:text-white/40 group-hover:text-[#111111] group-hover:bg-black/10 dark:group-hover:text-white dark:group-hover:bg-white/10 transition-all">
                      <BookOpen className="w-4.5 h-4.5 stroke-[1.5]" />
                    </div>

                    <div className="space-y-1.5">
                      <h3 className="font-serif font-medium text-2xl text-[#111111] dark:text-white leading-tight italic tracking-tight group-hover:text-black dark:group-hover:text-white">
                        {book.title}
                      </h3>
                      <p className="font-sans text-[10px] text-black/50 dark:text-white/50 uppercase tracking-[0.15em] font-semibold truncate">
                        {book.author}
                      </p>
                    </div>
                  </div>

                  {/* Card bottom footer detail */}
                  <div className="mt-8 pt-4 border-t border-black/5 dark:border-white/5 space-y-4">
                    {/* Progress slider bar representation */}
                    <div className="space-y-1.5" id={`progress-sec-${book.id}`}>
                      <div className="flex items-center justify-between text-[9px] font-sans font-bold uppercase tracking-widest text-[#111111]/40 dark:text-white/40">
                        <span>Progress</span>
                        <span>{formattedProgress}%</span>
                      </div>
                      <div className="w-full h-[2px] bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#111111] dark:bg-white transition-all duration-300"
                          style={{ width: `${formattedProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Metadata indicators */}
                    <div className="flex items-center justify-between text-[9px] font-sans uppercase tracking-widest text-[#111111]/40 dark:text-white/40 select-none">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> {formatDateLabel(book.lastOpenedAt)}
                      </span>
                      <button
                        onClick={(e) => handleDeleteBook(e, book)}
                        id={`btn-del-book-${book.id}`}
                        title="Remove book"
                        className="p-1 rounded-sm text-neutral-450 hover:text-red-600 hover:bg-red-500/5 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
        <div id="delete-confirm-modal" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#181818] p-6 rounded-sm border border-black/10 dark:border-white/10 shadow-2xl animate-in zoom-in-95 duration-150">
            <h4 className="font-sans font-bold text-[10px] uppercase tracking-[0.2em] text-red-500 mb-3">Delete Book Confirmation</h4>
            <h3 className="font-serif font-semibold text-base text-[#111111] dark:text-neutral-100 italic leading-snug mb-2">
              "{bookToDelete.title}"
            </h3>
            <p className="font-sans text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed mb-6">
              Are you sure you want to remove this book? This will permanently delete the text, all highlights, progress, and saved vocabulary local records.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setBookToDelete(null)}
                id="btn-delete-cancel"
                className="flex-1 py-2 rounded-sm border border-black/10 dark:border-white/10 text-[9px] uppercase tracking-[0.15em] font-sans font-bold text-neutral-600 dark:text-neutral-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
              >
                Keep Book
              </button>
              <button
                onClick={async () => {
                  const targetId = bookToDelete.id;
                  setBookToDelete(null);
                  try {
                    await deleteBookMetadata(targetId);
                    await deleteBookFile(targetId);
                    setBooks((prev) => prev.filter((b) => b.id !== targetId));
                  } catch (err) {
                    console.error("Delete book failed:", err);
                  }
                }}
                id="btn-delete-confirm"
                className="flex-1 py-1.5 rounded-sm bg-red-650 hover:bg-red-700 text-white text-[9px] uppercase tracking-[0.15em] font-sans font-bold transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Library branding footer */}
      <div className="mt-20 border-t border-black/5 dark:border-white/5 pt-8 text-center select-none" id="lib-footer">
        <p className="font-serif text-[13px] italic text-[#111111]/50 dark:text-white/50 max-w-lg mx-auto leading-relaxed">
          “Of my grandfathers, teachers, and governors, I have learned simplicity in my way of living, simplicity of expression, and simple tools of beauty.”
        </p>
      </div>
    </div>
  );
}
