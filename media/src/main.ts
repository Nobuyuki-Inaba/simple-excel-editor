import { S, vscode, filterInput, statusBar, sheetTabsEl, tableBody, registerUpdateStatus, sendSaveData, markDirty, requestSwitchSheet, WebviewLabels } from './state';
import { render, renderSheetTabs, renderTable, renderBody, renderPagination,
         updateStatus, registerRenderHandlers, startSheetRename } from './render';
import { selectCell, selectRow, selectColumn } from './selection';
import { startEdit, startHeaderEdit, commitActiveEdit, undo, redo,
         snapshot, isEditing } from './edit/cell';
import { copySelection, pasteSelection } from './edit/clipboard';
import { setupListeners, duplicateRow } from './data/operations';
import { getDisplayRows } from './data/utils';
import { applyFkHighlight } from './fkNav';

// Break state→render circular dep: register updateStatus callback
registerUpdateStatus(updateStatus);

// Wire render callbacks to selection/edit implementations
registerRenderHandlers({
  onCellClick:    (ri, ci, shift, ctrl) => selectCell(ri, ci, shift, ctrl),
  onCellDblClick: (td, ri, ci) => startEdit(td, ri, ci),
  onRowClick:     (ri, shift, ctrl) => selectRow(ri, shift, ctrl),
  onColClick:     ci => selectColumn(ci),
  onColDblClick:  (th, ci) => startHeaderEdit(th, ci),
  onCommitEdit:   () => commitActiveEdit(),
  onSheetRename:  (oldName, newName) => {
    vscode.postMessage({
      type: 'renameSheet',
      oldName,
      newName,
      currentData: { sheetName: S.activeSheet, columns: [...S.columns], rows: S.rows.map(r => [...r]) },
    });
  },
  onSheetTabContextMenu: (sheetName, x, y) => {
    contextMenuSheetName = sheetName;
    showContextMenu(x, y, 'ctx-mode-sheet');
  },
  onSheetMove: (newSheets) => {
    S.sheets = newSheets;
    markDirty();
    renderSheetTabs();
    vscode.postMessage({ type: 'moveSheet', sheets: newSheets });
  },
});

// Button / filter event listeners
setupListeners();

// ── Context menu ─────────────────────────────────────────────────────────────

const contextMenu     = document.getElementById('context-menu')      as HTMLElement;
const ctxCreateSheet  = document.getElementById('ctx-create-sheet')  as HTMLElement;
const ctxMoveLeft     = document.getElementById('ctx-move-left')     as HTMLElement;
const ctxMoveRight    = document.getElementById('ctx-move-right')    as HTMLElement;
const ctxRenameSheet  = document.getElementById('ctx-rename-sheet')  as HTMLElement;
const ctxDeleteSheet  = document.getElementById('ctx-delete-sheet')  as HTMLElement;

let contextMenuSheetName = '';

function hideContextMenu(): void {
  contextMenu.classList.remove('visible', 'ctx-mode-row', 'ctx-mode-sheet');
}

function showContextMenu(x: number, y: number, mode: 'ctx-mode-row' | 'ctx-mode-sheet'): void {
  contextMenu.classList.remove('visible', 'ctx-mode-row', 'ctx-mode-sheet');
  contextMenu.style.left = x + 'px';
  contextMenu.style.top  = y + 'px';
  contextMenu.classList.add('visible', mode);
  const rect = contextMenu.getBoundingClientRect();
  if (rect.bottom > window.innerHeight) {
    contextMenu.style.top = Math.max(0, y - rect.height) + 'px';
  }
  if (rect.right > window.innerWidth) {
    contextMenu.style.left = Math.max(0, x - rect.width) + 'px';
  }
}

document.addEventListener('click', hideContextMenu);
document.addEventListener('contextmenu', e => {
  hideContextMenu();
  const target = e.target as HTMLElement;
  if (target.closest('tr[data-row]') && S.selectedRows.size > 0) {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, 'ctx-mode-row');
  }
});

