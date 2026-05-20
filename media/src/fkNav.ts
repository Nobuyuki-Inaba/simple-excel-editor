import { S, fmt, statusBar, tableBody, requestSwitchSheet } from './state';
import { renderBody, renderPagination } from './render';

const fkNavArea   = document.getElementById('fk-nav-area')      as HTMLElement;
const fkSingleBtn = document.getElementById('btn-fk-single')    as HTMLButtonElement;
const fkSelect    = document.getElementById('fk-sheet-select')  as HTMLSelectElement;
const fkGoBtn     = document.getElementById('btn-fk-go')        as HTMLButtonElement;

/** Show/hide FK reference buttons based on the currently selected cell. */
export function updateFkButtons(ci: number, ri: number): void {
  if (ci < 0 || ri < 0) { fkNavArea.hidden = true; return; }

  const colName = S.columns[ci];
  const value   = S.rows[ri]?.[ci];
  if (!colName || value === undefined) { fkNavArea.hidden = true; return; }

  const targets = S.sheets.filter(
    s => s !== S.activeSheet && S.allSheetColumns[s]?.includes(colName)
  );

  if (targets.length === 0) { fkNavArea.hidden = true; return; }

  fkNavArea.hidden = false;

  if (targets.length === 1) {
    fkSingleBtn.hidden = false;
    fkSingleBtn.textContent = fmt(S.labels.fkNavigateTpl, targets[0]);
    fkSingleBtn.onclick = () => navigateToFk(targets[0], colName, value);
    fkSelect.hidden = true;
    fkGoBtn.hidden  = true;
  } else {
    fkSingleBtn.hidden = true;
    fkSelect.innerHTML = '';
    targets.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      fkSelect.appendChild(opt);
    });
    fkSelect.hidden = false;
    fkGoBtn.hidden  = false;
    fkGoBtn.onclick = () => navigateToFk(fkSelect.value, colName, value);
  }
}

function navigateToFk(targetSheet: string, columnName: string, value: string): void {
  S.pendingFkHighlight = { columnName, value };
  S.fkHighlightRows    = new Set();
  fkNavArea.hidden     = true;
  requestSwitchSheet(targetSheet);
}

/** Highlight rows matching pendingFkHighlight after sheetData arrives. */
export function applyFkHighlight(): void {
  const hint = S.pendingFkHighlight;
  if (!hint) return;
  S.pendingFkHighlight = null;

  const ci = S.columns.indexOf(hint.columnName);
  if (ci < 0) {
    statusBar.textContent = S.labels.fkColumnNotFound;
    return;
  }

  const matchRows: number[] = [];
  S.rows.forEach((row, ri) => {
    if ((row[ci] ?? '') === hint.value) matchRows.push(ri);
  });

  if (matchRows.length === 0) {
    S.fkHighlightRows = new Set();
    statusBar.textContent = S.labels.fkNoMatch;
    return;
  }

  S.fkHighlightRows = new Set(matchRows);
  S.page = Math.floor(matchRows[0] / S.pageSize);
  renderBody();
  renderPagination();

  requestAnimationFrame(() => {
    const tr = tableBody.querySelector(`tr[data-row="${matchRows[0]}"]`);
    tr?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

/** Clear FK highlight when the user makes a new selection. */
export function clearFkHighlight(): void {
  if (S.fkHighlightRows.size === 0) return;
  S.fkHighlightRows = new Set();
  renderBody();
}
