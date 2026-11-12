import JSZip from "jszip";
import type { Book, Highlight, ReaderSettings, SavedWord } from "../../types";
import type { BookStorage } from "../storage/storage";
import { parseEpub } from "../../utils/epubParser";

interface BackupData {
  format: "zreadbackup";
  version: 1;
  books: Book[];
  highlights: Highlight[];
  savedWords: SavedWord[];
  settings: ReaderSettings;
}

const LIMIT = 512 * 1024 * 1024;
const MEGABYTE = 1024 * 1024;
const fail = () => { throw new Error("Invalid or unsupported ZRead backup."); };
const string = (value: unknown): value is string => typeof value === "string" && value.length <= 1_000_000;
const id = (value: unknown): value is string => string(value) && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

function formatLimit(bytes: number) {
  return bytes % MEGABYTE === 0 ? `${bytes / MEGABYTE} MB` : `${bytes} bytes`;
}

function expandedExportLimitError(limit: number) {
  return new Error(`This backup exceeds ZRead's ${formatLimit(limit)} expanded restore limit. Your library was not changed.`);
}

export function validateBackup(value: unknown): BackupData {
  const data = value as BackupData;
  if (!data || data.format !== "zreadbackup" || data.version !== 1 ||
      !Array.isArray(data.books) || !Array.isArray(data.highlights) || !Array.isArray(data.savedWords) ||
      data.books.length > 10_000 || data.highlights.length > 100_000 || data.savedWords.length > 100_000) fail();
  const bookIds = new Set<string>();
  for (const book of data.books) {
    if (!book || !id(book.id) || bookIds.has(book.id) ||
        ![book.title, book.author, book.fileName, book.createdAt, book.lastOpenedAt].every(string) ||
        !book.progress || !Number.isInteger(book.progress.chapterIndex) || book.progress.chapterIndex < 0 ||
        !finite(book.progress.scrollPercent, 0, 100)) fail();
    bookIds.add(book.id);
  }
  for (const records of [data.highlights, data.savedWords]) {
    const ids = new Set<string>();
    for (const record of records) {
      if (!record || !id(record.id) || ids.has(record.id) || !bookIds.has(record.bookId) || !string(record.createdAt)) fail();
      ids.add(record.id);
    }
  }
  for (const h of data.highlights) {
    if (!string(h.text) || !h.text || !string(h.color) || !Number.isInteger(h.chapterIndex) || h.chapterIndex < 0 ||
        [h.note, h.prefixContext, h.suffixContext].some(v => v !== undefined && !string(v)) ||
        (h.textOffset !== undefined && (!Number.isInteger(h.textOffset) || h.textOffset < 0))) fail();
  }
  for (const word of data.savedWords) {
    if (!string(word.word) || !string(word.sentenceContext) ||
        [word.definition, word.contextualMeaning, word.simpleExample].some(v => v !== undefined && !string(v))) fail();
  }
  const s = data.settings;
  if (!s || !["dark", "light", "warm", "muted"].includes(s.theme) ||
      !["Literata", "Newsreader", "Source Serif", "Georgia"].includes(s.fontFamily) ||
      !finite(s.fontSize, 14, 28) || !finite(s.lineHeight, 1.4, 2.4) || !finite(s.contentWidth, 600, 960) ||
      !["single", "split"].includes(s.viewMode)) fail();
  return data;
}

