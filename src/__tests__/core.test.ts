import { describe, it, expect } from 'vitest';
import { schedule, dueEntries, summary, INTERVAL_DAYS } from '../lib/srs';
import { pickItem, isCorrect, type Item } from '../lib/bank';
import { stripMentions, mentionedBots } from '../lib/engine';
import { fenceCode } from '../components/Cards';
import type { Bot } from '../lib/types';

const DAY = 86_400_000;
const ref = { subject: 'MA', code: 'X-1' };

describe('srs (Ebbinghaus schedule)', () => {
  it('advances on correct and resets on wrong', () => {
    const t = 0;
    const a = schedule(undefined, ref, true, t);
    expect(a.stage).toBe(0); expect(a.due).toBe(INTERVAL_DAYS[0] * DAY);
    const b = schedule(a, ref, true, t);
    expect(b.stage).toBe(1); expect(b.due).toBe(2 * DAY);
    const c = schedule(b, ref, false, t);
    expect(c.stage).toBe(0); expect(c.seen).toBe(3); expect(c.correct).toBe(2);
  });
  it('caps at the last interval', () => {
    let e = schedule(undefined, ref, true, 0);
    for (let i = 0; i < 10; i++) e = schedule(e, ref, true, 0);
    expect(e.stage).toBe(INTERVAL_DAYS.length - 1);
  });
  it('lists due entries and summarises', () => {
    const e = schedule(undefined, ref, false, 0);
    expect(dueEntries({ k: e }, DAY - 1)).toHaveLength(0);
    expect(dueEntries({ k: e }, DAY)).toHaveLength(1);
    expect(dueEntries({ k: e }, DAY, ['EN'])).toHaveLength(0);
    expect(summary({ k: e }, DAY).accuracy).toBe(0);
  });
});

describe('bank helpers', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ code: 'c' + i, subject: 'MA', standard: 's', unit: 'u', type: 'MC', question: 'q', choices: ['a', 'b', 'c', 'd', 'e'], answer: i % 5 })) as Item[];
  it('picks deterministically and honours exclusions', () => {
    expect(pickItem(items, 'seed', new Set())!.code).toBe(pickItem(items, 'seed', new Set())!.code);
    const first = pickItem(items, 'seed', new Set())!.code;
    expect(pickItem(items, 'seed', new Set([first]))!.code).not.toBe(first);
  });
  it('grades MC by index and SA by normalised text', () => {
    expect(isCorrect(items[2], 2)).toBe(true);
    expect(isCorrect(items[2], 1)).toBe(false);
    const sa = { ...items[0], type: 'SA', choices: [], answer: '8x + 15' } as Item;
    expect(isCorrect(sa, null, '8x+15')).toBe(true);
    expect(isCorrect(sa, null, '8x+16')).toBe(false);
  });
});

describe('engine routing helpers', () => {
  const bots = [{ name: '수학' }, { name: '에빙' }] as Bot[];
  it('finds and strips mentions', () => {
    expect(mentionedBots('@수학 문제', bots).map((b) => b.name)).toEqual(['수학']);
    expect(stripMentions('@수학 문제 줘', bots)).toBe('문제 줘');
  });
  it('fences unfenced python code only for PY', () => {
    expect(fenceCode('PY', '출력은?\n\nx = 1\nprint(x)')).toContain('```python');
    expect(fenceCode('EN', 'x = (1)')).toBe('x = (1)');
  });
});
