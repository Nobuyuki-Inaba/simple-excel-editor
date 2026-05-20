declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

export const vscode = acquireVsCodeApi();

export const HISTORY_LIMIT = 50;

export interface HistoryEntry {
  rows: string[][];
  columns: string[];
}

export interface WebviewLabels {
  groupColTitle: string;
  groupAll: string;
  groupCountTpl: string;
  groupToggleExpand: string;
  groupToggleCollapse: string;
  dateWarning: string;
  statusLoading: string;
  rowsMatch: string;
  totalRows: string;
  rowsSelected: string;
  cellsSelected: string;
  colStatsMain: string;
  colStatsEmpty: string;
  colStatsDup: string;
  cannotDeleteLastSheet: string;
  fkNavigateTpl: string;
  fkGoBtn: string;
  fkColumnNotFound: string;
  fkNoMatch: string;
  hintNullEmpty: string;
  titleAddRow: string;
  titleDeleteRow: string;
  titleDupRow: string;
  titleAddCol: string;
  titleDeleteCol: string;
  titleImportCsv: string;
  titleExportCsv: string;
  btnAddRow: string;
  btnDeleteRow: string;
  btnDupRow: string;
  btnAddCol: string;
  btnDeleteCol: string;
  btnImportCsv: string;
  btnExportCsv: string;
  searchPlaceholder: string;
  titleClearSearch: string;
  titleGroupFilter: string;
  titleOpenSettings: string;
  titleFirstPage: string;
  titlePrevPage: string;
  titleNextPage: string;
  titleLastPage: string;
  ctxCreateSheet: string;
  ctxMoveLeft: string;
  ctxMoveRight: string;
  ctxRenameSheet: string;
  ctxDeleteSheet: string;
  langAttr: string;
}

const defaultLabels: WebviewLabels = {
  groupColTitle: 'Group column',
  groupAll: 'Group: All',
  groupCountTpl: '{0} ({1} rows)',
  groupToggleExpand: '▼ Grouped',
  groupToggleCollapse: '▶ Grouped',
  dateWarning: '⚠ Recommended format: yyyy-MM-dd or yyyy-MM-dd HH:mm:ss',
  statusLoading: 'Loading...',
  rowsMatch: '{0} matching / {1} rows',
  totalRows: '{0} rows',
  rowsSelected: '{0} rows selected',
  cellsSelected: '{0} rows × {1} cols selected',
  colStatsMain: '{0}: {1} rows | NULL: {2} | Unique: {3}',
  colStatsEmpty: ' | Empty: {0}',
  colStatsDup: ' | Duplicates: {0}',
  cannotDeleteLastSheet: 'Cannot delete the last sheet',
  fkNavigateTpl: '→ Navigate in {0}',
  fkGoBtn: '→ Navigate',
  fkColumnNotFound: '⚠ Reference column not found',
  fkNoMatch: '⚠ No matching records found',
  hintNullEmpty: 'NULL: Alt+N | Empty string: Alt+E',
  titleAddRow: 'Add row below selection',
  titleDeleteRow: 'Delete selected row',
  titleDupRow: 'Duplicate selected row below (Ctrl+D)',
  titleAddCol: 'Add column to the right of selection',
  titleDeleteCol: 'Delete selected column',
  titleImportCsv: 'Add CSV file as a sheet',
  titleExportCsv: 'Export all sheets as CSV files',
  btnAddRow: '＋ Row',
  btnDeleteRow: '－ Row',
  btnDupRow: 'Dup Row',
  btnAddCol: '＋ Col',
  btnDeleteCol: '－ Col',
  btnImportCsv: 'Add CSV',
  btnExportCsv: 'Export CSV',
  searchPlaceholder: 'Search...',
  titleClearSearch: 'Clear search',
  titleGroupFilter: 'Filter by group',
  titleOpenSettings: 'Open extension settings',
  titleFirstPage: 'First page',
  titlePrevPage: 'Previous page',
  titleNextPage: 'Next page',
  titleLastPage: 'Last page',
  ctxCreateSheet: 'Create sheet from selected rows...',
  ctxMoveLeft: '← Move left',
  ctxMoveRight: 'Move right →',
  ctxRenameSheet: 'Rename sheet...',
  ctxDeleteSheet: 'Delete sheet',
  langAttr: 'en',
};

export function fmt(template: string, ...args: (string | number)[]): string {
  return args.reduce<string>(
    (s, arg, i) => s.replace(`{${i}}`, String(arg)),
    template
  );
}

export const S = {
  sheets:       [] as string[],
  activeSheet:  '',
  columns:      [] as string[],
  rows:         [] as string[][],
  pageSize:     200,
  page:         0,
  nullMarkers:  ['[null]'] as string[],
  emptyMarkers: ['[empty]'] as string[],
  filterText:   '',
  selectedRow:  -1,
  selectedCol:  -1,
  selectedCells: new Set<string>(),
  anchorCell:   null as { ri: number; ci: number } | null,
  selectedRows: new Set<number>(),
  anchorRow:    -1,
  history:      [] as HistoryEntry[],
  historyIndex: -1,
  dirty:        false,
  // Row grouping
  enableRowGrouping: true,
  expandedGroups: new Set<string>(),
  groupFilter:    '',
  // FK navigation
  allSheetColumns:    {} as Record<string, string[]>,
  pendingFkHighlight: null as { columnName: string; value: string } | null,
  fkHighlightRows:    new Set<number>(),
  // i18n
  labels: { ...defaultLabels } as WebviewLabels,
};

// ── DOM refs ────────────────────────────────────────────────────────────────

const $  = (id: string) => document.getElementById(id) as HTMLElement;

export const headerRow      = $('header-row')      as HTMLTableRowElement;
export const tableBody      = $('table-body')      as HTMLTableSectionElement;
export const sheetTabsEl    = $('sheet-tabs');
export const pageInfo       = $('page-info');
export const rowCount       = $('row-count');
export const statusBar      = $('status-bar');
export const btnFirst       = $('btn-first')       as HTMLButtonElement;
export const btnPrev        = $('btn-prev')        as HTMLButtonElement;
export const btnNext        = $('btn-next')        as HTMLButtonElement;
export const btnLast        = $('btn-last')        as HTMLButtonElement;
export const filterInput    = $('filter-input')    as HTMLInputElement;
export const btnFilterClear = $('btn-filter-clear')as HTMLButtonElement;
export const btnAddRow      = $('btn-add-row')     as HTMLButtonElement;
export const btnDelRow      = $('btn-delete-row')  as HTMLButtonElement;
export const btnDupRow      = $('btn-dup-row')     as HTMLButtonElement;
export const btnAddCol      = $('btn-add-col')     as HTMLButtonElement;
export const btnDelCol      = $('btn-delete-col')  as HTMLButtonElement;

// ── Outbound messages ───────────────────────────────────────────────────────

// updateStatus is registered here to avoid circular deps (render.ts → state.ts → render.ts)
let _updateStatus: (() => void) | null = null;
export function registerUpdateStatus(fn: () => void): void { _updateStatus = fn; }

export function markDirty(): void {
  if (!S.dirty) {
    S.dirty = true;
    vscode.postMessage({ type: 'edit' });
  }
  _updateStatus?.();
}

export function sendSaveData(): void {
  vscode.postMessage({ type: 'saveData', sheetName: S.activeSheet, columns: S.columns, rows: S.rows });
}

export function requestSwitchSheet(name: string): void {
  vscode.postMessage({
    type: 'switchSheet',
    sheetName: name,
    currentData: { sheetName: S.activeSheet, columns: S.columns, rows: S.rows },
  });
}
