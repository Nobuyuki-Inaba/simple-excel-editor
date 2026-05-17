import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

export interface SheetData {
  columns: string[];
  rows: string[][];
}

export class ExcelDocument implements vscode.CustomDocument {
  readonly uri: vscode.Uri;
  readonly tmpDir: string;

  sheets: string[] = [];
  activeSheet = '';
  cache = new Map<string, SheetData>();

  constructor(uri: vscode.Uri) {
    this.uri = uri;
    this.tmpDir = path.join(
      os.tmpdir(),
      'simple-excel-editor',
      crypto.randomBytes(8).toString('hex')
    );
    fs.mkdirSync(this.tmpDir, { recursive: true });
  }

  dispose(): void {
    try {
      fs.rmSync(this.tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
