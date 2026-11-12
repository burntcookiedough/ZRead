
# ZRead

ZRead is a local EPUB reader for Windows and Linux, built with Tauri, React and TypeScript. Books, reading progress, highlights, vocabulary and reader settings stay on your device. AI assistance is optional.

## Development

Install Node.js 22 or later, Rust stable and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
npm ci
npm run desktop:dev
```

For the browser preview, run `npm run dev`. Browser data uses IndexedDB and localStorage. Desktop data uses SQLite plus app-owned EPUB files. Desktop startup migrates existing browser-backed desktop records without deleting the source records.

```powershell
npm run lint
npm test
npm run build
npm run desktop:build -- --bundles nsis
```

On Linux, use `npm run desktop:build -- --bundles appimage`. CI builds both package types and retains them as workflow artifacts.

## Reading data and backups

Import an EPUB with the file picker or drag it into the app. ZRead copies the file into its app data folder so you can move the original. Removing a book removes its copied EPUB and associated reading data.

Use **Export backup** on the bookshelf to save a `.zreadbackup` archive containing EPUBs, progress, highlights, vocabulary and reader settings. **Restore backup** validates the archive, adds books as new copies and applies its reader settings. Existing books are preserved. Restore accepts archives up to 512 MB expanded. Keep a backup outside the app data folder.

## Optional AI

AI starts disabled in the desktop app. Enable it on the bookshelf and enter your AI service endpoint. Definitions, explanations and summaries send only the requested word, context, passage or chapter excerpt. Saving vocabulary does not request AI.

For a local adapter, copy `.env.example` to `.env`, set `GEMINI_API_KEY` there and run:

```powershell
npm run dev:server
```

Set the desktop endpoint to `http://127.0.0.1:3000/api/ai/action`. The key stays in the server environment. The adapter listens on loopback by default. A hosted adapter needs HTTPS and its own access controls; configure additional permitted browser origins with `ZREAD_ALLOWED_ORIGINS`. `ZREAD_HOST` changes the listening interface.

The adapter accepts POST JSON with `action` equal to `define`, `explain` or `summarize`. Define uses `word` and optional `context`; the other actions use `text`. All actions accept optional `bookTitle` and return `{ "result": ... }`. See the result types in `src/utils/aiClient.ts` for a custom adapter. Requests time out after 30 seconds and can be cancelled by closing the response.

## Release acceptance

The product contract is [docs/V1_SCOPE.md](docs/V1_SCOPE.md). Current verified work and remaining acceptance checks are recorded in [docs/RESUME_CHECKPOINT.md](docs/RESUME_CHECKPOINT.md). A successful web build alone does not establish desktop release readiness.
