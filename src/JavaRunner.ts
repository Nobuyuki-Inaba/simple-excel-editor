import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { detectJavaPath } from './JavaPathDetector';
import { parseSheetNames } from './CsvUtils';

const execAsync = promisify(execFile);

export class JavaRunner {
  private javaPath = 'java';
  private jarPath: string;
  private initialized = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    const configured = vscode.workspace
      .getConfiguration('simpleExcelEditor')
      .get<string>('jarPath', '')
      .trim();
    this.jarPath = configured || path.join(context.extensionPath, 'lib', 'exceltocsv.jar');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.javaPath = await detectJavaPath();
    if (!fs.existsSync(this.jarPath)) {
      throw new Error(
        `exceltocsv JAR が見つかりません: ${this.jarPath}\n` +
        `exceltocsv リポジトリをビルド (mvn package) して ` +
        `target/exceltocsv-1.0.0-jar-with-dependencies.jar を lib/ フォルダに配置してください。`
      );
    }
    this.initialized = true;
  }

  private async run(args: string[]): Promise<string> {
    await this.initialize();
    // Force UTF-8 for stdout/stderr so Japanese sheet names are not garbled on Windows
    const jvmFlags = [
      '-Dfile.encoding=UTF-8',
      '-Dstdout.encoding=UTF-8',
      '-Dstderr.encoding=UTF-8',
    ];
    const { stdout, stderr } = await execAsync(
      this.javaPath,
      [...jvmFlags, '-jar', this.jarPath, ...args],
      { timeout: 60_000, maxBuffer: 100 * 1024 * 1024 }
    );
    // Log4j2 "no logging implementation" warning is harmless — suppress it
    const meaningful = stderr
      .split('\n')
      .filter(l => !l.includes('StatusLogger') && l.trim())
      .join('\n');
    if (meaningful) console.warn('[exceltocsv]', meaningful);
    return stdout;
  }

  async listSheets(excelPath: string): Promise<string[]> {
    const out = await this.run(['list-sheets', excelPath]);
    return parseSheetNames(out);
  }

  async excelToCsv(excelPath: string, csvPath: string, sheetName: string): Promise<void> {
    const enc = vscode.workspace
      .getConfiguration('simpleExcelEditor')
      .get<string>('encoding', 'UTF-8');
    await this.run([
      'excel2csv', excelPath, csvPath,
      `--sheet=${sheetName}`,
      `--encoding=${enc}`,
    ]);
  }

  async csvToExcel(csvPath: string, excelPath: string, sheetName: string, update = true): Promise<void> {
    const enc = vscode.workspace
      .getConfiguration('simpleExcelEditor')
      .get<string>('encoding', 'UTF-8');
    const args = [
      'csv2excel', csvPath, excelPath,
      `--sheet=${sheetName}`,
      `--encoding=${enc}`,
    ];
    if (update) args.push('--update');
    await this.run(args);
  }
}
