# ZRead resume checkpoint

Date: 2026-10-03. `V1_SCOPE.md` remains the product contract.

## Active completion goal

The user renewed the goal: finish the existing minimalist Windows/Linux EPUB reader, simplify bloated code into cohesive modules, polish the library home and divide settings by responsibility. No new features or rewrite. Audit with bounded Luna workers first; implement one batch per normal PR. Finish substantive latest-head CodeRabbit review, runtime checks and CI before merging into `dev` and starting the next batch. The user now authorizes these sequential merges, superseding the earlier monitor's no-merge restriction. Publishing a release remains outside this authorization.

Two thread heartbeats are active at ten-minute intervals: `zread-completion-worker` for implementation and `zread-sequential-pr-review` for review/CI follow-up. They share this checkpoint and must inspect live state before editing or starting a review. Do not run duplicate implementations or reviews. If usage is exhausted, preserve the next action and schedule the main heartbeat after the reported reset; never consume reset credits automatically. Last observed five-hour reset: `2026-10-03T20:55:07Z`, 02:25 IST on October 4.

The user clarified the scheduling rule: check account usage before expensive work and each heartbeat. At 2% or less five-hour allowance remaining, stop new work, reconcile workers and checkpoint; move the same main heartbeat and any active review heartbeat to the first supported occurrence at least one minute after `primary.resetsAt`, suppressing earlier wakeups. Recheck limits after waking before restoring ten-minute cadence. The PR review heartbeat is active only for an actual open PR, paused between PRs and reactivated by the main worker when the next normal PR exists.

Current gate: PR #32 remains open at `05fa3a4`. CLI review and CI passed. At the user's request, GitHub review was manually triggered with `@coderabbitai review`; CodeRabbit confirmed it is reviewing 37 files from `73a9e6b` through `05fa3a4`. Wait for actual output and resolve actionable issues before merging or implementing the next batch. Never treat a skipped review as evidence.

Read-only audits dispatched to existing Luna workers: `reader_layout` for reader modules/performance, `assess` for library/settings UX and code, `sqlite_storage` for storage/parser/backup and Linux acceptance. Their current briefs are read-only. Next planned batch is behavior-preserving reader simplification, with later library/settings polish and verified reliability fixes based on the returned evidence.

Audit results received:
- Library: `LibraryView.tsx` combines import lifecycle, library state, cards/delete dialog and app settings. Later bounded batch should separate library behavior from composition, make empty-state import keyboard accessible, and group existing backup/AI/About under compact settings without adding features. Keep native import and data semantics intact.
- Backup: `restoreBackup` uses JSZip without CRC checking. A worker's in-memory probe changed a stored manifest title while preserving the original CRC; restore accepted and wrote the changed title. Reproduce in a regression test and reject corrupt archives. Export has no aggregate limit although restore caps compressed/expanded size at 512 MiB, so align limits before offering a backup users cannot restore. Restore filters all highlights and words for every book, up to roughly two billion predicates at accepted limits; bucket once by book ID. These are existing-feature reliability repairs.
- Parser: import and first reader open each parse all chapter headings; measure real long/media books before optimizing. Do not add a speculative cache.
- Linux: no WSL distribution or Docker/Podman/QEMU/VMware/VirtualBox is available locally. Actual Linux runtime acceptance requires a usable Linux host; builds alone do not prove it. No OS changes were attempted.

Active writer: `sqlite_storage` now owns ONLY `src/features/backup/backup.ts` and `backup.test.ts` to fix the reproduced integrity/size/grouping defects in the EXISTING PR #32 batch. No commits or pushes by the worker. Parent must inspect, verify, integrate any GitHub review output, commit/push and review the new head before merging. Reader/library refactor implementation has not started and must wait for PR #32 to finish.

Manual GitHub CodeRabbit review completed at `05fa3a4` with four actionable comments. Parent fixed SQL reader settings defaults and changed deletion order to SQL, legacy cleanup, then app-owned EPUB last. Native verification in the isolated `app.zread.verification` profile injected SQL deletion and legacy cleanup failures; both retained exact EPUB bytes, progress, highlights and vocabulary, and successful final deletion cleaned the disposable book. Temporary native script is outside the repository. `desktop_ai` owns ONLY `server.ts` to correct raw client-facing errors and warn for non-loopback binding. Parent added `.coderabbit.yaml` enabling auto-review for `dev`, using the official configuration schema. Keyboard listener churn is a low-value nitpick to address within the later reader refactor rather than mixing it into data recovery repairs. These changes are not yet committed or reviewed. CodeRabbit GitHub review reports one included review/hour, zero remaining; no explicit reset timestamp was supplied.

