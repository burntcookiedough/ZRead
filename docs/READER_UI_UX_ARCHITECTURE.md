# Reader UI/UX Architecture

## Current Problem

The current Reader work needs a clean architecture reset before more UI changes are made.
PR #17 proved useful as an experiment, but it also showed that Reader UI fixes can become brittle when layout, animation, styling, and state management are patched directly inside one large surface.

Known problems from the ReaderView experiment:

- Single Page to Split Pages transitions can bounce when the real reader viewport is animated while column measurements are changing.
- Pagination behavior is spread across multiple effects, refs, timers, and state setters.
- Image-heavy chapters can render media taller than the reader column.
- The settings panel is too large for smaller viewports and behaves like a desktop popover even when space is constrained.
- Broad CSS overrides and brittle selectors create monkey-patch behavior that is difficult to reason about.
- `ReaderView.tsx` owns too many concerns: EPUB loading, rendered HTML, pagination, progress, HUD visibility, settings, chapter navigation, text selection, highlights, saved vocabulary, AI actions, fullscreen, and notifications.

Decision:

- Do not merge PR #17.
- Preserve the findings from PR #17.
- Start implementation again from clean `dev`.
- Land this document first as a planning-only PR.

Trade-off:

- This delays the next visual fix, but it prevents another patch stack from hardening into the Reader architecture.

## Design Principles

The Reader is the core ZRead product surface. It should feel calm, local-first, desktop-native, and reliable.

Reader UI changes should follow these principles:

- Reading comes first. Controls should help the reader without becoming the main visual subject.
- Architecture should separate layout measurement, rendered content, controls, settings, and persistence concerns.
- Layout math should be explicit. A displayed page, a displayed spread, and an internal movement unit must not be treated as the same concept by accident.
- CSS should be boring and local. Avoid global overrides unless they describe EPUB content semantics.
- Implementation should prefer stable, predictable behavior over visual polish that depends on timers or measurement races.
- Large files should be split by responsibility once the target shape is agreed.

Decision:

- Use simple modular React components and hooks rather than a new reader framework.

Trade-off:

- This keeps the current React/Vite/Tailwind stack and avoids a risky rewrite, but it requires discipline around component boundaries.

## Visual System

The Reader visual system should be quiet and utilitarian:

- Typography is the primary visual element.
- Controls should use restrained borders, low-contrast surfaces, and clear hover/focus states.
- Panels should be compact, scannable, and responsive.
- Repeated controls should come from shared primitives instead of one-off Tailwind strings.
- Reader-specific surfaces should use Reader tokens instead of hard-coded theme class combinations spread through JSX.

Target shared UI primitives:

```text
src/components/ui/
- Button.tsx
- IconButton.tsx
- Panel.tsx
- SliderRow.tsx
- SegmentedControl.tsx
- Tooltip.tsx
```

The shared primitives are not part of this PR. They are documented here as the target for the next implementation step.

Decision:

- Create a small shared UI primitive layer before continuing large Reader visual changes.

Trade-off:

- This adds a little upfront component work, but it reduces duplicated control styling and makes future Reader changes easier to review.

## Theme and Token Strategy

The Reader should use explicit theme and component tokens rather than broad overrides that fight Tailwind classes.

Rules:

- Define Reader theme tokens for page background, text, muted text, panel background, panel border, control hover, focus ring, and progress fill.
- Keep global CSS limited to base app styles and EPUB content semantics.
- Do not use brittle selectors such as `button[class*="bg-white"]`.
- Do not patch arbitrary Tailwind utility classes globally.
- Do not add hidden constants that change design behavior without naming their purpose.
- Keep theme names and available UI options aligned. If the type supports `warm` or `muted`, the settings UI and token map must either support them deliberately or remove them from the exposed model.
- Prefer CSS custom properties bound at the Reader shell root, then consume those tokens in Reader components.

Expected token categories:

```text
reader.bg
reader.text
reader.textMuted
reader.panelBg
reader.panelBorder
reader.controlBg
reader.controlHoverBg
reader.focusRing
reader.progress
reader.selection
reader.epubMediaFilter
```

Decision:

- Use Reader-scoped design tokens as the contract between theme settings and visual components.

Trade-off:

- Token names require maintenance, but they make visual changes auditable and prevent theme behavior from being hidden in scattered class strings.

