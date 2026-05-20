import { S } from '../state';

// ── Row grouping helpers ─────────────────────────────────────────────────────

const GROUP_COLORS = [
  'color-mix(in srgb, #4fc3f7 22%, transparent)',
  'color-mix(in srgb, #81c784 22%, transparent)',
  'color-mix(in srgb, #ffb74d 22%, transparent)',
  'color-mix(in srgb, #e57373 22%, transparent)',
  'color-mix(in srgb, #ba68c8 22%, transparent)',
  'color-mix(in srgb, #4db6ac 22%, transparent)',
  'color-mix(in srgb, #f06292 22%, transparent)',
  'color-mix(in srgb, #aed581 22%, transparent)',
];

export function groupColIndex(): number {
  if (!S.enableRowGrouping) return -1;
  return S.columns.indexOf('');
}

export function groupKeyOf(row: string[]): string | null {
  const ci = groupColIndex();
  if (ci < 0) return null;
  const val = (row[ci] ?? '').trim();
  // Extract leading [key] prefix; trailing text after ] is allowed (e.g. "[case 9] memo")
  const m = val.match(/^\[.+?\]/);
  return m ? m[0] : null;
}

export function buildGroupColorMap(): Map<string, string> {
  const map = new Map<string, string>();
  let idx = 0;
  for (const row of S.rows) {
    const key = groupKeyOf(row);
    if (key && !map.has(key)) {
      map.set(key, GROUP_COLORS[idx % GROUP_COLORS.length]);
      idx++;
    }
  }
  return map;
}

export function isNullValue(v: string): boolean {
  return S.nullMarkers.includes(v);
}

export function isEmptyValue(v: string): boolean {
  return S.emptyMarkers.includes(v);
}

export function primaryNullMarker(): string {
  return S.nullMarkers[0] ?? '[null]';
}

export function primaryEmptyMarker(): string {
  return S.emptyMarkers[0] ?? '[empty]';
}

// Column name patterns that suggest a date column (case-insensitive)
export function isDateColumn(colName: string): boolean {
  const lower = colName.toLowerCase();
  return lower.includes('date') || lower.includes('day') ||
         lower.includes('_on')  || lower.includes('_at');
}

export function isDateLike(v: string): boolean {
  if (!v || isNullValue(v) || isEmptyValue(v)) return false;
  if (/^\d+$/.test(v)) return false;
  if (/\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}/.test(v)) return true;
  if (/\d{1,2}[/.]\d{1,2}[/.]\d{4}/.test(v)) return true;
  if (/^(19|20)\d{6}$/.test(v)) return true;
  return false;
}

export function isValidIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ||
         /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v);
}

export function colLabel(i: number): string {
  let name = '';
  let n = i;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

export interface ColumnStats {
  total: number;
  nullCount: number;
  emptyCount: number;
  uniqueCount: number;
  dupValues: Set<string>;
  dupCount: number;
}

export function calculateColumnStats(ci: number): ColumnStats {
  const values = S.rows.map(row => row[ci] ?? '');
  const total = values.length;
  const nullCount = values.filter(v => isNullValue(v)).length;
  const emptyCount = values.filter(v => !isNullValue(v) && (v === '' || isEmptyValue(v))).length;
  const nonNullValues = values.filter(v => !isNullValue(v));
  const uniqueValues = new Set(nonNullValues);
  const freq = new Map<string, number>();
  for (const v of nonNullValues) freq.set(v, (freq.get(v) ?? 0) + 1);
  const dupValues = new Set([...freq.entries()].filter(([, c]) => c > 1).map(([v]) => v));
  const dupCount = nonNullValues.filter(v => dupValues.has(v)).length;
  return { total, nullCount, emptyCount, uniqueCount: uniqueValues.size, dupValues, dupCount };
}

export function getDisplayRows(): { data: string[]; ri: number }[] {
  const ci = groupColIndex();
  const query = S.filterText.toLowerCase();

  let result: { data: string[]; ri: number }[] = [];
  for (let ri = 0; ri < S.rows.length; ri++) {
    const row = S.rows[ri];
    if (query && !row.some(cell => (cell ?? '').toLowerCase().includes(query))) continue;
    if (S.groupFilter && groupKeyOf(row) !== S.groupFilter) continue;
    result.push({ data: row, ri });
  }

  // Collapse non-representative rows when no group dropdown filter is active
  if (ci >= 0 && !S.groupFilter) {
    const seen = new Set<string>();
    result = result.filter(({ data }) => {
      const key = groupKeyOf(data);
      if (!key) return true;
      if (!seen.has(key)) { seen.add(key); return true; }
      return S.expandedGroups.has(key);
    });
  }

  return result;
}

export function totalPages(): number {
  return Math.max(1, Math.ceil(getDisplayRows().length / S.pageSize));
}
