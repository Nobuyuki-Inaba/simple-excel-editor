/** RFC 4180 CSV parser — handles quoted fields, embedded commas and newlines. */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const n = content.length;

  while (i < n) {
    const row: string[] = [];

    while (i <= n) {
      let field = '';

      if (i < n && content[i] === '"') {
        i++; // skip opening quote
        while (i < n) {
          if (content[i] === '"') {
            if (i + 1 < n && content[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            field += content[i++];
          }
        }
      } else {
        while (i < n && content[i] !== ',' && content[i] !== '\n' && content[i] !== '\r') {
          field += content[i++];
        }
      }

      row.push(field);

      if (i >= n || content[i] === '\n' || content[i] === '\r') break;
      i++; // skip comma
    }

    // Skip line ending
    if (i < n && content[i] === '\r') i++;
    if (i < n && content[i] === '\n') i++;

    rows.push(row);
  }

  // Remove trailing empty row that parsers often produce
  if (rows.length > 0 && rows[rows.length - 1].every(c => c === '')) {
    rows.pop();
  }

  return rows;
}

/** Serialize a 2D array to CSV with CRLF line endings. */
export function serializeCsv(rows: string[][]): string {
  return (
    rows
      .map(row =>
        row
          .map(cell => {
            if (/[,"\n\r]/.test(cell)) {
              return '"' + cell.replace(/"/g, '""') + '"';
            }
            return cell;
          })
          .join(',')
      )
      .join('\r\n') + '\r\n'
  );
}

/**
 * Parse the newline-separated output of the exceltocsv `list-sheets` command.
 * Exported for unit testing without a VS Code dependency.
 */
export function parseSheetNames(stdout: string): string[] {
  return stdout.split('\n').map(s => s.trim()).filter(Boolean);
}

/** Generate spreadsheet-style column names: A, B, …, Z, AA, AB, … */
export function generateColumnNames(count: number): string[] {
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    names.push(toColumnName(i));
  }
  return names;
}

function toColumnName(index: number): string {
  let name = '';
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}
