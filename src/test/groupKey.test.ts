import * as assert from 'assert';

// Pure implementation mirroring media/src/data/utils.ts groupKeyOf's inner logic.
// Kept here (duplicated) because the webview module depends on browser globals (S, DOM).
function extractGroupKey(val: string): string | null {
  const m = val.trim().match(/^\[.+?\]/);
  return m ? m[0] : null;
}

describe('extractGroupKey — group key matching spec', () => {
  // ── 正常系 ────────────────────────────────────────────────────────────────

  it('完全一致: 値全体が [key] の形式', () => {
    assert.strictEqual(extractGroupKey('[case 9]'), '[case 9]');
    assert.strictEqual(extractGroupKey('[正常系]'), '[正常系]');
  });

  it('前置プレフィックス: [key] の後にテキストが続く場合でもキーを抽出', () => {
    assert.strictEqual(extractGroupKey('[case 9] xxx'),       '[case 9]');
    assert.strictEqual(extractGroupKey('[case 9]何かの文字列'), '[case 9]');
    assert.strictEqual(extractGroupKey('[case 9] memo'),      '[case 9]');
  });

  it('同じプレフィックスを持つ値は同一グループキーになる', () => {
    assert.strictEqual(
      extractGroupKey('[case 9] xxx'),
      extractGroupKey('[case 9]何かの文字列'),
    );
  });

  it('前後のスペースは無視される', () => {
    assert.strictEqual(extractGroupKey('  [case 9]  '), '[case 9]');
    assert.strictEqual(extractGroupKey('  [case 9] xxx'), '[case 9]');
  });

  it('複数の [key] が並ぶ場合は先頭のみ抽出', () => {
    assert.strictEqual(extractGroupKey('[a][b]'), '[a]');
  });

  // ── 非マッチ ─────────────────────────────────────────────────────────────

  it('空文字はグループキーなし', () => {
    assert.strictEqual(extractGroupKey(''), null);
    assert.strictEqual(extractGroupKey('   '), null);
  });

  it('ブラケットで始まらない値はグループキーなし', () => {
    assert.strictEqual(extractGroupKey('case 9'), null);
    assert.strictEqual(extractGroupKey('text[group]'), null);
  });

  it('空のブラケット [] はグループキーなし (+は1文字以上を要求)', () => {
    assert.strictEqual(extractGroupKey('[]'), null);
  });
});

// ── アコーディオン表示の条件 ──────────────────────────────────────────────────
// グループトグル（▶/▼）はグループ内の行数が 2 以上のときのみ表示される。
// 1 行しかない場合は通常の行として表示する。
// render.ts では S.rows 全体からカウントする（折りたたみ後の displayRows では
// 折りたたまれた行が除外されているため count=1 になるバグを防ぐため）。
describe('group accordion display rule', () => {
  function countAllByKey(allRows: string[][]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const row of allRows) {
      const key = extractGroupKey(row[0] ?? '');
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  it('同一キーが2行以上ならトグル表示対象', () => {
    const rows = [['[case 9] aaa'], ['[case 9] bbb']];
    const counts = countAllByKey(rows);
    assert.strictEqual((counts.get('[case 9]') ?? 0) >= 2, true);
  });

  it('同一キーが1行だけならトグル非表示（通常行として表示）', () => {
    const rows = [['[case 9] aaa']];
    const counts = countAllByKey(rows);
    assert.strictEqual((counts.get('[case 9]') ?? 0) >= 2, false);
  });

  it('カウントは折りたたまれた行も含む全行で計算する', () => {
    // displayRows が先頭行しか返さない状態でも全行カウントで 2 以上になること
    const allRows = [['[case 9] aaa'], ['[case 9] bbb']];
    const displayRows = [allRows[0]]; // 折りたたまれて先頭行だけ
    const countFromDisplay = countAllByKey(displayRows);
    const countFromAll     = countAllByKey(allRows);
    assert.strictEqual((countFromDisplay.get('[case 9]') ?? 0) >= 2, false); // displayRows だと誤判定
    assert.strictEqual((countFromAll.get('[case 9]') ?? 0) >= 2, true);      // 全行なら正しい
  });
});
