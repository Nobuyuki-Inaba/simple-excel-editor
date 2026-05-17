import { S, markDirty, filterInput, btnFirst, btnPrev, btnNext, btnLast,
         btnAddRow, btnDelRow, btnDupRow, btnAddCol, btnDelCol, btnFilterClear } from '../state';
import { renderBody, renderTable, renderPagination } from '../render';
import { totalPages } from './utils';
import { snapshot, commitActiveEdit } from '../edit/cell';

export function addRow(): void {
  commitActiveEdit();
  snapshot();
  const insertAt = S.selectedRow >= 0 ? S.selectedRow + 1 : S.rows.length;
  S.rows.splice(insertAt, 0, new Array(S.columns.length).fill(''));
  S.selectedRow = insertAt;
  markDirty();
  renderBody();
  renderPagination();
}

export function deleteRow(): void {
  commitActiveEdit();
  if (S.selectedRow < 0 || S.selectedRow >= S.rows.length) return;
  snapshot();
  S.rows.splice(S.selectedRow, 1);
  S.selectedRow = Math.min(S.selectedRow, S.rows.length - 1);
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
}
