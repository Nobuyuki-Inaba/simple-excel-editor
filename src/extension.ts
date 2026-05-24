import * as vscode from 'vscode';
import { ExcelEditorProvider } from './ExcelEditorProvider';
import { ExcelJsIO } from './excel/ExcelJsIO';
import { msg } from './i18n';

export function activate(context: vscode.ExtensionContext): void {
  const io = new ExcelJsIO();

  context.subscriptions.push(ExcelEditorProvider.register(context, io));

  context.subscriptions.push(
    vscode.commands.registerCommand('simpleExcelEditor.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'simpleExcelEditor');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('simpleExcelEditor.newFile', async () => {
      const uri = await vscode.window.showSaveDialog({
        title: msg.newFileSaveDialogTitle(),
        filters: { 'Excel Workbook': ['xlsx'] },
        defaultUri: vscode.Uri.file('NewFile.xlsx'),
      });
      if (!uri) return;

      try {
        const sheetName = msg.newFileDefaultSheetName();
        await io.writeWorkbook(uri.fsPath, [sheetName], new Map([[sheetName, { columns: [], rows: [] }]]), false);
        await vscode.commands.executeCommand('vscode.openWith', uri, 'simpleExcelEditor.editor');
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Simple Excel Editor: ${msg.newFileFailed(errMsg)}`);
      }
    })
  );
}

export function deactivate(): void {}