document.getElementById('btn-import-csv')?.addEventListener('click', () => {
  vscode.postMessage({ type: 'importCsv' });
});

document.getElementById('btn-export-csv')?.addEventListener('click', () => {
  vscode.postMessage({ type: 'exportCsv' });
});

document.getElementById('btn-open-settings')?.addEventListener('click', () => {
  vscode.postMessage({ type: 'openSettings' });
});

ctxCreateSheet.addEventListener('click', () => {
  hideContextMenu();
  const rows = [...S.selectedRows].sort((a, b) => a - b).map(ri => [...(S.rows[ri] ?? [])]);
  vscode.postMessage({ type: 'createSheet', columns: [...S.columns], rows });
});

ctxMoveLeft.addEventListener('click', () => {
  hideContextMenu();
  const idx = S.sheets.indexOf(contextMenuSheetName);
  if (idx <= 0) return;
  const next = [...S.sheets];
  next.splice(idx, 1);
  next.splice(idx - 1, 0, contextMenuSheetName);
  S.sheets = next;
  markDirty();
  renderSheetTabs();
  vscode.postMessage({ type: 'moveSheet', sheets: next });
});

ctxMoveRight.addEventListener('click', () => {
  hideContextMenu();
  const idx = S.sheets.indexOf(contextMenuSheetName);
  if (idx < 0 || idx >= S.sheets.length - 1) return;
  const next = [...S.sheets];
  next.splice(idx, 1);
  next.splice(idx + 1, 0, contextMenuSheetName);
  S.sheets = next;
  markDirty();
  renderSheetTabs();
  vscode.postMessage({ type: 'moveSheet', sheets: next });
});

ctxRenameSheet.addEventListener('click', () => {
  hideContextMenu();
  const tabs = Array.from(sheetTabsEl.querySelectorAll('.sheet-tab')) as HTMLElement[];
  const tab = tabs.find(t => t.dataset.sheet === contextMenuSheetName);
  if (tab) startSheetRename(tab, contextMenuSheetName);
});

ctxDeleteSheet.addEventListener('click', () => {
  hideContextMenu();
  if (S.sheets.length <= 1) {
    statusBar.textContent = S.labels.cannotDeleteLastSheet;
    return;
  }
  vscode.postMessage({
    type: 'deleteSheet',
    sheetName: contextMenuSheetName,
    currentData: { sheetName: S.activeSheet, columns: [...S.columns], rows: S.rows.map(r => [...r]) },
  });
});

// ── Keyboard navigation helpers ───────────────────────────────────────────────

function getCursor(): { dispIdx: number; ci: number } | null {
  const displayRows = getDisplayRows();
  if (S.selectedCells.size === 0) return null;
  if (S.selectedCells.size === 1 && S.anchorCell) {
    const dispIdx = displayRows.findIndex(r => r.ri === S.anchorCell!.ri);
    return dispIdx < 0 ? null : { dispIdx, ci: S.anchorCell.ci };
  }
  // Range: find corner opposite to anchor
  const anchor = S.anchorCell!;
  let minRi = Infinity, maxRi = -Infinity, minCi = Infinity, maxCi = -Infinity;
  for (const key of S.selectedCells) {
    const [r, c] = key.split(',').map(Number);
    minRi = Math.min(minRi, r); maxRi = Math.max(maxRi, r);
    minCi = Math.min(minCi, c); maxCi = Math.max(maxCi, c);
  }
  const curRi = anchor.ri === minRi ? maxRi : minRi;
  const curCi = anchor.ci === minCi ? maxCi : minCi;
  const dispIdx = displayRows.findIndex(r => r.ri === curRi);
  return dispIdx < 0 ? null : { dispIdx, ci: curCi };
}