## Responsive Layout Rules

The Reader layout must adapt deliberately across desktop, tablet, and narrow windows.

Desktop rules:

- Keep the reader viewport centered.
- Single Page mode displays one content page.
- Split Pages mode displays one spread when the available width can support it.
- Header and footer HUD controls may remain horizontal on desktop.
- Settings may open as a right-side popover or panel when there is enough width.
- Chapter rail may live on the right edge when it does not crowd the reading column.

Tablet and small viewport rules:

- Force Single Page mode when the viewport cannot support a readable split spread.
- Settings should use a constrained panel with internal scrolling.
- If a side popover would crowd the text, settings should become a bottom sheet.
- Footer controls should preserve previous, progress, and next actions without text collision.
- Chapter rail should collapse to an icon button, menu, or sheet.

Reader image constraints:

- EPUB images, SVGs, and image-like media must fit inside the current page unit.
- Media must not force the reader column taller than the visible viewport.
- Cover-heavy chapters should preserve aspect ratio and avoid horizontal or vertical overflow.

Chapter rail collapse behavior:

- Desktop: edge rail can expose chapter markers and a titled panel on hover or click.
- Narrow widths: rail collapses behind a direct chapter control.
- Touch-first behavior should use click/tap, not hover-only discovery.

Decision:

- Treat responsive behavior as part of the Reader layout contract, not as a CSS afterthought.

Trade-off:

- More explicit breakpoints and states are needed, but the Reader becomes testable across realistic desktop window sizes.

## Reader Component Architecture

The target structure is:

```text
src/components/reader/
- ReaderView.tsx
- ReaderShell.tsx
- ReaderViewport.tsx
- ReaderFooter.tsx
- ReaderSettingsPanel.tsx
- ChapterRail.tsx
- SelectionMenu.tsx

src/components/reader/hooks/
- useReaderLayout.ts
- useReaderProgress.ts
- useRenderedChapterHtml.ts
- useReaderHud.ts
```

Responsibility boundaries:

- `ReaderView.tsx` coordinates book identity, storage dependencies, high-level reader state, and composition.
- `ReaderShell.tsx` owns the full-screen reader frame, theme token binding, header/HUD slots, fullscreen behavior, and top-level interaction zones.
- `ReaderViewport.tsx` owns the rendered page/spread viewport and receives settled layout values rather than computing them ad hoc.
- `ReaderFooter.tsx` owns progress display, previous/next controls, and page/spread copy.
- `ReaderSettingsPanel.tsx` owns typography, theme, width, and view mode controls.
- `ChapterRail.tsx` owns chapter navigation and responsive collapse behavior.
- `SelectionMenu.tsx` remains responsible for selected-text actions and should not know about layout measurement.
- `useReaderLayout.ts` owns pagination units, measurement, resize handling, layout-settled state, and mode transitions.
- `useReaderProgress.ts` owns progress save/restore mapping between source percent and layout units.
- `useRenderedChapterHtml.ts` owns rendered chapter HTML, highlights injection, and front-cover decoration.
- `useReaderHud.ts` owns HUD visibility, interaction refresh, and overlay-aware auto-hide rules.

Decision:

- Split by behavior and state ownership, not by visual nesting alone.

Trade-off:

- Extraction must happen in small PRs because `ReaderView.tsx` currently couples many concerns. The plan avoids a risky all-at-once rewrite.

## Reader Layout Engine Model

The Reader layout engine should expose named concepts instead of ambiguous page values.

Internal concepts:

```text
unitIndex
unitCount
unitStride
unitsPerViewport
sourcePercent
layoutSettled
```

Definitions:

- `unitIndex`: zero-based index of the currently displayed movement unit.
- `unitCount`: total number of movement units in the current chapter and layout mode.
- `unitStride`: horizontal distance between movement units.
- `unitsPerViewport`: number of EPUB columns visible in the viewport.
- `sourcePercent`: persisted normalized chapter progress from 0 to 100.
- `layoutSettled`: true only after rendered content, viewport size, columns, and target unit have been measured and applied.

Mode behavior:

- Single mode displays one page per unit.
- Split mode displays one spread per unit.
- Single mode usually has `unitsPerViewport = 1`.
- Split mode usually has `unitsPerViewport = 2` on wide enough viewports.
- Narrow viewports may force `unitsPerViewport = 1` even when the saved setting is Split Pages.

