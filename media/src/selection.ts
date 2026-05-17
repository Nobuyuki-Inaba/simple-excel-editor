import { S, headerRow, tableBody } from './state';
import { applyDuplicateHighlight, updateStatus } from './render';

export function buildRangeSet(r1: number, c1: number, r2: number, c2: number): Set<string> {
  const cells = new Set<string>();
  const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
  const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      cells.add(`${r},${c}`);
    }
  }
  return cells;
}

export function selectCell(ri: number, ci: number, shiftKey = false, ctrlKey = false): void {
  S.selectedRows = new Set();
  S.anchorRow = -1;
  if (shiftKey && S.anchorCell !== null) {
    S.selectedCells = buildRangeSet(S.anchorCell.ri, S.anchorCell.ci, ri, ci);
    S.selectedRow = ri;
    S.selectedCol = -1;
  } else if (ctrlKey) {
    const key = `${ri},${ci}`;
    if (S.selectedCells.has(key)) {
      S.selectedCells.delete(key);
    } else {
      S.selectedCells.add(key);
    }
    S.anchorCell = { ri, ci };
    S.selectedRow = ri;
    S.selectedCol = -1;
  } else {
    S.selectedCells = new Set([`${ri},${ci}`]);
    S.anchorCell = { ri, ci };
    S.selectedRow = ri;
    S.selectedCol = ci;
  }
  refreshSelection();
  applyDuplicateHighlight(S.selectedCol);
  updateStatus();
}

export function selectRow(ri: number, shift = false, ctrl = false): void {
  if (shift && S.anchorRow >= 0) {
    const min = Math.min(S.anchorRow, ri);
    const max = Math.max(S.anchorRow, ri);
    S.selectedRows = new Set();
    for (let r = min; r <= max; r++) S.selectedRows.add(r);
  } else if (ctrl) {
    if (S.selectedRows.has(ri)) S.selectedRows.delete(ri);
    else S.selectedRows.add(ri);
    S.anchorRow = ri;
  } else {
    S.selectedRows = new Set([ri]);
    S.anchorRow = ri;
  }
  S.selectedRow = ri;
  S.selectedCol = -1;
  S.selectedCells = new Set();
  S.anchorCell = null;
  refreshSelection();
  applyDuplicateHighlight(-1);
  updateStatus();
}

export function selectColumn(ci: number): void {
  S.selectedCol = ci;
  S.selectedRow = -1;
  S.selectedRows = new Set();
  S.anchorRow = -1;
  S.selectedCells = new Set();
  S.anchorCell = null;
  document.querySelectorAll('th.selected-col-header').forEach(
    el => el.classList.remove('selected-col-header')
  );
  const th = headerRow.querySelector(`th[data-col="${ci}"]`);
  if (th) th.classList.add('selected-col-header');
  applyDuplicateHighlight(ci);
  updateStatus();
}

export function refreshSelection(): void {
  document.querySelectorAll('tr.selected-row').forEach(el => el.classList.remove('selected-row'));
  document.querySelectorAll('td.selected-cell').forEach(el => el.classList.remove('selected-cell'));
  document.querySelectorAll('td.range-selected').forEach(el => el.classList.remove('range-selected'));
  document.querySelectorAll('th.selected-col-header').forEach(
    el => el.classList.remove('selected-col-header')
  );

  if (S.selectedRows.size > 0) {
    S.selectedRows.forEach(ri => {
      const tr = tableBody.querySelector(`tr[data-row="${ri}"]`);
      if (tr) tr.classList.add('selected-row');
    });
  } else {
    const tr = tableBody.querySelector(`tr[data-row="${S.selectedRow}"]`);
    if (tr) tr.classList.add('selected-row');
  }

  if (S.selectedCells.size > 1) {
    S.selectedCells.forEach(key => {
      const [r, c] = key.split(',');
      const td = tableBody.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
      if (td) td.classList.add('range-selected');
    });
  } else if (S.selectedRow >= 0 && S.selectedCol >= 0) {
    const td = tableBody.querySelector(
      `td[data-row="${S.selectedRow}"][data-col="${S.selectedCol}"]`
    );
    if (td) td.classList.add('selected-cell');
  }
}
