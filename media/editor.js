"use strict";
(() => {
  // media/src/state.ts
  var vscode = acquireVsCodeApi();
  var HISTORY_LIMIT = 50;
  var defaultLabels = {
    groupColTitle: "Group column",
    groupAll: "Group: All",
    groupCountTpl: "{0} ({1} rows)",
    groupToggleExpand: "\u25BC Grouped",
    groupToggleCollapse: "\u25B6 Grouped",
    dateWarning: "\u26A0 Recommended format: yyyy-MM-dd or yyyy-MM-dd HH:mm:ss",
    statusLoading: "Loading...",
    rowsMatch: "{0} matching / {1} rows",
    totalRows: "{0} rows",
    rowsSelected: "{0} rows selected",
    cellsSelected: "{0} rows \xD7 {1} cols selected",
    colStatsMain: "{0}: {1} rows | NULL: {2} | Unique: {3}",
    colStatsEmpty: " | Empty: {0}",
    colStatsDup: " | Duplicates: {0}",
    cannotDeleteLastSheet: "Cannot delete the last sheet",
    fkNavigateTpl: "\u2192 Navigate in {0}",
    fkGoBtn: "\u2192 Navigate",
    fkColumnNotFound: "\u26A0 Reference column not found",
    fkNoMatch: "\u26A0 No matching records found",
    hintNullEmpty: "NULL: Alt+N | Empty string: Alt+E",
    titleAddRow: "Add row below selection",
    titleDeleteRow: "Delete selected row",
    titleDupRow: "Duplicate selected row below (Ctrl+D)",
    titleAddCol: "Add column to the right of selection",
    titleDeleteCol: "Delete selected column",
    titleImportCsv: "Add CSV file as a sheet",
    titleExportCsv: "Export all sheets as CSV files",
    btnAddRow: "\uFF0B Row",
    btnDeleteRow: "\uFF0D Row",
    btnDupRow: "Dup Row",
    btnAddCol: "\uFF0B Col",
    btnDeleteCol: "\uFF0D Col",
    btnImportCsv: "Add CSV",
    btnExportCsv: "Export CSV",
    searchPlaceholder: "Search...",
    titleClearSearch: "Clear search",
    titleGroupFilter: "Filter by group",
    titleOpenSettings: "Open extension settings",
    titleFirstPage: "First page",
    titlePrevPage: "Previous page",
    titleNextPage: "Next page",
    titleLastPage: "Last page",
    ctxCreateSheet: "Create sheet from selected rows...",
    ctxMoveLeft: "\u2190 Move left",
    ctxMoveRight: "Move right \u2192",
    ctxRenameSheet: "Rename sheet...",
    ctxDeleteSheet: "Delete sheet",
    langAttr: "en"
  };
  function fmt(template, ...args) {
    return args.reduce(
      (s, arg, i) => s.replace(`{${i}}`, String(arg)),
      template
    );
  }
  var S = {
    sheets: [],
    activeSheet: "",
    columns: [],
    rows: [],
    pageSize: 200,
    page: 0,
    nullMarkers: ["[null]"],
    emptyMarkers: ["[empty]"],
    filterText: "",
    selectedRow: -1,
    selectedCol: -1,
    selectedCells: /* @__PURE__ */ new Set(),
    anchorCell: null,
    selectedRows: /* @__PURE__ */ new Set(),
    anchorRow: -1,
    history: [],
    historyIndex: -1,
    dirty: false,
    // Row grouping
    enableRowGrouping: true,
    expandedGroups: /* @__PURE__ */ new Set(),
    groupFilter: "",
    // FK navigation
    allSheetColumns: {},
    pendingFkHighlight: null,
    fkHighlightRows: /* @__PURE__ */ new Set(),
    // i18n
    labels: { ...defaultLabels }
  };
  var $ = (id) => document.getElementById(id);
  var headerRow = $("header-row");
  var tableBody = $("table-body");
  var sheetTabsEl = $("sheet-tabs");
  var pageInfo = $("page-info");
  var rowCount = $("row-count");
  var statusBar = $("status-bar");
  var btnFirst = $("btn-first");
  var btnPrev = $("btn-prev");
  var btnNext = $("btn-next");
  var btnLast = $("btn-last");
  var filterInput = $("filter-input");
  var btnFilterClear = $("btn-filter-clear");
  var btnAddRow = $("btn-add-row");
  var btnDelRow = $("btn-delete-row");
  var btnDupRow = $("btn-dup-row");
  var btnAddCol = $("btn-add-col");
  var btnDelCol = $("btn-delete-col");
  var _updateStatus = null;
  function registerUpdateStatus(fn) {
    _updateStatus = fn;
  }
  function markDirty() {
    if (!S.dirty) {
      S.dirty = true;
      vscode.postMessage({ type: "edit" });
    }
    _updateStatus?.();
  }
  function sendSaveData() {
    vscode.postMessage({ type: "saveData", sheetName: S.activeSheet, columns: S.columns, rows: S.rows });
  }
  function requestSwitchSheet(name) {
    vscode.postMessage({
      type: "switchSheet",
      sheetName: name,
      currentData: { sheetName: S.activeSheet, columns: S.columns, rows: S.rows }
    });
  }

  // media/src/data/utils.ts
  var GROUP_COLORS = [
    "color-mix(in srgb, #4fc3f7 22%, transparent)",
    "color-mix(in srgb, #81c784 22%, transparent)",
    "color-mix(in srgb, #ffb74d 22%, transparent)",
    "color-mix(in srgb, #e57373 22%, transparent)",
    "color-mix(in srgb, #ba68c8 22%, transparent)",
    "color-mix(in srgb, #4db6ac 22%, transparent)",
    "color-mix(in srgb, #f06292 22%, transparent)",
    "color-mix(in srgb, #aed581 22%, transparent)"
  ];
  function groupColIndex() {
    if (!S.enableRowGrouping) return -1;
    return S.columns.indexOf("");
  }
  function groupKeyOf(row) {
    const ci = groupColIndex();
    if (ci < 0) return null;
    const val = (row[ci] ?? "").trim();
    return /^\[.+\]$/.test(val) ? val : null;
  }
  function buildGroupColorMap() {
    const map = /* @__PURE__ */ new Map();
    let idx = 0;
    for (const row of S.rows) {
      const key = groupKeyOf(row);
      if (key && !map.has(key)) {
        map.set(key, GROUP_COLORS[idx % GROUP_COLORS.length]);
        idx++;
      }
    }
    return map;
  }
  function isNullValue(v) {
    return S.nullMarkers.includes(v);
  }
  function isEmptyValue(v) {
    return S.emptyMarkers.includes(v);
  }
  function primaryNullMarker() {
    return S.nullMarkers[0] ?? "[null]";
  }
  function primaryEmptyMarker() {
    return S.emptyMarkers[0] ?? "[empty]";
  }
  function isDateColumn(colName) {
    const lower = colName.toLowerCase();
    return lower.includes("date") || lower.includes("day") || lower.includes("_on") || lower.includes("_at");
  }
  function isDateLike(v) {
    if (!v || isNullValue(v) || isEmptyValue(v)) return false;
    if (/^\d+$/.test(v)) return false;
    if (/\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}/.test(v)) return true;
    if (/\d{1,2}[/.]\d{1,2}[/.]\d{4}/.test(v)) return true;
    if (/^(19|20)\d{6}$/.test(v)) return true;
    return false;
  }
  function isValidIsoDate(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v);
  }
  function colLabel(i) {
    let name = "";
    let n = i;
    do {
      name = String.fromCharCode(65 + n % 26) + name;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return name;
  }
  function calculateColumnStats(ci) {
    const values = S.rows.map((row) => row[ci] ?? "");
    const total = values.length;
    const nullCount = values.filter((v) => isNullValue(v)).length;
    const emptyCount = values.filter((v) => !isNullValue(v) && (v === "" || isEmptyValue(v))).length;
    const nonNullValues = values.filter((v) => !isNullValue(v));
    const uniqueValues = new Set(nonNullValues);
    const freq = /* @__PURE__ */ new Map();
    for (const v of nonNullValues) freq.set(v, (freq.get(v) ?? 0) + 1);
    const dupValues = new Set([...freq.entries()].filter(([, c]) => c > 1).map(([v]) => v));
    const dupCount = nonNullValues.filter((v) => dupValues.has(v)).length;
    return { total, nullCount, emptyCount, uniqueCount: uniqueValues.size, dupValues, dupCount };
  }
  function getDisplayRows() {
    const ci = groupColIndex();
    const query = S.filterText.toLowerCase();
    let result = [];
    for (let ri = 0; ri < S.rows.length; ri++) {
      const row = S.rows[ri];
      if (query && !row.some((cell) => (cell ?? "").toLowerCase().includes(query))) continue;
      if (S.groupFilter && groupKeyOf(row) !== S.groupFilter) continue;
      result.push({ data: row, ri });
    }
    if (ci >= 0 && !S.groupFilter) {
      const seen = /* @__PURE__ */ new Set();
      result = result.filter(({ data }) => {
        const key = groupKeyOf(data);
        if (!key) return true;
        if (!seen.has(key)) {
          seen.add(key);
          return true;
        }
        return S.expandedGroups.has(key);
      });
    }
    return result;
  }
  function totalPages() {
    return Math.max(1, Math.ceil(getDisplayRows().length / S.pageSize));
  }

  // media/src/render.ts
  var onCellClick = () => {
  };
  var onCellDblClick = () => {
  };
  var onRowClick = () => {
  };
  var onColClick = () => {
  };
  var onColDblClick = () => {
  };
  var onCommitEdit = () => {
  };
  var onSheetRename = () => {
  };
  var onSheetTabContextMenu = () => {
  };
  var onSheetMove = () => {
  };
  function registerRenderHandlers(handlers) {
    onCellClick = handlers.onCellClick;
    onCellDblClick = handlers.onCellDblClick;
    onRowClick = handlers.onRowClick;
    onColClick = handlers.onColClick;
    onColDblClick = handlers.onColDblClick;
    onCommitEdit = handlers.onCommitEdit;
    onSheetRename = handlers.onSheetRename;
    onSheetTabContextMenu = handlers.onSheetTabContextMenu;
    onSheetMove = handlers.onSheetMove;
  }
  function render() {
    renderSheetTabs();
    renderTable();
    renderPagination();
    updateStatus();
  }
  var dragSrcSheet = "";
  function renderSheetTabs() {
    sheetTabsEl.innerHTML = "";
    S.sheets.forEach((name) => {
      const tab = document.createElement("div");
      tab.className = "sheet-tab" + (name === S.activeSheet ? " active" : "");
      tab.textContent = name;
      tab.title = name;
      tab.dataset.sheet = name;
      tab.draggable = true;
      tab.addEventListener("click", () => {
        if (name !== S.activeSheet) {
          onCommitEdit();
          requestSwitchSheet(name);
        }
      });
      tab.addEventListener("dblclick", (e) => {
        e.preventDefault();
        startSheetRename(tab, name);
      });
      tab.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSheetTabContextMenu(name, e.clientX, e.clientY);
      });
      tab.addEventListener("dragstart", (e) => {
        dragSrcSheet = name;
        tab.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      tab.addEventListener("dragend", () => {
        tab.classList.remove("dragging");
        sheetTabsEl.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      });
      tab.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (name !== dragSrcSheet) tab.classList.add("drag-over");
      });
      tab.addEventListener("dragleave", () => {
        tab.classList.remove("drag-over");
      });
      tab.addEventListener("drop", (e) => {
        e.preventDefault();
        tab.classList.remove("drag-over");
        if (!dragSrcSheet || dragSrcSheet === name) return;
        const next = [...S.sheets];
        const from = next.indexOf(dragSrcSheet);
        const to = next.indexOf(name);
        if (from < 0 || to < 0) return;
        next.splice(from, 1);
        next.splice(to, 0, dragSrcSheet);
        onSheetMove(next);
      });
      sheetTabsEl.appendChild(tab);
    });
  }
  function startSheetRename(tab, currentName) {
    if (tab.classList.contains("editing")) return;
    tab.classList.add("editing");
    tab.textContent = "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "sheet-tab-input";
    input.value = currentName;
    input.addEventListener("click", (e) => e.stopPropagation());
    tab.appendChild(input);
    input.focus();
    input.select();
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const newName = input.value.trim();
      tab.classList.remove("editing");
      tab.textContent = currentName;
      tab.title = currentName;
      if (!newName || newName === currentName || S.sheets.includes(newName)) return;
      onSheetRename(currentName, newName);
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      tab.classList.remove("editing");
      tab.textContent = currentName;
      tab.title = currentName;
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        input.value = currentName;
        cancel();
      }
    });
  }
  function renderTable() {
    renderHeader();
    renderGroupFilter();
    renderBody();
  }
  function renderHeader() {
    headerRow.innerHTML = "";
    const thNum = document.createElement("th");
    thNum.className = "row-num-header";
    thNum.textContent = "#";
    headerRow.appendChild(thNum);
    S.columns.forEach((col, ci) => {
      const th = document.createElement("th");
      if (col === "") {
        th.textContent = "\u{1F3F7}";
        th.title = S.labels.groupColTitle;
        th.classList.add("group-col-header");
      } else {
        th.textContent = col;
        th.title = col;
      }
      th.dataset.col = String(ci);
      if (ci === S.selectedCol) th.classList.add("selected-col-header");
      th.addEventListener("click", () => onColClick(ci));
      th.addEventListener("dblclick", () => onColDblClick(th, ci));
      headerRow.appendChild(th);
    });
  }
  function renderGroupFilter() {
    const area = document.getElementById("group-filter-area");
    const sel = document.getElementById("group-filter");
    const ci = groupColIndex();
    if (ci < 0) {
      area.hidden = true;
      return;
    }
    const keys = [];
    const counts = /* @__PURE__ */ new Map();
    for (const row of S.rows) {
      const key = groupKeyOf(row);
      if (!key) continue;
      if (!keys.includes(key)) keys.push(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (keys.length === 0) {
      area.hidden = true;
      return;
    }
    area.hidden = false;
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = S.labels.groupAll;
    sel.replaceChildren(allOpt);
    for (const key of keys) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = fmt(S.labels.groupCountTpl, key, counts.get(key) ?? 0);
      if (S.groupFilter === key) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  function renderBody() {
    tableBody.innerHTML = "";
    const ci = groupColIndex();
    const colorMap = ci >= 0 ? buildGroupColorMap() : /* @__PURE__ */ new Map();
    const dataTable = document.getElementById("data-table");
    dataTable.classList.toggle("has-grouping", ci >= 0);
    const displayRows = getDisplayRows();
    const offset = S.page * S.pageSize;
    const slice = displayRows.slice(offset, offset + S.pageSize);
    const firstOccMap = /* @__PURE__ */ new Map();
    for (const { ri, data } of displayRows) {
      const key = ci >= 0 ? groupKeyOf(data) : null;
      if (key && !firstOccMap.has(key)) firstOccMap.set(key, ri);
    }
    slice.forEach(({ data: rowData, ri }) => {
      const groupKey = ci >= 0 ? groupKeyOf(rowData) : null;
      const isRepresentative = groupKey !== null && firstOccMap.get(groupKey) === ri && !S.groupFilter;
      const isExpanded = groupKey !== null && S.expandedGroups.has(groupKey);
      const tr = document.createElement("tr");
      tr.dataset.row = String(ri);
      if (groupKey) {
        const color = colorMap.get(groupKey);
        if (color) tr.style.background = color;
      }
      const rowHighlighted = S.selectedRows.size > 0 ? S.selectedRows.has(ri) : ri === S.selectedRow;
      if (rowHighlighted) tr.classList.add("selected-row");
      if (S.fkHighlightRows.has(ri)) tr.classList.add("fk-highlight-row");
      const tdNum = document.createElement("td");
      tdNum.className = "row-num";
      if (isRepresentative) {
        tdNum.classList.add("group-toggle");
        tdNum.textContent = isExpanded ? S.labels.groupToggleExpand : S.labels.groupToggleCollapse;
        tdNum.addEventListener("click", (e) => {
          e.stopPropagation();
          if (S.expandedGroups.has(groupKey)) {
            S.expandedGroups.delete(groupKey);
          } else {
            S.expandedGroups.add(groupKey);
          }
          renderBody();
          renderPagination();
        });
      } else {
        tdNum.textContent = String(ri + 1);
        tdNum.addEventListener("click", (e) => onRowClick(ri, e.shiftKey, e.ctrlKey || e.metaKey));
      }
      tr.appendChild(tdNum);
      S.columns.forEach((_, colIdx) => {
        const value = rowData[colIdx] ?? "";
        tr.appendChild(makeCell(ri, colIdx, value));
      });
      tableBody.appendChild(tr);
    });
    applyDuplicateHighlight(S.selectedCol);
  }
  function makeCell(ri, ci, value) {
    const td = document.createElement("td");
    td.dataset.row = String(ri);
    td.dataset.col = String(ci);
    setCellDisplay(td, value, S.columns[ci] ?? "");
    const key = `${ri},${ci}`;
    if (S.selectedCells.size > 1 && S.selectedCells.has(key)) {
      td.classList.add("range-selected");
    } else if (S.selectedCells.size === 1 && S.selectedCells.has(key)) {
      td.classList.add("selected-cell");
    }
    td.addEventListener("click", (e) => onCellClick(ri, ci, e.shiftKey, e.ctrlKey || e.metaKey));
    td.addEventListener("dblclick", () => onCellDblClick(td, ri, ci));
    return td;
  }
  function setCellDisplay(td, value, colName = "") {
    td.innerHTML = "";
    td.classList.remove("null-cell", "empty-cell", "date-warning-cell");
    td.removeAttribute("title");
    if (isNullValue(value)) {
      td.classList.add("null-cell");
      const span = document.createElement("span");
      span.className = "null-label";
      span.textContent = "NULL";
      td.appendChild(span);
    } else if (isEmptyValue(value)) {
      td.classList.add("empty-cell");
      const span = document.createElement("span");
      span.className = "empty-label";
      span.textContent = "EMPTY";
      td.appendChild(span);
    } else {
      td.textContent = value;
      if (isDateColumn(colName) && isDateLike(value) && !isValidIsoDate(value)) {
        td.classList.add("date-warning-cell");
        td.title = S.labels.dateWarning;
      }
    }
  }
  function renderPagination() {
    const displayRows = getDisplayRows();
    const total = Math.max(1, Math.ceil(displayRows.length / S.pageSize));
    pageInfo.textContent = `${S.page + 1} / ${total}`;
    rowCount.textContent = S.filterText ? fmt(S.labels.rowsMatch, displayRows.length, S.rows.length) : fmt(S.labels.totalRows, S.rows.length);
    btnFirst.disabled = S.page === 0;
    btnPrev.disabled = S.page === 0;
    btnNext.disabled = S.page >= total - 1;
    btnLast.disabled = S.page >= total - 1;
  }
  function updateStatus() {
    const dirty = S.dirty ? " \u25CF" : "";
    if (S.selectedRows.size > 1) {
      statusBar.textContent = fmt(S.labels.rowsSelected, S.selectedRows.size) + dirty;
    } else if (S.selectedCells.size > 1) {
      const coords = [...S.selectedCells].map((k) => k.split(",").map(Number));
      const rowSet = new Set(coords.map(([r]) => r));
      const colSet = new Set(coords.map(([, c]) => c));
      statusBar.textContent = fmt(S.labels.cellsSelected, rowSet.size, colSet.size) + dirty;
    } else if (S.selectedCol >= 0) {
      const stats = calculateColumnStats(S.selectedCol);
      const colName = S.columns[S.selectedCol] || colLabel(S.selectedCol);
      let text = fmt(S.labels.colStatsMain, colName, stats.total, stats.nullCount, stats.uniqueCount);
      if (stats.emptyCount > 0) text += fmt(S.labels.colStatsEmpty, stats.emptyCount);
      if (stats.dupCount > 0) text += fmt(S.labels.colStatsDup, stats.dupCount);
      statusBar.textContent = text + dirty;
    } else {
      statusBar.textContent = S.activeSheet + dirty;
    }
  }
  function applyDuplicateHighlight(ci) {
    document.querySelectorAll("td.duplicate-cell").forEach((el) => el.classList.remove("duplicate-cell"));
    if (ci < 0) return;
    const { dupValues } = calculateColumnStats(ci);
    if (dupValues.size === 0) return;
    tableBody.querySelectorAll(`td[data-col="${ci}"]`).forEach((td) => {
      const ri = Number(td.dataset.row);
      const value = S.rows[ri]?.[ci] ?? "";
      if (dupValues.has(value)) td.classList.add("duplicate-cell");
    });
  }

  // media/src/fkNav.ts
  var fkNavArea = document.getElementById("fk-nav-area");
  var fkSingleBtn = document.getElementById("btn-fk-single");
  var fkSelect = document.getElementById("fk-sheet-select");
  var fkGoBtn = document.getElementById("btn-fk-go");
  function updateFkButtons(ci, ri) {
    if (ci < 0 || ri < 0) {
      fkNavArea.hidden = true;
      return;
    }
    const colName = S.columns[ci];
    const value = S.rows[ri]?.[ci];
    if (!colName || value === void 0) {
      fkNavArea.hidden = true;
      return;
    }
    const targets = S.sheets.filter(
      (s) => s !== S.activeSheet && S.allSheetColumns[s]?.includes(colName)
    );
    if (targets.length === 0) {
      fkNavArea.hidden = true;
      return;
    }
    fkNavArea.hidden = false;
    if (targets.length === 1) {
      fkSingleBtn.hidden = false;
      fkSingleBtn.textContent = fmt(S.labels.fkNavigateTpl, targets[0]);
      fkSingleBtn.onclick = () => navigateToFk(targets[0], colName, value);
      fkSelect.hidden = true;
      fkGoBtn.hidden = true;
    } else {
      fkSingleBtn.hidden = true;
      fkSelect.innerHTML = "";
      targets.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        fkSelect.appendChild(opt);
      });
      fkSelect.hidden = false;
      fkGoBtn.hidden = false;
      fkGoBtn.onclick = () => navigateToFk(fkSelect.value, colName, value);
    }
  }
  function navigateToFk(targetSheet, columnName, value) {
    S.pendingFkHighlight = { columnName, value };
    S.fkHighlightRows = /* @__PURE__ */ new Set();
    fkNavArea.hidden = true;
    requestSwitchSheet(targetSheet);
  }
  function applyFkHighlight() {
    const hint = S.pendingFkHighlight;
    if (!hint) return;
    S.pendingFkHighlight = null;
    const ci = S.columns.indexOf(hint.columnName);
    if (ci < 0) {
      statusBar.textContent = S.labels.fkColumnNotFound;
      return;
    }
    const matchRows = [];
    S.rows.forEach((row, ri) => {
      if ((row[ci] ?? "") === hint.value) matchRows.push(ri);
    });
    if (matchRows.length === 0) {
      S.fkHighlightRows = /* @__PURE__ */ new Set();
      statusBar.textContent = S.labels.fkNoMatch;
      return;
    }
    S.fkHighlightRows = new Set(matchRows);
    S.page = Math.floor(matchRows[0] / S.pageSize);
    renderBody();
    renderPagination();
    requestAnimationFrame(() => {
      const tr = tableBody.querySelector(`tr[data-row="${matchRows[0]}"]`);
      tr?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
  function clearFkHighlight() {
    if (S.fkHighlightRows.size === 0) return;
    S.fkHighlightRows = /* @__PURE__ */ new Set();
    renderBody();
  }

  // media/src/selection.ts
  function buildRangeSet(r1, c1, r2, c2) {
    const cells = /* @__PURE__ */ new Set();
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        cells.add(`${r},${c}`);
      }
    }
    return cells;
  }
  function selectCell(ri, ci, shiftKey = false, ctrlKey = false) {
    S.selectedRows = /* @__PURE__ */ new Set();
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
      S.selectedCells = /* @__PURE__ */ new Set([`${ri},${ci}`]);
      S.anchorCell = { ri, ci };
      S.selectedRow = ri;
      S.selectedCol = ci;
    }
    clearFkHighlight();
    refreshSelection();
    applyDuplicateHighlight(S.selectedCol);
    updateFkButtons(S.selectedCol, S.selectedRow);
    updateStatus();
  }
  function selectRow(ri, shift = false, ctrl = false) {
    if (shift && S.anchorRow >= 0) {
      const min = Math.min(S.anchorRow, ri);
      const max = Math.max(S.anchorRow, ri);
      S.selectedRows = /* @__PURE__ */ new Set();
      for (let r = min; r <= max; r++) S.selectedRows.add(r);
    } else if (ctrl) {
      if (S.selectedRows.has(ri)) S.selectedRows.delete(ri);
      else S.selectedRows.add(ri);
      S.anchorRow = ri;
    } else {
      S.selectedRows = /* @__PURE__ */ new Set([ri]);
      S.anchorRow = ri;
    }
    S.selectedRow = ri;
    S.selectedCol = -1;
    S.selectedCells = /* @__PURE__ */ new Set();
    S.anchorCell = null;
    clearFkHighlight();
    refreshSelection();
    applyDuplicateHighlight(-1);
    updateFkButtons(-1, -1);
    updateStatus();
  }
  function selectColumn(ci) {
    S.selectedCol = ci;
    S.selectedRow = -1;
    S.selectedRows = /* @__PURE__ */ new Set();
    S.anchorRow = -1;
    S.selectedCells = /* @__PURE__ */ new Set();
    S.anchorCell = null;
    document.querySelectorAll("th.selected-col-header").forEach(
      (el) => el.classList.remove("selected-col-header")
    );
    const th = headerRow.querySelector(`th[data-col="${ci}"]`);
    if (th) th.classList.add("selected-col-header");
    clearFkHighlight();
    applyDuplicateHighlight(ci);
    updateFkButtons(-1, -1);
    updateStatus();
  }
  function refreshSelection() {
    document.querySelectorAll("tr.selected-row").forEach((el) => el.classList.remove("selected-row"));
    document.querySelectorAll("td.selected-cell").forEach((el) => el.classList.remove("selected-cell"));
    document.querySelectorAll("td.range-selected").forEach((el) => el.classList.remove("range-selected"));
    document.querySelectorAll("th.selected-col-header").forEach(
      (el) => el.classList.remove("selected-col-header")
    );
    if (S.selectedRows.size > 0) {
      S.selectedRows.forEach((ri) => {
        const tr = tableBody.querySelector(`tr[data-row="${ri}"]`);
        if (tr) tr.classList.add("selected-row");
      });
    } else {
      const tr = tableBody.querySelector(`tr[data-row="${S.selectedRow}"]`);
      if (tr) tr.classList.add("selected-row");
    }
    if (S.selectedCells.size > 1) {
      S.selectedCells.forEach((key) => {
        const [r, c] = key.split(",");
        const td = tableBody.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
        if (td) td.classList.add("range-selected");
      });
    } else if (S.selectedRow >= 0 && S.selectedCol >= 0) {
      const td = tableBody.querySelector(
        `td[data-row="${S.selectedRow}"][data-col="${S.selectedCol}"]`
      );
      if (td) td.classList.add("selected-cell");
    }
  }

  // media/src/edit/cell.ts
  var activeHeaderEdit = null;
  var activeEdit = null;
  function isEditing() {
    return activeEdit !== null;
  }
  function snapshot() {
    S.history.splice(S.historyIndex + 1);
    S.history.push({ rows: S.rows.map((r) => [...r]), columns: [...S.columns] });
    if (S.history.length > HISTORY_LIMIT) S.history.shift();
    S.historyIndex = S.history.length - 1;
  }
  function applyHistoryState(state) {
    S.rows = state.rows.map((r) => [...r]);
    S.columns = [...state.columns];
    S.dirty = S.historyIndex > 0;
    S.selectedCells = /* @__PURE__ */ new Set();
    S.anchorCell = null;
    renderTable();
    renderPagination();
    updateStatus();
    if (!S.dirty) vscode.postMessage({ type: "revert" });
  }
  function undo() {
    commitActiveEdit();
    if (S.historyIndex <= 0) return;
    S.historyIndex--;
    applyHistoryState(S.history[S.historyIndex]);
  }
  function redo() {
    if (S.historyIndex >= S.history.length - 1) return;
    S.historyIndex++;
    applyHistoryState(S.history[S.historyIndex]);
  }
  function startHeaderEdit(th, ci) {
    if (activeHeaderEdit) commitHeaderEdit();
    commitActiveEdit();
    const original = S.columns[ci] ?? "";
    th.classList.add("editing");
    th.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "header-input";
    input.value = original;
    th.appendChild(input);
    input.focus();
    input.select();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        commitHeaderEdit();
      } else if (e.key === "Escape") {
        cancelHeaderEdit();
      }
    });
    input.addEventListener("blur", () => {
      if (activeHeaderEdit && activeHeaderEdit.input === input) commitHeaderEdit();
    });
    activeHeaderEdit = { input, th, ci, original };
  }
  function commitHeaderEdit() {
    if (!activeHeaderEdit) return;
    const { input, th, ci, original } = activeHeaderEdit;
    const newName = input.value.trim();
    activeHeaderEdit = null;
    th.classList.remove("editing");
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
  function cancelHeaderEdit() {
    if (!activeHeaderEdit) return;
    const { th, ci, original } = activeHeaderEdit;
    activeHeaderEdit = null;
    th.classList.remove("editing");
    th.textContent = original || `(${colLabel(ci)})`;
    th.title = original;
  }
  function startEdit(td, ri, ci) {
    if (activeEdit) {
      if (activeEdit.ri === ri && activeEdit.ci === ci) return;
      commitActiveEdit();
    }
    selectCell(ri, ci);
    const currentValue = S.rows[ri]?.[ci] ?? "";
    td.classList.add("editing");
    td.innerHTML = "";
    const input = document.createElement("textarea");
    input.className = "cell-input";
    input.value = currentValue;
    input.rows = 1;
    td.appendChild(input);
    input.focus();
    input.select();
    autoResize(input);
    input.addEventListener("input", () => autoResize(input));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitActiveEdit();
        moveFocus(ri + 1, ci);
      } else if (e.key === "Tab") {
        e.preventDefault();
        commitActiveEdit();
        if (e.shiftKey) moveFocus(ri, ci - 1);
        else moveFocus(ri, ci + 1);
      } else if (e.key === "Escape") {
        cancelActiveEdit();
      } else if (e.key === "n" && e.altKey) {
        e.preventDefault();
        input.value = primaryNullMarker();
        autoResize(input);
      } else if (e.key === "e" && e.altKey) {
        e.preventDefault();
        input.value = primaryEmptyMarker();
        autoResize(input);
      }
    });
    input.addEventListener("blur", () => {
      if (activeEdit && activeEdit.input === input) commitActiveEdit();
    });
    activeEdit = { input, td, ri, ci };
  }
  function autoResize(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }
  function commitActiveEdit() {
    if (!activeEdit) return;
    const { input, td, ri, ci } = activeEdit;
    const newValue = input.value;
    const oldValue = S.rows[ri]?.[ci] ?? "";
    activeEdit = null;
    td.classList.remove("editing");
    if (newValue === oldValue) {
      setCellDisplay(td, newValue, S.columns[ci] ?? "");
      return;
    }
    snapshot();
    while (S.rows.length <= ri) S.rows.push([]);
    while (S.rows[ri].length <= ci) S.rows[ri].push("");
    S.rows[ri][ci] = newValue;
    markDirty();
    renderGroupFilter();
    renderBody();
  }
  function cancelActiveEdit() {
    if (!activeEdit) return;
    const { td, ri, ci } = activeEdit;
    activeEdit = null;
    td.classList.remove("editing");
    setCellDisplay(td, S.rows[ri]?.[ci] ?? "", S.columns[ci] ?? "");
  }
  function moveFocus(ri, ci) {
    if (ri < 0 || ri >= S.rows.length) return;
    if (ci < 0 || ci >= S.columns.length) return;
    const targetPage = Math.floor(ri / S.pageSize);
    if (targetPage !== S.page) {
      S.page = targetPage;
      renderBody();
      renderPagination();
    }
    const td = tableBody.querySelector(`td[data-row="${ri}"][data-col="${ci}"]`);
    if (td) startEdit(td, ri, ci);
  }

  // media/src/edit/clipboard.ts
  function copySelection() {
    if (S.selectedCells.size === 0) return;
    const coords = [...S.selectedCells].map((k) => k.split(",").map(Number));
    const minR = Math.min(...coords.map(([r]) => r));
    const maxR = Math.max(...coords.map(([r]) => r));
    const minC = Math.min(...coords.map(([, c]) => c));
    const maxC = Math.max(...coords.map(([, c]) => c));
    const lines = [];
    for (let r = minR; r <= maxR; r++) {
      const cells = [];
      for (let c = minC; c <= maxC; c++) {
        cells.push(S.selectedCells.has(`${r},${c}`) ? S.rows[r]?.[c] ?? "" : "");
      }
      lines.push(cells.join("	"));
    }
    navigator.clipboard.writeText(lines.join("\n"));
  }
  async function pasteSelection() {
    if (S.selectedCells.size === 0) return;
    const text = await navigator.clipboard.readText().catch(() => "");
    if (!text) return;
    snapshot();
    const coords = [...S.selectedCells].map((k) => k.split(",").map(Number));
    const startR = Math.min(...coords.map(([r]) => r));
    const startC = Math.min(...coords.map(([, c]) => c));
    const pasteRows = text.split("\n").map((line) => line.split("	"));
    for (let dr = 0; dr < pasteRows.length; dr++) {
      const targetR = startR + dr;
      if (targetR >= S.rows.length) break;
      for (let dc = 0; dc < pasteRows[dr].length; dc++) {
        const targetC = startC + dc;
        if (targetC >= S.columns.length) break;
        while (S.rows[targetR].length <= targetC) S.rows[targetR].push("");
        S.rows[targetR][targetC] = pasteRows[dr][dc];
      }
    }
    markDirty();
    renderBody();
  }

  // media/src/data/operations.ts
  function addRow() {
    commitActiveEdit();
    snapshot();
    const insertAt = S.selectedRow >= 0 ? S.selectedRow + 1 : S.rows.length;
    const newRow = new Array(S.columns.length).fill("");
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
  function deleteRow() {
    commitActiveEdit();
    let rowsToDelete;
    if (S.selectedRows.size > 0) {
      rowsToDelete = [...S.selectedRows].sort((a, b) => b - a);
    } else if (S.selectedCells.size > 0) {
      const coords = [...S.selectedCells].map((k) => k.split(",").map(Number));
      rowsToDelete = [...new Set(coords.map(([r]) => r))].sort((a, b) => b - a);
    } else if (S.selectedRow >= 0) {
      rowsToDelete = [S.selectedRow];
    } else {
      return;
    }
    if (rowsToDelete.some((r) => r < 0 || r >= S.rows.length)) return;
    snapshot();
    for (const ri of rowsToDelete) {
      S.rows.splice(ri, 1);
    }
    const minRow = Math.min(...rowsToDelete);
    S.selectedRow = S.rows.length === 0 ? -1 : Math.min(minRow, S.rows.length - 1);
    S.selectedRows = /* @__PURE__ */ new Set();
    S.anchorRow = -1;
    S.selectedCells = /* @__PURE__ */ new Set();
    S.anchorCell = null;
    markDirty();
    renderBody();
    renderPagination();
  }
  function duplicateRow() {
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
  function addColumn() {
    commitActiveEdit();
    snapshot();
    const insertAt = S.selectedCol >= 0 ? S.selectedCol + 1 : S.columns.length;
    let name = "NewColumn";
    let n = 1;
    while (S.columns.includes(name)) name = "NewColumn" + n++;
    S.columns.splice(insertAt, 0, name);
    S.rows.forEach((row) => row.splice(insertAt, 0, ""));
    S.selectedCol = insertAt;
    markDirty();
    renderTable();
  }
  function deleteColumn() {
    commitActiveEdit();
    if (S.selectedCol < 0 || S.selectedCol >= S.columns.length) return;
    snapshot();
    S.columns.splice(S.selectedCol, 1);
    S.rows.forEach((row) => row.splice(S.selectedCol, 1));
    S.selectedCol = Math.min(S.selectedCol, S.columns.length - 1);
    markDirty();
    renderTable();
  }
  function goToPage(p) {
    const max = totalPages() - 1;
    if (p < 0 || p > max) return;
    commitActiveEdit();
    S.page = p;
    renderBody();
    renderPagination();
  }
  function setupListeners() {
    btnAddRow.addEventListener("click", addRow);
    btnDelRow.addEventListener("click", deleteRow);
    btnDupRow.addEventListener("click", duplicateRow);
    btnAddCol.addEventListener("click", addColumn);
    btnDelCol.addEventListener("click", deleteColumn);
    btnFirst.addEventListener("click", () => goToPage(0));
    btnPrev.addEventListener("click", () => goToPage(S.page - 1));
    btnNext.addEventListener("click", () => goToPage(S.page + 1));
    btnLast.addEventListener("click", () => goToPage(totalPages() - 1));
    filterInput.addEventListener("input", () => {
      S.filterText = filterInput.value;
      S.page = 0;
      S.selectedRow = -1;
      S.selectedCol = -1;
      renderBody();
      renderPagination();
    });
    btnFilterClear.addEventListener("click", () => {
      filterInput.value = "";
      S.filterText = "";
      S.page = 0;
      S.selectedRow = -1;
      S.selectedCol = -1;
      renderBody();
      renderPagination();
      filterInput.focus();
    });
    document.getElementById("group-filter")?.addEventListener("change", (e) => {
      S.groupFilter = e.target.value;
      S.page = 0;
      S.selectedRow = -1;
      renderBody();
      renderPagination();
    });
  }

  // media/src/main.ts
  registerUpdateStatus(updateStatus);
  registerRenderHandlers({
    onCellClick: (ri, ci, shift, ctrl) => selectCell(ri, ci, shift, ctrl),
    onCellDblClick: (td, ri, ci) => startEdit(td, ri, ci),
    onRowClick: (ri, shift, ctrl) => selectRow(ri, shift, ctrl),
    onColClick: (ci) => selectColumn(ci),
    onColDblClick: (th, ci) => startHeaderEdit(th, ci),
    onCommitEdit: () => commitActiveEdit(),
    onSheetRename: (oldName, newName) => {
      vscode.postMessage({
        type: "renameSheet",
        oldName,
        newName,
        currentData: { sheetName: S.activeSheet, columns: [...S.columns], rows: S.rows.map((r) => [...r]) }
      });
    },
    onSheetTabContextMenu: (sheetName, x, y) => {
      contextMenuSheetName = sheetName;
      showContextMenu(x, y, "ctx-mode-sheet");
    },
    onSheetMove: (newSheets) => {
      S.sheets = newSheets;
      markDirty();
      renderSheetTabs();
      vscode.postMessage({ type: "moveSheet", sheets: newSheets });
    }
  });
  setupListeners();
  var contextMenu = document.getElementById("context-menu");
  var ctxCreateSheet = document.getElementById("ctx-create-sheet");
  var ctxMoveLeft = document.getElementById("ctx-move-left");
  var ctxMoveRight = document.getElementById("ctx-move-right");
  var ctxRenameSheet = document.getElementById("ctx-rename-sheet");
  var ctxDeleteSheet = document.getElementById("ctx-delete-sheet");
  var contextMenuSheetName = "";
  function hideContextMenu() {
    contextMenu.classList.remove("visible", "ctx-mode-row", "ctx-mode-sheet");
  }
  function showContextMenu(x, y, mode) {
    contextMenu.classList.remove("visible", "ctx-mode-row", "ctx-mode-sheet");
    contextMenu.style.left = x + "px";
    contextMenu.style.top = y + "px";
    contextMenu.classList.add("visible", mode);
    const rect = contextMenu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = Math.max(0, y - rect.height) + "px";
    }
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = Math.max(0, x - rect.width) + "px";
    }
  }
  document.addEventListener("click", hideContextMenu);
  document.addEventListener("contextmenu", (e) => {
    hideContextMenu();
    const target = e.target;
    if (target.closest("tr[data-row]") && S.selectedRows.size > 0) {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, "ctx-mode-row");
    }
  });
  document.getElementById("btn-import-csv")?.addEventListener("click", () => {
    vscode.postMessage({ type: "importCsv" });
  });
  document.getElementById("btn-export-csv")?.addEventListener("click", () => {
    vscode.postMessage({ type: "exportCsv" });
  });
  document.getElementById("btn-open-settings")?.addEventListener("click", () => {
    vscode.postMessage({ type: "openSettings" });
  });
  ctxCreateSheet.addEventListener("click", () => {
    hideContextMenu();
    const rows = [...S.selectedRows].sort((a, b) => a - b).map((ri) => [...S.rows[ri] ?? []]);
    vscode.postMessage({ type: "createSheet", columns: [...S.columns], rows });
  });
  ctxMoveLeft.addEventListener("click", () => {
    hideContextMenu();
    const idx = S.sheets.indexOf(contextMenuSheetName);
    if (idx <= 0) return;
    const next = [...S.sheets];
    next.splice(idx, 1);
    next.splice(idx - 1, 0, contextMenuSheetName);
    S.sheets = next;
    markDirty();
    renderSheetTabs();
    vscode.postMessage({ type: "moveSheet", sheets: next });
  });
  ctxMoveRight.addEventListener("click", () => {
    hideContextMenu();
    const idx = S.sheets.indexOf(contextMenuSheetName);
    if (idx < 0 || idx >= S.sheets.length - 1) return;
    const next = [...S.sheets];
    next.splice(idx, 1);
    next.splice(idx + 1, 0, contextMenuSheetName);
    S.sheets = next;
    markDirty();
    renderSheetTabs();
    vscode.postMessage({ type: "moveSheet", sheets: next });
  });
  ctxRenameSheet.addEventListener("click", () => {
    hideContextMenu();
    const tabs = Array.from(sheetTabsEl.querySelectorAll(".sheet-tab"));
    const tab = tabs.find((t) => t.dataset.sheet === contextMenuSheetName);
    if (tab) startSheetRename(tab, contextMenuSheetName);
  });
  ctxDeleteSheet.addEventListener("click", () => {
    hideContextMenu();
    if (S.sheets.length <= 1) {
      statusBar.textContent = S.labels.cannotDeleteLastSheet;
      return;
    }
    vscode.postMessage({
      type: "deleteSheet",
      sheetName: contextMenuSheetName,
      currentData: { sheetName: S.activeSheet, columns: [...S.columns], rows: S.rows.map((r) => [...r]) }
    });
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      commitActiveEdit();
      sendSaveData();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey && !isEditing()) {
      e.preventDefault();
      undo();
    }
    if (!isEditing() && ((e.ctrlKey || e.metaKey) && e.key === "y" || (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Z")) {
      e.preventDefault();
      redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "c" && S.selectedCells.size > 0 && !isEditing()) {
      e.preventDefault();
      copySelection();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "v" && S.selectedCells.size > 0 && !isEditing()) {
      e.preventDefault();
      pasteSelection();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "d" && S.selectedRow >= 0 && !isEditing()) {
      e.preventDefault();
      duplicateRow();
    }
    if (e.key === "Delete" && S.selectedRow >= 0 && !isEditing()) {
      snapshot();
      S.rows[S.selectedRow] = new Array(S.columns.length).fill("");
      markDirty();
      renderBody();
    }
    if (e.key === "Escape") {
      contextMenu.classList.remove("visible");
    }
  });
  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "init":
        S.sheets = msg.sheets;
        S.activeSheet = msg.activeSheet;
        S.columns = msg.columns;
        S.rows = msg.rows;
        S.pageSize = msg.pageSize;
        S.nullMarkers = msg.nullMarkers;
        S.emptyMarkers = msg.emptyMarkers;
        S.enableRowGrouping = msg.enableRowGrouping ?? true;
        S.allSheetColumns = msg.allSheetColumns ?? {};
        if (msg.labels) S.labels = msg.labels;
        S.filterText = "";
        filterInput.value = "";
        S.page = 0;
        S.dirty = false;
        S.selectedRow = -1;
        S.selectedCol = -1;
        S.selectedCells = /* @__PURE__ */ new Set();
        S.anchorCell = null;
        S.selectedRows = /* @__PURE__ */ new Set();
        S.anchorRow = -1;
        S.fkHighlightRows = /* @__PURE__ */ new Set();
        S.pendingFkHighlight = null;
        S.expandedGroups = /* @__PURE__ */ new Set();
        S.groupFilter = "";
        S.history = [{ rows: msg.rows.map((r) => [...r]), columns: [...msg.columns] }];
        S.historyIndex = 0;
        render();
        break;
      case "sheetData":
        S.activeSheet = msg.sheetName;
        S.columns = msg.columns;
        S.rows = msg.rows;
        S.allSheetColumns = msg.allSheetColumns ?? S.allSheetColumns;
        S.filterText = "";
        filterInput.value = "";
        S.page = 0;
        S.selectedRow = -1;
        S.selectedCol = -1;
        S.selectedCells = /* @__PURE__ */ new Set();
        S.anchorCell = null;
        S.selectedRows = /* @__PURE__ */ new Set();
        S.anchorRow = -1;
        S.fkHighlightRows = /* @__PURE__ */ new Set();
        S.expandedGroups = /* @__PURE__ */ new Set();
        S.groupFilter = "";
        S.history = [{ rows: msg.rows.map((r) => [...r]), columns: [...msg.columns] }];
        S.historyIndex = 0;
        renderSheetTabs();
        renderTable();
        renderPagination();
        updateStatus();
        applyFkHighlight();
        break;
      case "sheetAdded":
        S.sheets = msg.sheets;
        if (msg.allSheetColumns) S.allSheetColumns = msg.allSheetColumns;
        renderSheetTabs();
        break;
      case "sheetRenamed": {
        const { oldName, newName, sheets, allSheetColumns } = msg;
        S.sheets = sheets;
        if (S.activeSheet === oldName) S.activeSheet = newName;
        S.allSheetColumns = allSheetColumns;
        renderSheetTabs();
        updateStatus();
        break;
      }
      case "sheetDeleted": {
        const { sheets, newActiveSheet, columns, rows, allSheetColumns } = msg;
        S.sheets = sheets;
        S.activeSheet = newActiveSheet;
        S.columns = columns;
        S.rows = rows;
        S.allSheetColumns = allSheetColumns;
        S.filterText = "";
        filterInput.value = "";
        S.page = 0;
        S.selectedRow = -1;
        S.selectedCol = -1;
        S.selectedCells = /* @__PURE__ */ new Set();
        S.anchorCell = null;
        S.selectedRows = /* @__PURE__ */ new Set();
        S.anchorRow = -1;
        S.fkHighlightRows = /* @__PURE__ */ new Set();
        S.expandedGroups = /* @__PURE__ */ new Set();
        S.groupFilter = "";
        S.history = [{ rows: rows.map((r) => [...r]), columns: [...columns] }];
        S.historyIndex = 0;
        render();
        break;
      }
      case "requestSave":
        sendSaveData();
        break;
      case "error":
        statusBar.textContent = "\u26A0 " + msg.message;
        break;
    }
  });
  vscode.postMessage({ type: "ready" });
})();
