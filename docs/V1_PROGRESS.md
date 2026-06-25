# ZRead V1 Progress Map

## Status

```text
Status: V1 progress map
Branch: docs/v1-progress-map
Source of truth: docs/V1_SCOPE.md
Target PR branch: dev
```

This document maps the current merged repo state against the frozen V1 scope.

Phase 4A must not start until this progress map is merged.

---

## 1. Current Baseline

### Branch Model

```text
main = stable/protected
dev = integration/protected
all work starts from dev
PR target = dev
```

Current progress mapping branch:

```text
docs/v1-progress-map
```

### CI Status

Basic CI is present in `.github/workflows/ci.yml`.

Current CI checks:

```text
npm ci
npm run lint
npm run build
```

CI runs on:

```text
pull_request -> main, dev
push -> main, dev
```

CI currently covers the web TypeScript/build path. It does not yet cover full desktop packaging.

### Desktop Runtime Status

Tauri has been added and configured as the desktop runtime.

Current desktop scripts:

```text
npm run tauri
npm run desktop:dev
npm run desktop:build
```

Current Tauri configuration:

```text
productName: ZRead
version: 0.1.0
identifier: app.zread.desktop
frontendDist: ../dist
devUrl: http://localhost:5173
bundle targets: all
```

The app has a native Tauri shell, but desktop-native storage and desktop-native import are not complete.

### Windows Build Status

Phase 3 notes record that:

```text
npm run desktop:build -- --no-bundle
```

passed desktop compilation.

Full bundled Windows desktop packaging is not yet reliable in the local environment. The notes identify MSI/WiX ICE validation as the remaining packaging issue, while NSIS generation has been observed.

Windows build status for V1:

```text
desktop compile: passing in Phase 3 notes
full packaged build: not yet accepted as V1-complete
```

### Repo Bloat Cleanup Status

Repo bloat cleanup has been merged into `dev`.

Latest merged baseline includes:

```text
chore: remove generated AI Studio metadata
```

Repo hygiene is part of completed V1 groundwork, but generated artifacts should continue to stay out of commits.

---

## 2. Completed V1 Work

### Scope Freeze

`docs/V1_SCOPE.md` exists and is the source of truth for V1.

Completed:

```text
V1 product definition
desktop/local-first principles
in-scope features
explicit non-goals
feature gate checklist
PR/agent checklist
definition of done
```

### Tauri Shell

The Tauri desktop shell has been added.

Completed:

```text
src-tauri/ initialized
Tauri CLI added
desktop scripts added
frontend wired into Tauri
app identity configured as ZRead
```

### Storage Abstraction

The current IndexedDB implementation has been moved behind a storage interface.

Completed:

```text
BookStorage interface
indexedDbStorage implementation
desktopStorage placeholder
runtime storage selector
LibraryView uses storage abstraction
ReaderView uses storage abstraction
```

Important current limitation:

```text
desktopStorage currently delegates to IndexedDB
```

SQLite and filesystem storage have not been added.

### Delete Cascade

Book deletion is represented through the storage abstraction and is expected to remove associated book data through the active storage implementation.

Completed V1 groundwork:

```text
deleteBook interface method
book metadata deletion path
book file deletion path
related book data deletion path through storage implementation
```

Remaining V1 risk:

```text
delete cascade must be preserved when storage moves from IndexedDB to SQLite/filesystem
```

### Reader Controls and Navigation Fixes

Reader controls and navigation fixes have been merged.

Completed:

```text
reader controls fixes
previous/next navigation fixes
chapter/navigation behavior fixes
reader review feedback addressed
reader docstrings added
```

### Selected Text Action Fixes

Selected text actions have been improved as part of the merged reader work.

Completed:

```text
selection action behavior fixes
selection menu flow improvements
reader action handling improvements
```

### AI Failure Handling Improvements

AI behavior has received failure-handling improvements in the merged V1 groundwork.

Completed direction:

```text
AI remains optional
reader can return to normal reading after AI errors
AI errors are handled as action failures, not reading blockers
```

Remaining V1 risk:

```text
AI adapter cleanup is still needed
provider coupling should be reduced before V1
```

### Basic CI

Basic CI has been added.

Completed:

```text
GitHub Actions workflow
Node 22 setup
npm ci
npm run lint
npm run build
PR and push coverage for main/dev
```

### Repo Hygiene

Repo hygiene work has been merged.

Completed:

