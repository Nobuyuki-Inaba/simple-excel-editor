import * as vscode from 'vscode';
import { ExcelEditorProvider } from './ExcelEditorProvider';
import { ExcelJsIO } from './excel/ExcelJsIO';

export function activate(context: vscode.ExtensionContext): void {
  const io = new ExcelJsIO();

  context.subscriptions.push(ExcelEditorProvider.register(context, io));

  context.subscriptions.push(
    vscode.commands.registerCommand('simpleExcelEditor.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'simpleExcelEditor');
    })
  );
}

export function deactivate(): void {}
