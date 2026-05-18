import * as vscode from 'vscode';

export interface SheetData {
  columns: string[];
  rows: string[][];
}

export type DocumentKind = 'excel' | 'csv' | 'tableOrdering';

export class ExcelDocument implements vscode.CustomDocument {
  readonly uri: vscode.Uri;
  readonly kind: DocumentKind;

  sheets: string[] = [];
  activeSheet = '';
  cache = new Map<string, SheetData>();

  constructor(uri: vscode.Uri, kind: DocumentKind = 'excel') {
    this.uri = uri;
    this.kind = kind;
  }

  dispose(): void {}
}
