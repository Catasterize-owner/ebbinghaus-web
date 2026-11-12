// Item bank access. Shards are produced by scripts/build-bank.mjs from the itembank repo.
import type { ItemRef } from './types';

export interface Item {
  code: string; subject: string; standard: string; unit: string; topic?: string;
  type: 'MC' | 'SA' | 'TF'; difficulty?: string; question: string; choices?: string[];
  answer: number | string; explanation?: string; hints?: string[]; steps?: string[]; tip?: string;
  wrongAnswerReasons?: Record<string, string> | string[]; origin?: string; tags?: string[];
}
export interface UnitInfo { standard: string; unit: string; count: number }
export interface SubjectInfo { id: string; name: string; count: number; units: UnitInfo[] }
export interface BankIndex { total: number; skipped: number; sample?: boolean; subjects: SubjectInfo[] }

let index: BankIndex | null = null;
let indexPromise: Promise<BankIndex> | null = null;
const shards = new Map<string, Item[]>();
const shardPromises = new Map<string, Promise<Item[]>>();
const byCode = new Map<string, Item>();

const base = () => new URL('bank/', document.baseURI).toString();

export function loadIndex(): Promise<BankIndex> {
  if (index) return Promise.resolve(index);
  indexPromise ??= fetch(base() + 'index.json').then((r) => {
    if (!r.ok) throw new Error(`문항 색인을 불러오지 못했어요 (${r.status})`);
    return r.json();
  }).then((j: BankIndex) => (index = j)).catch((e) => { indexPromise = null; throw e; });
  return indexPromise;
}

export const getIndex = () => index;
export const subjectInfo = (id: string) => index?.subjects.find((s) => s.id === id);

export function loadSubject(id: string): Promise<Item[]> {
  const have = shards.get(id);
  if (have) return Promise.resolve(have);
  let p = shardPromises.get(id);
  if (!p) {
    p = fetch(base() + `${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`${id} 문항을 불러오지 못했어요 (${r.status})`);
      return r.json();
    }).then((items: Item[]) => {
      shards.set(id, items);
      for (const it of items) byCode.set(it.code, it);
      return items;
    }).catch((e) => { shardPromises.delete(id); throw e; });
    shardPromises.set(id, p);
  }
  return p;
}

export const getItem = (ref: ItemRef) => byCode.get(ref.code);

export async function ensureItem(ref: ItemRef): Promise<Item | undefined> {
  if (!byCode.has(ref.code)) await loadSubject(ref.subject);
  return byCode.get(ref.code);
}

/** Deterministic pick: same seed → same item, so a resumed run produces the same output. */
export function pickItem(items: Item[], seed: string, exclude: Set<string>): Item | undefined {
  if (!items.length) return undefined;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const start = Math.abs(h) % items.length;
  for (let k = 0; k < items.length; k++) {
    const it = items[(start + k * 7919) % items.length];
    if (!exclude.has(it.code)) return it;
  }
  return items[start];
}

export function isCorrect(item: Item, selected: number | null | undefined, typed?: string): boolean {
  if (item.type === 'SA' && (!item.choices || item.choices.length === 0)) {
    const norm = (s: string) => s.replace(/\s+/g, '').replace(/[,.]/g, '').toLowerCase();
    return typed != null && norm(typed) === norm(String(item.answer));
  }
  return selected === item.answer;
}

export function answerLabel(item: Item): string {
  if (typeof item.answer === 'number' && item.choices?.length) return `${'①②③④⑤⑥'[item.answer] ?? item.answer + 1} ${item.choices[item.answer]}`;
  return String(item.answer);
}