function navigateTo(dispIdx: number, ci: number, extend: boolean): void {
  const displayRows = getDisplayRows();
  dispIdx = Math.max(0, Math.min(displayRows.length - 1, dispIdx));
  ci      = Math.max(0, Math.min(S.columns.length - 1, ci));
  const { ri } = displayRows[dispIdx];
  const targetPage = Math.floor(dispIdx / S.pageSize);
  if (targetPage !== S.page) {
    S.page = targetPage;
    renderBody();
    renderPagination();
  }
  selectCell(ri, ci, extend);
  const td = tableBody.querySelector<HTMLElement>(`td[data-row="${ri}"][data-col="${ci}"]`);
  td?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    commitActiveEdit();
    sendSaveData();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && !isEditing()) {
    e.preventDefault();
    undo();
  }
  if (!isEditing() && (
    ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
    ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z')
  )) {
    e.preventDefault();
    redo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'c' && S.selectedCells.size > 0 && !isEditing()) {
    e.preventDefault();
    copySelection();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'v' && S.selectedCells.size > 0 && !isEditing()) {
    e.preventDefault();
    pasteSelection();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'd' && S.selectedRow >= 0 && !isEditing()) {
    e.preventDefault();
    duplicateRow();
  }
  if (e.key === 'Delete' && S.selectedRow >= 0 && !isEditing()) {
    snapshot();
    S.rows[S.selectedRow] = new Array(S.columns.length).fill('');
    markDirty();
    renderBody();
  }
  if (e.key === 'Escape') {
    contextMenu.classList.remove('visible');
  }
  // Arrow / Home / End / PageUp / PageDown navigation
  const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
  if (!isEditing() && NAV_KEYS.includes(e.key) && !e.ctrlKey && !e.metaKey) {
    const displayRows = getDisplayRows();
    if (displayRows.length === 0 || S.columns.length === 0) return;
    e.preventDefault();
    const cur = getCursor() ?? { dispIdx: 0, ci: 0 };
    const { dispIdx, ci } = cur;
    const extend = e.shiftKey;
    if (e.key === 'ArrowUp')    navigateTo(dispIdx - 1, ci, extend);
    if (e.key === 'ArrowDown')  navigateTo(dispIdx + 1, ci, extend);
    if (e.key === 'ArrowLeft')  navigateTo(dispIdx, ci - 1, extend);
    if (e.key === 'ArrowRight') navigateTo(dispIdx, ci + 1, extend);
    if (e.key === 'Home')       navigateTo(dispIdx, 0, extend);
    if (e.key === 'End')        navigateTo(dispIdx, S.columns.length - 1, extend);
    if (e.key === 'PageUp')     navigateTo(dispIdx - S.pageSize, ci, extend);
    if (e.key === 'PageDown')   navigateTo(dispIdx + S.pageSize, ci, extend);
  }
  // Ctrl+Home / Ctrl+End: jump to first / last cell
  if (!isEditing() && (e.ctrlKey || e.metaKey) && (e.key === 'Home' || e.key === 'End')) {
    const displayRows = getDisplayRows();
    if (displayRows.length === 0 || S.columns.length === 0) return;
    e.preventDefault();
    const extend = e.shiftKey;
    if (e.key === 'Home') navigateTo(0, 0, extend);
    if (e.key === 'End')  navigateTo(displayRows.length - 1, S.columns.length - 1, extend);
  }
});

// ── Message handling ──────────────────────────────────────────────────────────

