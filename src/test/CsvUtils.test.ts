import * as assert from 'assert';
import { parseCsv, serializeCsv, generateColumnNames, parseSheetNames } from '../CsvUtils';

// ── parseCsv ─────────────────────────────────────────────────────────────────
// These tests verify that parseCsv correctly handles all CSV patterns the
// exceltocsv JAR produces (UTF-8, RFC 4180, CRLF line endings).

describe('parseCsv', () => {
  it('基本的な1行', () => {
    assert.deepStrictEqual(parseCsv('a,b,c\r\n'), [['a', 'b', 'c']]);
  });

  it('複数行', () => {
    assert.deepStrictEqual(parseCsv('a,b\r\nc,d\r\n'), [['a', 'b'], ['c', 'd']]);
  });

  it('末尾の空行は除去される', () => {
    assert.deepStrictEqual(parseCsv('a,b\r\n\r\n'), [['a', 'b']]);
  });

  it('LFのみの行末（JAR実装依存）', () => {
    assert.deepStrictEqual(parseCsv('a,b\nc,d\n'), [['a', 'b'], ['c', 'd']]);
  });

  it('ダブルクォートフィールド', () => {
    assert.deepStrictEqual(parseCsv('"hello","world"\r\n'), [['hello', 'world']]);
  });

  it('フィールド内のカンマはクォートで保護される', () => {
    assert.deepStrictEqual(parseCsv('"a,b",c\r\n'), [['a,b', 'c']]);
  });

  it('フィールド内の改行', () => {
    assert.deepStrictEqual(parseCsv('"line1\nline2",c\r\n'), [['line1\nline2', 'c']]);
  });

  it('ダブルクォートのエスケープ（"" → "）', () => {
    assert.deepStrictEqual(parseCsv('"say ""hello"""\r\n'), [['say "hello"']]);
  });

  it('空セル（連続カンマ）', () => {
    assert.deepStrictEqual(parseCsv('a,,c\r\n'), [['a', '', 'c']]);
  });

  it('[null] マーカーはそのまま文字列として保持', () => {
    assert.deepStrictEqual(parseCsv('[null],[empty]\r\n'), [['[null]', '[empty]']]);
  });

  it('日本語値', () => {
    assert.deepStrictEqual(
      parseCsv('名前,部署\r\n山田,開発\r\n'),
      [['名前', '部署'], ['山田', '開発']]
    );
  });

  it('空文字列入力', () => {
    assert.deepStrictEqual(parseCsv(''), []);
  });

  it('ヘッダ行のみ（データなし）', () => {
    assert.deepStrictEqual(parseCsv('id,name\r\n'), [['id', 'name']]);
  });
});

// ── serializeCsv ─────────────────────────────────────────────────────────────
// Verify that serializeCsv produces CSV the JAR can read back via csv2excel.

describe('serializeCsv', () => {
  it('基本的なシリアライズ', () => {
    assert.strictEqual(serializeCsv([['a', 'b', 'c']]), 'a,b,c\r\n');
  });

  it('複数行', () => {
    assert.strictEqual(serializeCsv([['a', 'b'], ['c', 'd']]), 'a,b\r\nc,d\r\n');
  });

  it('カンマを含むフィールドはクォート', () => {
    assert.strictEqual(serializeCsv([['a,b', 'c']]), '"a,b",c\r\n');
  });

  it('ダブルクォートを含むフィールド', () => {
    assert.strictEqual(serializeCsv([['say "hello"', 'b']]), '"say ""hello""",b\r\n');
  });

  it('改行を含むフィールドはクォート', () => {
    assert.strictEqual(serializeCsv([['line1\nline2', 'c']]), '"line1\nline2",c\r\n');
  });

  it('空セル', () => {
    assert.strictEqual(serializeCsv([['a', '', 'c']]), 'a,,c\r\n');
  });

  it('[null] / [empty] マーカーはクォートせずそのまま出力', () => {
    assert.strictEqual(serializeCsv([['[null]', '[empty]']]), '[null],[empty]\r\n');
  });

  it('行末は CRLF', () => {
    const result = serializeCsv([['a'], ['b']]);
    assert.ok(result.includes('\r\n'), 'CRLF が含まれること');
  });
});

