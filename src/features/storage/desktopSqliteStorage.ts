import { isTauriRuntime } from "@/app/runtime";
import type { Book, Highlight, ReaderSettings, SavedWord } from "@/types";
import { DEFAULT_READER_SETTINGS } from "./storage";
import type { LegacyStorageSnapshot } from "./indexedDbStorage";
import type { BookStorage } from "./storage";

export const DESKTOP_DATABASE_URL = "sqlite:zread.db";

export interface DesktopSqlDatabase {
  execute(query: string, values?: unknown[]): Promise<unknown>;
  select<T>(query: string, values?: unknown[]): Promise<T>;
}

interface JsonRow {
  payload: string;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS zread_books (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS zread_highlights (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    payload TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS zread_highlights_book_id ON zread_highlights(book_id)`,
  `CREATE TABLE IF NOT EXISTS zread_saved_words (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    payload TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS zread_saved_words_book_id ON zread_saved_words(book_id)`,
  `CREATE TABLE IF NOT EXISTS zread_reader_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS zread_migrations (
    id TEXT PRIMARY KEY,
    completed_at TEXT NOT NULL
  )`,
  `CREATE TRIGGER IF NOT EXISTS zread_books_delete_cascade
    AFTER DELETE ON zread_books
    BEGIN
      DELETE FROM zread_highlights WHERE book_id = OLD.id;
      DELETE FROM zread_saved_words WHERE book_id = OLD.id;
    END`,
];

export async function initializeDesktopSchema(db: DesktopSqlDatabase): Promise<void> {
  for (const statement of SCHEMA) {
    await db.execute(statement);
  }
}

function parsePayload<T>(rows: JsonRow[]): T[] {
  return rows.map(({ payload }) => JSON.parse(payload) as T);
}

export function createDesktopSqliteStorage(db: DesktopSqlDatabase): Pick<BookStorage,
  | "getAllBooks"
  | "saveBookMetadata"
  | "deleteBookMetadata"
  | "deleteBook"
  | "getBookHighlights"
  | "saveHighlight"
  | "deleteHighlight"
  | "getBookSavedWords"
  | "saveSavedWord"
  | "deleteSavedWord"
  | "getReaderSettings"
  | "saveReaderSettings"
> {
  return {
    async getAllBooks() {
      const rows = await db.select<JsonRow[]>("SELECT payload FROM zread_books");
      return parsePayload<Book>(rows).sort(
        (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime(),
      );
    },

    async saveBookMetadata(book) {
      await db.execute(
        "INSERT INTO zread_books (id, payload) VALUES ($1, $2) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
        [book.id, JSON.stringify(book)],
      );
    },

    async deleteBookMetadata(bookId) {
      await db.execute("DELETE FROM zread_books WHERE id = $1", [bookId]);
    },

    async deleteBook(bookId) {
      await db.execute("DELETE FROM zread_books WHERE id = $1", [bookId]);
    },

    async getBookHighlights(bookId) {
      const rows = await db.select<JsonRow[]>(
        "SELECT payload FROM zread_highlights WHERE book_id = $1 ORDER BY rowid",
        [bookId],
      );
      return parsePayload<Highlight>(rows);
    },

    async saveHighlight(highlight) {
      const result = await db.execute(
        "INSERT INTO zread_highlights (id, book_id, payload) SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM zread_books WHERE id = $2) ON CONFLICT(id) DO UPDATE SET book_id = excluded.book_id, payload = excluded.payload",
        [highlight.id, highlight.bookId, JSON.stringify(highlight)],
      );
      if (hasNoAffectedRows(result)) throw new Error("Cannot save a highlight for a book that is no longer in the library.");
    },

    async deleteHighlight(id) {
      await db.execute("DELETE FROM zread_highlights WHERE id = $1", [id]);
    },

    async getBookSavedWords(bookId) {
      const rows = await db.select<JsonRow[]>(
        "SELECT payload FROM zread_saved_words WHERE book_id = $1 ORDER BY rowid",
        [bookId],
      );
      return parsePayload<SavedWord>(rows);
    },

    async saveSavedWord(wordItem) {
      const result = await db.execute(
        "INSERT INTO zread_saved_words (id, book_id, payload) SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM zread_books WHERE id = $2) ON CONFLICT(id) DO UPDATE SET book_id = excluded.book_id, payload = excluded.payload",
        [wordItem.id, wordItem.bookId, JSON.stringify(wordItem)],
      );
      if (hasNoAffectedRows(result)) throw new Error("Cannot save vocabulary for a book that is no longer in the library.");
    },

    async deleteSavedWord(id) {
      await db.execute("DELETE FROM zread_saved_words WHERE id = $1", [id]);
    },

    async getReaderSettings() {
      const rows = await db.select<JsonRow[]>("SELECT payload FROM zread_reader_settings WHERE id = 1");
      return rows.length
        ? { ...DEFAULT_READER_SETTINGS, ...JSON.parse(rows[0].payload) as Partial<ReaderSettings> }
        : { ...DEFAULT_READER_SETTINGS };
    },

    async saveReaderSettings(settings) {
      await db.execute(
        "INSERT INTO zread_reader_settings (id, payload) VALUES (1, $1) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
        [JSON.stringify(settings)],
      );
    },
  };
}

function hasNoAffectedRows(result: unknown): boolean {
  return typeof result === "object" && result !== null && "rowsAffected" in result && result.rowsAffected === 0;
}

export async function isLegacyMigrationComplete(db: DesktopSqlDatabase): Promise<boolean> {
  const rows = await db.select<Array<{ id: string }>>(
    "SELECT id FROM zread_migrations WHERE id = $1",
    ["indexeddb-v1"],
  );
  return rows.length > 0;
}

/** Migrate records one atomic statement at a time; the source stays intact for recovery. */
export async function migrateLegacyRecords(
  db: DesktopSqlDatabase,
  snapshot: LegacyStorageSnapshot,
  copyBookFiles: (files: LegacyStorageSnapshot["bookFiles"]) => Promise<void>,
): Promise<boolean> {
  if (await isLegacyMigrationComplete(db)) return false;

  for (const book of snapshot.books) {
    await db.execute(
      "INSERT OR IGNORE INTO zread_books (id, payload) VALUES ($1, $2)",
      [book.id, JSON.stringify(book)],
    );
  }
  for (const highlight of snapshot.highlights) {
    await db.execute(
      "INSERT OR IGNORE INTO zread_highlights (id, book_id, payload) VALUES ($1, $2, $3)",
      [highlight.id, highlight.bookId, JSON.stringify(highlight)],
    );
  }
  for (const word of snapshot.savedWords) {
    await db.execute(
      "INSERT OR IGNORE INTO zread_saved_words (id, book_id, payload) VALUES ($1, $2, $3)",
      [word.id, word.bookId, JSON.stringify(word)],
    );
  }
  if (snapshot.readerSettings) {
    await db.execute(
      "INSERT OR IGNORE INTO zread_reader_settings (id, payload) VALUES (1, $1)",
      [JSON.stringify(snapshot.readerSettings)],
    );
  }
  await copyBookFiles(snapshot.bookFiles);
  await db.execute(
    "INSERT OR IGNORE INTO zread_migrations (id, completed_at) VALUES ($1, $2)",
    ["indexeddb-v1", new Date().toISOString()],
  );
  return true;
}

let databasePromise: Promise<DesktopSqlDatabase> | undefined;
let schemaPromise: Promise<void> | undefined;

async function getDatabase(): Promise<DesktopSqlDatabase> {
  if (!databasePromise) {
    databasePromise = import("@tauri-apps/plugin-sql")
      .then(({ default: Database }) => Database.load(DESKTOP_DATABASE_URL))
      .catch((error) => {
        databasePromise = undefined;
        throw error;
      });
  }
  const db = await databasePromise;
  if (!schemaPromise) {
    schemaPromise = initializeDesktopSchema(db).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
  return db;
}

export async function initializeDesktopDatabase(): Promise<DesktopSqlDatabase | null> {
  if (!isTauriRuntime) return null;
  return getDatabase();
}

export const desktopSqliteStorage: ReturnType<typeof createDesktopSqliteStorage> = {
  getAllBooks: async () => createDesktopSqliteStorage(await getDatabase()).getAllBooks(),
  saveBookMetadata: async (book) => createDesktopSqliteStorage(await getDatabase()).saveBookMetadata(book),
  deleteBookMetadata: async (bookId) => createDesktopSqliteStorage(await getDatabase()).deleteBookMetadata(bookId),
  deleteBook: async (bookId) => createDesktopSqliteStorage(await getDatabase()).deleteBook(bookId),
  getBookHighlights: async (bookId) => createDesktopSqliteStorage(await getDatabase()).getBookHighlights(bookId),
  saveHighlight: async (highlight) => createDesktopSqliteStorage(await getDatabase()).saveHighlight(highlight),
  deleteHighlight: async (id) => createDesktopSqliteStorage(await getDatabase()).deleteHighlight(id),
  getBookSavedWords: async (bookId) => createDesktopSqliteStorage(await getDatabase()).getBookSavedWords(bookId),
  saveSavedWord: async (wordItem) => createDesktopSqliteStorage(await getDatabase()).saveSavedWord(wordItem),
  deleteSavedWord: async (id) => createDesktopSqliteStorage(await getDatabase()).deleteSavedWord(id),
  getReaderSettings: async () => createDesktopSqliteStorage(await getDatabase()).getReaderSettings(),
  saveReaderSettings: async (settings) => createDesktopSqliteStorage(await getDatabase()).saveReaderSettings(settings),
};
