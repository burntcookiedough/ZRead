import type { Book } from "../../types";

interface BookCardProps {
  book: Book;
  isContinue: boolean;
  onOpen: (bookId: string) => void;
  onDelete: (book: Book) => void;
}

function formatDate(isoDate: string) {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function BookCard({ book, isContinue, onOpen, onDelete }: BookCardProps) {
  const progress = Math.max(0, Math.min(100, Math.round(book.progress?.scrollPercent || 0)));
  const hasStarted = (book.progress?.chapterIndex || 0) > 0 || progress > 0;
  const actionLabel = isContinue ? (hasStarted ? "Continue reading" : "Start reading") : "Open book";

  return (
    <article className="flex flex-col rounded-sm border border-black/15 dark:border-white/15 bg-white dark:bg-black">
      <button
        type="button"
        id={`book-card-${book.id}`}
        onClick={() => onOpen(book.id)}
        aria-label={`${actionLabel}: ${book.title} by ${book.author}, ${progress}% read`}
        className="flex flex-1 flex-col items-start p-5 text-left hover:bg-black/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:hover:bg-white/[0.04] dark:focus-visible:outline-white"
      >
        <span className="font-sans text-[9px] font-bold uppercase tracking-[0.16em] text-black/50 dark:text-white/50">
          {isContinue ? "Continue reading" : "Your book"}
        </span>
        <span className="mt-3 font-serif text-xl font-semibold leading-tight text-black dark:text-white">
          {book.title}
        </span>
        <span className="mt-1 font-sans text-xs text-black/65 dark:text-white/65">by {book.author}</span>

        <span className="mt-6 w-full" id={`progress-sec-${book.id}`}>
          <span className="mb-2 flex items-center justify-between font-sans text-[10px] font-medium text-black/60 dark:text-white/60">
            <span>Reading progress</span>
            <span>{progress}%</span>
          </span>
          <span
            className="block h-1 w-full overflow-hidden bg-black/10 dark:bg-white/15"
            role="progressbar"
            aria-label={`${book.title} reading progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span className="block h-full bg-black dark:bg-white" style={{ width: `${progress}%` }} />
          </span>
        </span>

        <span className="mt-5 inline-flex items-center gap-2 font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-black dark:text-white">
          {actionLabel}<span aria-hidden="true">→</span>
        </span>
      </button>

      <div className="flex items-center justify-between border-t border-black/10 px-5 py-3 font-sans text-[10px] text-black/55 dark:border-white/10 dark:text-white/55">
        <span>Opened {formatDate(book.lastOpenedAt)}</span>
        <button
          type="button"
          onClick={() => onDelete(book)}
          id={`btn-del-book-${book.id}`}
          title={`Remove ${book.title}`}
          className="rounded-sm px-2 py-1 font-bold uppercase tracking-wider text-black/65 hover:bg-black/5 hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-black dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:outline-white"
        >
          Remove
        </button>
      </div>
    </article>
  );
}
