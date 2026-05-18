import { S, markDirty, filterInput, btnFirst, btnPrev, btnNext, btnLast,
         btnAddRow, btnDelRow, btnDupRow, btnAddCol, btnDelCol, btnFilterClear } from '../state';
import { renderBody, renderTable, renderPagination, renderGroupFilter } from '../render';
import { totalPages, groupColIndex, groupKeyOf } from './utils';
import { snapshot, commitActiveEdit } from '../edit/cell';

export function addRow(): void {
  commitActiveEdit();
  snapshot();
  const insertAt = S.selectedRow >= 0 ? S.selectedRow + 1 : S.rows.length;
  const newRow = new Array(S.columns.length).fill('');
  // Inherit group value from selected row
  if (S.selectedRow >= 0) {
    const ci = groupColIndex();
    if (ci >= 0) {
      const key = groupKeyOf(S.rows[S.selectedRow]);
      if (key) newRow[ci] = key;
    }
  }
  S.rows.splice(insertAt, 0, newRow);
  S.selectedRow = insertAt;
  markDirty();
  renderGroupFilter();
  renderBody();
  renderPagination();
}

export function deleteRow(): void {
  commitActiveEdit();

  let rowsToDelete: number[];
  if (S.selectedRows.size > 0) {
    rowsToDelete = [...S.selectedRows].sort((a, b) => b - a);
  } else if (S.selectedCells.size > 0) {
    const coords = [...S.selectedCells].map(k => k.split(',').map(Number));
    rowsToDelete = [...new Set(coords.map(([r]) => r))].sort((a, b) => b - a);
  } else if (S.selectedRow >= 0) {
    rowsToDelete = [S.selectedRow];
  } else {
    return;
  }

  if (rowsToDelete.some(r => r < 0 || r >= S.rows.length)) return;

  snapshot();
  for (const ri of rowsToDelete) {
    S.rows.splice(ri, 1);
  }

  const minRow = Math.min(...rowsToDelete);
  S.selectedRow = S.rows.length === 0 ? -1 : Math.min(minRow, S.rows.length - 1);
  S.selectedRows = new Set();
  S.anchorRow = -1;
  S.selectedCells = new Set();
  S.anchorCell = null;

  markDirty();
  renderBody();
  renderPagination();
}

export function duplicateRow(): void {
  if (S.selectedRow < 0 || S.selectedRow >= S.rows.length) return;
  commitActiveEdit();
  snapshot();
  const copy = S.rows[S.selectedRow].slice();
  const insertAt = S.selectedRow + 1;
  S.rows.splice(insertAt, 0, copy);
  S.selectedRow = insertAt;
  const targetPage = Math.floor(insertAt / S.pageSize);
  if (targetPage !== S.page) S.page = targetPage;
  markDirty();
  renderBody();
  renderPagination();
}

export function addColumn(): void {
  commitActiveEdit();
  snapshot();
  const insertAt = S.selectedCol >= 0 ? S.selectedCol + 1 : S.columns.length;
  let name = 'NewColumn';
  let n = 1;
  while (S.columns.includes(name)) name = 'NewColumn' + n++;
  S.columns.splice(insertAt, 0, name);
  S.rows.forEach(row => row.splice(insertAt, 0, ''));
  S.selectedCol = insertAt;
  markDirty();
  renderTable();
}

export function deleteColumn(): void {
  commitActiveEdit();
  if (S.selectedCol < 0 || S.selectedCol >= S.columns.length) return;
  snapshot();
  S.columns.splice(S.selectedCol, 1);
  S.rows.forEach(row => row.splice(S.selectedCol, 1));
  S.selectedCol = Math.min(S.selectedCol, S.columns.length - 1);
  markDirty();
  renderTable();
}

export function goToPage(p: number): void {
  const max = totalPages() - 1;
  if (p < 0 || p > max) return;
  commitActiveEdit();
  S.page = p;
  renderBody();
  renderPagination();
}

export function setupListeners(): void {
  btnAddRow.addEventListener('click', addRow);
  btnDelRow.addEventListener('click', deleteRow);
  btnDupRow.addEventListener('click', duplicateRow);
  btnAddCol.addEventListener('click', addColumn);
  btnDelCol.addEventListener('click', deleteColumn);

  btnFirst.addEventListener('click', () => goToPage(0));
  btnPrev.addEventListener('click',  () => goToPage(S.page - 1));
  btnNext.addEventListener('click',  () => goToPage(S.page + 1));
  btnLast.addEventListener('click',  () => goToPage(totalPages() - 1));

  filterInput.addEventListener('input', () => {
    S.filterText = filterInput.value;
    S.page = 0;
    S.selectedRow = -1;
    S.selectedCol = -1;
    renderBody();
    renderPagination();
  });

  btnFilterClear.addEventListener('click', () => {
    filterInput.value = '';
    S.filterText = '';
    S.page = 0;
    S.selectedRow = -1;
    S.selectedCol = -1;
    renderBody();
    renderPagination();
    filterInput.focus();
  });

  document.getElementById('group-filter')?.addEventListener('change', e => {
    S.groupFilter = (e.target as HTMLSelectElement).value;
    S.page = 0;
    S.selectedRow = -1;
    renderBody();
    renderPagination();
  });
}
