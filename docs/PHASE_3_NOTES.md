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

## Environment Waivers

The Phase 3 code-level verification passed:

- `npm run lint`
- `npm run build`
- `npm run desktop:build -- --no-bundle`
- `npm run lint` after desktop compile

Two desktop checks were not accepted as Phase 3 blockers because they are environment/package-tooling issues, not storage-abstraction failures.

### `npm run desktop:dev`

`npm run desktop:dev` fails inside the Codex sandbox because the process runs as `winux\codexsandboxoffline` and cannot write to:

```text
C:\Users\anshu\AppData\Local
```

This causes `tauri-plugin-log` initialization to fail with Access Denied.

This is not caused by the Phase 3 storage abstraction changes.

### Full `npm run desktop:build`

Full `npm run desktop:build` reaches desktop compilation, and `npm run desktop:build -- --no-bundle` passes.

The full bundled build still fails during MSI/WiX ICE validation in the local Windows packaging environment.

NSIS generation has been observed, but MSI/WiX validation remains unreliable in this environment.

This is not caused by the Phase 3 storage abstraction changes.

### `src-tauri/Cargo.toml` Line-Ending Noise

Running Tauri commands may mark `src-tauri/Cargo.toml` as modified even when there is no textual diff. The observed issue is LF/CRLF line-ending noise.

`src-tauri/Cargo.toml` must not be committed as part of Phase 3 unless there is an intentional content change.

## Next Phase

Phase 4 should implement real desktop-native import and/or SQLite/filesystem storage using the storage abstraction.
