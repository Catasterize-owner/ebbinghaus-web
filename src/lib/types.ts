// Typed schema for everything the UI renders. Persisted records (bots, conversations,
// messages, runs, srs) are kept apart from ephemeral UI state (see store.ts).

export type BotState =
  | 'idle' | 'acknowledging' | 'thinking' | 'working'
  | 'waiting' | 'blocked' | 'completed' | 'error';

export type BotShape = 'blob' | 'pill' | 'drop' | 'square';

export interface Bot {
  id: string;
  name: string;
  color: string;          // token-friendly hex
  shape: BotShape;
  role: 'coach' | 'tutor';
  subjects: string[];     // itembank subject ids
  persona: string;        // short description shown in details
  pinned: boolean;
  order: number;          // stable sidebar order (never re-sorted by activity)
  skills: { quiz: boolean; hints: boolean; review: boolean };
  createdAt: number;
}

export interface Conversation {
  id: string;
  kind: 'dm' | 'group';
  botIds: string[];
  title: string;
  createdAt: number;
  lastActivity: number;
  unread: number;
  focus?: { subject: string; standard: string } | null; // unit the user picked
}

export type Author = { type: 'user' } | { type: 'bot'; botId: string } | { type: 'system' };

export interface ItemRef { subject: string; code: string }

export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'quiz'; item: ItemRef; selected?: number | null; typed?: string; submitted?: boolean; correct?: boolean }
  | { kind: 'event'; text: string; tone?: 'info' | 'handoff' | 'done' | 'warn' }
  | { kind: 'actions'; actions: { label: string; send?: string; open?: string }[] }
  | { kind: 'units'; subject: string }
  | { kind: 'stats' }
  | { kind: 'review'; items: ItemRef[] }
  | { kind: 'attachment'; name: string; size: number; mime: string; dataUrl?: string; progress: number; state: 'uploading' | 'done' | 'failed' }
  | { kind: 'confirm'; prompt: string; yes: string; no: string; send: { yes: string; no: string }; chosen?: 'yes' | 'no' };

export type MessageStatus =
  | 'pending'    // optimistic, not yet acknowledged by the transport
  | 'sent'       // acknowledged (canonical)
  | 'failed'     // transport rejected; can retry
  | 'streaming'  // bot message being revealed
  | 'complete'   // bot message done
  | 'interrupted'; // bot message stopped (error/cancel)

export interface Message {
  id: string;            // client-generated, stable across retries (dedupe key)
  convId: string;
  author: Author;
  createdAt: number;
  seq: number;           // canonical ordering assigned on ack (pending: Infinity-ish)
  status: MessageStatus;
  parts: Part[];
  replyTo?: string | null;
  reactions?: Record<string, number>; // emoji -> 1 when reacted by user (single-user app)
  runId?: string;
  revealed?: number;     // streaming: chars of text part revealed
  error?: string;
  meta?: { quizAnswer?: { messageId: string; item: ItemRef; correct: boolean; selected?: number | null; typed?: string } };
}

export type RunStatus = 'queued' | 'acknowledging' | 'thinking' | 'working' | 'completed' | 'error' | 'cancelled';

export interface Run {
  id: string;
  convId: string;
  botId: string;
  triggerId: string;      // message that triggered the run
  input?: string;         // text the bot should act on (handoffs carry the user's original request)
  status: RunStatus;
  messageId?: string;     // bot message being produced
  plan?: Part[];          // full planned output (deterministic engine)
  followups?: { botId: string; text: string }[]; // bot-to-bot handoffs to spawn after completion
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface SrsEntry { item: ItemRef; stage: number; due: number; lastResult: boolean; seen: number; correct: number; updatedAt: number }

export interface Routine { id: string; botId: string; label: string; hour: number; minute: number; enabled: boolean; lastFired?: string }

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  motion: 'system' | 'reduced' | 'full';
  explanation: 'official' | 'friendly';
  simulateOffline: boolean;
  failNextSend: boolean;
  latencyMs: number;
  streamCps: number;   // characters per second for progressive reveal
}

export type ConnState = 'online' | 'offline' | 'reconnecting';
