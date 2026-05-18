import { SheetData } from '../ExcelDocument';

/**
 * Excel ファイルの読み書きを抽象化するインターフェース。
 * ExcelJS / JAR / 他ライブラリなど実装を差し替えられるようにする。
 */
export interface IExcelIO {
  /** Excel ファイルのシート名一覧を返す */
  listSheets(filePath: string): Promise<string[]>;

  /** Excel ファイルの全シートを読み込む */
  readAllSheets(filePath: string, hasHeader: boolean): Promise<{ sheets: string[]; data: Map<string, SheetData> }>;

  /** Excel ファイルの単一シートを読み込む（キャッシュミス時のフォールバック用） */
  readSheet(filePath: string, sheetName: string, hasHeader: boolean): Promise<SheetData>;

  /** キャッシュ内の全シートを新規 Excel ファイルとして書き込む。sheets の順序でワークシートを作成する */
  writeWorkbook(targetPath: string, sheets: string[], cache: Map<string, SheetData>, hasHeader: boolean): Promise<void>;
}
