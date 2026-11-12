import type { SavedWord } from "../../types";

export default function VocabularyPanel({ words, onClose, onDelete }: {
  words: SavedWord[];
  onClose: () => void;
  onDelete: (word: SavedWord) => void;
}) {
  return <section aria-label="Saved vocabulary" className="absolute top-[4.5rem] right-4 sm:right-6 z-50 w-[min(24rem,calc(100vw-2rem))] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-sm border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 p-5 shadow-xl">
    <div className="flex justify-between items-center mb-4">
      <h2 className="font-serif text-lg">Saved vocabulary</h2>
      <button onClick={onClose} className="border rounded-sm px-2 py-1 text-xs">Close</button>
    </div>
    {!words.length && <p className="text-xs opacity-70">Select a word or phrase and choose Save to keep it here.</p>}
    <ul className="space-y-4">
      {words.map(word => <li key={word.id} className="border-b border-black/10 dark:border-white/10 pb-4">
        <div className="flex justify-between gap-3 items-start">
          <h3 className="font-semibold break-words">{word.word}</h3>
          <button onClick={() => onDelete(word)} aria-label={`Remove saved word ${word.word}`} className="text-xs underline shrink-0">Remove</button>
        </div>
        <p className="mt-2 text-xs opacity-70 whitespace-pre-wrap break-words">{word.sentenceContext}</p>
        {word.definition && <p className="mt-2 text-sm">{word.definition}</p>}
        {word.contextualMeaning && <p className="mt-2 text-xs">{word.contextualMeaning}</p>}
        {word.simpleExample && <p className="mt-2 text-xs italic">{word.simpleExample}</p>}
      </li>)}
    </ul>
  </section>;
}
