# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Compile extension host TypeScript + bundle webview
npm run compile

# Watch mode (use alongside F5 debug launch)
npm run watch

# Bundle webview only (esbuild: media/src/main.ts → media/editor.js)
npm run build:webview

# Run unit tests (Mocha + ts-node)
npm test

# Package as VSIX
npm run package
```

There is no linter configured. TypeScript is set to `strict: true`.

## Architecture

This is a **VSCode Custom Editor extension** for `.xlsx`/`.xls`/`.xlsm` files. It renders a spreadsheet UI inside a webview and converts between Excel and CSV using an external Java subprocess.

### Host ↔ Webview Split

The extension host (`src/`) owns file I/O and Excel↔CSV conversion. The webview (`media/src/`) owns all edit state, undo/redo, filtering, and rendering. The host is effectively stateless after initialization — it stores cached sheet data in `ExcelDocument` but defers to the webview for all mutations.

**Messages host → webview:** `init`, `sheetData`, `requestSave`
**Messages webview → host:** `ready`, `edit`, `switchSheet`, `saveData`, `revert`

### Data Flow

1. File open → `ExcelEditorProvider.openCustomDocument()` → `JavaRunner` spawns `exceltocsv` JAR → CSV output → `CsvUtils.parseCsv()` → cached in `ExcelDocument`
2. Webview boots, sends `ready` → host sends `init` with all sheets
3. User edits → webview state (`S`) mutates → re-renders from state
4. Save (Ctrl+S) → host sends `requestSave` → webview replies `saveData` → `JavaRunner` converts CSV → Excel → written to disk
5. Undo to initial state → webview sends `revert` → host clears dirty flag

### Key Source Files

| File | Role |
|------|------|
| `src/ExcelEditorProvider.ts` | Custom editor provider; webview lifecycle, message routing, save/revert |
| `src/ExcelDocument.ts` | Document model; sheet metadata and per-sheet CSV cache |
| `src/JavaRunner.ts` | Subprocess wrapper for `exceltocsv` JAR; handles encoding, timeouts, temp files |
| `src/JavaPathDetector.ts` | Resolves Java binary: VS Code setting → Java extension → `JAVA_HOME` → `PATH` |
| `src/CsvUtils.ts` | RFC 4180 CSV parser/serializer; column name generation (A–Z, AA–AZ…) |
| `media/src/main.ts` | Webview entry; message routing, keyboard shortcut wiring |
| `media/src/state.ts` | Global state object `S` and DOM element refs |
| `media/src/render.ts` | State → DOM; table, column headers, pagination, status bar |
| `media/src/selection.ts` | Cell/row/column selection with Shift+click / Ctrl+click |
| `media/src/edit/cell.ts` | Inline cell editing; undo/redo stack (max 50 entries) |
| `media/src/edit/clipboard.ts` | Copy/paste via Clipboard API |
| `media/src/data/operations.ts` | Row/column mutations, filtering, pagination |
| `media/src/data/utils.ts` | NULL/EMPTY detection, date validation, column stats |

### External Dependency: exceltocsv JAR

All Excel parsing and writing is delegated to `lib/exceltocsv.jar` (not included in this repo — must be built from the sibling Java project and placed there manually). Java 21+ is required at runtime.

### NULL / EMPTY Distinction

The extension distinguishes `[null]` (SQL NULL) from `[empty]` (empty string) — a deliberate design for DBUnit/DBRider test data. Markers are configurable via VS Code settings (`simpleExcelEditor.nullMarkers`, `simpleExcelEditor.emptyMarkers`).

## Tests

Tests live in `src/test/` and cover `CsvUtils` (parsing, serialization, round-trips, column name generation). Run with `npm test`. To add tests for a new module, place them in `src/test/<ModuleName>.test.ts` — Mocha discovers them automatically via the pattern in `.mocharc.js`.
