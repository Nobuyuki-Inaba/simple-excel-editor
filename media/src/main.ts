import { S, vscode, filterInput, statusBar, sheetTabsEl, registerUpdateStatus, sendSaveData, markDirty } from './state';
import { render, renderSheetTabs, renderTable, renderBody, renderPagination,
         updateStatus, registerRenderHandlers, startSheetRename } from './render';
import { selectCell, selectRow, selectColumn } from './selection';
import { startEdit, startHeaderEdit, commitActiveEdit, undo, redo,
         snapshot, isEditing } from './edit/cell';
import { copySelection, pasteSelection } from './edit/clipboard';
import { setupListeners, duplicateRow } from './data/operations';
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
});

// Button / filter event listeners
setupListeners();

// ── Context menu ─────────────────────────────────────────────────────────────

const contextMenu     = document.getElementById('context-menu')      as HTMLElement;
const ctxCreateSheet  = document.getElementById('ctx-create-sheet')  as HTMLElement;
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

ctxCreateSheet.addEventListener('click', () => {
  hideContextMenu();
  const rows = [...S.selectedRows].sort((a, b) => a - b).map(ri => [...(S.rows[ri] ?? [])]);
  vscode.postMessage({ type: 'createSheet', columns: [...S.columns], rows });
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
    statusBar.textContent = '最後のシートは削除できません';
    return;
  }
  vscode.postMessage({
    type: 'deleteSheet',
    sheetName: contextMenuSheetName,
    currentData: { sheetName: S.activeSheet, columns: [...S.columns], rows: S.rows.map(r => [...r]) },
  });
});

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
      S.allSheetColumns   = (msg.allSheetColumns as Record<string, string[]>) ?? {};
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
      S.fkHighlightRows = new Set();
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