Progress mapping:

- Persist source progress as a normalized `sourcePercent`.
- Restore progress by mapping `sourcePercent` onto the current `unitCount`.
- When layout mode changes, convert through `sourcePercent` rather than trying to preserve a stale page index.
- Clamp all restored unit indexes to the valid range.

Measurement rules:

- Measure only after chapter HTML is rendered and the viewport has a stable size.
- A layout mode change should enter an unsettled state, compute the new unit model, apply the target unit, then mark layout settled.
- Effects should not compete to update unit count, viewport width, and current unit independently.

Decision:

- Centralize layout state in `useReaderLayout.ts`.

Trade-off:

- The hook becomes an important shared contract, but it removes hidden coupling between rendering, resize events, settings changes, and progress restore.

## Page vs Spread Terminology

User-facing copy may say page or spread deliberately, but internal math must be explicit.

Terminology:

- Page: one visible EPUB column.
- Spread: two visible EPUB columns shown together.
- Unit: the movement step used by navigation and animation.

Display rules:

- In Single Page mode, the current unit is a page.
- In Split Pages mode, the current unit is a spread.
- Footer copy may show `Page X of Y` in Single Page mode.
- Footer copy may show `Spread X of Y` in Split Pages mode if that is clearer.
- Internal variables should not use `pageIndex` when the value may represent a spread.

Decision:

- Rename future layout state toward unit-based language during the layout hook extraction.

Trade-off:

- This creates some migration churn, but it prevents bugs where split layout math is accidentally treated as single-page math.

## EPUB Media Sizing Rules

EPUB content may include covers, inline images, SVGs, and image-like elements. The Reader must constrain these without rewriting book content unpredictably.

Rules:

- Constrain EPUB media inside `.epub-content` only.
- Use max inline size of 100 percent of the readable column.
- Use max block size based on the current reader viewport height, not the full browser window.
- Preserve aspect ratio with `object-fit: contain`.
- Avoid grayscale or contrast filters unless the active theme explicitly defines a media filter token.
- Prevent media from breaking page height by default.
- Allow intentional cover display rules for first-page/front-cover treatment, but keep them Reader-owned and named.
- Do not use broad global selectors that affect app icons or UI images.

Target behavior:

- Normal inline images fit the column.
- Tall covers fit within the visible page unit.
- SVG images do not overflow horizontally.
- Image-heavy chapters do not create unreachable content or blank navigation units.

Decision:

- Keep EPUB media rules in a Reader-scoped content stylesheet or Reader token-aware CSS section.

Trade-off:

- Some EPUBs may not match their publisher styling exactly, but the Reader remains usable and predictable.

## Settings Panel Rules

The settings panel should be a first-class responsive component, not a fixed desktop popover.

Controls:

- Typeface uses a segmented or selectable list control.
- Font size uses a stepper or slider row with visible value.
- Line height uses a stepper or slider row with visible value.
- Content width uses a stepper or slider row with visible value.
- Page layout uses a segmented control for Single Page and Split Pages.
- Theme uses labeled swatches.

Sizing:

- Desktop panel width should be constrained, roughly 320 to 400 px.
- Panel height should never exceed the available viewport minus HUD spacing.
- Panel content should scroll internally when needed.
- Narrow widths should use a bottom sheet if a side panel would cover too much text.
- The panel should have predictable focus order and close behavior.

Interaction:

- Escape closes the panel.
- Clicking outside may close the panel only when it does not conflict with selection or fullscreen behavior.
- Settings changes may trigger layout recalculation, but not animated measurement.
- Split Pages may be disabled or shown as unavailable on too-narrow windows.

Decision:

- Replace the current typography popover with `ReaderSettingsPanel.tsx` after shared primitives exist.

Trade-off:

- The panel will take more structure than the current component, but it will behave correctly across desktop and narrow windows.

## Animation Rules

Reader animation must never depend on measuring layout during the animation.

Rules:

- Page turns use transform-only movement.
- Opacity may be used for settled/unsettled transitions.
- Layout mode transitions must not measure during animation.
- Layout should settle before animated polish begins.
- Do not animate width, column count, or measured layout containers while they are being measured.
- Do not use random timer patches to hide measurement races.
- Prefer stable simple animation over fancy broken animation.

