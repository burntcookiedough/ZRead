/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Book, Highlight, SavedWord, ReaderSettings } from "@/types";
import type { BookStorage } from "./storage";

const DB_NAME = "epub-reader-db";
const DB_VERSION = 1;

interface DbStoreConfig {
  name: string;
  keyPath: string;
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

// Global DB Operations
export async function saveBookFile(bookId: string, fileData: ArrayBuffer): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("book_files", "readwrite");
    const store = tx.objectStore("book_files");
    const req = store.put({ id: bookId, fileData });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getBookFile(bookId: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("book_files", "readonly");
    const store = tx.objectStore("book_files");
    const req = store.get(bookId);
    req.onsuccess = () => {
      resolve(req.result ? req.result.fileData : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBookFile(bookId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("book_files", "readwrite");
    const store = tx.objectStore("book_files");
    const req = store.delete(bookId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Metadata Operations - Books
export async function getAllBooks(): Promise<Book[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("books", "readonly");
    const store = tx.objectStore("books");
    const req = store.getAll();
    req.onsuccess = () => {
      const books = req.result as Book[];
      // Sort by lastOpenedAt descending
      books.sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime());
      resolve(books);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveBookMetadata(book: Book): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("books", "readwrite");
    const store = tx.objectStore("books");
    const req = store.put(book);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBookMetadata(bookId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("books", "readwrite");
    const store = tx.objectStore("books");
    const req = store.delete(bookId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
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
      const all = req.result as Highlight[];
      resolve(all.filter((h) => h.bookId === bookId));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveHighlight(highlight: Highlight): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("highlights", "readwrite");
    const store = tx.objectStore("highlights");
    const req = store.put(highlight);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("highlights", "readwrite");
    const store = tx.objectStore("highlights");
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Saved Words (Vocabulary)
export async function getBookSavedWords(bookId: string): Promise<SavedWord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("saved_words", "readonly");
    const store = tx.objectStore("saved_words");
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result as SavedWord[];
      resolve(all.filter((w) => w.bookId === bookId));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveSavedWord(wordItem: SavedWord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("saved_words", "readwrite");
    const store = tx.objectStore("saved_words");
    const req = store.put(wordItem);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSavedWord(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("saved_words", "readwrite");
    const store = tx.objectStore("saved_words");
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Settings Operation (using localStorage to keep it simple, since reader settings are lightweight config)
const SETTINGS_KEY = "epub-reader-settings";
const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "dark",
  fontFamily: "Literata",
  fontSize: 18,
  lineHeight: 1.7,
  contentWidth: 740,
  viewMode: "single",
};

export function getReaderSettings(): ReaderSettings {
  const data = localStorage.getItem(SETTINGS_KEY);
  if (!data) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export const indexedDbStorage: BookStorage = {
  saveBookFile,
  getBookFile,
  deleteBookFile,
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