window.addEventListener('message', event => {
  const msg = event.data as { type: string; [key: string]: unknown };
  switch (msg.type) {
    case 'init':
      S.sheets            = msg.sheets as string[];
      S.activeSheet       = msg.activeSheet as string;
      S.columns           = msg.columns as string[];
      S.rows              = msg.rows as string[][];
      S.pageSize          = msg.pageSize as number;
      S.nullMarkers       = msg.nullMarkers as string[];
      S.emptyMarkers      = msg.emptyMarkers as string[];
      S.enableRowGrouping = (msg.enableRowGrouping as boolean) ?? true;
      S.allSheetColumns   = (msg.allSheetColumns as Record<string, string[]>) ?? {};
      if (msg.labels) S.labels = msg.labels as WebviewLabels;
      S.filterText        = '';
      filterInput.value   = '';
      S.page              = 0;
      S.dirty             = false;
      S.selectedRow       = -1;
      S.selectedCol       = -1;
      S.selectedCells     = new Set();
      S.anchorCell        = null;
      S.selectedRows      = new Set();
      S.anchorRow         = -1;
      S.fkHighlightRows   = new Set();
      S.pendingFkHighlight = null;
      S.expandedGroups    = new Set();
      S.groupFilter       = '';
      S.history       = [{ rows: (msg.rows as string[][]).map(r => [...r]), columns: [...(msg.columns as string[])] }];
      S.historyIndex  = 0;
      render();
      break;

    case 'sheetData':
      S.activeSheet       = msg.sheetName as string;
      S.columns           = msg.columns as string[];
      S.rows              = msg.rows as string[][];
      S.allSheetColumns   = (msg.allSheetColumns as Record<string, string[]>) ?? S.allSheetColumns;
      S.filterText        = '';
      filterInput.value   = '';
      S.page              = 0;
      S.selectedRow       = -1;
      S.selectedCol       = -1;
      S.selectedCells     = new Set();
      S.anchorCell        = null;
      S.selectedRows      = new Set();
      S.anchorRow         = -1;
      S.fkHighlightRows   = new Set();
      S.expandedGroups    = new Set();
      S.groupFilter       = '';
      S.history       = [{ rows: (msg.rows as string[][]).map(r => [...r]), columns: [...(msg.columns as string[])] }];
      S.historyIndex  = 0;
      renderSheetTabs();
      renderTable();
      renderPagination();
      updateStatus();
      applyFkHighlight();
      break;

    case 'sheetAdded':
      S.sheets = msg.sheets as string[];
      if (msg.allSheetColumns) S.allSheetColumns = msg.allSheetColumns as Record<string, string[]>;
      renderSheetTabs();
      break;

    case 'sheetRenamed': {
      const { oldName, newName, sheets, allSheetColumns } = msg as unknown as {
        oldName: string; newName: string;
        sheets: string[]; allSheetColumns: Record<string, string[]>;
      };
      S.sheets = sheets;
      if (S.activeSheet === oldName) S.activeSheet = newName;
      S.allSheetColumns = allSheetColumns;
      renderSheetTabs();
      updateStatus();
      break;
    }

    case 'sheetDeleted': {
      const { sheets, newActiveSheet, columns, rows, allSheetColumns } = msg as unknown as {
        deletedSheet: string; sheets: string[];
        newActiveSheet: string; columns: string[]; rows: string[][];
        allSheetColumns: Record<string, string[]>;
      };
      S.sheets          = sheets;
      S.activeSheet     = newActiveSheet;
      S.columns         = columns;
      S.rows            = rows;
      S.allSheetColumns = allSheetColumns;
      S.filterText      = '';
      filterInput.value = '';
      S.page            = 0;
      S.selectedRow     = -1;
      S.selectedCol     = -1;
      S.selectedCells   = new Set();
      S.anchorCell      = null;
      S.selectedRows    = new Set();
      S.anchorRow       = -1;
      S.fkHighlightRows   = new Set();
      S.expandedGroups    = new Set();
      S.groupFilter       = '';
      S.history         = [{ rows: rows.map(r => [...r]), columns: [...columns] }];
      S.historyIndex    = 0;
      render();
      break;
    }

    case 'requestSave':
      sendSaveData();
      break;

    case 'error':
      statusBar.textContent = '⚠ ' + (msg.message as string);
      break;
  }
});

// Boot
vscode.postMessage({ type: 'ready' });
