import { isTauriRuntime } from "@/app/runtime";
import { indexedDbStorage, getLegacyStorageSnapshot } from "./indexedDbStorage";
import type { BookStorage } from "./storage";
import {
  desktopSqliteStorage,
  initializeDesktopDatabase,
  isLegacyMigrationComplete,
  migrateLegacyRecords,
} from "./desktopSqliteStorage";

const BOOKS_DIR = "books";
const BOOK_ID_PATTERN = /^[a-zA-Z0-9_-]{1,160}$/;

function isSafeBookId(bookId: string) {
  return BOOK_ID_PATTERN.test(bookId);
}

async function getFs() {
  return import("@tauri-apps/plugin-fs");
}

function getBookPath(bookId: string) {
  if (!isSafeBookId(bookId)) throw new Error("Invalid book ID for an app-owned EPUB file.");
  return `${BOOKS_DIR}/${bookId}.epub`;
}

function toUint8Array(fileData: ArrayBuffer) {
  return new Uint8Array(fileData);
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function ensureBooksDirectory() {
  const { BaseDirectory, mkdir } = await getFs();
  await mkdir(BOOKS_DIR, {
    baseDir: BaseDirectory.AppData,
    recursive: true,
  });
}

async function hasAppOwnedBookFile(bookId: string) {
  if (!isSafeBookId(bookId)) return false;
  const { BaseDirectory, exists } = await getFs();
  return exists(getBookPath(bookId), { baseDir: BaseDirectory.AppData });
}

async function deleteAppOwnedBookFile(bookId: string) {
  if (!isSafeBookId(bookId)) return;
  const { BaseDirectory, exists, remove } = await getFs();
  const bookPath = getBookPath(bookId);
  if (await exists(bookPath, { baseDir: BaseDirectory.AppData })) {
    await remove(bookPath, { baseDir: BaseDirectory.AppData });
  }
}

async function saveBookFile(bookId: string, fileData: ArrayBuffer): Promise<void> {
  const bookPath = getBookPath(bookId);
  const { BaseDirectory, writeFile } = await getFs();
  await ensureBooksDirectory();
  await writeFile(bookPath, toUint8Array(fileData), {
    baseDir: BaseDirectory.AppData,
  });
}

async function getBookFile(bookId: string): Promise<ArrayBuffer | null> {
  if (!isSafeBookId(bookId)) return indexedDbStorage.getBookFile(bookId);
  const bookPath = getBookPath(bookId);
  const { BaseDirectory, exists, readFile } = await getFs();
  if (await exists(bookPath, { baseDir: BaseDirectory.AppData })) {
    const bytes = await readFile(bookPath, { baseDir: BaseDirectory.AppData });
    return toArrayBuffer(bytes);
  }
  return indexedDbStorage.getBookFile(bookId);
}

async function deleteBookFile(bookId: string): Promise<void> {
  await deleteAppOwnedBookFile(bookId);
}

async function copyLegacyBookFiles(files: Array<{ id: string; fileData: ArrayBuffer }>) {
  for (const file of files) {
    if (!isSafeBookId(file.id)) continue;
    if (await hasAppOwnedBookFile(file.id)) continue;
    await saveBookFile(file.id, file.fileData);
  }
}

let desktopStorageInitialization: Promise<void> | undefined;

export function initializeDesktopStorage(): Promise<void> {
  if (!isTauriRuntime) return Promise.resolve();
  if (!desktopStorageInitialization) {
    desktopStorageInitialization = (async () => {
      const db = await initializeDesktopDatabase();
      if (!db || await isLegacyMigrationComplete(db)) return;
      const snapshot = await getLegacyStorageSnapshot();
      await migrateLegacyRecords(db, snapshot, copyLegacyBookFiles);
    })().catch((error) => {
      desktopStorageInitialization = undefined;
      throw error;
    });
  }
  return desktopStorageInitialization;
}

async function deleteBook(bookId: string): Promise<void> {
  const previousBook = (await desktopSqliteStorage.getAllBooks()).find((book) => book.id === bookId);
  const previousHighlights = previousBook ? await desktopSqliteStorage.getBookHighlights(bookId) : [];
  const previousWords = previousBook ? await desktopSqliteStorage.getBookSavedWords(bookId) : [];
  const hadAppOwnedFile = await hasAppOwnedBookFile(bookId);
  const previousFile = hadAppOwnedFile ? await getBookFile(bookId) : null;
  let sqliteDeleted = false;
  let fileDeletionStarted = false;
  try {
    await desktopSqliteStorage.deleteBook(bookId);
    sqliteDeleted = true;
    await indexedDbStorage.deleteBook(bookId);
    fileDeletionStarted = true;
    await deleteAppOwnedBookFile(bookId);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (sqliteDeleted && previousBook) {
      try {
        await desktopSqliteStorage.saveBookMetadata(previousBook);
        for (const highlight of previousHighlights) await desktopSqliteStorage.saveHighlight(highlight);
        for (const word of previousWords) await desktopSqliteStorage.saveSavedWord(word);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (fileDeletionStarted && hadAppOwnedFile && previousFile) {
      try {
        if (!await hasAppOwnedBookFile(bookId)) await saveBookFile(bookId, previousFile);
      } catch (restoreError) {
        rollbackErrors.push(restoreError);
      }
    }
    if (rollbackErrors.length) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Book deletion failed and its library data could not be fully restored.",
      );
    }
    throw error;
  }
}

export const desktopStorage: BookStorage = {
  ...desktopSqliteStorage,
  saveBookFile,
  getBookFile,
  deleteBookFile,
  deleteBook,
};
