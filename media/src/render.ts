import { S, headerRow, tableBody, sheetTabsEl, pageInfo, rowCount, statusBar,
         btnFirst, btnPrev, btnNext, btnLast, requestSwitchSheet } from './state';
import { isNullValue, isEmptyValue, isDateColumn, isDateLike, isValidIsoDate,
         colLabel, calculateColumnStats, getDisplayRows, totalPages } from './data/utils';

// ── Registered callbacks (breaks circular deps with edit/cell and selection) ──

type CellClickHandler = (ri: number, ci: number, shift: boolean, ctrl: boolean) => void;
type CellDblClickHandler = (td: HTMLElement, ri: number, ci: number) => void;
type RowClickHandler = (ri: number) => void;
type ColClickHandler = (ci: number) => void;
type ColDblClickHandler = (th: HTMLElement, ci: number) => void;
type CommitEditHandler = () => void;

let onCellClick:     CellClickHandler    = () => {};
let onCellDblClick:  CellDblClickHandler = () => {};
let onRowClick:      RowClickHandler     = () => {};
let onColClick:      ColClickHandler     = () => {};
let onColDblClick:   ColDblClickHandler  = () => {};
let onCommitEdit:    CommitEditHandler   = () => {};

export function registerRenderHandlers(handlers: {
  onCellClick:    CellClickHandler;
  onCellDblClick: CellDblClickHandler;
  onRowClick:     RowClickHandler;
  onColClick:     ColClickHandler;
  onColDblClick:  ColDblClickHandler;
  onCommitEdit:   CommitEditHandler;
}): void {
  onCellClick    = handlers.onCellClick;
  onCellDblClick = handlers.onCellDblClick;
  onRowClick     = handlers.onRowClick;
  onColClick     = handlers.onColClick;
  onColDblClick  = handlers.onColDblClick;
  onCommitEdit   = handlers.onCommitEdit;
}

// ── Render ──────────────────────────────────────────────────────────────────

export function render(): void {
  renderSheetTabs();
  renderTable();
  renderPagination();
  updateStatus();
}

export function renderSheetTabs(): void {
  sheetTabsEl.innerHTML = '';
  S.sheets.forEach(name => {
    const tab = document.createElement('div');
    tab.className = 'sheet-tab' + (name === S.activeSheet ? ' active' : '');
    tab.textContent = name;
    tab.title = name;
    tab.addEventListener('click', () => {
      if (name !== S.activeSheet) {
        onCommitEdit();
        requestSwitchSheet(name);
      }
    });
    sheetTabsEl.appendChild(tab);
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
    if (ri === S.selectedRow) tr.classList.add('selected-row');

    const tdNum = document.createElement('td');
    tdNum.className = 'row-num';
    tdNum.textContent = String(ri + 1);
    tdNum.addEventListener('click', () => onRowClick(ri));
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
  if (S.selectedCells.size > 1) {
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
