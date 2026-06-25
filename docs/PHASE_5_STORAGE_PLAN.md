# Phase 5 Storage Plan

## Current Storage State

Phase 4A left ZRead with a working storage abstraction and desktop-owned EPUB file copies, but desktop metadata storage is still browser-backed.

Current data locations:

- EPUB binary files are stored in IndexedDB `book_files` in the browser runtime.
- EPUB binary files are stored as app-owned files in Tauri AppData at `books/<bookId>.epub` in the desktop runtime, with a legacy IndexedDB `book_files` fallback when the app-owned file is missing.
- Book metadata and reading progress are stored in IndexedDB `books`; progress is embedded in `Book.progress`.
- Highlights are stored in IndexedDB `highlights`.
- Saved words are stored in IndexedDB `saved_words`.
- Reader settings are stored in `localStorage` under `epub-reader-settings`.

The `BookStorage` interface currently defines these methods:

- Book file lifecycle: `saveBookFile`, `getBookFile`, `deleteBookFile`, `deleteBook`.
- Book metadata lifecycle: `getAllBooks`, `saveBookMetadata`, `deleteBookMetadata`.
- Highlights: `getBookHighlights`, `saveHighlight`, `deleteHighlight`.
- Saved words: `getBookSavedWords`, `saveSavedWord`, `deleteSavedWord`.
- Reader settings: `getReaderSettings`, `saveReaderSettings`.

Already routed through the storage abstraction:

- Library book loading, EPUB import metadata save, EPUB file save, failed-import cleanup, and delete book.
- Reader EPUB file loading, metadata loading, last-opened updates, progress saves, highlight save/delete, saved-word saves, and reader settings get/save.

Remaining direct IndexedDB/localStorage dependencies:

- IndexedDB usage is encapsulated in `src/features/storage/indexedDbStorage.ts`.
- `desktopStorage` still delegates metadata, progress, highlights, saved words, and settings to `indexedDbStorage`.
- `src/App.tsx` directly reads `localStorage` key `epub-reader-settings` for theme bootstrapping and theme resync.

Phase 5 should move desktop book metadata and progress first, while keeping existing app-owned EPUB filesystem storage. Phase 5 should not move the browser runtime, AI interactions, backup/export/import, EPUB parser data, ReaderView structure, UI design, or old IndexedDB migration code in the first implementation PR.

The browser runtime should remain IndexedDB/localStorage-backed as a development fallback. Old IndexedDB migration should be deferred until after the desktop storage path can read and write new data safely.

Primary data-loss risks:

- Split writes between filesystem EPUB storage and metadata storage can leave orphaned files or metadata if rollback fails.
- Delete cascade can regress when metadata moves from IndexedDB to SQLite.
- Legacy IndexedDB fallback can mask missing desktop metadata during testing.
- Reader settings are split between the storage abstraction and direct `App.tsx` localStorage reads.
- A failed or partial future migration could make old library data inaccessible if compatibility reads are removed too early.

Required checks before any Phase 5 PR can merge:

- `npm run lint`.
- `npm run build`.
- Manual desktop import/open/restart/progress/delete smoke checks after implementation PRs.
- Browser fallback import/open/progress smoke checks.
- Migration and fallback tests when migration is introduced.

## Target V1 Storage State

Desktop V1 storage target:

- SQLite stores books, reading progress, highlights, saved words, and reader settings.
- The local filesystem stores copied EPUB files under app data at `books/<bookId>.epub`.
- Delete book removes metadata, progress, highlights, saved words, and the app-owned EPUB file.

Browser runtime target:

- IndexedDB/localStorage remains a development fallback.
- Browser storage is not the V1 product storage target.

## Browser vs Desktop Runtime Decision

Keep the existing runtime selector:

```ts
storage = isTauriRuntime ? desktopStorage : indexedDbStorage
```

Desktop storage should stop delegating metadata and settings to IndexedDB over Phase 5. Browser storage should remain unchanged unless a `BookStorage` interface change requires compatibility updates.

Desktop file storage should continue using Tauri AppData for EPUB files. The current IndexedDB file fallback should remain until migration/fallback hardening verifies that legacy desktop imports are still recoverable.

## Data Model Proposal

Proposed SQLite tables:

