import * as vscode from 'vscode';

function isJa(): boolean {
  const lang = vscode.workspace
    .getConfiguration('simpleExcelEditor')
    .get<string>('language', 'auto');
  if (lang === 'ja') return true;
  if (lang === 'en') return false;
  return vscode.env.language.startsWith('ja');
}

export const msg = {
  noSheetsFound: () =>
    isJa() ? 'シートが見つかりません' : 'No sheets found',
  revertFailed: (err: string) =>
    isJa() ? `リバート失敗: ${err}` : `Revert failed: ${err}`,
  saveCancelledWarning: (name: string) =>
    isJa() ? `${name} が既に存在するため保存をキャンセルしました。` : `${name} already exists, save cancelled.`,
  saveCancelledError: (name: string) =>
    isJa() ? `保存キャンセル: ${name} が既に存在します` : `Save cancelled: ${name} already exists`,
  saveTimeout: () =>
    isJa() ? '保存タイムアウト: Webviewが応答しませんでした' : 'Save timeout: Webview did not respond',
  csvMissingFiles: (files: string) =>
    isJa() ? `以下の CSV ファイルが見つかりませんでした: ${files}` : `The following CSV files were not found: ${files}`,
  csvNoCsvFiles: () =>
    isJa() ? '読み込める CSV ファイルがありませんでした' : 'No CSV files could be loaded',
  csvExportCancelled: (files: string) =>
    isJa() ? `CSV出力をキャンセルしました。以下のファイルが既に存在します: ${files}` : `CSV export cancelled. The following files already exist: ${files}`,
  csvExportWithErrors: (files: string) =>
    isJa() ? `CSV出力が完了しましたが、以下のシートでエラーが発生しました: ${files}` : `CSV export completed, but errors occurred in the following sheets: ${files}`,
  csvExportSuccess: (count: number) =>
    isJa() ? `CSV出力が完了しました（${count}シート）。` : `CSV export completed (${count} sheets).`,
  createSheetPrompt: () =>
    isJa() ? '新しいシート名を入力してください' : 'Enter a new sheet name',
  createSheetPlaceholder: () =>
    isJa() ? '例: NewSheet' : 'e.g. NewSheet',
  sheetNameRequired: () =>
    isJa() ? 'シート名を入力してください' : 'Please enter a sheet name',
  sheetNameExists: () =>
    isJa() ? 'そのシート名は既に存在します' : 'A sheet with that name already exists',
  deleteSheetConfirm: (name: string) =>
    isJa() ? `シート「${name}」を削除しますか？この操作は元に戻せません。` : `Delete sheet "${name}"? This cannot be undone.`,
  deleteSheetButton: () =>
    isJa() ? '削除' : 'Delete',
  cannotDeleteLastSheet: () =>
    isJa() ? '最後のシートは削除できません' : 'Cannot delete the last sheet',
  sheetNotFound: (name: string) =>
    isJa() ? `シート "${name}" が見つかりません` : `Sheet "${name}" not found`,
  openDialogCsvExport: () =>
    isJa() ? 'ここに出力' : 'Export here',
  openDialogCsvImport: () =>
    isJa() ? 'シートとして追加' : 'Add as sheet',
};

export interface WebviewLabels {
  // Group
  groupColTitle: string;
  groupAll: string;
  groupCountTpl: string;
  groupToggleExpand: string;
  groupToggleCollapse: string;
  // Cell display
  dateWarning: string;
  // Status bar
  statusLoading: string;
  rowsMatch: string;
  totalRows: string;
  rowsSelected: string;
  cellsSelected: string;
  colStatsMain: string;
  colStatsEmpty: string;
  colStatsDup: string;
  // Sheet operations
  cannotDeleteLastSheet: string;
  // FK nav
  fkNavigateTpl: string;
  fkGoBtn: string;
  fkColumnNotFound: string;
  fkNoMatch: string;
  // Toolbar
  hintNullEmpty: string;
  titleAddRow: string;
  titleDeleteRow: string;
  titleDupRow: string;
  titleAddCol: string;
  titleDeleteCol: string;
  titleImportCsv: string;
  titleExportCsv: string;
  btnAddRow: string;
  btnDeleteRow: string;
  btnDupRow: string;
  btnAddCol: string;
  btnDeleteCol: string;
  btnImportCsv: string;
  btnExportCsv: string;
  searchPlaceholder: string;
  titleClearSearch: string;
  titleGroupFilter: string;
  titleOpenSettings: string;
  // Pagination
  titleFirstPage: string;
  titlePrevPage: string;
  titleNextPage: string;
  titleLastPage: string;
  // Context menu
  ctxCreateSheet: string;
  ctxMoveLeft: string;
  ctxMoveRight: string;
  ctxRenameSheet: string;
  ctxDeleteSheet: string;
  // Lang
  langAttr: string;
}

