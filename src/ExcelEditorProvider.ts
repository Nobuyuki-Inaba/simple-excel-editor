import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseCsv, serializeCsv, generateColumnNames } from './CsvUtils';
import { ExcelDocument, DocumentKind, SheetData } from './ExcelDocument';
import { IExcelIO } from './excel/IExcelIO';
import { msg, buildWebviewLabels } from './i18n';

// Callback type used to resolve a pending webview-data request
type WebviewDataResolver = (data: {
  sheetName: string;
  columns: string[];
  rows: string[][];
}) => void;

// ─── Provider ─────────────────────────────────────────────────────────────────

export class ExcelEditorProvider implements vscode.CustomEditorProvider<ExcelDocument> {
  static readonly viewType = 'simpleExcelEditor.editor';

  // VS Code watches this event to know the document is dirty
  private readonly _onChange =
    new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<ExcelDocument>>();
  readonly onDidChangeCustomDocument = this._onChange.event;

  // One panel per open document
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  // Pending promises waiting for the webview to send back its current data
  private readonly pendingData = new Map<string, WebviewDataResolver>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly io: IExcelIO
  ) {}

  static register(
    context: vscode.ExtensionContext,
    io: IExcelIO
  ): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      ExcelEditorProvider.viewType,
      new ExcelEditorProvider(context, io),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  // ── CustomEditorProvider interface ──────────────────────────────────────────

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<ExcelDocument> {
    const kind = detectKind(uri);
    const doc = new ExcelDocument(uri, kind);
    try {
      if (kind === 'csv') {
        this.openCsvDocument(doc);
      } else if (kind === 'tableOrdering') {
        this.openTableOrderingDocument(doc);
      } else {
        const hasHeader = this.getHasHeader();
        const { sheets, data } = await this.io.readAllSheets(uri.fsPath, hasHeader);
        if (sheets.length === 0) throw new Error(msg.noSheetsFound());
        doc.sheets = sheets;
        doc.activeSheet = sheets[0];
        for (const [name, sheetData] of data) {
          doc.cache.set(name, sheetData);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Simple Excel Editor: ${msg}`);
      throw err;
    }
    return doc;
  }

  async resolveCustomEditor(
    document: ExcelDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const key = document.uri.toString();
    this.panels.set(key, webviewPanel);
    webviewPanel.onDidDispose(() => this.panels.delete(key));

    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = this.buildHtml(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage(msg =>
      this.handleMessage(document, webviewPanel, msg)
    );
  }

  async saveCustomDocument(
    document: ExcelDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    if (document.kind === 'csv' || document.kind === 'tableOrdering') {
      const xlsxPath = this.resolveXlsxPath(document);
      if (fs.existsSync(xlsxPath)) {
        vscode.window.showWarningMessage(
          msg.saveCancelledWarning(path.basename(xlsxPath))
        );
        throw new Error(msg.saveCancelledError(path.basename(xlsxPath)));
      }
      await this.requestAndSave(document, xlsxPath);
      return;
    }
    await this.requestAndSave(document, document.uri.fsPath);
  }

  async saveCustomDocumentAs(
    document: ExcelDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    await this.requestAndSave(document, destination.fsPath);
  }

  async revertCustomDocument(
    document: ExcelDocument,
    _token: vscode.CancellationToken
  ): Promise<void> {
    document.cache.clear();
    try {
      if (document.kind === 'csv') {
        this.openCsvDocument(document);
      } else if (document.kind === 'tableOrdering') {
        this.openTableOrderingDocument(document);
      } else {
        const hasHeader = this.getHasHeader();
        const { sheets, data } = await this.io.readAllSheets(document.uri.fsPath, hasHeader);
        document.sheets = sheets;
        document.activeSheet = sheets[0] ?? '';
        for (const [name, sheetData] of data) {
          document.cache.set(name, sheetData);
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(msg.revertFailed(errMsg));
      return;
    }
    const panel = this.panels.get(document.uri.toString());
    if (panel) await this.sendInit(document, panel);
  }

  async backupCustomDocument(
    document: ExcelDocument,
    context: vscode.CustomDocumentBackupContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    if (document.kind === 'excel') {
      fs.copyFileSync(document.uri.fsPath, context.destination.fsPath);
    } else {
      // CSV / tableOrdering: write current cached state as xlsx
      const hasHeader = this.getHasHeader();
      await this.io.writeWorkbook(context.destination.fsPath, document.sheets, document.cache, hasHeader);
    }
    return {
      id: context.destination.toString(),
      delete: () => {
        try { fs.unlinkSync(context.destination.fsPath); } catch { /* ignore */ }
      },
    };
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /** Read a CSV file from disk into SheetData, stripping BOM if present. */
  private readCsv(filePath: string): SheetData {
    const hasHeader = this.getHasHeader();

    let content = fs.readFileSync(filePath, 'utf-8');
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1); // strip UTF-8 BOM

    const allRows = parseCsv(content);
    if (allRows.length === 0) return { columns: [], rows: [] };

    if (hasHeader) {
      return { columns: allRows[0], rows: allRows.slice(1) };
    }
    const colCount = Math.max(...allRows.map(r => r.length));
    return { columns: generateColumnNames(colCount), rows: allRows };
  }

  /** Populate doc from a single CSV file. */
  private openCsvDocument(doc: ExcelDocument): void {
    const sheetName = path.basename(doc.uri.fsPath, path.extname(doc.uri.fsPath));
    const data = this.readCsv(doc.uri.fsPath);
    doc.sheets = [sheetName];
    doc.activeSheet = sheetName;
    doc.cache.set(sheetName, data);
  }

  /**
   * Populate doc from a table-ordering.txt file.
   * Each non-comment line is a CSV filename (relative to the txt file's directory).
   * Lines starting with '#' are treated as comments.
   */
  private openTableOrderingDocument(doc: ExcelDocument): void {
    let raw = fs.readFileSync(doc.uri.fsPath, 'utf-8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

    const dir = path.dirname(doc.uri.fsPath);
    const lines = raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));

    doc.sheets = [];
    const missing: string[] = [];

    for (const line of lines) {
      const csvFile = line.endsWith('.csv') ? line : line + '.csv';
      const csvPath = path.isAbsolute(csvFile) ? csvFile : path.join(dir, csvFile);

      if (!fs.existsSync(csvPath)) {
        missing.push(path.basename(csvPath));
        continue;
      }

      const sheetName = path.basename(csvPath, '.csv');
      const data = this.readCsv(csvPath);
      doc.sheets.push(sheetName);
      doc.cache.set(sheetName, data);
    }

    if (missing.length > 0) {
      vscode.window.showWarningMessage(
        msg.csvMissingFiles(missing.join(', '))
      );
    }

    if (doc.sheets.length === 0) {
      throw new Error(msg.csvNoCsvFiles());
    }

    doc.activeSheet = doc.sheets[0];
  }

  /** Resolve the target .xlsx path for CSV / table-ordering documents. */
  private resolveXlsxPath(doc: ExcelDocument): string {
    if (doc.kind === 'csv') {
      return doc.uri.fsPath.replace(/\.csv$/i, '.xlsx');
    }
    // tableOrdering: same directory, folder name as filename
    const dir = path.dirname(doc.uri.fsPath);
    return path.join(dir, `${path.basename(dir)}.xlsx`);
  }

  /**
   * Ask the webview for its current data, wait for the response, then persist.
   */
  private requestAndSave(document: ExcelDocument, targetExcelPath: string): Promise<void> {
    const panel = this.panels.get(document.uri.toString());
    if (!panel) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const key = document.uri.toString();

      const timer = setTimeout(() => {
        this.pendingData.delete(key);
        reject(new Error(msg.saveTimeout()));
      }, 15_000);

      this.pendingData.set(key, async ({ sheetName, columns, rows }) => {
        clearTimeout(timer);
        this.pendingData.delete(key);
        document.cache.set(sheetName, { columns, rows });
        try {
          const hasHeader = this.getHasHeader();
          await this.io.writeWorkbook(targetExcelPath, document.sheets, document.cache, hasHeader);
          resolve();
        } catch (err: unknown) {
          reject(err);
        }
      });

      panel.webview.postMessage({ type: 'requestSave' });
    });
  }

  private async handleMessage(
    doc: ExcelDocument,
    panel: vscode.WebviewPanel,
    message: Record<string, unknown>
  ): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.sendInit(doc, panel);
        break;

      case 'edit':
        this._onChange.fire({ document: doc });
        break;

      case 'switchSheet': {
        const { sheetName, currentData } = message as {
          sheetName: string;
          currentData?: { sheetName: string; columns: string[]; rows: string[][] };
        };
        // Persist the webview's current edits into the cache before switching
        if (currentData) {
          doc.cache.set(currentData.sheetName, {
            columns: currentData.columns,
            rows: currentData.rows,
          });
        }
        if (!doc.cache.has(sheetName)) {
          try {
            // Fallback: should not occur since all sheets are loaded eagerly
            const hasHeader = this.getHasHeader();
            doc.cache.set(sheetName, await this.io.readSheet(doc.uri.fsPath, sheetName, hasHeader));
          } catch (err: unknown) {
            const m = err instanceof Error ? err.message : String(err);
            panel.webview.postMessage({ type: 'error', message: m });
            return;
          }
        }
        doc.activeSheet = sheetName;
        const data = doc.cache.get(sheetName)!;
        panel.webview.postMessage({
          type: 'sheetData',
          sheetName,
          columns: data.columns,
          rows: data.rows,
          allSheetColumns: this.buildAllSheetColumns(doc),
        });
        break;
      }

      case 'saveData': {
        const { sheetName, columns, rows } = message as {
          sheetName: string;
          columns: string[];
          rows: string[][];
        };
        const resolver = this.pendingData.get(doc.uri.toString());
        if (resolver) {
          resolver({ sheetName, columns, rows });
        }
        break;
      }

      case 'createSheet': {
        const { columns, rows } = message as { columns: string[]; rows: string[][] };
        const input = await vscode.window.showInputBox({
          prompt: msg.createSheetPrompt(),
          placeHolder: msg.createSheetPlaceholder(),
          validateInput: v => {
            if (!v?.trim()) return msg.sheetNameRequired();
            if (doc.sheets.includes(v.trim())) return msg.sheetNameExists();
            return null;
          },
        });
        if (!input) break;
        const newSheetName = input.trim();
        doc.sheets.push(newSheetName);
        doc.cache.set(newSheetName, { columns, rows });
        this._onChange.fire({ document: doc });
        panel.webview.postMessage({
          type: 'sheetAdded',
          sheets: doc.sheets,
          allSheetColumns: this.buildAllSheetColumns(doc),
        });
        break;
      }

      case 'renameSheet': {
        const { oldName, newName, currentData } = message as {
          oldName: string;
          newName: string;
          currentData?: { sheetName: string; columns: string[]; rows: string[][] };
        };
        if (currentData) {
          doc.cache.set(currentData.sheetName, { columns: currentData.columns, rows: currentData.rows });
        }
        const idx = doc.sheets.indexOf(oldName);
        if (idx < 0) break;
        doc.sheets[idx] = newName;
        const cached = doc.cache.get(oldName);
        if (cached) {
          doc.cache.delete(oldName);
          doc.cache.set(newName, cached);
        }
        if (doc.activeSheet === oldName) doc.activeSheet = newName;
        this._onChange.fire({ document: doc });
        panel.webview.postMessage({
          type: 'sheetRenamed',
          oldName,
          newName,
          sheets: doc.sheets,
          allSheetColumns: this.buildAllSheetColumns(doc),
        });
        break;
      }

      case 'deleteSheet': {
        const { sheetName, currentData } = message as {
          sheetName: string;
          currentData?: { sheetName: string; columns: string[]; rows: string[][] };
        };
        if (doc.sheets.length <= 1) {
          panel.webview.postMessage({ type: 'error', message: msg.cannotDeleteLastSheet() });
          break;
        }
        const deleteBtn = msg.deleteSheetButton();
        const answer = await vscode.window.showWarningMessage(
          msg.deleteSheetConfirm(sheetName),
          { modal: true },
          deleteBtn
        );
        if (answer !== deleteBtn) break;
        if (currentData) {
          doc.cache.set(currentData.sheetName, { columns: currentData.columns, rows: currentData.rows });
        }
        const delIdx = doc.sheets.indexOf(sheetName);
        doc.sheets.splice(delIdx, 1);
        doc.cache.delete(sheetName);
        const newActive = doc.sheets[Math.min(delIdx, doc.sheets.length - 1)];
        doc.activeSheet = newActive;
        if (!doc.cache.has(newActive)) {
          try {
            const hasHeader = this.getHasHeader();
            doc.cache.set(newActive, await this.io.readSheet(doc.uri.fsPath, newActive, hasHeader));
          } catch (err: unknown) {
            const m = err instanceof Error ? err.message : String(err);
            panel.webview.postMessage({ type: 'error', message: m });
            return;
          }
        }
        this._onChange.fire({ document: doc });
        const newData = doc.cache.get(newActive)!;
        panel.webview.postMessage({
          type: 'sheetDeleted',
          deletedSheet: sheetName,
          sheets: doc.sheets,
          newActiveSheet: newActive,
          columns: newData.columns,
          rows: newData.rows,
          allSheetColumns: this.buildAllSheetColumns(doc),
        });
        break;
      }

      case 'openSettings': {
        vscode.commands.executeCommand('workbench.action.openSettings', 'simpleExcelEditor');
        break;
      }
      case 'moveSheet': {
        const newSheets = message.sheets as string[];
        doc.sheets = newSheets;
        this._onChange.fire({ document: doc });
        break;
      }
      case 'exportCsv': {
        const dirs = await vscode.window.showOpenDialog({
          canSelectMany: false,
          canSelectFiles: false,
          canSelectFolders: true,
          openLabel: msg.openDialogCsvExport(),
        });
        if (!dirs || dirs.length === 0) break;
        const outDir = dirs[0].fsPath;

        // 事前チェック: 全シートの CSV が既存ファイルと重複しないか確認
        const conflicts = doc.sheets.filter(name =>
          fs.existsSync(path.join(outDir, `${name}.csv`))
        );
        if (conflicts.length > 0) {
          vscode.window.showErrorMessage(
            msg.csvExportCancelled(conflicts.map(n => `${n}.csv`).join(', '))
          );
          break;
        }

        // 各シートを CSV として書き出し
        const cfg = vscode.workspace.getConfiguration('simpleExcelEditor');
        const hasHeader = cfg.get<boolean>('hasHeader', true);
        const failedSheets: string[] = [];
        const succeededSheets: string[] = [];

        for (const sheetName of doc.sheets) {
          const data = doc.cache.get(sheetName);
          if (!data) continue;
          const csvPath = path.join(outDir, `${sheetName}.csv`);
          try {
            const allRows = hasHeader ? [data.columns, ...data.rows] : data.rows;
            fs.writeFileSync(csvPath, serializeCsv(allRows), { encoding: 'utf8' });
            succeededSheets.push(sheetName);
          } catch {
            failedSheets.push(sheetName);
          }
        }

        // table-ordering.txt を生成（成功シートのみ）
        if (succeededSheets.length > 0) {
          const txtPath = path.join(outDir, 'table-ordering.txt');
          const txtContent = succeededSheets.map(n => `${n}.csv`).join('\n') + '\n';
          fs.writeFileSync(txtPath, txtContent, { encoding: 'utf8' });
        }

        if (failedSheets.length > 0) {
          vscode.window.showWarningMessage(
            msg.csvExportWithErrors(failedSheets.map(n => `${n}.csv`).join(', '))
          );
        } else {
          vscode.window.showInformationMessage(
            msg.csvExportSuccess(succeededSheets.length)
          );
        }
        break;
      }
      case 'importCsv': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: true,
          canSelectFiles: true,
          canSelectFolders: false,
          filters: { 'CSV': ['csv'] },
          openLabel: msg.openDialogCsvImport(),
        });
        if (!uris || uris.length === 0) break;

        const firstAdded = path.basename(uris[0].fsPath, '.csv');
        for (const fileUri of uris) {
          const sheetName = path.basename(fileUri.fsPath, '.csv');
          const data = this.readCsv(fileUri.fsPath);
          if (!doc.sheets.includes(sheetName)) {
            doc.sheets.push(sheetName);
          }
          doc.cache.set(sheetName, data);
        }
        this._onChange.fire({ document: doc });
        panel.webview.postMessage({
          type: 'sheetAdded',
          sheets: doc.sheets,
          allSheetColumns: this.buildAllSheetColumns(doc),
        });
        // Switch to first imported sheet
        doc.activeSheet = firstAdded;
        const importedData = doc.cache.get(firstAdded)!;
        panel.webview.postMessage({
          type: 'sheetData',
          sheetName: firstAdded,
          columns: importedData.columns,
          rows: importedData.rows,
          allSheetColumns: this.buildAllSheetColumns(doc),
        });
        break;
      }
    }
  }

  private async sendInit(doc: ExcelDocument, panel: vscode.WebviewPanel): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('simpleExcelEditor');
    const pageSize = cfg.get<number>('pageSize', 200);
    const nullMarkers = cfg.get<string[]>('nullMarkers', ['[null]']);
    const emptyMarkers = cfg.get<string[]>('emptyMarkers', ['[empty]']);
    const enableRowGrouping = cfg.get<boolean>('enableRowGrouping', true);

    const data = doc.cache.get(doc.activeSheet) ?? { columns: [], rows: [] };
    const allSheetColumns = this.buildAllSheetColumns(doc);

    panel.webview.postMessage({
      type: 'init',
      sheets: doc.sheets,
      activeSheet: doc.activeSheet,
      columns: data.columns,
      rows: data.rows,
      pageSize,
      nullMarkers,
      emptyMarkers,
      enableRowGrouping,
      allSheetColumns,
      labels: buildWebviewLabels(),
    });
  }

  private buildAllSheetColumns(doc: ExcelDocument): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [name, data] of doc.cache) {
      result[name] = data.columns;
    }
    return result;
  }

  private getHasHeader(): boolean {
    return vscode.workspace
      .getConfiguration('simpleExcelEditor')
      .get<boolean>('hasHeader', true);
  }

  // ── Webview HTML ────────────────────────────────────────────────────────────

  private buildHtml(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css')
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.js')
    );
    const L = buildWebviewLabels();

    return /* html */ `<!DOCTYPE html>
<html lang="${L.langAttr}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource};
                 script-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${cssUri}" rel="stylesheet">
  <title>Simple Excel Editor</title>
</head>
<body>
  <div id="toolbar">
    <div class="toolbar-left">
      <button id="btn-add-row"    title="${L.titleAddRow}">${L.btnAddRow}</button>
      <button id="btn-delete-row" title="${L.titleDeleteRow}">${L.btnDeleteRow}</button>
      <button id="btn-dup-row"    title="${L.titleDupRow}">${L.btnDupRow}</button>
      <button id="btn-add-col"    title="${L.titleAddCol}">${L.btnAddCol}</button>
      <button id="btn-delete-col" title="${L.titleDeleteCol}">${L.btnDeleteCol}</button>
      <button id="btn-import-csv" title="${L.titleImportCsv}">${L.btnImportCsv}</button>
      <button id="btn-export-csv" title="${L.titleExportCsv}">${L.btnExportCsv}</button>
    </div>
    <div id="filter-area">
      <input type="text" id="filter-input" placeholder="${L.searchPlaceholder}" autocomplete="off" spellcheck="false">
      <button id="btn-filter-clear" title="${L.titleClearSearch}">✕</button>
    </div>
    <div id="group-filter-area" hidden>
      <select id="group-filter" title="${L.titleGroupFilter}"></select>
    </div>
    <div id="fk-nav-area" hidden>
      <button id="btn-fk-single" hidden></button>
      <select id="fk-sheet-select" hidden></select>
      <button id="btn-fk-go" hidden>${L.fkGoBtn}</button>
    </div>
    <div class="toolbar-right">
      <span class="hint">${L.hintNullEmpty}</span>
      <span id="status-bar">${L.statusLoading}</span>
      <button id="btn-open-settings" title="${L.titleOpenSettings}">⚙</button>
    </div>
  </div>

  <div id="table-wrapper">
    <table id="data-table">
      <thead><tr id="header-row"></tr></thead>
      <tbody id="table-body"></tbody>
    </table>
  </div>

  <div id="pagination">
    <button id="btn-first" title="${L.titleFirstPage}">《</button>
    <button id="btn-prev"  title="${L.titlePrevPage}">＜</button>
    <span id="page-info"></span>
    <button id="btn-next"  title="${L.titleNextPage}">＞</button>
    <button id="btn-last"  title="${L.titleLastPage}">》</button>
    <span id="row-count"></span>
  </div>

  <div id="sheet-tabs-bar">
    <div id="sheet-tabs"></div>
  </div>

  <div id="context-menu">
    <div class="ctx-item ctx-for-row" id="ctx-create-sheet">${L.ctxCreateSheet}</div>
    <div class="ctx-item ctx-for-sheet" id="ctx-move-left">${L.ctxMoveLeft}</div>
    <div class="ctx-item ctx-for-sheet" id="ctx-move-right">${L.ctxMoveRight}</div>
    <div class="ctx-separator ctx-for-sheet"></div>
    <div class="ctx-item ctx-for-sheet" id="ctx-rename-sheet">${L.ctxRenameSheet}</div>
    <div class="ctx-separator ctx-for-sheet"></div>
    <div class="ctx-item ctx-for-sheet" id="ctx-delete-sheet">${L.ctxDeleteSheet}</div>
  </div>

  <script src="${jsUri}"></script>
</body>
</html>`;
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function detectKind(uri: vscode.Uri): DocumentKind {
  if (path.basename(uri.fsPath) === 'table-ordering.txt') return 'tableOrdering';
  if (path.extname(uri.fsPath).toLowerCase() === '.csv') return 'csv';
  return 'excel';
}
