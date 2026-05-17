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

This is a **VSCode Custom Editor extension** for `.xlsx`/`.xls`/`.xlsm`/`.csv`/`table-ordering.txt` files. It renders a spreadsheet UI inside a webview and converts between Excel and CSV using an external Java subprocess.

### Host ↔ Webview Split

The extension host (`src/`) owns file I/O and Excel↔CSV conversion. The webview (`media/src/`) owns all edit state, undo/redo, filtering, and rendering. The host is effectively stateless after initialization — it stores cached sheet data in `ExcelDocument` but defers to the webview for all mutations.

**Messages host → webview:** `init`, `sheetData`, `requestSave`
- `init` payload includes `allSheetColumns: Record<string, string[]>` (column names for every sheet, for FK navigation)
- `sheetData` payload also includes `allSheetColumns`

**Messages webview → host:** `ready`, `edit`, `switchSheet`, `saveData`, `revert`, `importCsv`

### Data Flow

1. File open → `ExcelEditorProvider.openCustomDocument()` → `JavaRunner` spawns `exceltocsv` JAR → CSV output → `CsvUtils.parseCsv()` → cached in `ExcelDocument`
   - `.csv`: JAR不要。`CsvUtils.parseCsv` で直接読み込み。シート名=ファイル名(拡張子なし)
   - `table-ordering.txt`: ファイル内の各行を CSV パスとして読み込み複数シートを構築
2. Webview boots, sends `ready` → host sends `init` with all sheets
3. User edits → webview state (`S`) mutates → re-renders from state
4. Save (Ctrl+S) → host sends `requestSave` → webview replies `saveData` → `JavaRunner` converts CSV → Excel → written to disk
   - CSV/tableOrdering: 同名 `.xlsx` が存在しない場合のみ保存（存在すれば警告してキャンセル）
   - tableOrdering: 保存先は同じディレクトリの `{フォルダ名}.xlsx`
5. Undo to initial state → webview sends `revert` → host clears dirty flag

### Key Source Files

| File | Role |
|------|------|
| `src/ExcelEditorProvider.ts` | Custom editor provider; webview lifecycle, message routing, save/revert |
| `src/ExcelDocument.ts` | Document model; `DocumentKind` ('excel'|'csv'|'tableOrdering'), sheet metadata and per-sheet CSV cache |
| `src/JavaRunner.ts` | Subprocess wrapper for `exceltocsv` JAR; handles encoding, timeouts, temp files |
| `src/JavaPathDetector.ts` | Resolves Java binary: VS Code setting → Java extension → `JAVA_HOME` → `PATH` |
| `src/CsvUtils.ts` | RFC 4180 CSV parser/serializer; column name generation (A–Z, AA–AZ…) |
| `media/src/main.ts` | Webview entry; message routing, keyboard shortcut wiring |
| `media/src/state.ts` | Global state object `S` and DOM element refs |
| `media/src/render.ts` | State → DOM; table, column headers, pagination, status bar |
| `media/src/selection.ts` | Cell/row/column selection with Shift+click / Ctrl+click |
| `media/src/fkNav.ts` | FK reference navigation: `updateFkButtons`, `applyFkHighlight`, `clearFkHighlight` |
| `media/src/edit/cell.ts` | Inline cell editing; undo/redo stack (max 50 entries) |
| `media/src/edit/clipboard.ts` | Copy/paste via Clipboard API |
| `media/src/data/operations.ts` | Row/column mutations, filtering, pagination |
| `media/src/data/utils.ts` | NULL/EMPTY detection, date validation, column stats |

### External Dependency: exceltocsv JAR

All Excel parsing and writing is delegated to `lib/exceltocsv.jar` (not included in this repo — must be built from the sibling Java project and placed there manually). Java 21+ is required at runtime.

### CSV Direct Open (issue #40)

`ExcelDocument.kind` discriminates between `'excel'`, `'csv'`, and `'tableOrdering'`.

- **CSV**: `openCsvDocument` reads the file directly via `CsvUtils.parseCsv`. On save, the file is converted to `.xlsx` via JAR (new file, no `--update`). If a same-named `.xlsx` already exists, save is cancelled with a warning.
- **table-ordering.txt**: `openTableOrderingDocument` reads each line as a CSV filename (relative to the txt file's dir). Lines starting with `#` are ignored. On save, all sheets are written to `{folderName}.xlsx` in the same directory.
- **CSV追加ボタン**: Toolbar "CSV追加" triggers `importCsv` message → host opens file dialog → CSV is loaded into cache as a new sheet → `sheetAdded` + `sheetData` sent to webview.
- **Encoding**: UTF-8 only (BOM stripped if present). Shift-JIS support is a future task.
- `JavaRunner.csvToExcel` accepts `update: boolean` (default `true`). Pass `false` when creating a new xlsx so `--update` is omitted.

### Cross-Sheet FK Navigation (issue #9)

When a single cell is selected, `fkNav.ts:updateFkButtons` checks `S.allSheetColumns` to find other sheets with the same column name. If found, a "→ [sheet] で参照" button (or dropdown for multiple sheets) appears in the toolbar. Clicking it sets `S.pendingFkHighlight` and calls `requestSwitchSheet`. After `sheetData` arrives, `applyFkHighlight` scans the new sheet's rows, sets `S.fkHighlightRows`, and scrolls to the first match. Making any new selection clears the highlight via `clearFkHighlight`.

`sendInit` now eagerly loads **all** sheets into `doc.cache` so `allSheetColumns` is always complete.

### NULL / EMPTY Distinction

The extension distinguishes `[null]` (SQL NULL) from `[empty]` (empty string) — a deliberate design for DBUnit/DBRider test data. Markers are configurable via VS Code settings (`simpleExcelEditor.nullMarkers`, `simpleExcelEditor.emptyMarkers`).

## Tests

Tests live in `src/test/` and cover `CsvUtils` (parsing, serialization, round-trips, column name generation). Run with `npm test`. To add tests for a new module, place them in `src/test/<ModuleName>.test.ts` — Mocha discovers them automatically via the pattern in `.mocharc.js`.
