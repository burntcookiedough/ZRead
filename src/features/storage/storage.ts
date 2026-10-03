import type { Book, Highlight, ReaderSettings, SavedWord } from "@/types";

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: "dark",
  fontFamily: "Literata",
  fontSize: 18,
  lineHeight: 1.7,
  contentWidth: 740,
  viewMode: "single",
};

export interface BookStorage {
  saveBookFile(bookId: string, fileData: ArrayBuffer): Promise<void>;
  getBookFile(bookId: string): Promise<ArrayBuffer | null>;
  deleteBookFile(bookId: string): Promise<void>;
  deleteBook(bookId: string): Promise<void>;

  getAllBooks(): Promise<Book[]>;
  saveBookMetadata(book: Book): Promise<void>;
  deleteBookMetadata(bookId: string): Promise<void>;

  getBookHighlights(bookId: string): Promise<Highlight[]>;
  saveHighlight(highlight: Highlight): Promise<void>;
  deleteHighlight(id: string): Promise<void>;

  getBookSavedWords(bookId: string): Promise<SavedWord[]>;
  saveSavedWord(wordItem: SavedWord): Promise<void>;
  deleteSavedWord(id: string): Promise<void>;

  getReaderSettings(): Promise<ReaderSettings>;
  saveReaderSettings(settings: ReaderSettings): Promise<void>;
}