- `books`: `id`, `title`, `author`, `file_name`, `created_at`, `last_opened_at`.
- `reading_progress`: `book_id`, `chapter_index`, `scroll_percent`, `updated_at`.
- `highlights`: `id`, `book_id`, `chapter_index`, `text`, `color`, `note`, `created_at`.
- `saved_words`: `id`, `book_id`, `word`, `sentence_context`, `definition`, `contextual_meaning`, `simple_example`, `created_at`.
- `reader_settings`: singleton key/value rows or a singleton row storing theme, font family, font size, line height, content width, and view mode.

Highlight storage should reserve future `prefix_context` and `suffix_context` fields, but Phase 5 should not require a highlight anchoring rewrite unless that work is explicitly scheduled.

Filesystem storage:

- EPUB files remain under app data at `books/<bookId>.epub`.
- The SQLite `books.file_name` value stores the original display filename, not the trusted source path.

## Migration Policy

Phase 5.1 through Phase 5.3 must not delete or rewrite existing IndexedDB data.

Migration should be explicit, idempotent, and verified before disabling legacy reads. Failed migration must leave old data readable.

Recommended migration sequence:

- First add desktop SQLite read/write support for new records.
- Preserve legacy IndexedDB EPUB file fallback while desktop metadata storage is introduced.
- Add compatibility reads or migration commands only after the new desktop path is stable.
- Remove or reduce legacy fallback only after tests prove existing Phase 4A data remains recoverable.

## Phase Split

Phase 5.0: storage architecture plan.

- Add this document only.
- Do not implement SQLite, install plugins, add Rust commands, or change runtime behavior.

Phase 5.1: desktop SQLite adapter skeleton.

- Add the desktop SQLite command/adapter shape.
- Keep behavior migration out of this phase.
- Keep browser fallback unchanged.

Phase 5.2: books/progress metadata moved to desktop storage.

- Move desktop book metadata and reading progress to SQLite.
- Preserve app-owned EPUB filesystem storage.
- Preserve delete rollback and cascade expectations.

Phase 5.3: highlights/saved words/settings moved.

- Move desktop highlights, saved words, and reader settings to SQLite.
- Remove the accidental direct settings dependency in `App.tsx` by routing theme bootstrap through storage or a storage-backed helper.

Phase 5.4: migration/fallback hardening.

- Add explicit migration or compatibility logic for old IndexedDB data.
- Verify legacy desktop data remains readable.
- Harden partial-write, failed-migration, and delete-cascade behavior.

Phase 5.5: final storage smoke and docs.

- Run end-to-end desktop and browser fallback smoke checks.
- Update V1 progress documentation with the accepted storage status.

## Out of Scope

The following are out of scope for Phase 5.0:

- No SQLite implementation.
- No Tauri plugin installation.
- No Rust command implementation.
- No data migration code.
- No UI redesign.
- No ReaderView refactor.
- No AI changes.
- No EPUB parser rewrite.
- No backup/export/import implementation.
- No Linux packaging.

## Risks

- Partial import writes can create an EPUB file without matching metadata, or metadata without a readable file.
- Delete cascade regressions can leave orphaned EPUB files, highlights, saved words, or progress.
- Browser and desktop storage can diverge if `BookStorage` behavior is not kept consistent.
- Theme/settings can become inconsistent while `App.tsx` reads `localStorage` directly.
- Legacy IndexedDB data can become inaccessible if fallback reads are removed before migration is verified.
- SQLite schema choices can constrain future backup/export/import if records omit timestamps, stable IDs, or file references.

## Verification Plan

Phase 5.0 documentation PR:

- Run `npm run lint`.
- Run `npm run build`.
- Do not run `desktop:build` unless package or Tauri configuration files are changed.

Implementation PRs:

- Add focused unit or type coverage where the repo has a practical test surface.
- Manually verify desktop import, open, app restart, progress restore, settings restore, highlight persistence, saved-word persistence, and delete cascade.
- Manually verify browser fallback import, open, progress persistence, and settings persistence.
- Add migration/fallback tests when migration is introduced.

## PR Sequence

- PR 5.0: `docs: plan phase 5 desktop metadata storage`.
- PR 5.1: SQLite adapter skeleton only.
- PR 5.2: desktop books/progress metadata.
- PR 5.3: desktop highlights/saved words/settings.
- PR 5.4: migration/fallback hardening.
- PR 5.5: storage smoke/docs cleanup.
