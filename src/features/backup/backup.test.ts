import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { exportBackup, restoreBackup, validateBackup } from "./backup";
import type { BookStorage } from "../storage/storage";
import type { Book, Highlight, SavedWord, ReaderSettings } from "../../types";

const settings: ReaderSettings = { theme: "dark", fontFamily: "Literata", fontSize: 18, lineHeight: 1.7, contentWidth: 740, viewMode: "single" };
const book: Book = { id: "old_book", title: "A book", author: "An author", fileName: "book.epub", createdAt: "2026-10-03", lastOpenedAt: "2026-10-03", progress: { chapterIndex: 2, scrollPercent: 42 } };

function memoryStorage() {
  const books = new Map([[book.id, structuredClone(book)]]);
  const files = new Map([[book.id, new TextEncoder().encode("EPUB test bytes").buffer]]);
  const highlights = new Map<string, Highlight>([["h", { id: "h", bookId: book.id, chapterIndex: 2, text: "passage", prefixContext: "before ", suffixContext: " after", color: "custom-highlight-yellow", createdAt: "2026-10-03" }]]);
  const words = new Map<string, SavedWord>([["w", { id: "w", bookId: book.id, word: "word", sentenceContext: "a word", definition: "meaning", createdAt: "2026-10-03" }]]);
  let savedSettings = structuredClone(settings);
  const storage: BookStorage = {
    getAllBooks: async () => [...books.values()],
    saveBookMetadata: async b => { books.set(b.id, b); },
    deleteBookMetadata: async id => { books.delete(id); },
    saveBookFile: async (id, bytes) => { files.set(id, bytes); },
    getBookFile: async id => files.get(id) || null,
    deleteBookFile: async id => { files.delete(id); },
    deleteBook: async id => {
      books.delete(id); files.delete(id);
      for (const [key, h] of highlights) if (h.bookId === id) highlights.delete(key);
      for (const [key, w] of words) if (w.bookId === id) words.delete(key);
    },
    getBookHighlights: async id => [...highlights.values()].filter(h => h.bookId === id),
    saveHighlight: async h => { highlights.set(h.id, h); },
    deleteHighlight: async id => { highlights.delete(id); },
    getBookSavedWords: async id => [...words.values()].filter(w => w.bookId === id),
    saveSavedWord: async w => { words.set(w.id, w); },
    deleteSavedWord: async id => { words.delete(id); },
    getReaderSettings: async () => savedSettings,
    saveReaderSettings: async s => { savedSettings = s; },
  };
  return { storage, books, files, highlights, words };
}

test("backup round trip preserves reading data and keeps existing books", async () => {
  const state = memoryStorage();
  const backup = await exportBackup(state.storage);
  const restored = await restoreBackup(backup.buffer as ArrayBuffer, state.storage, async bytes => {
    assert.equal(new TextDecoder().decode(bytes), "EPUB test bytes");
    return {} as never;
  });
  assert.equal(restored, 1);
  assert.equal(state.books.size, 2);
  const copy = [...state.books.values()].find(b => b.id !== book.id)!;
  assert.deepEqual(copy.progress, book.progress);
  assert.equal((await state.storage.getBookHighlights(copy.id))[0].prefixContext, "before ");
  assert.equal((await state.storage.getBookSavedWords(copy.id))[0].definition, "meaning");
  assert.deepEqual(await state.storage.getReaderSettings(), settings);
});

test("failed restore rolls back new copies and preserves the original library", async () => {
  const state = memoryStorage();
  const backup = await exportBackup(state.storage);
  state.storage.saveSavedWord = async () => { throw new Error("disk full"); };
  await assert.rejects(restoreBackup(backup.buffer as ArrayBuffer, state.storage, async () => ({} as never)), /disk full/);
  assert.deepEqual([...state.books.values()], [book]);
  assert.deepEqual([...state.files.keys()], [book.id]);
  assert.equal(state.highlights.size, 1);
  assert.equal(state.words.size, 1);
});

test("invalid metadata, traversal IDs and missing EPUB fail before writes", async () => {
  const state = memoryStorage();
  const backup = await exportBackup(state.storage);
  const zip = await JSZip.loadAsync(backup);
  const data = JSON.parse(await zip.file("manifest.json")!.async("string"));
  data.books[0].id = "../../escape";
  assert.throws(() => validateBackup(data));
  zip.remove(`books/${book.id}.epub`);
  await assert.rejects(restoreBackup(await zip.generateAsync({ type: "arraybuffer" }), state.storage), /missing the EPUB/);
  assert.equal(state.books.size, 1);
});