Both correction workers completed. Server runtime checks confirmed generic client errors while logs retain provider diagnostics, plus the non-loopback startup warning. Backup now preflights symmetric 512 MiB size limits, CRC-verifies entries before writes, and groups annotations once. Parent ran all 13 tests successfully, including corrupt archive rejection, size boundaries, partial settings recovery and a 400-book/80,000-annotation restore. Lint/build/diff checks passed; desktop/narrow reader QA and delayed-metadata/settings flows passed. The correction commit following `05fa3a4` needs fresh substantive review and CI before merge; the previous head's passing checks do not clear it.

Reader audit: highlighted HTML currently reparses on every unrelated `ReaderView` render; memoize on actual content/highlight/chapter/title/author changes. The requested reader compartmentalization should also separate cohesive book/chapter/progress, annotations, AI request lifecycle and HUD/fullscreen/notification responsibilities, leaving `ReaderView` composition and orchestration. Avoid shallow wrappers with dozens of props or moving the entire thousand-line file into one hook. Retain data queues, load cancellation, object-URL cleanup, normalized position and existing tests/QA. A later measured improvement may deduplicate unchanged progress saves. This turn reran lint, all eight current tests, and desktop/narrow Playwright reader flow: rapid turns, reflow, reopen, chapter boundaries, inline highlights, backup round trip and offline reading passed with zero page errors. Temporary Vite session `90759` listens at 127.0.0.1:5173 for parent QA; stop it when finished.

Greptile removal is requested for this repository. No repository Greptile config was found. Its GitHub App installation exists, but its settings page requires user passkey/2FA authentication. A browser handoff and asynchronous request were left for the user; remove only ZRead access rather than changing unrelated repositories. Do not grant the pending CodeRabbit/Greptile permission expansions.

The user explicitly authorized installing any suitable WSL distro for Linux verification. `wsl --status` reports default version 2; Ubuntu-22.04 is listed online. Parent started `wsl --install Ubuntu-22.04 --name ZRead-QA --no-launch --web-download`, terminal session `36916`, still pending at the last observation. Verify the actual install result and launch the named disposable QA distribution; do not reboot without user authorization or unregister other distributions. Use the installed Linux environment to exercise the actual AppImage/native data flows once available. Existing historical Linux-host limitation below is superseded only when setup and runtime proof succeed.

## Where we resumed

- Integration checkout was `dev` at `73a9e6b`, merged PR #20, after reader shell extraction.
- Reader architecture steps A, B and C were merged. Step D, centralized layout measurement and position restoration, was next.
- SQLite only ran a health check. Desktop metadata still used IndexedDB, desktop AI lacked a transport, and backup/restore was absent.
- An existing nontextual working-tree modification to `src-tauri/Cargo.toml` was preserved.

## Current implementation

Work branch: `codex/finish-zread-v1`, targeting `dev`.

Normal PR: https://github.com/burntcookiedough/ZRead/pull/32. The user requires ready-for-review PRs, never drafts. Verified implementation head: `05fa3a4fa12c117349adeb9dc64798ff9de272a7`. CodeRabbit CLI completed the initial review with four issues. The reader initialization race, queued settings return, highlight range text mismatch and checkpoint portability corrections are implemented; delayed-storage browser checks passed. Follow-up CLI review at this head against `aa7083a` completed with zero issues. GitHub CodeRabbit skips the `dev` base branch; that skipped status is not review evidence.

Review and CI follow-up completed on 2026-10-03 at 18:16 UTC. The heartbeat `zread-v1-review-and-release-checks` was deleted. This local checkpoint update records the verified implementation revision without creating another PR head. The PR remains open; nothing was merged or released.

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
- Local QA scripts and result files are kept outside the repository. Native QA data is isolated from the user's production library.
- CI run https://github.com/burntcookiedough/ZRead/actions/runs/37143098818 passed at the verified head: web lint/tests/build, Windows NSIS build/artifact upload and Linux AppImage build/artifact upload. All three jobs completed successfully. The final local Windows NSIS rebuild also passed after the source corrections.

## Remaining release acceptance

1. Review and current CI checks are complete at the verified head above. Any subsequent substantive implementation head needs fresh review and checks.
2. Launch/import/restart/export/restore the built AppImage on Linux. Windows verification cannot establish Linux runtime behavior.
3. Install and launch the final Windows NSIS package and exercise native file-picker and OS drag/drop import. The native dev runtime and package build passed; installation itself has not been checked.
4. Complete media-heavy EPUB and long-session checks with representative real books. Synthetic fixtures cover local media, hostile HTML/SVG, long chapters and inline text selections.
5. Verify a real optional AI provider response if desired. Transport tests used a local deterministic adapter without a provider key or external book-text request.

V1 is not marked complete until the observable acceptance criteria in `V1_SCOPE.md` pass. Older phase documents are historical; this checkpoint records the current implementation and proof.
