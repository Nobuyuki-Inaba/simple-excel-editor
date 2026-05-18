declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

export const vscode = acquireVsCodeApi();

export const HISTORY_LIMIT = 50;

export interface HistoryEntry {
  rows: string[][];
  columns: string[];
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
