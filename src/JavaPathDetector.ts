import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export async function detectJavaPath(): Promise<string> {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';

  function javaBin(home: string | undefined): string | null {
    if (!home) return null;
    const p = path.join(home, 'bin', exe);
    return fs.existsSync(p) ? p : null;
  }

  // 1. User-configured path
  const userPath = vscode.workspace
    .getConfiguration('simpleExcelEditor')
    .get<string>('javaPath', '')
    .trim();
  if (userPath) return userPath;

  const javaCfg = vscode.workspace.getConfiguration('java');

  // 2. java.jdt.ls.java.home  (Language Support for Java by Red Hat)
  const found2 = javaBin(javaCfg.get<string>('jdt.ls.java.home', ''));
  if (found2) return found2;

  // 3. java.home  (Java Extension Pack, older setting)
  const found3 = javaBin(javaCfg.get<string>('home', ''));
  if (found3) return found3;

  // 4. JAVA_HOME environment variable
  const found4 = javaBin(process.env['JAVA_HOME']);
  if (found4) return found4;

  // 5. Fallback: assume java is on PATH
  return 'java';
}
