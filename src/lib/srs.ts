// Ebbinghaus-style spaced repetition. Correct → next stage; wrong → back to stage 0.
import type { ItemRef, SrsEntry } from './types';

export const INTERVAL_DAYS = [1, 2, 4, 7, 15, 30];
const DAY = 86_400_000;

export const srsKey = (r: ItemRef) => `${r.subject}:${r.code}`;

export function schedule(prev: SrsEntry | undefined, item: ItemRef, correct: boolean, now = Date.now()): SrsEntry {
  const stage = correct ? Math.min((prev ? prev.stage + 1 : 0), INTERVAL_DAYS.length - 1) : 0;
  return {
    item, stage, lastResult: correct, updatedAt: now,
    due: now + INTERVAL_DAYS[stage] * DAY,
    seen: (prev?.seen ?? 0) + 1,
    correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
  };
}

export function dueEntries(srs: Record<string, SrsEntry>, now = Date.now(), subjects?: string[]): SrsEntry[] {
  return Object.values(srs)
    .filter((e) => e.due <= now && (!subjects || subjects.length === 0 || subjects.includes(e.item.subject)))
    .sort((a, b) => a.due - b.due);
}

export function summary(srs: Record<string, SrsEntry>, now = Date.now()) {
  const all = Object.values(srs);
  const seen = all.reduce((a, e) => a + e.seen, 0);
  const correct = all.reduce((a, e) => a + e.correct, 0);
  return {
    items: all.length, seen, correct,
    accuracy: seen ? Math.round((correct / seen) * 100) : 0,
    due: all.filter((e) => e.due <= now).length,
    nextDue: all.filter((e) => e.due > now).sort((a, b) => a.due - b.due)[0]?.due ?? null,
    byStage: INTERVAL_DAYS.map((_, i) => all.filter((e) => e.stage === i).length),
  };
}
