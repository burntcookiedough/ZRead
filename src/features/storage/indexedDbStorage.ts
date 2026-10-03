/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Book, Highlight, SavedWord, ReaderSettings } from "@/types";
import { DEFAULT_READER_SETTINGS } from "./storage";
import type { BookStorage } from "./storage";

const DB_NAME = "epub-reader-db";
const DB_VERSION = 1;

interface DbStoreConfig {
  name: string;
  keyPath: string;
}

export interface LegacyStorageSnapshot {
  books: Book[];
  highlights: Highlight[];
  savedWords: SavedWord[];
  bookFiles: Array<{ id: string; fileData: ArrayBuffer }>;
  readerSettings: ReaderSettings | null;
}

const STORES: DbStoreConfig[] = [
  { name: "book_files", keyPath: "id" },
  { name: "books", keyPath: "id" },
  { name: "highlights", keyPath: "id" },
  { name: "saved_words", keyPath: "id" },
];

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      STORES.forEach((store) => {
        if (!db.objectStoreNames.contains(store.name)) {
          db.createObjectStore(store.name, { keyPath: store.keyPath });
        }
      });
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

function waitForTransaction(db: IDBDatabase, tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB transaction failed."));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB transaction was aborted."));
    };
  });
}

// Global DB Operations
export async function saveBookFile(bookId: string, fileData: ArrayBuffer): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("book_files", "readwrite");
  const complete = waitForTransaction(db, tx);
  tx.objectStore("book_files").put({ id: bookId, fileData });
  return complete;
}

export async function getBookFile(bookId: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("book_files", "readonly");
    const store = tx.objectStore("book_files");
    const req = store.get(bookId);
    req.onsuccess = () => {
      db.close();
      resolve(req.result ? req.result.fileData : null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function deleteBookFile(bookId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("book_files", "readwrite");
  const complete = waitForTransaction(db, tx);
  tx.objectStore("book_files").delete(bookId);
  return complete;
}

// Metadata Operations - Books
export async function getAllBooks(): Promise<Book[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("books", "readonly");
    const store = tx.objectStore("books");
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      const books = req.result as Book[];
      // Sort by lastOpenedAt descending
      books.sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime());
      resolve(books);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function saveBookMetadata(book: Book): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("books", "readwrite");
  const complete = waitForTransaction(db, tx);
  tx.objectStore("books").put(book);
  return complete;
}

export async function deleteBookMetadata(bookId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("books", "readwrite");
  const complete = waitForTransaction(db, tx);
  tx.objectStore("books").delete(bookId);
  return complete;
}

export async function deleteBook(bookId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["books", "book_files", "highlights", "saved_words"], "readwrite");
    const booksStore = tx.objectStore("books");
    const filesStore = tx.objectStore("book_files");
    const highlightsStore = tx.objectStore("highlights");
    const savedWordsStore = tx.objectStore("saved_words");

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB book deletion was aborted."));
    };

    booksStore.delete(bookId);
    filesStore.delete(bookId);

    const highlightsReq = highlightsStore.getAll();
    highlightsReq.onsuccess = () => {
      const highlights = highlightsReq.result as Highlight[];
      highlights
        .filter((highlight) => highlight.bookId === bookId)
        .forEach((highlight) => highlightsStore.delete(highlight.id));
    };

    const savedWordsReq = savedWordsStore.getAll();
    savedWordsReq.onsuccess = () => {
      const savedWords = savedWordsReq.result as SavedWord[];
      savedWords
        .filter((word) => word.bookId === bookId)
        .forEach((word) => savedWordsStore.delete(word.id));
    };
  });
}

/** Read every legacy record without modifying or deleting the IndexedDB source. */
export async function getLegacyStorageSnapshot(): Promise<LegacyStorageSnapshot> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["books", "highlights", "saved_words", "book_files"], "readonly");
    const booksRequest = tx.objectStore("books").getAll();
    const highlightsRequest = tx.objectStore("highlights").getAll();
    const savedWordsRequest = tx.objectStore("saved_words").getAll();
    const bookFilesRequest = tx.objectStore("book_files").getAll();
    const snapshot: LegacyStorageSnapshot = {
      books: [],
      highlights: [],
      savedWords: [],
      bookFiles: [],
      readerSettings: getLegacyReaderSettings(),
    };

    booksRequest.onsuccess = () => { snapshot.books = booksRequest.result as Book[]; };
    highlightsRequest.onsuccess = () => { snapshot.highlights = highlightsRequest.result as Highlight[]; };
    savedWordsRequest.onsuccess = () => { snapshot.savedWords = savedWordsRequest.result as SavedWord[]; };
    bookFilesRequest.onsuccess = () => {
      snapshot.bookFiles = bookFilesRequest.result as LegacyStorageSnapshot["bookFiles"];
    };
    tx.oncomplete = () => {
      db.close();
      resolve(snapshot);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Could not read legacy library records."));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("Could not read legacy library records."));
    };
  });
}

// Highlights
export async function getBookHighlights(bookId: string): Promise<Highlight[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("highlights", "readonly");
    const store = tx.objectStore("highlights");
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      const all = req.result as Highlight[];
      resolve(all.filter((h) => h.bookId === bookId));
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function saveHighlight(highlight: Highlight): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("highlights", "readwrite");
  const complete = waitForTransaction(db, tx);
  tx.objectStore("highlights").put(highlight);
  return complete;
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("highlights", "readwrite");
  const complete = waitForTransaction(db, tx);
  tx.objectStore("highlights").delete(id);
  return complete;
}

// Saved Words (Vocabulary)
export async function getBookSavedWords(bookId: string): Promise<SavedWord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("saved_words", "readonly");
    const store = tx.objectStore("saved_words");
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      const all = req.result as SavedWord[];
      resolve(all.filter((w) => w.bookId === bookId));
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function saveSavedWord(wordItem: SavedWord): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("saved_words", "readwrite");
  const complete = waitForTransaction(db, tx);
  tx.objectStore("saved_words").put(wordItem);
  return complete;
}

export async function deleteSavedWord(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("saved_words", "readwrite");
  const complete = waitForTransaction(db, tx);
  tx.objectStore("saved_words").delete(id);
  return complete;
}

// Settings Operation (using localStorage to keep it simple, since reader settings are lightweight config)
const SETTINGS_KEY = "epub-reader-settings";
export async function getReaderSettings(): Promise<ReaderSettings> {
  return getLegacyReaderSettings() ?? { ...DEFAULT_READER_SETTINGS };
}

function getLegacyReaderSettings(): ReaderSettings | null {
  const data = localStorage.getItem(SETTINGS_KEY);
  if (!data) return null;
  try {
    return { ...DEFAULT_READER_SETTINGS, ...JSON.parse(data) };
  } catch {
    return { ...DEFAULT_READER_SETTINGS };
  }
}

export async function saveReaderSettings(settings: ReaderSettings): Promise<void> {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export const indexedDbStorage: BookStorage = {
  saveBookFile,
  getBookFile,
  deleteBookFile,
  deleteBook,
  getAllBooks,
  saveBookMetadata,
  deleteBookMetadata,
  getBookHighlights,
  saveHighlight,
  deleteHighlight,
  getBookSavedWords,
  saveSavedWord,
  deleteSavedWord,
  getReaderSettings,
  saveReaderSettings,
};
