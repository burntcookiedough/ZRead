/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Book {
  id: string;
  title: string;
  author: string;
  fileName: string;
  createdAt: string;
  lastOpenedAt: string;
  progress: {
    chapterIndex: number;
    scrollPercent: number; // percentage of scroll position
  };
}

export interface Highlight {
  id: string;
  bookId: string;
  chapterIndex: number;
  text: string;
  color: string; // tailwind color indicator e.g. "bg-yellow-200" or "bg-amber-14"
  note?: string;
  createdAt: string;
}

export interface SavedWord {
  id: string;
  bookId: string;
  word: string;
  sentenceContext: string;
  definition?: string;
  contextualMeaning?: string;
  simpleExample?: string;
  createdAt: string;
}

export interface AIInteraction {
  id: string;
  bookId: string;
  type: "define" | "explain" | "summarize";
  inputText: string;
  outputText: any; // structured JSON result from server
  createdAt: string;
}

export type ReaderTheme = "light" | "warm" | "dark" | "muted";
export type ReaderFont = "Literata" | "Newsreader" | "Source Serif" | "Georgia";

export interface ReaderSettings {
  theme: ReaderTheme;
  fontFamily: ReaderFont;
  fontSize: number; // 14 to 28 px
  lineHeight: number; // 1.5 to 2.2
  contentWidth: number; // 600 to 900 px
}
