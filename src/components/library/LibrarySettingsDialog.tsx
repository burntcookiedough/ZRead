import { useRef } from "react";
import { version } from "../../../package.json";
import { isTauriRuntime } from "@/app/runtime";
import AISettings from "@/features/ai/AISettings";
import BackupPanel from "@/features/backup/BackupPanel";

interface LibrarySettingsDialogProps {
  onRestore: () => void;
}

function platformName() {
  if (isTauriRuntime && navigator.userAgent.includes("Windows")) return "Windows";
  if (isTauriRuntime && navigator.userAgent.includes("Linux")) return "Linux";
  return "Browser preview";
}

export default function LibrarySettingsDialog({ onRestore }: LibrarySettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        id="btn-library-settings"
        aria-haspopup="dialog"
        aria-controls="library-settings-dialog"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-sm border border-black/20 px-4 py-2 font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-black hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black dark:border-white/25 dark:text-white dark:hover:bg-white/10 dark:focus-visible:outline-white"
      >
        Settings
      </button>

      <dialog
        ref={dialogRef}
        id="library-settings-dialog"
        aria-labelledby="library-settings-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100vw-2rem))] max-w-none overflow-hidden border border-black/15 bg-white p-0 text-black shadow-2xl backdrop:bg-black/65 dark:border-white/15 dark:bg-neutral-950 dark:text-white dark:backdrop:bg-black/75"
      >
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-black/10 px-5 py-4 dark:border-white/10">
            <div>
              <h2 id="library-settings-title" className="font-serif text-xl font-semibold">Library settings</h2>
              <p className="mt-1 font-sans text-xs text-black/55 dark:text-white/55">Backup, optional AI, and app information</p>
            </div>
            <button
              type="button"
              autoFocus
              id="btn-close-library-settings"
              onClick={() => dialogRef.current?.close()}
              className="rounded-sm border border-black/20 px-3 py-2 font-sans text-[10px] font-bold uppercase tracking-wider text-black hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black dark:border-white/25 dark:text-white dark:hover:bg-white/10 dark:focus-visible:outline-white"
            >
              Close
            </button>
          </header>

          <div className="overflow-y-auto px-5 pb-5">
            <BackupPanel onRestore={onRestore} />
            <AISettings />
            <details className="mt-6 border-t border-black/10 pt-4 text-xs dark:border-white/10">
              <summary className="cursor-pointer font-semibold">About ZRead</summary>
              <p className="mt-3">ZRead {version} · {platformName()}</p>
              <p className="mt-2 leading-relaxed text-black/65 dark:text-white/65">
                Books and reading data stay on this device. No account or sync is required. Text is sent to your configured AI service only when you ask for a definition, explanation, or chapter summary.
              </p>
            </details>
          </div>
        </div>
      </dialog>
    </>
  );
}
