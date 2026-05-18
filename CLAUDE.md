# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Type-check + bundle extension host + bundle webview
npm run compile

# Bundle extension host only (esbuild: src/extension.ts → out/extension.js)
npm run build:ext

# Bundle webview only (esbuild: media/src/main.ts → media/editor.js)
npm run build:webview

# Watch mode (use alongside F5 debug launch)
npm run watch

# Run unit tests (Mocha + ts-node)
npm test

# Package as VSIX
npm run package
```

There is no linter configured. TypeScript is set to `strict: true`.

## Architecture

This is a **VSCode Custom Editor extension** for `.xlsx`/`.xlsm`/`.csv`/`table-ordering.txt` files. It renders a spreadsheet UI inside a webview and reads/writes Excel files via **ExcelJS** (bundled into the extension — no Java required).

### Build

- **Extension host** (`src/`): TypeScript type-checked by `tsc --noEmit`, then bundled by `esbuild` into `out/extension.js` (CommonJS, Node 20).
- **Webview** (`media/src/`): Bundled by `esbuild` into `media/editor.js` (IIFE, ES2020).
- ExcelJS is bundled into `out/extension.js` — `node_modules` are not shipped separately.

### Excel I/O (issue #32)

Excel reading/writing is done through `IExcelIO` interface (`src/excel/IExcelIO.ts`), with `ExcelJsIO` (`src/excel/ExcelJsIO.ts`) as the current implementation.

- **To swap the library**: implement `IExcelIO` in a new class and inject it in `extension.ts`.
- Supported formats: `.xlsx`, `.xlsm`. `.xls` (old binary) is not supported by ExcelJS.
- All sheets are loaded eagerly at document open time (`readAllSheets`). No lazy per-sheet loading.
- On save, `writeWorkbook` writes all cached sheets as a fresh workbook (formatting/formulas are not preserved).
- Sheet order is determined by `doc.sheets` (not Map insertion order). `writeWorkbook` takes `sheets: string[]` as first arg to write in the correct order.

### Host ↔ Webview Split

The extension host (`src/`) owns file I/O and Excel read/write. The webview (`media/src/`) owns all edit state, undo/redo, filtering, and rendering. The host is effectively stateless after initialization — it stores cached sheet data in `ExcelDocument` but defers to the webview for all mutations.

**Messages host → webview:** `init`, `sheetData`, `requestSave`
- `init` payload includes `allSheetColumns: Record<string, string[]>` (column names for every sheet, for FK navigation)
- `sheetData` payload also includes `allSheetColumns`

**Messages webview → host:** `ready`, `edit`, `switchSheet`, `saveData`, `revert`, `importCsv`, `openSettings`, `moveSheet`, `renameSheet`, `deleteSheet`, `createSheet`

### Data Flow

1. File open → `ExcelEditorProvider.openCustomDocument()` → `ExcelJsIO.readAllSheets()` → all sheet data cached in `ExcelDocument`
   - `.csv`: `CsvUtils.parseCsv` で直接読み込み。シート名=ファイル名(拡張子なし)
   - `table-ordering.txt`: ファイル内の各行を CSV パスとして読み込み複数シートを構築
2. Webview boots, sends `ready` → host sends `init` with all sheets
3. User edits → webview state (`S`) mutates → re-renders from state
4. Save (Ctrl+S) → host sends `requestSave` → webview replies `saveData` → `ExcelJsIO.writeWorkbook()` writes xlsx
   - CSV/tableOrdering: 同名 `.xlsx` が存在しない場合のみ保存（存在すれば警告してキャンセル）
   - tableOrdering: 保存先は同じディレクトリの `{フォルダ名}.xlsx`
5. Undo to initial state → webview sends `revert` → host clears dirty flag

### Key Source Files

| File | Role |
|------|------|
| `src/ExcelEditorProvider.ts` | Custom editor provider; webview lifecycle, message routing, save/revert |
| `src/ExcelDocument.ts` | Document model; `DocumentKind` ('excel'|'csv'|'tableOrdering'), sheet metadata and per-sheet cache |
| `src/excel/IExcelIO.ts` | Excel I/O interface (listSheets, readAllSheets, readSheet, writeWorkbook) |
| `src/excel/ExcelJsIO.ts` | ExcelJS implementation of IExcelIO |
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

### CSV Direct Open (issue #40)

`ExcelDocument.kind` discriminates between `'excel'`, `'csv'`, and `'tableOrdering'`.

- **CSV**: `openCsvDocument` reads the file directly via `CsvUtils.parseCsv`. On save, the file is converted to `.xlsx` via `ExcelJsIO.writeWorkbook` (new file). If a same-named `.xlsx` already exists, save is cancelled with a warning.
- **table-ordering.txt**: `openTableOrderingDocument` reads each line as a CSV filename (relative to the txt file's dir). Lines starting with `#` are ignored. On save, all sheets are written to `{folderName}.xlsx` in the same directory.
- **CSV追加ボタン**: Toolbar "CSV追加" triggers `importCsv` message → host opens file dialog → CSV is loaded into cache as a new sheet → `sheetAdded` + `sheetData` sent to webview.
- **CSV出力ボタン**: Toolbar "CSV出力" triggers `exportCsv` message → host opens folder dialog → pre-flight check (all `{sheet}.csv` must not exist) → writes each sheet via `CsvUtils.serializeCsv` → writes `table-ordering.txt` with succeeded sheets. Conflicts found mid-write are reported as warnings; pre-flight conflicts cancel everything.
- **Encoding**: UTF-8 only (BOM stripped if present). Shift-JIS support is a future task.

