import { S, headerRow, tableBody, sheetTabsEl, pageInfo, rowCount, statusBar,
         btnFirst, btnPrev, btnNext, btnLast, requestSwitchSheet } from './state';

import { isNullValue, isEmptyValue, isDateColumn, isDateLike, isValidIsoDate,
         colLabel, calculateColumnStats, getDisplayRows } from './data/utils';

// ── Registered callbacks (breaks circular deps with edit/cell and selection) ──

type CellClickHandler = (ri: number, ci: number, shift: boolean, ctrl: boolean) => void;
type CellDblClickHandler = (td: HTMLElement, ri: number, ci: number) => void;
type RowClickHandler = (ri: number, shift: boolean, ctrl: boolean) => void;
type ColClickHandler = (ci: number) => void;
type ColDblClickHandler = (th: HTMLElement, ci: number) => void;
type CommitEditHandler = () => void;
type SheetRenameHandler = (oldName: string, newName: string) => void;
type SheetTabContextMenuHandler = (sheetName: string, x: number, y: number) => void;
type SheetMoveHandler = (newSheets: string[]) => void;

let onCellClick:            CellClickHandler           = () => {};
let onCellDblClick:         CellDblClickHandler        = () => {};
let onRowClick:             RowClickHandler            = () => {};
let onColClick:             ColClickHandler            = () => {};
let onColDblClick:          ColDblClickHandler         = () => {};
let onCommitEdit:           CommitEditHandler          = () => {};
let onSheetRename:          SheetRenameHandler         = () => {};
let onSheetTabContextMenu:  SheetTabContextMenuHandler = () => {};
let onSheetMove:            SheetMoveHandler           = () => {};

export function registerRenderHandlers(handlers: {
  onCellClick:           CellClickHandler;
  onCellDblClick:        CellDblClickHandler;
  onRowClick:            RowClickHandler;
  onColClick:            ColClickHandler;
  onColDblClick:         ColDblClickHandler;
  onCommitEdit:          CommitEditHandler;
  onSheetRename:         SheetRenameHandler;
  onSheetTabContextMenu: SheetTabContextMenuHandler;
  onSheetMove:           SheetMoveHandler;
}): void {
  onCellClick           = handlers.onCellClick;
  onCellDblClick        = handlers.onCellDblClick;
  onRowClick            = handlers.onRowClick;
  onColClick            = handlers.onColClick;
  onColDblClick         = handlers.onColDblClick;
  onCommitEdit          = handlers.onCommitEdit;
  onSheetRename         = handlers.onSheetRename;
  onSheetTabContextMenu = handlers.onSheetTabContextMenu;
  onSheetMove           = handlers.onSheetMove;
}

// ── Render ──────────────────────────────────────────────────────────────────

export function render(): void {
  renderSheetTabs();
  renderTable();
  renderPagination();
  updateStatus();
}

let dragSrcSheet = '';

export function renderSheetTabs(): void {
  sheetTabsEl.innerHTML = '';
  S.sheets.forEach(name => {
    const tab = document.createElement('div');
    tab.className = 'sheet-tab' + (name === S.activeSheet ? ' active' : '');
    tab.textContent = name;
    tab.title = name;
    tab.dataset.sheet = name;
    tab.draggable = true;

    tab.addEventListener('click', () => {
      if (name !== S.activeSheet) {
        onCommitEdit();
        requestSwitchSheet(name);
      }
    });
    tab.addEventListener('dblclick', e => {
      e.preventDefault();
      startSheetRename(tab, name);
    });
    tab.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      onSheetTabContextMenu(name, e.clientX, e.clientY);
    });

    tab.addEventListener('dragstart', e => {
      dragSrcSheet = name;
      tab.classList.add('dragging');
      e.dataTransfer!.effectAllowed = 'move';
    });
    tab.addEventListener('dragend', () => {
      tab.classList.remove('dragging');
      sheetTabsEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    tab.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      if (name !== dragSrcSheet) tab.classList.add('drag-over');
    });
    tab.addEventListener('dragleave', () => {
      tab.classList.remove('drag-over');
    });
    tab.addEventListener('drop', e => {
      e.preventDefault();
      tab.classList.remove('drag-over');
      if (!dragSrcSheet || dragSrcSheet === name) return;
      const next = [...S.sheets];
      const from = next.indexOf(dragSrcSheet);
      const to   = next.indexOf(name);
      if (from < 0 || to < 0) return;
      next.splice(from, 1);
      next.splice(to, 0, dragSrcSheet);
      onSheetMove(next);
    });

    sheetTabsEl.appendChild(tab);
  });
}

export function startSheetRename(tab: HTMLElement, currentName: string): void {
  if (tab.classList.contains('editing')) return;
  tab.classList.add('editing');
  tab.textContent = '';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'sheet-tab-input';
  input.value = currentName;
  input.addEventListener('click', e => e.stopPropagation());
  tab.appendChild(input);
  input.focus();
  input.select();

  let committed = false;

  const commit = () => {
    if (committed) return;
    committed = true;
    const newName = input.value.trim();
    tab.classList.remove('editing');
    tab.textContent = currentName;
    tab.title = currentName;
    if (!newName || newName === currentName || S.sheets.includes(newName)) return;
    onSheetRename(currentName, newName);
  };

  const cancel = () => {
    if (committed) return;
    committed = true;
    tab.classList.remove('editing');
    tab.textContent = currentName;
    tab.title = currentName;
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); input.value = currentName; cancel(); }
  });
}

export function renderTable(): void {
  renderHeader();
  renderBody();
}

