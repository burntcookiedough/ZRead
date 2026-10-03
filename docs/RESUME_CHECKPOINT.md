# ZRead resume checkpoint

Date: 2026-10-03. `V1_SCOPE.md` remains the product contract.

## Where we resumed

- Integration checkout was `dev` at `73a9e6b`, merged PR #20, after reader shell extraction.
- Reader architecture steps A, B and C were merged. Step D, centralized layout measurement and position restoration, was next.
- SQLite only ran a health check. Desktop metadata still used IndexedDB, desktop AI lacked a transport, and backup/restore was absent.
- An existing nontextual working-tree modification to `src-tauri/Cargo.toml` was preserved.

## Current implementation

Work branch: `codex/finish-zread-v1`, targeting `dev`.

Normal PR: https://github.com/burntcookiedough/ZRead/pull/32. The user requires ready-for-review PRs, never drafts. Follow-up automation: `zread-v1-review-and-release-checks`, every 10 minutes while review/CI work remains. CodeRabbit CLI completed the initial review with four issues; the reader races and highlight text mismatch are being corrected. The developer-specific QA artifact path below is intentionally retained for local resumption, rather than moving temporary verification scripts into the project.

- Reader layout now has one measurement hook using ResizeObserver, animation frames, image load events and font readiness. Normalized chapter position survives typography, split/single and viewport changes. Stale chapter loads are ignored. Progress and settings writes run in order.
- Desktop SQLite stores books/progress, highlights, vocabulary and reader settings. Startup waits for readiness and recoverable legacy migration. Migration retains the source records, checks its completion marker before touching IndexedDB, and copies legacy EPUBs into app data.
- Explicit book deletion cascades in SQLite and removes copied EPUBs and associated legacy records. Filesystem/metadata failures attempt rollback; a second failure during rollback is reported as incomplete recovery.
- Highlight records include prefix/suffix context and a text offset. Restoration handles repeated text and selections spanning inline elements. Ambiguous legacy highlights remain unmarked instead of attaching to the wrong passage.
- Saved vocabulary is readable and removable in the reader. Saving it makes no AI request.
- Desktop AI starts disabled. A user-configured HTTPS or loopback adapter supports define/explain/summarize, bounded input, validated results, timeout and cancellation. The local Express adapter uses loopback by default and checks permitted origins.
- Backup export includes EPUBs and reading data. Restore validates the archive and EPUBs before writing, adds copies without overwriting existing books, and rolls back newly imported copies on failure.
- About information, explicit fullscreen, narrow overlay sizing and keyboard access were added. Tailwind dark styling follows the saved theme rather than the operating-system preference.
- EPUB rendering sanitizes active content and external resource references. Archive expansion is bounded, local images are retained, and chapter image URLs are revoked when no longer needed.
- Dependency audit fixes applied within the existing version ranges. `npm audit` reports zero vulnerabilities at this checkpoint.
- CI now runs tests and builds Windows NSIS and Linux AppImage packages.

## Verified evidence

- `npm run lint`, `npm test`, `npm run build` and `git diff --check` passed. Tests cover reading-position mapping, AI response/transport failures, backup round trip/rollback/validation, contextual highlight matching, and real SQLite migration/persistence/cascades.
- Browser QA in Edge at 1200x800 and 390x700 passed import, rapid page turns, font and single/split changes, resize, reopen, chapter boundary navigation, cross-element highlights, vocabulary save without AI, backup round trip and offline reading. No page errors occurred.
- Native Tauri QA used the isolated identifier `app.zread.verification`. It verified real SQL and filesystem plugin behavior, legacy migration, backup round trip, deletion cascade, disabled AI, configured local AI success/error/cancellation, and vocabulary display.
- A real native process restart preserved the copied EPUB, SQLite book/progress/highlight/vocabulary records and reader settings. Reader position restored on reopening.
- The Windows NSIS build produced `src-tauri/target/release/bundle/nsis/ZRead_0.1.0_x64-setup.exe`. Rebuild after any subsequent source corrections before distributing it.
- Local QA scripts and result files are outside the repository at `C:/Users/anshu/AppData/Local/Temp/zread-verification/`. Native QA data is isolated from the user's production library.

## Remaining release acceptance

1. Resolve actionable CodeRabbit review issues against the final head and require current PR checks to pass.
2. Verify the Linux AppImage build in CI, then launch/import/restart/export/restore on Linux. Windows verification cannot establish Linux runtime behavior.
3. Install and launch the final Windows NSIS package and exercise native file-picker and OS drag/drop import. The native dev runtime and package build passed; installation itself has not been checked.
4. Complete media-heavy EPUB and long-session checks with representative real books. Synthetic fixtures cover local media, hostile HTML/SVG, long chapters and inline text selections.
5. Verify a real optional AI provider response if desired. Transport tests used a local deterministic adapter without a provider key or external book-text request.

V1 is not marked complete until the observable acceptance criteria in `V1_SCOPE.md` pass. Older phase documents are historical; this checkpoint records the current implementation and proof.
