## Summary
- Add `useReaderLayout` to own Reader viewport measurement and pagination unit state.
- Move resize recalculation, source-percent restore mapping, layout-settled state, unit stride, and viewport width style out of `ReaderView`.
- Keep ReaderView responsible for book/chapter orchestration, navigation commands, and progress persistence.

## Validation
- [x] npm run lint
- [x] npm run build
- [x] npm run desktop:build -- --no-bundle
- [x] Browser app shell loads via `npm run dev`
- [x] Desktop app launches via `npm run desktop:dev`
- [ ] Real EPUB Reader interaction smoke

## Manual Smoke Notes
Desktop dev launches and existing app-data EPUB files are present, but native Reader interactions were not fully verified in this environment. Do not merge until real-book smoke is completed or this gap is accepted explicitly.

## Merge Gate
Do not merge until:
- GitHub PR metadata, changed files, and diff are verified.
- Real EPUB Reader smoke is completed:
  - open real EPUB
  - next/previous
  - Single mode
  - Split mode
  - Single -> Split
  - Split -> Single
  - settings panel
  - chapter rail
  - back to library
  - restart/progress restore if practical
- lint/build/desktop build status remains passing.
