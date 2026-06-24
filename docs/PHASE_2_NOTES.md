# Phase 2 Notes: Tauri Desktop Shell

## Completed

- Added Tauri CLI as a dev dependency.
- Added desktop scripts:
  - `npm run tauri`
  - `npm run desktop:dev`
  - `npm run desktop:build`
- Initialized `src-tauri/`.
- Configured Tauri to run the existing Vite frontend.
- Updated Vite config for Tauri-compatible fixed dev server behavior.

## Intentionally Not Done

- SQLite was not added.
- Native file picker was not added.
- Filesystem import was not added.
- Storage was not refactored.
- Reader UI was not changed.
- AI behavior was not changed.
- EPUB parser was not changed.
- Backend server was not moved.
- Auto-update was not added.
- Tauri plugins were not added.

## Current Phase Goal

The only goal of this phase is to prove that the existing ZRead frontend can run inside a native Tauri desktop window.

## Next Phase

Phase 3 should introduce a storage abstraction or native desktop file import, depending on the chosen sequencing.
