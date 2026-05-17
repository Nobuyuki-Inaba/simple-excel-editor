/* global acquireVsCodeApi */
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // ── State ──────────────────────────────────────────────────────────────────

  const S = {
    sheets: /** @type {string[]} */ ([]),
    activeSheet: '',
    columns: /** @type {string[]} */ ([]),
    rows: /** @type {string[][]} */ ([]),   // all data rows for current sheet
    pageSize: 200,
    page: 0,                               // 0-based current page
    nullMarkers: /** @type {string[]} */ (['[null]']),
    emptyMarkers: /** @type {string[]} */ (['[empty]']),
    filterText: '',
    selectedRow: -1,
    selectedCol: -1,
    dirty: false,
  };

  // ── DOM refs ───────────────────────────────────────────────────────────────

  const $ = id => document.getElementById(id);

  const headerRow    = $('header-row');
  const tableBody    = $('table-body');
  const sheetTabsEl  = $('sheet-tabs');
  const pageInfo     = $('page-info');
  const rowCount     = $('row-count');
  const statusBar    = $('status-bar');
  const btnFirst     = $('btn-first');
  const btnPrev      = $('btn-prev');
  const btnNext      = $('btn-next');
  const btnLast      = $('btn-last');
  const filterInput    = $('filter-input');
  const btnFilterClear = $('btn-filter-clear');
  const btnAddRow    = $('btn-add-row');
  const btnDelRow    = $('btn-delete-row');
  const btnDupRow    = $('btn-dup-row');
  const btnAddCol    = $('btn-add-col');
  const btnDelCol    = $('btn-delete-col');

  // ── Message handling ───────────────────────────────────────────────────────

  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
      case 'init':
        S.sheets        = msg.sheets;
        S.activeSheet   = msg.activeSheet;
        S.columns       = msg.columns;
        S.rows          = msg.rows;
        S.pageSize      = msg.pageSize;
        S.nullMarkers   = msg.nullMarkers;
        S.emptyMarkers  = msg.emptyMarkers;
        S.filterText    = '';
        filterInput.value = '';
        S.page          = 0;
        S.dirty       = false;
        S.selectedRow = -1;
        S.selectedCol = -1;
        render();
        break;

      case 'sheetData':
        S.activeSheet = msg.sheetName;
        S.columns     = msg.columns;
        S.rows        = msg.rows;
        S.filterText  = '';
        filterInput.value = '';
        S.page        = 0;
        S.selectedRow = -1;
        S.selectedCol = -1;
        renderSheetTabs();
        renderTable();
        renderPagination();
        updateStatus();
        break;

      case 'requestSave':
        sendSaveData();
        break;

      case 'error':
        statusBar.textContent = '⚠ ' + msg.message;
        break;
    }
  });

  // ── Outbound messages ──────────────────────────────────────────────────────

  function markDirty() {
    if (!S.dirty) {
      S.dirty = true;
      vscode.postMessage({ type: 'edit' });
    }
    updateStatus();
  }

  function sendSaveData() {
    vscode.postMessage({
      type: 'saveData',
      sheetName: S.activeSheet,
      columns: S.columns,
      rows: S.rows,
    });
  }

  function requestSwitchSheet(name) {
    vscode.postMessage({
      type: 'switchSheet',
      sheetName: name,
      // Send the current sheet's data so the extension can cache edits
      currentData: {
        sheetName: S.activeSheet,
        columns: S.columns,
        rows: S.rows,
      },
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    renderSheetTabs();
    renderTable();
    renderPagination();
    updateStatus();
  }

  function renderSheetTabs() {
    sheetTabsEl.innerHTML = '';
    S.sheets.forEach(name => {
      const tab = document.createElement('div');
      tab.className = 'sheet-tab' + (name === S.activeSheet ? ' active' : '');
      tab.textContent = name;
      tab.title = name;
      tab.addEventListener('click', () => {
        if (name !== S.activeSheet) {
          commitActiveEdit();
          requestSwitchSheet(name);
        }
      });
      sheetTabsEl.appendChild(tab);
    });
  }

  function renderTable() {
    renderHeader();
    renderBody();
  }

  function renderHeader() {
    headerRow.innerHTML = '';

    // Row-number column
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
      th.addEventListener('click', () => selectColumn(ci));
      th.addEventListener('dblclick', () => startHeaderEdit(th, ci));
      headerRow.appendChild(th);
    });
  }

  function renderBody() {
    tableBody.innerHTML = '';
    const displayRows = getDisplayRows();
    const offset = S.page * S.pageSize;
    const slice = displayRows.slice(offset, offset + S.pageSize);

    slice.forEach(({ data: rowData, ri }) => {
      const tr = document.createElement('tr');
      tr.dataset.row = String(ri);
      if (ri === S.selectedRow) tr.classList.add('selected-row');

      // Row number (shows original index in S.rows)
      const tdNum = document.createElement('td');
      tdNum.className = 'row-num';
      tdNum.textContent = String(ri + 1);
      tdNum.addEventListener('click', () => selectRow(ri));
      tr.appendChild(tdNum);

      // Data cells
      S.columns.forEach((_, ci) => {
        const value = rowData[ci] ?? '';
        const td = makeCell(ri, ci, value);
        tr.appendChild(td);
      });

      tableBody.appendChild(tr);
    });
  }

  function makeCell(ri, ci, value) {
    const td = document.createElement('td');
    td.dataset.row = String(ri);
    td.dataset.col = String(ci);

    setCellDisplay(td, value, S.columns[ci] ?? '');

    td.addEventListener('click', () => selectCell(ri, ci));
    td.addEventListener('dblclick', () => startEdit(td, ri, ci));
    return td;
  }

  function setCellDisplay(td, value, colName = '') {
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

  function renderPagination() {
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

  function calculateColumnStats(ci) {
    const values = S.rows.map(row => row[ci] ?? '');
    const total = values.length;
    const nullCount = values.filter(v => isNullValue(v)).length;
    const emptyCount = values.filter(v => !isNullValue(v) && (v === '' || isEmptyValue(v))).length;
    const uniqueValues = new Set(values.filter(v => !isNullValue(v)));
    return { total, nullCount, emptyCount, uniqueCount: uniqueValues.size };
  }

  function updateStatus() {
    const dirty = S.dirty ? ' ●' : '';
    if (S.selectedCol >= 0) {
      const stats = calculateColumnStats(S.selectedCol);
      const colName = S.columns[S.selectedCol] || colLabel(S.selectedCol);
      let text = `${colName}: ${stats.total}行 | NULL: ${stats.nullCount}件 | ユニーク: ${stats.uniqueCount}件`;
      if (stats.emptyCount > 0) text += ` | 空: ${stats.emptyCount}件`;
      statusBar.textContent = text + dirty;
    } else {
      statusBar.textContent = S.activeSheet + dirty;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getDisplayRows() {
    if (!S.filterText) {
      return S.rows.map((data, ri) => ({ data, ri }));
    }
    const query = S.filterText.toLowerCase();
    const result = [];
    for (let ri = 0; ri < S.rows.length; ri++) {
      if (S.rows[ri].some(cell => (cell ?? '').toLowerCase().includes(query))) {
        result.push({ data: S.rows[ri], ri });
      }
    }
    return result;
  }

  function totalPages() {
    return Math.max(1, Math.ceil(getDisplayRows().length / S.pageSize));
  }

  function isNullValue(v) {
    return S.nullMarkers.includes(v);
  }

  function isEmptyValue(v) {
    return S.emptyMarkers.includes(v);
  }

  // Column name patterns that suggest a date column (case-insensitive)
  function isDateColumn(colName) {
    const lower = colName.toLowerCase();
    return lower.includes('date') ||
           lower.includes('day')  ||
           lower.includes('_on')  ||
           lower.includes('_at');
  }

  function isDateLike(v) {
    if (!v || isNullValue(v) || isEmptyValue(v)) return false;
    if (/^\d+$/.test(v)) return false; // 純粋な整数（IDなど）は除外
    // yyyy/MM/dd, yyyy.MM.dd, yyyy-M-d など年始まりのパターン
    if (/\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2}/.test(v)) return true;
    // dd/MM/yyyy, MM/dd/yyyy など年終わりのパターン
    if (/\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4}/.test(v)) return true;
    // YYYYMMDD（19xx/20xx 始まりの8桁）
    if (/^(19|20)\d{6}$/.test(v)) return true;
    return false;
  }

  function isValidIsoDate(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ||
           /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v);
  }

  function primaryNullMarker() {
    return S.nullMarkers[0] ?? '[null]';
  }

  function primaryEmptyMarker() {
    return S.emptyMarkers[0] ?? '[empty]';
  }

  function colLabel(i) {
    let name = '';
    let n = i;
    do {
      name = String.fromCharCode(65 + (n % 26)) + name;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return name;
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  function selectCell(ri, ci) {
    S.selectedRow = ri;
    S.selectedCol = ci;
    refreshSelection();
    updateStatus();
  }

  function selectRow(ri) {
    S.selectedRow = ri;
    S.selectedCol = -1;
    refreshSelection();
    updateStatus();
  }

  function selectColumn(ci) {
    S.selectedCol = ci;
    S.selectedRow = -1;
    // Highlight column header
    document.querySelectorAll('th.selected-col-header').forEach(
      el => el.classList.remove('selected-col-header')
    );
    const th = headerRow.querySelector(`th[data-col="${ci}"]`);
    if (th) th.classList.add('selected-col-header');
    updateStatus();
  }

  function refreshSelection() {
    document.querySelectorAll('tr.selected-row').forEach(el => el.classList.remove('selected-row'));
    document.querySelectorAll('td.selected-cell').forEach(el => el.classList.remove('selected-cell'));
    document.querySelectorAll('th.selected-col-header').forEach(
      el => el.classList.remove('selected-col-header')
    );

    const tr = tableBody.querySelector(`tr[data-row="${S.selectedRow}"]`);
    if (tr) tr.classList.add('selected-row');

    if (S.selectedRow >= 0 && S.selectedCol >= 0) {
      const td = tableBody.querySelector(
        `td[data-row="${S.selectedRow}"][data-col="${S.selectedCol}"]`
      );
      if (td) td.classList.add('selected-cell');
    }
  }

  // ── Header editing ─────────────────────────────────────────────────────────

  let activeHeaderEdit = /** @type {{ input: HTMLInputElement, th: HTMLElement, ci: number, original: string }|null} */ (null);

  function startHeaderEdit(th, ci) {
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
      if (activeHeaderEdit && activeHeaderEdit.input === input) {
        commitHeaderEdit();
      }
    });

    activeHeaderEdit = { input, th, ci, original };
  }

  function commitHeaderEdit() {
    if (!activeHeaderEdit) return;
    const { input, th, ci, original } = activeHeaderEdit;
    const newName = input.value.trim();
    activeHeaderEdit = null;
    th.classList.remove('editing');

    if (!newName) {
      // 空文字は無効 — 元の名前に戻す
      th.textContent = original || `(${colLabel(ci)})`;
      th.title = original;
      return;
    }

    S.columns[ci] = newName;
    markDirty();
    // カラム名変更で日付バリデーション対象が変わるため本体も再描画
    renderTable();
  }

  function cancelHeaderEdit() {
    if (!activeHeaderEdit) return;
    const { th, ci, original } = activeHeaderEdit;
    activeHeaderEdit = null;
    th.classList.remove('editing');
    th.textContent = original || `(${colLabel(ci)})`;
    th.title = original;
  }

  // ── Cell editing ───────────────────────────────────────────────────────────

  let activeEdit = /** @type {{ input: HTMLTextAreaElement, td: HTMLElement, ri: number, ci: number }|null} */ (null);

  function startEdit(td, ri, ci) {
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

    // Commit on blur (e.g. clicking another cell)
    input.addEventListener('blur', () => {
      if (activeEdit && activeEdit.input === input) {
        commitActiveEdit();
      }
    });

    activeEdit = { input, td, ri, ci };
  }

  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  function commitActiveEdit() {
    if (!activeEdit) return;
    const { input, td, ri, ci } = activeEdit;
    const newValue = input.value;
    activeEdit = null;

    // Update state
    while (S.rows.length <= ri) S.rows.push([]);
    while (S.rows[ri].length <= ci) S.rows[ri].push('');
    S.rows[ri][ci] = newValue;

    td.classList.remove('editing');
    setCellDisplay(td, newValue, S.columns[ci] ?? '');

    markDirty();
  }

  function cancelActiveEdit() {
    if (!activeEdit) return;
    const { td, ri, ci } = activeEdit;
    activeEdit = null;
    td.classList.remove('editing');
    setCellDisplay(td, S.rows[ri]?.[ci] ?? '', S.columns[ci] ?? '');
  }

  function moveFocus(ri, ci) {
    if (ri < 0 || ri >= S.rows.length) return;
    if (ci < 0 || ci >= S.columns.length) return;

    // Switch page if needed
    const targetPage = Math.floor(ri / S.pageSize);
    if (targetPage !== S.page) {
      S.page = targetPage;
      renderBody();
      renderPagination();
    }

    const td = tableBody.querySelector(`td[data-row="${ri}"][data-col="${ci}"]`);
    if (td) startEdit(/** @type {HTMLElement} */ (td), ri, ci);
  }

  // ── Row / column operations ────────────────────────────────────────────────

  btnAddRow.addEventListener('click', () => {
    commitActiveEdit();
    const insertAt = S.selectedRow >= 0 ? S.selectedRow + 1 : S.rows.length;
    S.rows.splice(insertAt, 0, new Array(S.columns.length).fill(''));
    S.selectedRow = insertAt;
    markDirty();
    renderBody();
    renderPagination();
  });

  btnDelRow.addEventListener('click', () => {
    commitActiveEdit();
    if (S.selectedRow < 0 || S.selectedRow >= S.rows.length) return;
    S.rows.splice(S.selectedRow, 1);
    S.selectedRow = Math.min(S.selectedRow, S.rows.length - 1);
    markDirty();
    renderBody();
    renderPagination();
  });

  function duplicateRow() {
    if (S.selectedRow < 0 || S.selectedRow >= S.rows.length) return;
    commitActiveEdit();
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

  btnDupRow.addEventListener('click', () => duplicateRow());

  btnAddCol.addEventListener('click', () => {
    commitActiveEdit();
    const insertAt = S.selectedCol >= 0 ? S.selectedCol + 1 : S.columns.length;
    let name = 'NewColumn';
    let n = 1;
    while (S.columns.includes(name)) name = 'NewColumn' + n++;
    S.columns.splice(insertAt, 0, name);
    S.rows.forEach(row => row.splice(insertAt, 0, ''));
    S.selectedCol = insertAt;
    markDirty();
    renderTable();
  });

  btnDelCol.addEventListener('click', () => {
    commitActiveEdit();
    if (S.selectedCol < 0 || S.selectedCol >= S.columns.length) return;
    S.columns.splice(S.selectedCol, 1);
    S.rows.forEach(row => row.splice(S.selectedCol, 1));
    S.selectedCol = Math.min(S.selectedCol, S.columns.length - 1);
    markDirty();
    renderTable();
  });

  // ── Pagination controls ────────────────────────────────────────────────────

  function goToPage(p) {
    const max = totalPages() - 1;
    if (p < 0 || p > max) return;
    commitActiveEdit();
    S.page = p;
    renderBody();
    renderPagination();
  }

  btnFirst.addEventListener('click', () => goToPage(0));
  btnPrev.addEventListener('click',  () => goToPage(S.page - 1));
  btnNext.addEventListener('click',  () => goToPage(S.page + 1));
  btnLast.addEventListener('click',  () => goToPage(totalPages() - 1));

  // ── Filter ─────────────────────────────────────────────────────────────────

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

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      commitActiveEdit();
      sendSaveData();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd' && S.selectedRow >= 0 && !activeEdit) {
      e.preventDefault();
      duplicateRow();
    }
    if (e.key === 'Delete' && S.selectedRow >= 0 && !activeEdit) {
      // Clear selected row on Delete key (without removing it)
      S.rows[S.selectedRow] = new Array(S.columns.length).fill('');
      markDirty();
      renderBody();
    }
  });

  // ── Boot ───────────────────────────────────────────────────────────────────

  vscode.postMessage({ type: 'ready' });

})();
