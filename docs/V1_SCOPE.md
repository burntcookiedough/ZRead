# ZRead V1 Scope

## Status

```text
Status: Frozen for V1 planning
Phase: 0 - Scope Freeze
Purpose: Prevent scope creep before desktop conversion begins
```

This document is the source of truth for ZRead V1.

Any future feature, refactor, pull request, or agent task must be checked against this document before implementation.

If a proposed change does not fit this scope, it must be moved to the post-V1 parking lot.

---

## One-line Product Definition

ZRead V1 is a calm, local-first desktop EPUB reader for Windows and Linux, with optional AI reading assistance for definitions, explanations, and summaries.

---

## V1 Product Vision

ZRead V1 should feel like a real desktop reading application, not a website and not an AI demo.

The target user flow is:

```text
Open app
→ import EPUB
→ read immediately
→ continue from last position
→ select text only when needed
→ define, explain, save, or highlight
→ return to reading
```

Reading is the core product.

AI is only a supporting layer. It should appear when the user explicitly asks for help, then disappear so the user can continue reading.

The app should feel calm, minimal, reliable, and local-first.

---

## Product Principles

### 1. Desktop-first, not website-first

ZRead V1 is an installable Windows/Linux desktop application.

The web is not the main product surface for V1.

A website may exist later only for:

```text
download page
documentation
privacy policy
changelog
release notes
```

### 2. Local-first, not cloud-first

Books, reading progress, highlights, saved vocabulary, and settings must be stored locally.

No account should be required.

No sync should be required.

### 3. EPUB-first, not PDF-first

ZRead V1 supports EPUB.

PDF support is explicitly out of scope for V1.

### 4. Reading-first, not dashboard-first

The reader screen is the product.

The interface should minimize distractions and avoid dashboards, feeds, social features, or complex workspaces.

### 5. AI-on-demand, not AI-chat-first

AI should only appear when invoked through a specific action:

```text
define selected word
explain selected passage
summarize current chapter
```

No full AI chat sidebar in V1.

### 6. Simple V1, not feature-complete fantasy

V1 should be stable, installable, and useful.

It should not try to become a universal document reader, study platform, social product, cloud sync app, or AI knowledge graph.

### 7. Recoverable data, not fragile assumptions

User data must be recoverable through backup/export.

Imported books and annotations should not disappear because the original imported file was moved.

---

## Target Platforms

### In scope for V1

```text
Windows desktop
Linux desktop
```

### Not in scope for V1

```text
macOS
mobile
public web reader
browser extension
```

---

## V1 In-Scope Features

### Desktop Application Shell

V1 includes a native desktop shell using Tauri.

Required desktop behavior:

```text
native app window
app name
app icon
window title
basic app menu if needed
Windows installer
Linux AppImage
```

### Local EPUB Import

V1 includes EPUB import through:

```text
native file picker
drag/drop import
```

Import behavior:

```text
validate file is EPUB
read EPUB metadata
copy EPUB into ZRead app data directory
store book metadata locally
open imported book
```

The app must not depend on the original user-selected file path after import.

### Local Bookshelf

V1 includes a local bookshelf showing:

```text
book title
author
last opened date
reading progress
open action
delete action
```

Deleting a book should delete:

```text
book metadata
copied EPUB file
reading progress
highlights
saved vocabulary for that book
```

### Reading View

V1 includes a clean reading view with:

```text
EPUB chapter rendering
single-page layout
split-page layout
previous/next page navigation
chapter navigation
continue from last reading position
fullscreen reading mode
minimal disappearing controls
```

### Typography Settings

V1 includes local reader settings:

```text
font family
font size
line height
content width
single/split layout
light/dark theme
```

Settings must persist after app restart.

### Reading Progress

V1 includes local reading progress.

At minimum, progress should store:

```text
book id
chapter index
page index or scroll percent
updated timestamp
```

Progress must restore after app restart.

### Highlights

V1 includes local highlights.

Highlight records should store:

```text
highlight id
book id
chapter index
selected text
prefix context
suffix context
highlight style/color
optional note
created timestamp
```

Prefix and suffix context should be used to make highlight restoration more reliable than plain text matching.

### Saved Vocabulary

V1 includes saved vocabulary.

Saved vocabulary records should store:

```text
word or phrase
book id
sentence context
optional definition
optional contextual meaning
optional example
created timestamp
```

### Optional AI Assistance

V1 includes optional network AI actions:

```text
define selected word
explain selected passage
summarize current chapter
```

AI must be optional.

The app must remain useful without AI.

### AI Failure Handling

V1 must handle:

```text
AI disabled
network failure
invalid AI response
API quota or server error
timeout
```

Failures should show a clear error and allow the user to return to reading.

### Local Storage

V1 target storage:

```text
SQLite for metadata, progress, highlights, saved words, and settings
local filesystem for copied EPUB files
```

IndexedDB may remain temporarily during migration, but it is not the final desktop storage target.

### Backup and Restore

V1 includes backup/export and restore/import.

Backup should support:

```text
book metadata
reading progress
highlights
saved vocabulary
settings
optionally copied EPUB files
```

Preferred backup format:

```text
.zreadbackup
```

Internally, this may be a ZIP archive containing JSON data and EPUB files.

### About / Version

V1 includes a basic About section showing:

