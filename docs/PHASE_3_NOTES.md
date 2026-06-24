# Phase 3 Notes: Storage Abstraction

## Completed

- Added a `BookStorage` interface.
- Moved the existing IndexedDB implementation behind `indexedDbStorage`.
- Added a `desktopStorage` placeholder that delegates to IndexedDB for now.
- Added a runtime storage selector.
- Updated LibraryView and ReaderView to use the storage interface.

## Intentionally Not Done

- SQLite was not added.
- Filesystem storage was not added.
- Native file picker was not added.
- Backup/export was not added.
- Reader UI was not refactored.
- EPUB parser behavior was not changed.
- AI behavior was not changed.

## Current Phase Goal

The only goal of this phase is to decouple app components from the current IndexedDB implementation.

## Next Phase

Phase 4 should implement real desktop-native import and/or SQLite/filesystem storage using the storage abstraction.