// ── Round-trip ────────────────────────────────────────────────────────────────
// Guarantee that serialize → parse is lossless for all patterns the JAR produces.

describe('parseCsv + serializeCsv ラウンドトリップ', () => {
  function roundTrip(label: string, rows: string[][]): void {
    it(label, () => {
      const csv = serializeCsv(rows);
      const parsed = parseCsv(csv);
      assert.deepStrictEqual(parsed, rows);
    });
  }

  roundTrip('基本ケース', [['a', 'b', 'c']]);
  roundTrip('カンマを含むフィールド', [['a,b', 'c']]);
  roundTrip('クォートを含むフィールド', [['say "hi"', 'x']]);
  roundTrip('空セル', [['a', '', 'c']]);
  roundTrip('[null] / [empty] マーカー', [['[null]', '[empty]', 'normal']]);
  roundTrip('複数行', [['h1', 'h2'], ['v1', 'v2'], ['v3', 'v4']]);
  roundTrip('日本語', [['名前', '部署'], ['山田', '開発']]);
  roundTrip('改行を含むフィールド', [['line1\nline2', 'ok']]);
});

// ── generateColumnNames ───────────────────────────────────────────────────────

describe('generateColumnNames', () => {
  it('A から Z（26列）', () => {
    const names = generateColumnNames(26);
    assert.strictEqual(names[0], 'A');
    assert.strictEqual(names[25], 'Z');
    assert.strictEqual(names.length, 26);
  });

  it('27列目は AA', () => {
    const names = generateColumnNames(27);
    assert.strictEqual(names[26], 'AA');
  });

  it('AZ の次は BA', () => {
    const names = generateColumnNames(53);
    assert.strictEqual(names[51], 'AZ');
    assert.strictEqual(names[52], 'BA');
  });

  it('0列のとき空配列', () => {
    assert.deepStrictEqual(generateColumnNames(0), []);
  });
});

// ── parseSheetNames ───────────────────────────────────────────────────────────
// Verify that the list-sheets command output is parsed correctly.
// If the JAR changes its output format, these tests will catch the regression.

describe('parseSheetNames', () => {
  it('LF区切りのシート名リスト', () => {
    assert.deepStrictEqual(
      parseSheetNames('Sheet1\nSheet2\nSheet3\n'),
      ['Sheet1', 'Sheet2', 'Sheet3']
    );
  });

  it('CRLF区切り', () => {
    assert.deepStrictEqual(
      parseSheetNames('Sheet1\r\nSheet2\r\n'),
      ['Sheet1', 'Sheet2']
    );
  });

  it('空行は除去', () => {
    assert.deepStrictEqual(
      parseSheetNames('Sheet1\n\nSheet2\n'),
      ['Sheet1', 'Sheet2']
    );
  });

  it('先頭・末尾の空白はトリム', () => {
    assert.deepStrictEqual(
      parseSheetNames('  Sheet1  \nSheet2\n'),
      ['Sheet1', 'Sheet2']
    );
  });

  it('日本語シート名', () => {
    assert.deepStrictEqual(
      parseSheetNames('従業員\n注文\n'),
      ['従業員', '注文']
    );
  });

  it('シートが1つ（末尾改行なし）', () => {
    assert.deepStrictEqual(parseSheetNames('Sheet1'), ['Sheet1']);
  });

  it('空の出力（シートなし）', () => {
    assert.deepStrictEqual(parseSheetNames(''), []);
  });

  it('空白のみの出力', () => {
    assert.deepStrictEqual(parseSheetNames('   \n   \n'), []);
  });
});