```text
app name
version
platform
basic local-first/privacy note
```

---

## V1 Technical Direction

### UI Layer

```text
React
Vite
TypeScript
Tailwind
```

The current React/Vite reader UI should remain the main interface layer.

### Desktop Shell

```text
Tauri
```

Tauri is the target desktop runtime for Windows and Linux.

### Storage

Target storage architecture:

```text
SQLite:
  books
  reading progress
  highlights
  saved vocabulary
  settings

Filesystem:
  copied EPUB files
  backup files
  future cover images
```

### AI

AI must use an adapter pattern.

The app should not be permanently tied to one provider in frontend code.

Supported V1 AI actions:

```text
define
explain
summarize
```

### Offline Behavior

The reader must work offline.

AI may require internet.

If AI is unavailable, reading must continue normally.

---

## V1 Data and Privacy Rules

Imported books must stay local.

Reading progress must stay local.

Highlights must stay local.

Saved vocabulary must stay local.

Settings must stay local.

No account is required for V1.

No sync is required for V1.

No book text should be sent to an AI service unless the user explicitly invokes an AI action.

AI requests should send only the minimum text needed for that action.

For example:

```text
Define:
  selected word
  sentence context
  optional book title

Explain:
  selected passage
  optional book title

Summarize:
  current chapter text or limited chapter excerpt
  optional book title
```

The app must not silently upload full books.

---

## V1 AI Rules

AI is optional.

AI must not block reading.

AI must not be required to:

```text
open the app
import EPUBs
open books
read books
save progress
highlight text
save vocabulary
export backups
```

V1 AI actions are limited to:

```text
define selected word
explain selected passage
summarize current chapter
```

Explicitly not allowed in V1:

```text
full AI chat sidebar
cross-book AI memory
knowledge graph generation
AI recommendations
AI writing assistant
AI-generated study plans
AI-generated quizzes
```

---

## V1 Desktop Rules

ZRead V1 is an installed application.

The app should own its imported files.

After import, the app must not depend on the original file path.

Required desktop behaviors:

```text
native app launch
persistent local library
persistent settings
persistent reading progress
persistent annotations
native file import
desktop packaging
```

The website is not the product for V1.

If a website is created later, it is only for:

```text
downloads
documentation
privacy policy
changelog
release notes
```

---

## Explicitly Out of Scope for V1

The following are not allowed in V1:

```text
PDF support
accounts
login
cloud sync
cloud library
mobile app
public web reader
browser extension
social sharing
recommendations
bookstore features
knowledge graph
tab groups
AI chat sidebar
cross-book AI memory
collaboration
plugin system
marketplace
OCR
audiobook support
multi-format document reader
```

If a future task proposes any of these, it should be rejected for V1 and moved to the post-V1 parking lot.

---

## Post-V1 Parking Lot

The following may be considered after V1:

```text
PDF support
sync
account system
mobile app
macOS app
semantic search
graph view
cross-book memory
export to Markdown
export to Obsidian
advanced review mode
study mode
quiz generation
store distribution
signed auto-update
book covers
OPDS/catalog support
local LLM support
```

These are not V1.

---

## Feature Gate Checklist

Before implementing any feature, answer:

```text
Does this directly improve desktop EPUB reading?
Does this preserve offline reading?
Does this avoid requiring an account?
Does this avoid requiring sync?
Does this keep AI optional?
Does this fit Windows/Linux desktop V1?
Does this avoid PDF/graph/social/mobile scope?
Can this be tested locally?
Can user data be backed up or recovered?
```

If the answer to any critical question is no, the feature is post-V1.

---

## Pull Request / Agent Checklist

Every future pull request or coding-agent task must confirm:

```text
This change fits V1_SCOPE.md.
This change does not add out-of-scope features.
This change does not make AI required.
This change does not make cloud/account/sync required.
This change does not break offline reading.
This change does not risk user book/progress/highlight data.
This change can be tested locally.
```

If the change modifies storage, import, deletion, progress, highlights, saved words, or backups, it must explain how user data is protected.

---

## Definition of Done for V1

ZRead V1 is complete only when:

```text
Windows app builds.
Linux app builds.
EPUB import works.
Imported EPUBs are copied into app data.
Imported EPUBs persist after app restart.
Reader opens books.
Progress persists after restart.
Highlights persist after restart.
Saved vocabulary persists after restart.
Typography settings persist after restart.
AI can fail without breaking reading.
AI is not required for reading.
Backup export works.
Backup import works.
No account is required.
No sync is required.
PDF is not included.
Graph features are not included.
Social features are not included.
```

---

## Definition of Done for Phase 0

Phase 0 is complete only when:

```text
docs/V1_SCOPE.md exists.
The document defines ZRead V1 clearly.
The document defines non-goals clearly.
The document lists in-scope V1 features.
The document lists out-of-scope V1 features.
The document includes feature gate rules.
The document includes PR/agent checklist.
No source code files were changed.
No dependencies were installed.
No runtime behavior changed.
```

---

## Phase 0 Verification

Run:

```bash
ls docs/V1_SCOPE.md
```

Then run:

```bash
git status --short
```

Expected result:

```text
A docs/V1_SCOPE.md
```

or, if the file already existed:

```text
M docs/V1_SCOPE.md
```

No other files should be changed in Phase 0.