### Sheet Rename / Delete (issue #42)

シートタブのダブルクリックまたは右クリックメニューからリネーム・削除が可能。

- **リネーム**: タブをダブルクリック or 右クリック→「シート名を変更...」→インライン `<input>` 編集 → Enter/blur でコミット、Escape でキャンセル。重複名は無視（バリデーションで弾く）。webview が `renameSheet { oldName, newName, currentData }` 送信 → host が `doc.sheets[idx]` と `doc.cache` キーを更新 → `sheetRenamed { sheets, allSheetColumns }` 返却。
- **削除**: 右クリック→「シートを削除」。シートが1枚のときはステータスバーにエラー表示。webview が `deleteSheet { sheetName, currentData }` 送信 → host が `vscode.window.showWarningMessage` で確認 → 削除後に隣シートへ切り替え → `sheetDeleted { sheets, newActiveSheet, columns, rows, allSheetColumns }` 返却。
- **コンテキストメニュー**: `#context-menu` を `ctx-mode-row` / `ctx-mode-sheet` の CSS クラスで切り替え。行右クリックは `ctx-for-row` 項目、シートタブ右クリックは `ctx-for-sheet` 項目を表示。
- `render.ts:startSheetRename(tab, currentName)` がインライン編集ロジックを担当。`main.ts` の `ctxRenameSheet` クリックハンドラからも呼ばれる。

### Sheet Reorder (issue #5)

シートタブのドラッグ&ドロップ、または右クリックメニューの「← 左へ移動」「右へ移動 →」で並び替え可能。

- **D&D**: `render.ts:renderSheetTabs` がタブに `draggable=true` と dragstart/dragover/drop/dragend を付与。drop 時に `S.sheets` を再配列し `onSheetMove` コールバックを呼ぶ。
- **コンテキストメニュー**: `ctx-move-left` / `ctx-move-right` クリックで同様の処理。
- **webview → host**: `{ type: 'moveSheet', sheets: string[] }` を送信 → host が `doc.sheets` を更新し `_onChange.fire`。ホストから webview への返却メッセージはなし（webview 側で先に `S.sheets` 更新済み）。
- **保存反映**: `writeWorkbook(targetPath, doc.sheets, cache, hasHeader)` で `doc.sheets` 順にシートを書き込む。

### Cross-Sheet FK Navigation (issue #9)

When a single cell is selected, `fkNav.ts:updateFkButtons` checks `S.allSheetColumns` to find other sheets with the same column name. If found, a "→ [sheet] で参照" button (or dropdown for multiple sheets) appears in the toolbar. Clicking it sets `S.pendingFkHighlight` and calls `requestSwitchSheet`. After `sheetData` arrives, `applyFkHighlight` scans the new sheet's rows, sets `S.fkHighlightRows`, and scrolls to the first match. Making any new selection clears the highlight via `clearFkHighlight`.

All sheets are loaded eagerly at open time, so `allSheetColumns` is always complete.

### Settings Button (issue #44)

ツールバー右端の `⚙` ボタン（`#btn-open-settings`）をクリックすると `openSettings` メッセージをホストへ送信。ホストが `workbench.action.openSettings simpleExcelEditor` を実行して設定画面を開く。コマンドパレットの `simpleExcelEditor.openSettings` コマンドも引き続き動作する。

### NULL / EMPTY Distinction

The extension distinguishes `[null]` (SQL NULL) from `[empty]` (empty string) — a deliberate design for DBUnit/DBRider test data. Markers are configurable via VS Code settings (`simpleExcelEditor.nullMarkers`, `simpleExcelEditor.emptyMarkers`).

## Tests

Tests live in `src/test/` and cover `CsvUtils` (parsing, serialization, round-trips, column name generation). Run with `npm test`. To add tests for a new module, place them in `src/test/<ModuleName>.test.ts` — Mocha discovers them automatically via the pattern in `.mocharc.js`.