export async function exportBackup(storage: BookStorage, sizeLimit = LIMIT): Promise<Uint8Array> {
  const books = await storage.getAllBooks();
  const zip = new JSZip();
  const data: BackupData = { format: "zreadbackup", version: 1, books, highlights: [], savedWords: [], settings: await storage.getReaderSettings() };
  let expandedBytes = 0;
  for (const book of books) {
    if (!id(book.id)) fail();
    const file = await storage.getBookFile(book.id);
    if (!file) throw new Error(`Cannot back up "${book.title}": its EPUB file is missing.`);
    expandedBytes += file.byteLength;
    if (expandedBytes > sizeLimit) throw expandedExportLimitError(sizeLimit);
    zip.file(`books/${book.id}.epub`, file);
    const highlights = await storage.getBookHighlights(book.id);
    const savedWords = await storage.getBookSavedWords(book.id);
    if (data.highlights.length + highlights.length > 100_000 || data.savedWords.length + savedWords.length > 100_000) fail();
    for (const highlight of highlights) data.highlights.push(highlight);
    for (const word of savedWords) data.savedWords.push(word);
  }
  validateBackup(data);
  const manifest = JSON.stringify(data);
  expandedBytes += new TextEncoder().encode(manifest).byteLength;
  if (expandedBytes > sizeLimit) throw expandedExportLimitError(sizeLimit);
  zip.file("manifest.json", manifest);
  const backup = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  if (backup.byteLength > sizeLimit) {
    throw new Error(`This backup exceeds ZRead's ${formatLimit(sizeLimit)} compressed restore limit. Your library was not changed.`);
  }
  return backup;
}

export async function restoreBackup(bytes: ArrayBuffer, storage: BookStorage, validateEpub = parseEpub, sizeLimit = LIMIT): Promise<number> {
  if (bytes.byteLength > sizeLimit) throw new Error(`Backup exceeds the compressed ${formatLimit(sizeLimit)} restore limit. Your library was not changed.`);
  // Inspect declared sizes before enabling CRC checks, which decompress every entry.
  const unverifiedZip = await JSZip.loadAsync(bytes);
  let expanded = 0;
  for (const entry of Object.values(unverifiedZip.files)) {
    // JSZip exposes uncompressed sizes from the central directory before allocating entry buffers.
    expanded += (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0;
    if (expanded > sizeLimit) throw new Error(`Expanded backup exceeds the ${formatLimit(sizeLimit)} restore limit. Your library was not changed.`);
  }
  // CRC-check all entries before parsing or writing anything; the preflight above bounds normal expansion.
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const manifest = zip.file("manifest.json");
  if (!manifest) fail();
  const data = validateBackup(JSON.parse(await manifest!.async("string")));
  const files = new Map<string, ArrayBuffer>();
  // Validate everything before changing the library.
  for (const book of data.books) {
    const entry = zip.file(`books/${book.id}.epub`);
    if (!entry) throw new Error(`Backup is missing the EPUB for "${book.title}".`);
    const file = await entry.async("arraybuffer");
    await validateEpub(file);
    files.set(book.id, file);
  }
  const originalSettings = await storage.getReaderSettings();
  const highlightsByBook = new Map<string, Highlight[]>();
  const wordsByBook = new Map<string, SavedWord[]>();
  for (const highlight of data.highlights) {
    const items = highlightsByBook.get(highlight.bookId) ?? [];
    items.push(highlight);
    highlightsByBook.set(highlight.bookId, items);
  }
  for (const word of data.savedWords) {
    const items = wordsByBook.get(word.bookId) ?? [];
    items.push(word);
    wordsByBook.set(word.bookId, items);
  }
  const created: string[] = [];
  try {
    for (const book of data.books) {
      const bookId = `book_${crypto.randomUUID()}`;
      created.push(bookId);
      await storage.saveBookFile(bookId, files.get(book.id)!);
      await storage.saveBookMetadata({ ...book, id: bookId });
      for (const h of highlightsByBook.get(book.id) ?? [])
        await storage.saveHighlight({ ...h, id: `hl_${crypto.randomUUID()}`, bookId });
      for (const word of wordsByBook.get(book.id) ?? [])
        await storage.saveSavedWord({ ...word, id: `word_${crypto.randomUUID()}`, bookId });
    }
    await storage.saveReaderSettings(data.settings);
    return created.length;
  } catch (error) {
    const rollback = await Promise.allSettled(created.map(bookId => storage.deleteBook(bookId)));
    const settingsRollback = await Promise.allSettled([Promise.resolve(storage.saveReaderSettings(originalSettings))]);
    if ([...rollback, ...settingsRollback].some(result => result.status === "rejected")) {
      throw new Error("Restore failed and cleanup was incomplete. Your original books were preserved; check for partially restored copies before retrying.");
    }
    throw error;
  }
}
