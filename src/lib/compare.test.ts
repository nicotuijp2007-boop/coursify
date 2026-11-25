import { describe, expect, it } from 'vitest';
import { cell, compare, lastTable, norm } from './compare';

const t = (rows: unknown[][], cols = rows[0]?.map((_, i) => 'c' + i) ?? ['c0']) => ({ cols, rows });

describe('compare', () => {
  it('unordered ignores row order but keeps duplicate counts', () => {
    expect(compare(t([[1], [2], [2]]), t([[2], [1], [2]]), 'unordered')).toBe('');
    expect(compare(t([[1], [1], [2]]), t([[1], [2], [2]]), 'unordered')).toMatch(/some values differ/);
  });
  it('ordered reports the first differing row', () => {
    expect(compare(t([[1], [2]]), t([[1], [2]]), 'ordered')).toBe('');
    expect(compare(t([[2], [1]]), t([[1], [2]]), 'ordered')).toMatch(/^Row 1 differs/);
  });
  it('row and column counts are checked before values', () => {
    expect(compare(t([[1]]), t([[1], [2]]), 'unordered')).toMatch(/returns 1 row\(s\); the model answer returns 2/);
    expect(compare(t([[1, 2]]), t([[1]]), 'unordered')).toMatch(/2 column\(s\)/);
  });
  it('rowcount only compares shape', () => {
    expect(compare(t([[1], [9]]), t([[5], [6]]), 'rowcount')).toBe('');
    expect(compare(t([[1]]), t([[5], [6]]), 'rowcount')).not.toBe('');
  });
  it('column names do not matter, values and NULLs do', () => {
    expect(compare({ cols: ['a'], rows: [[1]] }, { cols: ['b'], rows: [[1]] }, 'unordered')).toBe('');
    expect(compare(t([[null]]), t([['']]), 'unordered')).not.toBe('');
  });
  it('numbers compare by value with 6-decimal rounding; text stays exact', () => {
    expect(cell('10.50')).toBe('10.5');
    expect(cell(1.0000001)).toBe('1');
    expect(cell('INV-001')).toBe('INV-001');
    expect(cell(true)).toBe('t');
    expect(compare(t([['100.00']]), t([[100]]), 'unordered')).toBe('');
    expect(compare(t([['100.01']]), t([[100]]), 'unordered')).not.toBe('');
  });
});

describe('result normalisation', () => {
  it('lastTable picks the last statement that returned columns', () => {
    const r = lastTable([{ fields: [{ name: 'x' }], rows: [{ x: 1 }] }, { fields: [], rows: [], affectedRows: 3 }]);
    expect(r).toEqual({ cols: ['x'], rows: [[1]], affected: undefined });
    expect(lastTable([{ fields: [], affectedRows: 3 }])).toEqual({ cols: [], rows: [], affected: 3 });
  });
  it('norm turns objects and dates into stable text', () => {
    expect(norm({ a: 1 })).toBe('{"a":1}');
    expect(norm(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01T00:00:00.000Z');
    expect(norm(undefined)).toBeNull();
  });
});
