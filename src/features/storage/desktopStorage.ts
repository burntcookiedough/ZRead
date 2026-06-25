import { indexedDbStorage } from "./indexedDbStorage";
import type { BookStorage } from "./storage";

const BOOKS_DIR = "books";

async function getFs() {
  return import("@tauri-apps/plugin-fs");
}

function getBookPath(bookId: string) {
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

async function deleteAppOwnedBookFile(bookId: string) {
  const { BaseDirectory, exists, remove } = await getFs();
  const bookPath = getBookPath(bookId);
  const fileExists = await exists(bookPath, { baseDir: BaseDirectory.AppData });
  if (!fileExists) return;

  await remove(bookPath, { baseDir: BaseDirectory.AppData });
}

async function saveBookFile(bookId: string, fileData: ArrayBuffer): Promise<void> {
  const { BaseDirectory, writeFile } = await getFs();
  await ensureBooksDirectory();
  await writeFile(getBookPath(bookId), toUint8Array(fileData), {
    baseDir: BaseDirectory.AppData,
  });
}

async function getBookFile(bookId: string): Promise<ArrayBuffer | null> {
  const bookPath = getBookPath(bookId);

  try {
    const { BaseDirectory, exists, readFile } = await getFs();
    const fileExists = await exists(bookPath, { baseDir: BaseDirectory.AppData });
    if (fileExists) {
      const bytes = await readFile(bookPath, { baseDir: BaseDirectory.AppData });
      return toArrayBuffer(bytes);
    }
  } catch (err) {
    console.warn("Failed to read app-owned EPUB copy; falling back to IndexedDB.", err);
  }

  return indexedDbStorage.getBookFile(bookId);
}

async function deleteBookFile(bookId: string): Promise<void> {
  try {
    await deleteAppOwnedBookFile(bookId);
  } catch (err) {
    console.warn("Failed to delete app-owned EPUB copy.", err);
  }

  await indexedDbStorage.deleteBookFile(bookId);
}

async function deleteBook(bookId: string): Promise<void> {
  await deleteBookFile(bookId);
  await indexedDbStorage.deleteBook(bookId);
}

export const desktopStorage: BookStorage = {
  ...indexedDbStorage,
  saveBookFile,
  getBookFile,
  deleteBookFile,
  deleteBook,
};
