import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { Book, Highlight, ReaderSettings, SavedWord } from "@/types";
import {
  createDesktopSqliteStorage,
  initializeDesktopSchema,
  isLegacyMigrationComplete,
  migrateLegacyRecords,
  type DesktopSqlDatabase,
} from "./desktopSqliteStorage";
import type { LegacyStorageSnapshot } from "./indexedDbStorage";
import { DEFAULT_READER_SETTINGS } from "./storage";

function createInMemoryDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  const db: DesktopSqlDatabase = {
    async execute(query, values = []) {
      const named = Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value])) as Record<string, string>;
      const result = sqlite.prepare(query).run(named);
      return { rowsAffected: Number(result.changes) };
    },
    async select<T>(query: string, values = []) {
      const named = Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value])) as Record<string, string>;
      return sqlite.prepare(query).all(named) as T;
    },
  };
  return { db, close: () => sqlite.close() };
}

const book: Book = {
  id: "book_123",
  title: "A Local Book",
  author: "A. Reader",
  fileName: "local.epub",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: "2026-02-01T00:00:00.000Z",
  progress: { chapterIndex: 3, scrollPercent: 63 },
};

const highlight: Highlight = {
  id: "highlight_1",
  bookId: book.id,
  chapterIndex: 2,
  text: "A saved passage",
  color: "custom-highlight-yellow",
  createdAt: "2026-02-01T00:00:00.000Z",
};

const word: SavedWord = {
  id: "word_1",
  bookId: book.id,
  word: "tenacious",
  sentenceContext: "A tenacious reader.",
  definition: "Persistent.",
  createdAt: "2026-02-01T00:00:00.000Z",
};

const legacySettings: ReaderSettings = {
  ...DEFAULT_READER_SETTINGS,
  theme: "warm",
  fontSize: 21,
};

function legacySnapshot(): LegacyStorageSnapshot {
  return {
    books: [book],
    highlights: [highlight],
    savedWords: [word],
    bookFiles: [{ id: book.id, fileData: new Uint8Array([1, 2, 3]).buffer }],
    readerSettings: legacySettings,
  };
}

test("legacy migration is idempotent, persists all records, and cascades deletion", async () => {
  const { db, close } = createInMemoryDatabase();
  try {
    await initializeDesktopSchema(db);
    const store = createDesktopSqliteStorage(db);
    assert.deepEqual(await store.getReaderSettings(), DEFAULT_READER_SETTINGS);
    const source = legacySnapshot();
    let copiedFiles = 0;
    assert.equal(await migrateLegacyRecords(db, source, async (files) => { copiedFiles += files.length; }), true);

    assert.deepEqual(await store.getAllBooks(), [book]);
    assert.deepEqual(await store.getBookHighlights(book.id), [highlight]);
    assert.deepEqual(await store.getBookSavedWords(book.id), [word]);
    assert.deepEqual(await store.getReaderSettings(), legacySettings);
    assert.equal(copiedFiles, 1);
    assert.equal(source.books.length, 1, "migration must leave the IndexedDB source records intact");

    const updatedBook = { ...book, progress: { chapterIndex: 4, scrollPercent: 70 } };
    const updatedSettings = { ...legacySettings, fontSize: 24 };
    await store.saveBookMetadata(updatedBook);
    await store.saveReaderSettings(updatedSettings);
    assert.equal(await migrateLegacyRecords(db, source, async () => { throw new Error("must not copy twice"); }), false);
    assert.deepEqual(await store.getAllBooks(), [updatedBook]);
    assert.deepEqual(await store.getReaderSettings(), updatedSettings);

    await store.deleteBook(book.id);
    assert.deepEqual(await store.getAllBooks(), []);
    assert.deepEqual(await store.getBookHighlights(book.id), []);
    assert.deepEqual(await store.getBookSavedWords(book.id), []);
    await assert.rejects(store.saveHighlight(highlight), /no longer in the library/);
    await assert.rejects(store.saveSavedWord(word), /no longer in the library/);
    assert.equal(await isLegacyMigrationComplete(db), true);
  } finally {
    close();
  }
});

test("failed file copy leaves migration retryable and does not mark partial data complete", async () => {
  const { db, close } = createInMemoryDatabase();
  try {
    await initializeDesktopSchema(db);
    const source = legacySnapshot();
    const store = createDesktopSqliteStorage(db);
    const sqliteBook = { ...book, title: "Existing SQLite book" };
    await store.saveBookMetadata(sqliteBook);
    await assert.rejects(
      migrateLegacyRecords(db, source, async () => { throw new Error("filesystem unavailable"); }),
      /filesystem unavailable/,
    );
    assert.equal(await isLegacyMigrationComplete(db), false);

    const copied: string[] = [];
    await migrateLegacyRecords(db, source, async (files) => { copied.push(...files.map(({ id }) => id)); });
    assert.deepEqual(await store.getAllBooks(), [sqliteBook], "migration must not overwrite a newer SQLite row");
    assert.deepEqual(copied, [book.id]);
    assert.equal(source.bookFiles.length, 1, "failed migration must leave legacy file data intact");
    assert.equal(await isLegacyMigrationComplete(db), true);
  } finally {
    close();
  }
});
