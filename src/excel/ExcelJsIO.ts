import ExcelJS from 'exceljs';
import { SheetData } from '../ExcelDocument';
import { generateColumnNames } from '../CsvUtils';
import { IExcelIO } from './IExcelIO';

export class ExcelJsIO implements IExcelIO {
  async listSheets(filePath: string): Promise<string[]> {
    const wb = await this.loadWorkbook(filePath);
    return wb.worksheets.map(ws => ws.name);
  }

  async readAllSheets(filePath: string, hasHeader: boolean): Promise<{ sheets: string[]; data: Map<string, SheetData> }> {
    const wb = await this.loadWorkbook(filePath);
    const sheets = wb.worksheets.map(ws => ws.name);
    const data = new Map<string, SheetData>();
    for (const ws of wb.worksheets) {
      data.set(ws.name, extractSheetData(ws, hasHeader));
    }
    return { sheets, data };
  }

  async readSheet(filePath: string, sheetName: string, hasHeader: boolean): Promise<SheetData> {
    const wb = await this.loadWorkbook(filePath);
    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`シート "${sheetName}" が見つかりません`);
    return extractSheetData(ws, hasHeader);
  }

  async writeWorkbook(targetPath: string, cache: Map<string, SheetData>, hasHeader: boolean): Promise<void> {
    const wb = new ExcelJS.Workbook();
    for (const [sheetName, data] of cache) {
      const ws = wb.addWorksheet(sheetName);
      const allRows = hasHeader ? [data.columns, ...data.rows] : data.rows;
      for (const row of allRows) {
        ws.addRow(row);
      }
    }
    await wb.xlsx.writeFile(targetPath);
  }

  private async loadWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    return wb;
  }
}

function extractSheetData(ws: ExcelJS.Worksheet, hasHeader: boolean): SheetData {
  const colCount = ws.columnCount || 0;
  const rows: string[][] = [];

  ws.eachRow({ includeEmpty: false }, row => {
    const cells: string[] = [];
    const width = Math.max(colCount, row.cellCount);
    for (let c = 1; c <= width; c++) {
      cells.push(cellToString(row.getCell(c)));
    }
    rows.push(cells);
  });

  if (rows.length === 0) return { columns: [], rows: [] };
  if (hasHeader) return { columns: rows[0], rows: rows.slice(1) };
  const maxCols = Math.max(...rows.map(r => r.length));
  return { columns: generateColumnNames(maxCols), rows };
}

function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';

  // 数式セルは計算結果を使う
  if (cell.type === ExcelJS.ValueType.Formula) {
    const fv = v as ExcelJS.CellFormulaValue;
    const result = fv.result;
    if (result === null || result === undefined) return '';
    if (result instanceof Date) return formatDate(result);
    if (typeof result === 'object' && 'error' in result) return '';
    return String(result);
  }

  if (v instanceof Date) return formatDate(v);

  // リッチテキスト
  if (typeof v === 'object' && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map(rt => rt.text).join('');
  }

  // ハイパーリンク
  if (typeof v === 'object' && 'text' in v && 'hyperlink' in v) {
    return String((v as ExcelJS.CellHyperlinkValue).text);
  }

  return String(v);
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
