import { S, vscode, filterInput, statusBar, registerUpdateStatus, sendSaveData, markDirty } from './state';
import { render, renderSheetTabs, renderTable, renderBody, renderPagination,
         updateStatus, registerRenderHandlers } from './render';
import { selectCell, selectRow, selectColumn } from './selection';
import { startEdit, startHeaderEdit, commitActiveEdit, undo, redo,
         snapshot, isEditing } from './edit/cell';
import { copySelection, pasteSelection } from './edit/clipboard';
import { setupListeners, duplicateRow } from './data/operations';

// Break state→render circular dep: register updateStatus callback
registerUpdateStatus(updateStatus);

// Wire render callbacks to selection/edit implementations
registerRenderHandlers({
  onCellClick:    (ri, ci, shift, ctrl) => selectCell(ri, ci, shift, ctrl),
  onCellDblClick: (td, ri, ci) => startEdit(td, ri, ci),
  onRowClick:     ri => selectRow(ri),
  onColClick:     ci => selectColumn(ci),
  onColDblClick:  (th, ci) => startHeaderEdit(th, ci),
  onCommitEdit:   () => commitActiveEdit(),
});

// Button / filter event listeners
setupListeners();

// Keyboard shortcuts
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
});

// Message handling
window.addEventListener('message', event => {
  const msg = event.data as { type: string; [key: string]: unknown };
  switch (msg.type) {
    case 'init':
      S.sheets        = msg.sheets as string[];
      S.activeSheet   = msg.activeSheet as string;
      S.columns       = msg.columns as string[];
      S.rows          = msg.rows as string[][];
      S.pageSize      = msg.pageSize as number;
      S.nullMarkers   = msg.nullMarkers as string[];
      S.emptyMarkers  = msg.emptyMarkers as string[];
      S.filterText    = '';
      filterInput.value = '';
      S.page          = 0;
      S.dirty         = false;
      S.selectedRow   = -1;
      S.selectedCol   = -1;
      S.selectedCells = new Set();
      S.anchorCell    = null;
      S.history       = [{ rows: (msg.rows as string[][]).map(r => [...r]), columns: [...(msg.columns as string[])] }];
      S.historyIndex  = 0;
      render();
      break;

    case 'sheetData':
      S.activeSheet   = msg.sheetName as string;
      S.columns       = msg.columns as string[];
      S.rows          = msg.rows as string[][];
      S.filterText    = '';
      filterInput.value = '';
      S.page          = 0;
      S.selectedRow   = -1;
      S.selectedCol   = -1;
      S.selectedCells = new Set();
      S.anchorCell    = null;
      S.history       = [{ rows: (msg.rows as string[][]).map(r => [...r]), columns: [...(msg.columns as string[])] }];
      S.historyIndex  = 0;
      renderSheetTabs();
      renderTable();
      renderPagination();
      updateStatus();
      break;

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
