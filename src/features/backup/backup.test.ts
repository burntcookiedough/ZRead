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

function archiveExpandedSize(zip: JSZip) {
  return Object.values(zip.files).reduce((total, entry) => {
    return total + ((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0);
  }, 0);
}

async function makeArchive(
  books: Book[],
  highlights: Highlight[] = [],
  savedWords: SavedWord[] = [],
  compression: "STORE" | "DEFLATE" = "STORE",
) {
  const zip = new JSZip();
  const data = { format: "zreadbackup" as const, version: 1 as const, books, highlights, savedWords, settings };
  for (const item of books) zip.file(`books/${item.id}.epub`, new Uint8Array([1, 2, 3]), { compression });
  zip.file("manifest.json", JSON.stringify(data), { compression });
  return zip.generateAsync({ type: "uint8array", compression });
}

function corruptStoredText(bytes: Uint8Array, text: string, replacement: string) {
  const original = new TextEncoder().encode(text);
  const changed = new TextEncoder().encode(replacement);
  assert.equal(original.byteLength, changed.byteLength);
  const copy = bytes.slice();
  let offset = -1;
  outer: for (let i = 0; i <= copy.length - original.length; i++) {
    for (let j = 0; j < original.length; j++) if (copy[i + j] !== original[j]) continue outer;
    offset = i;
    break;
  }
  assert.notEqual(offset, -1, `could not find ${text} in the stored archive`);
  copy.set(changed, offset);
  return copy;
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

test("restore rejects CRC-corrupt manifest before validation or writes", async () => {
  const state = memoryStorage();
  const bytes = corruptStoredText(await makeArchive([book]), "A book", "B book");
  const before = {
    books: [...state.books.values()],
    files: [...state.files.entries()],
    highlights: [...state.highlights.entries()],
    words: [...state.words.entries()],
    settings: await state.storage.getReaderSettings(),
  };
  let epubValidations = 0;

  await assert.rejects(
    restoreBackup(bytes.buffer as ArrayBuffer, state.storage, async () => {
      epubValidations++;
      return {} as never;
    }),
    /CRC32 mismatch/,
  );

  assert.equal(epubValidations, 0);
  assert.deepEqual([...state.books.values()], before.books);
  assert.deepEqual([...state.files.entries()], before.files);
  assert.deepEqual([...state.highlights.entries()], before.highlights);
  assert.deepEqual([...state.words.entries()], before.words);
  assert.deepEqual(await state.storage.getReaderSettings(), before.settings);
});

test("export and restore enforce the same size limit without large allocations", async () => {
  const state = memoryStorage();
  let seed = 0x12345678;
  const incompressibleEpub = new Uint8Array(32 * 1024);
  for (let i = 0; i < incompressibleEpub.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    incompressibleEpub[i] = seed & 0xff;
  }
  state.files.set(book.id, incompressibleEpub.buffer);

  const archive = await exportBackup(state.storage, 1024 * 1024);
  const inspection = await JSZip.loadAsync(archive);
  const expanded = archiveExpandedSize(inspection);
  assert.ok(archive.byteLength > expanded, "fixture must reach the compressed export limit after expanded preflight");
  await assert.rejects(
    exportBackup(state.storage, expanded),
    /compressed restore limit.*library was not changed/i,
  );

  const before = [...state.books.values()];
  await assert.rejects(
    restoreBackup(archive.buffer as ArrayBuffer, state.storage, async () => ({} as never), archive.byteLength - 1),
    /compressed .* restore limit/,
  );
  assert.deepEqual([...state.books.values()], before);
});

test("restore accepts the expanded-size boundary and rejects one byte below it before writes", async () => {
  const boundaryBook = { ...book, title: "repeated title ".repeat(700) };
  const archive = await makeArchive([boundaryBook], [], [], "DEFLATE");
  const zip = await JSZip.loadAsync(archive);
  const expanded = archiveExpandedSize(zip);
  assert.ok(archive.byteLength < expanded, "fixture must allow testing the expanded limit independently");

  const accepted = memoryStorage();
  assert.equal(await restoreBackup(archive.buffer as ArrayBuffer, accepted.storage, async () => ({} as never), expanded), 1);

  const rejected = memoryStorage();
  await assert.rejects(
    restoreBackup(archive.buffer as ArrayBuffer, rejected.storage, async () => ({} as never), expanded - 1),
    /Expanded backup exceeds/,
  );
  assert.deepEqual([...rejected.books.values()], [book]);
});

test("restore distributes dense annotations across many books", async () => {
  const bookCount = 400;
  const perBook = 100;
  const books = Array.from({ length: bookCount }, (_, index) => ({
    ...book,
    id: `backup_${index}`,
    title: `Book ${index}`,
  }));
  const highlights = books.flatMap((item, bookIndex) => Array.from({ length: perBook }, (_, index): Highlight => ({
    id: `highlight_${bookIndex}_${index}`,
    bookId: item.id,
    chapterIndex: index,
    text: `passage ${bookIndex} ${index}`,
    color: "yellow",
    createdAt: "2026-10-03",
  })));
  const savedWords = books.flatMap((item, bookIndex) => Array.from({ length: perBook }, (_, index): SavedWord => ({
    id: `word_${bookIndex}_${index}`,
    bookId: item.id,
    word: `word-${bookIndex}-${index}`,
    sentenceContext: `sentence ${bookIndex} ${index}`,
    createdAt: "2026-10-03",
  })));
  const archive = await makeArchive(books, highlights, savedWords, "DEFLATE");
  const state = memoryStorage();

  assert.equal(await restoreBackup(archive.buffer as ArrayBuffer, state.storage, async () => ({} as never)), bookCount);
  const restored = [...state.books.values()].filter(item => item.id !== book.id);
  assert.equal(restored.length, bookCount);
  for (const index of [0, 199, 399]) {
    const copy = restored.find(item => item.title === `Book ${index}`)!;
    const bookHighlights = await state.storage.getBookHighlights(copy.id);
    const words = await state.storage.getBookSavedWords(copy.id);
    assert.equal(bookHighlights.length, perBook);
    assert.equal(words.length, perBook);
    assert.ok(bookHighlights.every(item => item.bookId === copy.id && item.text.startsWith(`passage ${index} `)));
    assert.ok(words.every(item => item.bookId === copy.id && item.word.startsWith(`word-${index}-`)));
  }
});
