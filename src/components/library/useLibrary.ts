import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, MouseEvent } from "react";
import { isTauriRuntime } from "@/app/runtime";
import { storage } from "@/features/storage";
import type { Book } from "../../types";
import { parseEpub } from "../../utils/epubParser";

function isEpubFileName(fileName: string) {
  return fileName.toLowerCase().endsWith(".epub");
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || "Imported EPUB";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useLibrary(onBookSelect: (bookId: string) => void) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeImportBusy = useRef(false);

  const refreshBooks = useCallback(async () => {
    try {
      setLoading(true);
      setBooks(await storage.getAllBooks());
      setUploadError(null);
    } catch (error) {
      console.error("Failed to load local books:", error);
      setUploadError("Could not load your library. Your reading data has not been deleted. Try reopening the app.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBooks();
  }, [refreshBooks]);

  const importEpubFromBuffer = useCallback(async (arrayBuffer: ArrayBuffer, fileName: string) => {
    const parsed = await parseEpub(arrayBuffer);
    const bookId = `book_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newBook: Book = {
      id: bookId,
      title: parsed.title,
      author: parsed.author,
      fileName,
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      progress: { chapterIndex: 0, scrollPercent: 0 },
    };

    await storage.saveBookFile(bookId, arrayBuffer);
    try {
      await storage.saveBookMetadata(newBook);
    } catch (error) {
      await storage.deleteBookFile(bookId);
      throw error;
    }

    await refreshBooks();
    onBookSelect(bookId);
  }, [onBookSelect, refreshBooks]);

  const importBrowserFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (!isEpubFileName(file.name) && file.type !== "application/epub+zip") {
      setUploadError("This reader currently only supports standard EPUB files. Please select a valid document.");
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    try {
      await importEpubFromBuffer(await file.arrayBuffer(), file.name);
    } catch (error) {
      console.error("EPUB upload parsing error:", error);
      setUploadError(errorMessage(error, "Could not successfully parse or save this book. The EPUB container might be corrupted."));
    } finally {
      setIsUploading(false);
    }
  }, [importEpubFromBuffer]);

  const importNativeFile = useCallback(async (dropPath?: string) => {
    if (nativeImportBusy.current) return;
    nativeImportBusy.current = true;
    setUploadError(null);
    if (dropPath) setIsUploading(true);

    try {
      let filePath = dropPath;
      let readFile: (path: string) => Promise<Uint8Array>;
      if (filePath) {
        ({ readFile } = await import("@tauri-apps/plugin-fs"));
      } else {
        const [{ open }, fileSystem] = await Promise.all([
          import("@tauri-apps/plugin-dialog"),
          import("@tauri-apps/plugin-fs"),
        ]);
        filePath = await open({
          multiple: false,
          directory: false,
          title: "Import EPUB",
          filters: [{ name: "EPUB", extensions: ["epub"] }],
        });
        readFile = fileSystem.readFile;
        if (!filePath) return;
      }

      const fileName = fileNameFromPath(filePath);
      if (!isEpubFileName(fileName)) {
        throw new Error(dropPath
          ? "Please drop an EPUB file."
          : "This reader currently only supports standard EPUB files. Please select a .epub document.");
      }

      setIsUploading(true);
      const bytes = await readFile(filePath);
      await importEpubFromBuffer(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        fileName,
      );
    } catch (error) {
      console.error(dropPath ? "Native EPUB drop failed:" : "Native EPUB import failed:", error);
      setUploadError(errorMessage(error, dropPath ? "Could not import this EPUB." : "Could not successfully import this EPUB from the desktop file picker."));
    } finally {
      nativeImportBusy.current = false;
      setIsUploading(false);
    }
  }, [importEpubFromBuffer]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/webview").then(async ({ getCurrentWebview }) => {
      const cleanup = await getCurrentWebview().onDragDropEvent((event) => {
        if (disposed) return;
        setDragActive(event.payload.type === "over" || event.payload.type === "enter");
        if (event.payload.type !== "drop" || nativeImportBusy.current) return;
        const path = event.payload.paths[0];
        if (path) void importNativeFile(path);
      });
      if (disposed) cleanup();
      else unlisten = cleanup;
    }).catch(() => {
      if (!disposed) setUploadError("Native file drop is unavailable. Use Import EPUB to choose an EPUB.");
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [importNativeFile]);

  const handleDrag = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") setDragActive(true);
    else if (event.type === "dragleave") setDragActive(false);
  }, []);

  const handleDrop = useCallback(async (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    await importBrowserFile(event.dataTransfer.files?.[0]);
  }, [importBrowserFile]);

  const handleFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    void importBrowserFile(selectedFile);
  }, [importBrowserFile]);

  const triggerFileBrowser = useCallback(() => {
    if (isTauriRuntime) void importNativeFile();
    else fileInputRef.current?.click();
  }, [importNativeFile]);

  const requestDelete = useCallback((book: Book) => setBookToDelete(book), []);
  const cancelDelete = useCallback(() => setBookToDelete(null), []);
  const confirmDelete = useCallback(async () => {
    if (!bookToDelete) return;
    const targetId = bookToDelete.id;
    setBookToDelete(null);
    try {
      await storage.deleteBook(targetId);
      setBooks((current) => current.filter((book) => book.id !== targetId));
    } catch (error) {
      console.error("Delete book failed:", error);
      setUploadError("Could not remove this book. Your library was kept; try again.");
    }
  }, [bookToDelete]);

  return {
    state: { books, loading, dragActive, uploadError, isUploading, bookToDelete },
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
  };
}