Mode transition sequence:

```text
settings change
-> mark layoutSettled false
-> render stable layout target
-> measure unit model
-> map sourcePercent to target unitIndex
-> apply transform without polish animation
-> mark layoutSettled true
-> allow subsequent page-turn animation
```

Decision:

- Separate page-turn animation from layout-mode transition behavior.

Trade-off:

- Mode switching may feel less animated at first, but it will not bounce or land on the wrong unit.

## Accessibility and Interaction Rules

The Reader should remain keyboard, pointer, and screen-reader friendly even when controls auto-hide.

Rules:

- Previous and next page controls must be reachable by keyboard.
- Arrow key navigation should not steal input when focus is inside form fields or editable controls.
- Escape should close the topmost overlay first.
- Focus should move into opened panels and return to the invoking control on close.
- All icon-only controls must have accessible labels and tooltips.
- Visible focus states must use Reader focus tokens.
- Text selection must remain possible inside EPUB content.
- Click-to-fullscreen must not trigger from buttons, panels, menus, selected text controls, or other interactive elements.
- Hover-only controls need tap/click alternatives.
- Reduced motion preferences should disable non-essential movement.

Decision:

- Treat overlays, HUD, selection, and fullscreen as coordinated interaction states.

Trade-off:

- This requires a small interaction model, but it avoids accidental fullscreen requests, hidden controls, and focus traps.

## Refactor PR Sequence

Future implementation should be split into reviewable PRs:

```text
PR A: docs reader UI/UX architecture
PR B: shared UI primitives and tokens
PR C: reader shell extraction
PR D: reader layout engine hook
PR E: media sizing and responsive panels
PR F: animation polish
```

PR A:

- Add this architecture document.
- Do not change runtime behavior.

PR B:

- Add shared UI primitives.
- Add Reader token definitions.
- Avoid changing Reader layout behavior except where needed to adopt primitives safely.

PR C:

- Extract `ReaderShell`, `ReaderFooter`, `ChapterRail`, and `ReaderSettingsPanel` scaffolding.
- Keep behavior equivalent where possible.

PR D:

- Add `useReaderLayout`.
- Rename ambiguous page state toward unit-based layout state.
- Centralize resize, measurement, restore, and layout-settled behavior.

PR E:

- Apply EPUB media sizing rules.
- Finish responsive settings panel behavior.
- Finish chapter rail collapse behavior.

PR F:

- Add page-turn polish only after layout state is stable.
- Keep layout mode transitions stable before adding visual effects.

Decision:

- Land architecture and extraction before animation polish.

Trade-off:

- The sequence is slower than one broad Reader rewrite, but each PR has a smaller blast radius and a clearer verification target.

## Verification Matrix

Each implementation PR after this document should verify the relevant rows from this matrix:

```text
- normal text EPUB
- long paragraph chapter
- image/cover-heavy chapter
- Single Page
- Split Pages
- Single -> Split
- Split -> Single
- rapid next/previous
- font size change
- content width change
- window resize
- settings panel at desktop/tablet/narrow widths
```

Additional checks:

- Open a book from the library.
- Restore progress after reopening the reader.
- Navigate previous and next by buttons, side hot zones, and arrow keys.
- Open and close settings with pointer and keyboard.
- Select text, copy, highlight, save, define, and explain.
- Open chapter navigation and jump to another chapter.
- Confirm AI failure does not block reading.
- Confirm no source file outside the intended PR scope changed.

Required commands for code-changing Reader PRs:

```powershell
npm run lint
npm run build
```

Decision:

- Verification must include layout transitions and narrow settings behavior, not only a successful build.

Trade-off:

- Manual checks take time, but they target the failure modes already observed in PR #17.

## Out of Scope

This architecture PR must not include:

```text
- no SQLite
- no Phase 5.2
- no storage migration
- no EPUB parser rewrite
- no AI changes
- no backup/export/import
- no massive ReaderView rewrite inside this docs PR
```

Additional non-goals:

- Do not implement the target component files in this PR.
- Do not change `ReaderView.tsx` in this PR.
- Do not change `src/index.css` in this PR.
- Do not add dependencies in this PR.
- Do not change runtime behavior in this PR.