```text
generated AI Studio metadata removed
basic repo cleanup merged into dev
package identity renamed to zread
browser/app title renamed to ZRead
```

---

## 3. Remaining V1 Blockers

### Native File Picker

V1 requires native EPUB import through a desktop file picker.

Current status:

```text
not implemented
```

### App-Owned EPUB Copy Into App Data

V1 requires imported EPUBs to be copied into ZRead app data.

Current status:

```text
not implemented
```

Current risk:

```text
the app must not depend on the original user-selected file path after import
```

### SQLite / Filesystem Desktop Storage

V1 target storage is:

```text
SQLite for metadata, progress, highlights, saved vocabulary, settings
filesystem for copied EPUB files
```

Current status:

```text
storage abstraction exists
desktopStorage delegates to IndexedDB
SQLite not added
filesystem storage not added
```

### Backup / Export / Import

V1 requires recoverable local data through backup/export and restore/import.

Current status:

```text
not implemented
```

Preferred backup extension:

```text
.zreadbackup
```

### Linux Packaging

V1 requires Linux desktop packaging, including AppImage.

Current status:

```text
not verified as V1-complete
```

### About / Version

V1 requires a basic About section.

Current status:

```text
not implemented
```

Required fields:

```text
app name
version
platform
basic local-first/privacy note
```

### AI Adapter Cleanup

V1 requires AI to use an adapter pattern and avoid permanent frontend coupling to one provider.

Current status:

```text
partially complete behaviorally
adapter cleanup still needed
```

### Highlight Anchoring Reliability

V1 requires highlights to store context for more reliable restoration.

Current status:

```text
highlight support exists
anchoring reliability still needs hardening
```

Required direction:

```text
selected text
prefix context
suffix context
chapter index
style/color
optional note
```

### ReaderView Decomposition

`ReaderView` remains a large shared surface for reading, navigation, selection, AI actions, progress, and annotations.

Current status:

```text
not decomposed
```

This is technical debt, not a reason to start post-V1 features.

---

## 4. Recommended Implementation Order

### 1. Phase 4A: Native Import + App-Owned EPUB Copy

Implement desktop-native EPUB import first.

Required outcome:

```text
native file picker
EPUB validation
metadata read
copy EPUB into app data
open imported book from app-owned copy
do not depend on original file path
```

### 2. Phase 5: SQLite / Filesystem Storage

Replace the desktop placeholder with real desktop storage.

Required outcome:

```text
SQLite metadata/progress/highlights/saved words/settings
filesystem copied EPUB storage
delete cascade preserved
settings persist after restart
progress persists after restart
annotations persist after restart
```

### 3. Backup / Export / Import

Add recoverable user data workflows.

Required outcome:

```text
export .zreadbackup
import .zreadbackup
include metadata/progress/highlights/saved vocabulary/settings
optionally include copied EPUB files
```

### 4. Linux Packaging

Verify and harden Linux packaging.

Required outcome:

```text
Linux AppImage builds
packaging documented
CI or release process can reproduce it
```

### 5. About / Version Polish

Add the V1 About surface.

Required outcome:

```text
app name
version
platform
local-first/privacy note
```

### 6. Technical Debt Cleanup

Clean up V1 technical debt only after the core desktop-local path is stable.

Recommended targets:

```text
AI adapter cleanup
highlight anchoring reliability
ReaderView decomposition
desktop packaging reliability
```

---

## 5. Strict Non-Goals

The following are not V1 and must not be added during V1 work:

```text
no PDF
no sync
no account/login
no cloud library
no AI chat sidebar
no graph features
no mobile app
no public web reader
```

Additional non-goals from `docs/V1_SCOPE.md` remain in force.

---

## 6. Current Next Action

Start Phase 4A only after this progress map is merged.

Next issue:

```text
Phase 4A native import + app-owned EPUB copy
```

Acceptance focus:

```text
native file picker works
imported EPUB is copied into app data
reader opens the app-owned EPUB copy
original source file can move or disappear without breaking the imported book
no SQLite added in Phase 4A unless explicitly scoped later
no post-V1 features added
```

---

## Current V1 Readiness

ZRead has completed the V1 planning foundation, desktop shell foundation, storage abstraction foundation, reader bug-fix groundwork, basic CI, and repo hygiene.

ZRead is not V1-ready yet because the app does not yet meet the required desktop-local data model:

```text
native file picker
app-owned EPUB copy
SQLite/filesystem storage
backup/export/import
Linux packaging verification
about/version surface
```

