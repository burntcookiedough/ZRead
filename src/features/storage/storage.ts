import type { Book, Highlight, ReaderSettings, SavedWord } from "@/types";

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

  getReaderSettings(): ReaderSettings;
  saveReaderSettings(settings: ReaderSettings): void;
}
