import { S, markDirty } from '../state';
import { renderBody } from '../render';
import { snapshot } from './cell';

export function copySelection(): void {
  if (S.selectedCells.size === 0) return;
  const coords = [...S.selectedCells].map(k => k.split(',').map(Number));
  const minR = Math.min(...coords.map(([r]) => r));
  const maxR = Math.max(...coords.map(([r]) => r));
  const minC = Math.min(...coords.map(([, c]) => c));
  const maxC = Math.max(...coords.map(([, c]) => c));

  const lines: string[] = [];
  for (let r = minR; r <= maxR; r++) {
    const cells: string[] = [];
    for (let c = minC; c <= maxC; c++) {
      cells.push(S.selectedCells.has(`${r},${c}`) ? (S.rows[r]?.[c] ?? '') : '');
    }
    lines.push(cells.join('\t'));
  }
  navigator.clipboard.writeText(lines.join('\n'));
}

export async function pasteSelection(): Promise<void> {
  if (S.selectedCells.size === 0) return;
  const text = await navigator.clipboard.readText().catch(() => '');
  if (!text) return;
  snapshot();

  const coords = [...S.selectedCells].map(k => k.split(',').map(Number));
  const startR = Math.min(...coords.map(([r]) => r));
  const startC = Math.min(...coords.map(([, c]) => c));

  const pasteRows = text.split('\n').map(line => line.split('\t'));
  for (let dr = 0; dr < pasteRows.length; dr++) {
    const targetR = startR + dr;
    if (targetR >= S.rows.length) break;
    for (let dc = 0; dc < pasteRows[dr].length; dc++) {
      const targetC = startC + dc;
      if (targetC >= S.columns.length) break;
      while (S.rows[targetR].length <= targetC) S.rows[targetR].push('');
      S.rows[targetR][targetC] = pasteRows[dr][dc];
    }
  }
  markDirty();
  renderBody();
}