export function renderHeader(): void {
  headerRow.innerHTML = '';

  const thNum = document.createElement('th');
  thNum.className = 'row-num-header';
  thNum.textContent = '#';
  headerRow.appendChild(thNum);

  S.columns.forEach((col, ci) => {
    const th = document.createElement('th');
    th.textContent = col || `(${colLabel(ci)})`;
    th.title = col;
    th.dataset.col = String(ci);
    if (ci === S.selectedCol) th.classList.add('selected-col-header');
    th.addEventListener('click', () => onColClick(ci));
    th.addEventListener('dblclick', () => onColDblClick(th, ci));
    headerRow.appendChild(th);
  });
}

export function renderBody(): void {
  tableBody.innerHTML = '';
  const displayRows = getDisplayRows();
  const offset = S.page * S.pageSize;
  const slice = displayRows.slice(offset, offset + S.pageSize);

  slice.forEach(({ data: rowData, ri }) => {
    const tr = document.createElement('tr');
    tr.dataset.row = String(ri);
    const rowHighlighted = S.selectedRows.size > 0 ? S.selectedRows.has(ri) : ri === S.selectedRow;
    if (rowHighlighted) tr.classList.add('selected-row');
    if (S.fkHighlightRows.has(ri)) tr.classList.add('fk-highlight-row');

    const tdNum = document.createElement('td');
    tdNum.className = 'row-num';
    tdNum.textContent = String(ri + 1);
    tdNum.addEventListener('click', e => onRowClick(ri, e.shiftKey, e.ctrlKey || e.metaKey));
    tr.appendChild(tdNum);

    S.columns.forEach((_, ci) => {
      const value = rowData[ci] ?? '';
      tr.appendChild(makeCell(ri, ci, value));
    });

    tableBody.appendChild(tr);
  });

  applyDuplicateHighlight(S.selectedCol);
}

export function makeCell(ri: number, ci: number, value: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.dataset.row = String(ri);
  td.dataset.col = String(ci);

  setCellDisplay(td, value, S.columns[ci] ?? '');

  const key = `${ri},${ci}`;
  if (S.selectedCells.size > 1 && S.selectedCells.has(key)) {
    td.classList.add('range-selected');
  } else if (S.selectedCells.size === 1 && S.selectedCells.has(key)) {
    td.classList.add('selected-cell');
  }

  td.addEventListener('click', e => onCellClick(ri, ci, e.shiftKey, e.ctrlKey || e.metaKey));
  td.addEventListener('dblclick', () => onCellDblClick(td, ri, ci));
  return td;
}

export function setCellDisplay(td: HTMLElement, value: string, colName = ''): void {
  td.innerHTML = '';
  td.classList.remove('null-cell', 'empty-cell', 'date-warning-cell');
  td.removeAttribute('title');

  if (isNullValue(value)) {
    td.classList.add('null-cell');
    const span = document.createElement('span');
    span.className = 'null-label';
    span.textContent = 'NULL';
    td.appendChild(span);
  } else if (isEmptyValue(value)) {
    td.classList.add('empty-cell');
    const span = document.createElement('span');
    span.className = 'empty-label';
    span.textContent = 'EMPTY';
    td.appendChild(span);
  } else {
    td.textContent = value;
    if (isDateColumn(colName) && isDateLike(value) && !isValidIsoDate(value)) {
      td.classList.add('date-warning-cell');
      td.title = '⚠ 推奨フォーマット: yyyy-MM-dd または yyyy-MM-dd HH:mm:ss';
    }
  }
}

export function renderPagination(): void {
  const displayRows = getDisplayRows();
  const total = Math.max(1, Math.ceil(displayRows.length / S.pageSize));
  pageInfo.textContent = `${S.page + 1} / ${total}`;
  rowCount.textContent = S.filterText
    ? `${displayRows.length} 件一致 / ${S.rows.length} 行`
    : `${S.rows.length} 行`;
  btnFirst.disabled = S.page === 0;
  btnPrev.disabled  = S.page === 0;
  btnNext.disabled  = S.page >= total - 1;
  btnLast.disabled  = S.page >= total - 1;
}

export function updateStatus(): void {
  const dirty = S.dirty ? ' ●' : '';
  if (S.selectedRows.size > 1) {
    statusBar.textContent = `${S.selectedRows.size}行 選択中` + dirty;
  } else if (S.selectedCells.size > 1) {
    const coords = [...S.selectedCells].map(k => k.split(',').map(Number));
    const rowSet = new Set(coords.map(([r]) => r));
    const colSet = new Set(coords.map(([, c]) => c));
    statusBar.textContent = `${rowSet.size}行 × ${colSet.size}列 選択中` + dirty;
  } else if (S.selectedCol >= 0) {
    const stats = calculateColumnStats(S.selectedCol);
    const colName = S.columns[S.selectedCol] || colLabel(S.selectedCol);
    let text = `${colName}: ${stats.total}行 | NULL: ${stats.nullCount}件 | ユニーク: ${stats.uniqueCount}件`;
    if (stats.emptyCount > 0) text += ` | 空: ${stats.emptyCount}件`;
    if (stats.dupCount > 0)   text += ` | 重複: ${stats.dupCount}件`;
    statusBar.textContent = text + dirty;
  } else {
    statusBar.textContent = S.activeSheet + dirty;
  }
}

export function applyDuplicateHighlight(ci: number): void {
  document.querySelectorAll('td.duplicate-cell').forEach(el => el.classList.remove('duplicate-cell'));
  if (ci < 0) return;
  const { dupValues } = calculateColumnStats(ci);
  if (dupValues.size === 0) return;
  tableBody.querySelectorAll(`td[data-col="${ci}"]`).forEach(td => {
    const ri = Number((td as HTMLElement).dataset.row);
    const value = S.rows[ri]?.[ci] ?? '';
    if (dupValues.has(value)) td.classList.add('duplicate-cell');
  });
}
