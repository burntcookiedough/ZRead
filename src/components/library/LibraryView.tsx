/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";
import { isTauriRuntime } from "@/app/runtime";
import BookCard from "./BookCard";
import LibrarySettingsDialog from "./LibrarySettingsDialog";
import { useLibrary } from "./useLibrary";

interface LibraryViewProps {
  onBookSelect: (bookId: string) => void;
}

export default function LibraryView({ onBookSelect }: LibraryViewProps) {
  const {
    state,
    fileInputRef,
    actions: {
      refreshBooks,
      handleDrag,
      handleDrop,
      handleFileInputChange,
      triggerFileBrowser,
      requestDelete,
      cancelDelete,
      confirmDelete,
    },
  } = useLibrary(onBookSelect);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (state.bookToDelete && !dialog.open) dialog.showModal();
    else if (!state.bookToDelete && dialog.open) dialog.close();
  }, [state.bookToDelete]);

  const localStorageDescription = isTauriRuntime
    ? "Imported EPUBs are copied into this app's local data folder."
    : "EPUBs stay in this browser's local IndexedDB library.";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10 text-black dark:text-white" id="lib-root">
      <header className="mb-10 flex flex-col gap-5 border-b border-black/10 pb-6 dark:border-white/10 sm:flex-row sm:items-end sm:justify-between" id="lib-header">
        <div>
          <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-black/50 dark:text-white/50">Your local library</p>
          <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-black dark:text-white">The Bookshelf</h1>
          <p className="mt-2 max-w-md font-sans text-sm leading-relaxed text-black/60 dark:text-white/60">
            Pick up where you left off. Your books stay on this device.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LibrarySettingsDialog onRestore={() => void refreshBooks()} />
          <button
            type="button"
            onClick={triggerFileBrowser}
            disabled={state.isUploading}
            id="btn-upload-nav"
            className="rounded-sm border border-black bg-black px-4 py-2 font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-white hover:bg-transparent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-wait disabled:opacity-50 dark:border-white dark:bg-white dark:text-black dark:hover:bg-transparent dark:hover:text-white dark:focus-visible:outline-white"
          >
            Import EPUB
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
      </header>

      {state.uploadError && (
        <div role="alert" className="mb-6 rounded-sm border border-black/20 bg-black/[0.03] px-4 py-3 text-sm dark:border-white/20 dark:bg-white/[0.04]" id="upload-err">
          <p className="font-semibold">Library update failed</p>
          <p className="mt-1 text-black/70 dark:text-white/70">{state.uploadError}</p>
        </div>
      )}

      {state.isUploading && (
        <div role="status" className="mb-6 rounded-sm border border-black/15 px-4 py-3 font-sans text-sm dark:border-white/15" id="upload-spinner">
          <p className="font-semibold">Importing EPUB…</p>
          <p className="mt-1 text-black/60 dark:text-white/60">Reading the book and adding a local copy.</p>
        </div>
      )}

      {state.loading ? (
        <div role="status" className="py-16 text-center font-sans text-xs text-black/55 dark:text-white/55" id="lib-loading-anim">
          Opening your library…
        </div>
      ) : state.books.length === 0 ? (
        <section className="flex flex-1 flex-col items-center justify-center py-12 text-center" aria-labelledby="empty-library-title">
          <h2 id="empty-library-title" className="font-serif text-2xl font-medium text-black dark:text-white">A quiet place for your books</h2>
          <p className="mt-2 max-w-md font-sans text-sm leading-relaxed text-black/60 dark:text-white/60">
            Choose an EPUB to add it to your bookshelf, or drop one here.
          </p>
          <button
            type="button"
            onClick={triggerFileBrowser}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={(event) => void handleDrop(event)}
            disabled={state.isUploading}
            id="lib-dropzone"
            className={`mt-8 flex min-h-44 w-full max-w-xl flex-col items-center justify-center rounded-sm border border-dashed px-6 py-10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:focus-visible:outline-white disabled:cursor-wait ${state.dragActive ? "border-black bg-black/[0.04] dark:border-white dark:bg-white/[0.05]" : "border-black/25 hover:border-black dark:border-white/25 dark:hover:border-white"}`}
          >
            <span className="font-sans text-sm font-semibold">Drop an EPUB to import</span>
            <span className="mt-1 font-sans text-xs text-black/55 dark:text-white/55">or choose a file</span>
          </button>
          <p className="mt-4 max-w-lg font-sans text-xs leading-relaxed text-black/50 dark:text-white/50">{localStorageDescription}</p>
        </section>
      ) : (
        <div className="space-y-10">
          <section aria-labelledby="continue-reading-title">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="continue-reading-title" className="font-serif text-xl font-semibold">Continue reading</h2>
              <p className="font-sans text-xs text-black/50 dark:text-white/50">Most recently opened</p>
            </div>
            <BookCard book={state.books[0]} isContinue onOpen={onBookSelect} onDelete={requestDelete} />
          </section>

          {state.books.length > 1 && (
            <section aria-labelledby="your-books-title">
              <h2 id="your-books-title" className="mb-4 font-serif text-xl font-semibold">Your books</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" id="lib-books-grid">
                {state.books.slice(1).map((book) => (
                  <div key={book.id} className="contents">
                    <BookCard book={book} isContinue={false} onOpen={onBookSelect} onDelete={requestDelete} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <dialog
        ref={deleteDialogRef}
        id="delete-confirm-modal"
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-description"
        onClose={cancelDelete}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] max-w-none border border-black/20 bg-white p-6 text-black shadow-2xl backdrop:bg-black/65 dark:border-white/20 dark:bg-neutral-900 dark:text-white dark:backdrop:bg-black/75"
      >
        {state.bookToDelete && (
          <>
            <h2 id="delete-confirm-title" className="font-sans text-xs font-bold uppercase tracking-[0.15em]">Remove this book?</h2>
            <p className="mt-3 font-serif text-lg italic">{state.bookToDelete.title}</p>
            <p id="delete-confirm-description" className="mt-3 text-sm leading-relaxed text-black/65 dark:text-white/65">
              This removes the local EPUB copy, reading progress, highlights, and saved vocabulary for this book.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={cancelDelete}
                id="btn-delete-cancel"
                className="rounded-sm border border-black/20 px-4 py-2 font-sans text-[10px] font-bold uppercase tracking-wider text-black/70 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black dark:border-white/20 dark:text-white/70 dark:hover:bg-white/10 dark:focus-visible:outline-white"
              >
                Keep book
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                id="btn-delete-confirm"
                className="rounded-sm border border-black bg-black px-4 py-2 font-sans text-[10px] font-bold uppercase tracking-wider text-white hover:bg-transparent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-black dark:border-white dark:bg-white dark:text-black dark:hover:bg-transparent dark:hover:text-white dark:focus-visible:outline-white"
              >
                Remove book
              </button>
            </div>
          </>
        )}
      </dialog>
    </main>
  );
}
