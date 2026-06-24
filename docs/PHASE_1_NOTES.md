# Phase 1 Notes: Repo Identity + Runtime Separation Prep

## Completed

- Renamed package identity from `react-example` to `zread`.
- Changed browser/app title to `ZRead`.
- Updated `.env.example` to remove generated AI Studio wording.
- Changed `npm run dev` to start the Vite frontend directly.
- Added `npm run dev:server` for the existing Express AI server.

## Intentionally Not Done

- Tauri was not installed.
- SQLite was not added.
- Storage was not refactored.
- `server.ts` was not moved.
- Reader UI was not changed.
- No source code behavior was changed.

## Next Phase

Phase 2 should add the Tauri desktop shell and confirm the current frontend can run inside a native Windows/Linux desktop window.
