# Contributing to Link2Heading

## Development Setup

Development requires Node.js 22 or newer.

```bash
# Clone the repository
git clone https://github.com/1amnotmad/obsidian-link2heading.git
cd obsidian-link2heading

# Install the locked dependencies
npm ci

# Build for development (watch mode)
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage
```

## Project Structure

```
link2heading/
├── main.ts          # Plugin entry point and core logic
├── main.test.ts     # Core navigation integration tests
├── settings.ts      # Settings interface and UI
├── utils.ts         # Pure utility functions (testable)
├── utils.test.ts    # Unit tests
├── manifest.json    # Obsidian plugin manifest
└── esbuild.config.mjs
```

## Architecture

The plugin uses a simple architecture:

1. **Link Interception** — Monkey-patches `workspace.openLinkText` to capture heading targets before navigation
2. **Heading Detection** — Uses Obsidian's `resolveSubpath` to check if heading exists
3. **Heading Creation** — Inserts markdown heading at the appropriate location

### Key Design Decisions

- **Monkey-patching** — Chosen over DOM event listeners because it works for both click and keyboard navigation (Ctrl+Enter)
- **Pure functions in utils.ts** — Enables unit testing without mocking Obsidian APIs
- **50ms delay after file-open** — Ensures the view is ready before processing

## Testing

Tests are written with Jest and cover the core plugin flow and pure utility functions, including:

- `getLineAfterFrontmatter` — Frontmatter detection
- `calculateHeadingLevel` — Heading level logic
- `findInsertionPoint` — Insertion point calculation
- `buildHeadingText` — Markdown generation
- `parseLinkWithHeading` — Link parsing
- Pending navigation state and target-file matching

Run tests:
```bash
npm test
```

## Local Testing in Obsidian

1. Build the plugin: `npm run build`
2. Copy `main.js` and `manifest.json` to your test vault:
   ```
   <vault>/.obsidian/plugins/link2heading/
   ```
3. Reload Obsidian (Ctrl+R) or toggle the plugin off/on
4. Test with links like `[[TestNote#New Heading]]`

## Code Style

- TypeScript with strict null checks
- Minimal comments (code should be self-documenting)
- JSDoc for public interfaces and exported functions
- No unused variables or imports

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Build: `npm run build`
6. Commit with a descriptive message
7. Push and open a Pull Request