export function buildWebviewLabels(): WebviewLabels {
  const ja = isJa();
  return {
    groupColTitle:       ja ? 'グループ列' : 'Group column',
    groupAll:            ja ? 'グループ: すべて' : 'Group: All',
    groupCountTpl:       ja ? '{0} ({1}件)' : '{0} ({1} rows)',
    groupToggleExpand:   ja ? '▼ グループ化' : '▼ Grouped',
    groupToggleCollapse: ja ? '▶ グループ化' : '▶ Grouped',
    dateWarning:         ja ? '⚠ 推奨フォーマット: yyyy-MM-dd または yyyy-MM-dd HH:mm:ss' : '⚠ Recommended format: yyyy-MM-dd or yyyy-MM-dd HH:mm:ss',
    statusLoading:       ja ? '読み込み中...' : 'Loading...',
    rowsMatch:           ja ? '{0} 件一致 / {1} 行' : '{0} matching / {1} rows',
    totalRows:           ja ? '{0} 行' : '{0} rows',
    rowsSelected:        ja ? '{0}行 選択中' : '{0} rows selected',
    cellsSelected:       ja ? '{0}行 × {1}列 選択中' : '{0} rows × {1} cols selected',
    colStatsMain:        ja ? '{0}: {1}行 | NULL: {2}件 | ユニーク: {3}件' : '{0}: {1} rows | NULL: {2} | Unique: {3}',
    colStatsEmpty:       ja ? ' | 空: {0}件' : ' | Empty: {0}',
    colStatsDup:         ja ? ' | 重複: {0}件' : ' | Duplicates: {0}',
    cannotDeleteLastSheet: ja ? '最後のシートは削除できません' : 'Cannot delete the last sheet',
    fkNavigateTpl:       ja ? '→ {0} で参照' : '→ Navigate in {0}',
    fkGoBtn:             ja ? '→ 参照' : '→ Navigate',
    fkColumnNotFound:    ja ? '⚠ 参照先の列が見つかりません' : '⚠ Reference column not found',
    fkNoMatch:           ja ? '⚠ 一致するレコードが見つかりません' : '⚠ No matching records found',
    hintNullEmpty:       ja ? 'NULL: Alt+N ｜ 空文字: Alt+E' : 'NULL: Alt+N | Empty string: Alt+E',
    titleAddRow:         ja ? '選択行の下に行を追加' : 'Add row below selection',
    titleDeleteRow:      ja ? '選択行を削除' : 'Delete selected row',
    titleDupRow:         ja ? '選択行を複製して直下に挿入 (Ctrl+D)' : 'Duplicate selected row below (Ctrl+D)',
    titleAddCol:         ja ? '選択列の右に列を追加' : 'Add column to the right of selection',
    titleDeleteCol:      ja ? '選択列を削除' : 'Delete selected column',
    titleImportCsv:      ja ? 'CSVファイルをシートとして追加' : 'Add CSV file as a sheet',
    titleExportCsv:      ja ? '全シートをCSVファイルとして出力' : 'Export all sheets as CSV files',
    btnAddRow:           ja ? '＋ 行' : '＋ Row',
    btnDeleteRow:        ja ? '－ 行' : '－ Row',
    btnDupRow:           ja ? '複製 行' : 'Dup Row',
    btnAddCol:           ja ? '＋ 列' : '＋ Col',
    btnDeleteCol:        ja ? '－ 列' : '－ Col',
    btnImportCsv:        ja ? 'CSV追加' : 'Add CSV',
    btnExportCsv:        ja ? 'CSV出力' : 'Export CSV',
    searchPlaceholder:   ja ? '検索...' : 'Search...',
    titleClearSearch:    ja ? '検索クリア' : 'Clear search',
    titleGroupFilter:    ja ? 'グループで絞り込み' : 'Filter by group',
    titleOpenSettings:   ja ? '拡張機能の設定を開く' : 'Open extension settings',
    titleFirstPage:      ja ? '最初のページ' : 'First page',
    titlePrevPage:       ja ? '前のページ' : 'Previous page',
    titleNextPage:       ja ? '次のページ' : 'Next page',
    titleLastPage:       ja ? '最後のページ' : 'Last page',
    ctxCreateSheet:      ja ? '選択行でシートを作成...' : 'Create sheet from selected rows...',
    ctxMoveLeft:         ja ? '← 左へ移動' : '← Move left',
    ctxMoveRight:        ja ? '右へ移動 →' : 'Move right →',
    ctxRenameSheet:      ja ? 'シート名を変更...' : 'Rename sheet...',
    ctxDeleteSheet:      ja ? 'シートを削除' : 'Delete sheet',
    langAttr:            ja ? 'ja' : 'en',
  };
}
