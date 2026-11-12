// Central store: one persisted document + ephemeral UI state.
// Components subscribe with useStore(selector). Mutations go through update().
import { useSyncExternalStore, useRef } from 'react';
import type { Bot, Conversation, Message, Run, SrsEntry, Routine, Settings, ConnState } from './types';
import { seedState } from './seed';

export interface Persisted {
  v: 1;
  bots: Bot[];
  convs: Conversation[];
  messages: Record<string, Message[]>;
  runs: Record<string, Run>;
  srs: Record<string, SrsEntry>;
  routines: Routine[];
  settings: Settings;
  ui: {
    sidebarCollapsed: boolean;
    selectedConvId: string | null;
    drafts: Record<string, string>;
    scroll: Record<string, number>;   // scrollTop per conversation (-1 = stuck to bottom)
    replyTo: Record<string, string | null>;
  };
  seq: number;          // last canonical sequence number handed out by the transport
  acked: string[];      // message ids the transport has acknowledged (dedupe on retry)
}

export interface Ephemeral {
  conn: ConnState;
  completedUntil: Record<string, number>;  // botId -> time the "completed" flourish ends
  ackUntil: Record<string, number>;        // botId -> time the "acknowledging" pose ends
  highlight: string | null;                // message id flashed after jump-to
  dialog: null | { type: 'bot'; botId?: string } | { type: 'settings' } | { type: 'group' } | { type: 'search' } | { type: 'details'; botId: string } | { type: 'confirm'; text: string; ok: string; onOk: () => void };
  mobileNav: boolean;
  toast: { id: number; text: string } | null;
  bankReady: boolean;
}

export interface State extends Persisted { eph: Ephemeral }

const KEY = 'ebbinghaus.v1';

function safeLoad(): Persisted | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    return p && p.v === 1 ? p : null;
  } catch { return null; }
}

let state: State = {
  ...(safeLoad() ?? seedState()),
  eph: { conn: 'online', completedUntil: {}, ackUntil: {}, highlight: null, dialog: null, mobileNav: false, toast: null, bankReady: false },
};

const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function persistNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    const { eph: _eph, ...p } = state;
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch { /* storage unavailable (private mode / artifact preview): app keeps working in memory */ }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(persistNow, 120);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistNow(); });
}

export function getState() { return state; }

/** Replace state immutably. `persist=false` for ephemeral-only changes. */
export function update(fn: (s: State) => State | void, persist = true) {
  const draft = fn(state);
  if (draft) state = draft;
  if (persist) scheduleSave();
  listeners.forEach((l) => l());
}

export function setEph(patch: Partial<Ephemeral>) {
  update((s) => ({ ...s, eph: { ...s.eph, ...patch } }), false);
}

export function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Selector hook with shallow-equal memo so unrelated updates don't re-render. */
export function useStore<T>(sel: (s: State) => T, eq: (a: T, b: T) => boolean = Object.is): T {
  const last = useRef<{ v: T } | null>(null);
  const get = () => {
    const v = sel(state);
    if (last.current && eq(last.current.v, v)) return last.current.v;
    last.current = { v };
    return v;
  };
  return useSyncExternalStore(subscribe, get, get);
}

export const shallowArr = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  state = { ...seedState(), eph: { ...state.eph, dialog: null } };
  persistNow();
  listeners.forEach((l) => l());
}

// ---------- small helpers used across modules ----------
export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

/** In-page confirmation (window.confirm is unavailable in sandboxed previews). */
export function askConfirm(text: string, ok: string, onOk: () => void) { setEph({ dialog: { type: 'confirm', text, ok, onOk } }); }

export function patchMessage(convId: string, id: string, fn: (m: Message) => Message) {
  update((s) => {
    const list = s.messages[convId];
    if (!list) return s;
    const i = list.findIndex((m) => m.id === id);
    if (i < 0) return s;
    const next = list.slice();
    next[i] = fn(list[i]);
    return { ...s, messages: { ...s.messages, [convId]: next } };
  });
}

export function addMessage(m: Message) {
  update((s) => {
    const list = s.messages[m.convId] ?? [];
    if (list.some((x) => x.id === m.id)) return s; // idempotent: never duplicate
    const convs = s.convs.map((c) => c.id === m.convId
      ? { ...c, lastActivity: m.createdAt, unread: c.id === s.ui.selectedConvId || m.author.type === 'user' ? c.unread : c.unread + 1 }
      : c);
    return { ...s, convs, messages: { ...s.messages, [m.convId]: [...list, m] } };
  });
}

export function patchRun(id: string, patch: Partial<Run>) {
  update((s) => (s.runs[id] ? { ...s, runs: { ...s.runs, [id]: { ...s.runs[id], ...patch, updatedAt: Date.now() } } } : s));
}

export function toast(text: string) {
  const id = Date.now();
  setEph({ toast: { id, text } });
  setTimeout(() => { if (getState().eph.toast?.id === id) setEph({ toast: null }); }, 2600);
}
