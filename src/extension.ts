import * as vscode from 'vscode';
import { ExcelEditorProvider } from './ExcelEditorProvider';
import { JavaRunner } from './JavaRunner';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const runner = new JavaRunner(context);

  // Initialize lazily — don't block activation if Java/JAR is not yet set up
  runner.initialize().catch(err => {
    console.warn('[SimpleExcelEditor] JavaRunner init deferred:', err.message);
  });

  context.subscriptions.push(ExcelEditorProvider.register(context, runner));

  context.subscriptions.push(
    vscode.commands.registerCommand('simpleExcelEditor.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'simpleExcelEditor');
    })
  );
}

export function deactivate(): void {}
