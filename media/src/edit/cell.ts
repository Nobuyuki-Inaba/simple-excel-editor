import { S, HISTORY_LIMIT, HistoryEntry, vscode, markDirty, tableBody } from '../state';
import { renderTable, renderBody, renderPagination, renderGroupFilter, setCellDisplay, updateStatus } from '../render';
import { selectCell } from '../selection';
import { primaryNullMarker, primaryEmptyMarker, colLabel } from '../data/utils';

let activeHeaderEdit: { input: HTMLInputElement; th: HTMLElement; ci: number; original: string } | null = null;
let activeEdit: { input: HTMLTextAreaElement; td: HTMLElement; ri: number; ci: number } | null = null;

export function isEditing(): boolean { return activeEdit !== null; }

export function snapshot(): void {
  S.history.splice(S.historyIndex + 1);
  S.history.push({ rows: S.rows.map(r => [...r]), columns: [...S.columns] });
  if (S.history.length > HISTORY_LIMIT) S.history.shift();
  S.historyIndex = S.history.length - 1;
}

function applyHistoryState(state: HistoryEntry): void {
  S.rows    = state.rows.map(r => [...r]);
  S.columns = [...state.columns];
  S.dirty   = S.historyIndex > 0;
  S.selectedCells = new Set();
  S.anchorCell    = null;
  renderTable();
  renderPagination();
  updateStatus();
  if (!S.dirty) vscode.postMessage({ type: 'revert' });
}

export function undo(): void {
  commitActiveEdit();
  if (S.historyIndex <= 0) return;
  S.historyIndex--;
  applyHistoryState(S.history[S.historyIndex]);
}

export function redo(): void {
  if (S.historyIndex >= S.history.length - 1) return;
  S.historyIndex++;
  applyHistoryState(S.history[S.historyIndex]);
}

// ── Header editing ───────────────────────────────────────────────────────────

export function startHeaderEdit(th: HTMLElement, ci: number): void {
  if (activeHeaderEdit) commitHeaderEdit();
  commitActiveEdit();

  const original = S.columns[ci] ?? '';
  th.classList.add('editing');
  th.innerHTML = '';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'header-input';
  input.value = original;
  th.appendChild(input);
  input.focus();
  input.select();

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      commitHeaderEdit();
    } else if (e.key === 'Escape') {
      cancelHeaderEdit();
    }
  });

  input.addEventListener('blur', () => {
    if (activeHeaderEdit && activeHeaderEdit.input === input) commitHeaderEdit();
  });

  activeHeaderEdit = { input, th, ci, original };
}

function commitHeaderEdit(): void {
  if (!activeHeaderEdit) return;
  const { input, th, ci, original } = activeHeaderEdit;
  const newName = input.value.trim();
  activeHeaderEdit = null;
  th.classList.remove('editing');

  if (!newName) {
    th.textContent = original || `(${colLabel(ci)})`;
    th.title = original;
    return;
  }

  snapshot();
  S.columns[ci] = newName;
  markDirty();
  renderTable();
}

function cancelHeaderEdit(): void {
  if (!activeHeaderEdit) return;
  const { th, ci, original } = activeHeaderEdit;
  activeHeaderEdit = null;
  th.classList.remove('editing');
  th.textContent = original || `(${colLabel(ci)})`;
  th.title = original;
}

// ── Cell editing ─────────────────────────────────────────────────────────────

export function startEdit(td: HTMLElement, ri: number, ci: number): void {
  if (activeEdit) {
    if (activeEdit.ri === ri && activeEdit.ci === ci) return;
    commitActiveEdit();
  }

  selectCell(ri, ci);

  const currentValue = S.rows[ri]?.[ci] ?? '';
  td.classList.add('editing');
  td.innerHTML = '';

  const input = document.createElement('textarea');
  input.className = 'cell-input';
  input.value = currentValue;
  input.rows = 1;
  td.appendChild(input);
  input.focus();
  input.select();

  autoResize(input);
  input.addEventListener('input', () => autoResize(input));

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitActiveEdit();
      moveFocus(ri + 1, ci);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitActiveEdit();
      if (e.shiftKey) moveFocus(ri, ci - 1); else moveFocus(ri, ci + 1);
    } else if (e.key === 'Escape') {
      cancelActiveEdit();
    } else if (e.key === 'n' && e.altKey) {
      e.preventDefault();
      input.value = primaryNullMarker();
      autoResize(input);
    } else if (e.key === 'e' && e.altKey) {
      e.preventDefault();
      input.value = primaryEmptyMarker();
      autoResize(input);
    }
  });

  input.addEventListener('blur', () => {
    if (activeEdit && activeEdit.input === input) commitActiveEdit();
  });

  activeEdit = { input, td, ri, ci };
}

function autoResize(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

export function commitActiveEdit(): void {
  if (!activeEdit) return;
  const { input, td, ri, ci } = activeEdit;
  const newValue = input.value;
  const oldValue = S.rows[ri]?.[ci] ?? '';
  activeEdit = null;

  td.classList.remove('editing');

  if (newValue === oldValue) {
    setCellDisplay(td, newValue, S.columns[ci] ?? '');
    return;
  }

  snapshot();
  while (S.rows.length <= ri) S.rows.push([]);
  while (S.rows[ri].length <= ci) S.rows[ri].push('');
  S.rows[ri][ci] = newValue;

  markDirty();
  renderGroupFilter();
  renderBody();
}

function cancelActiveEdit(): void {
  if (!activeEdit) return;
  const { td, ri, ci } = activeEdit;
  activeEdit = null;
  td.classList.remove('editing');
  setCellDisplay(td, S.rows[ri]?.[ci] ?? '', S.columns[ci] ?? '');
}

export function moveFocus(ri: number, ci: number): void {
  if (ri < 0 || ri >= S.rows.length) return;
  if (ci < 0 || ci >= S.columns.length) return;

  const targetPage = Math.floor(ri / S.pageSize);
  if (targetPage !== S.page) {
    S.page = targetPage;
    renderBody();
    renderPagination();
  }

  const td = tableBody.querySelector(`td[data-row="${ri}"][data-col="${ci}"]`);
  if (td) startEdit(td as HTMLElement, ri, ci);
}
