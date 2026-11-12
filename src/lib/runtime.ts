// Transport (optimistic send, ack, retry, offline queue) + Runner (bot run lifecycle,
// progressive reveal, resume after reload). Both persist through the store, so a reload
// at any point reconciles from saved state instead of losing or duplicating messages.
import { getState, update, setEph, patchMessage, addMessage, patchRun, uid, toast } from './store';
import type { Message, Run, Part, Bot, ConnState } from './types';
import { plan, stripMentions, mentionedBots, routeGroup } from './engine';
import { schedule, srsKey } from './srs';
import { ensureItem, isCorrect } from './bank';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ACK_MS = 520;          // acknowledging pose length (tuned approximation, not a measured Grok Bot value)
const COMPLETE_MS = 1500;    // completed flourish before settling to idle
const MIN_THINK_MS = 650;

// ------------------------------------------------------------------ transport
function wantOnline() { return (typeof navigator === 'undefined' || navigator.onLine) && !getState().settings.simulateOffline; }

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
export function syncConnection() {
  const conn = getState().eph.conn;
  const want = wantOnline();
  if (!want && conn !== 'offline') { if (reconnectTimer) clearTimeout(reconnectTimer); setEph({ conn: 'offline' }); return; }
  if (want && conn === 'offline') {
    setEph({ conn: 'reconnecting' });
    reconnectTimer = setTimeout(() => {
      if (!wantOnline()) { setEph({ conn: 'offline' }); return; }
      setEph({ conn: 'online' });
      flushOutbox();
      Object.values(getState().runs).forEach((r) => { if (!isTerminal(r)) void drive(r.id); });
    }, 900);
  }
}

export function connState(): ConnState { return getState().eph.conn; }

function flushOutbox() {
  const s = getState();
  const pending = Object.values(s.messages).flat().filter((m) => m.author.type === 'user' && m.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  pending.forEach((m) => void deliver(m.id, m.convId));
}

const inFlight = new Set<string>();
async function deliver(id: string, convId: string) {
  if (inFlight.has(id) || connState() !== 'online') return;
  inFlight.add(id);
  try {
    await sleep(getState().settings.latencyMs);
    if (connState() !== 'online') return; // stays pending; flushed on reconnect
    const s = getState();
    const msg = s.messages[convId]?.find((m) => m.id === id);
    if (!msg || msg.status !== 'pending') return;
    if (s.settings.failNextSend) {
      update((st) => ({ ...st, settings: { ...st.settings, failNextSend: false } }));
      patchMessage(convId, id, (m) => ({ ...m, status: 'failed', error: '서버가 요청을 거부했어요 (실패 시뮬레이션)' }));
      return;
    }
    const already = s.acked.includes(id);
    let seq = 0;
    update((st) => {
      seq = already ? (msg.seq || st.seq) : st.seq + 1;
      return { ...st, seq: already ? st.seq : seq, acked: already ? st.acked : [...st.acked.slice(-500), id] };
    });
    patchMessage(convId, id, (m) => ({ ...m, status: 'sent', seq, error: undefined }));
    if (!already) onAcked(getState().messages[convId].find((m) => m.id === id)!);
  } finally { inFlight.delete(id); }
}

/** Optimistically add a user message and hand it to the transport. */
export function sendUserMessage(convId: string, parts: Part[], opts: { replyTo?: string | null; meta?: Message['meta']; hold?: boolean } = {}) {
  const m: Message = {
    id: uid('m_'), convId, author: { type: 'user' }, createdAt: Date.now(), seq: Number.MAX_SAFE_INTEGER,
    status: 'pending', parts, replyTo: opts.replyTo ?? null, meta: opts.meta,
  };
  addMessage(m);
  if (!opts.hold) void deliver(m.id, convId);
  return m.id;
}

/** Hand a held message (e.g. waiting for attachments to finish reading) to the transport. */
export function releaseMessage(convId: string, id: string) { void deliver(id, convId); }

export function retryMessage(convId: string, id: string) {
  patchMessage(convId, id, (m) => ({ ...m, status: 'pending', error: undefined }));
  void deliver(id, convId);
}

export function discardMessage(convId: string, id: string) {
  update((s) => ({ ...s, messages: { ...s.messages, [convId]: s.messages[convId].filter((m) => m.id !== id) } }));
}

/** Submit an answer on a quiz card: lock the card, schedule SRS, send the answer as a message. */
export async function answerQuiz(convId: string, msgId: string, partIndex: number, selected: number | null, typed?: string) {
  const msg = getState().messages[convId]?.find((m) => m.id === msgId);
  const part = msg?.parts[partIndex];
  if (!msg || !part || part.kind !== 'quiz' || part.submitted) return;
  const item = await ensureItem(part.item);
  if (!item) { toast('문항을 불러오지 못했어요'); return; }
  const correct = isCorrect(item, selected, typed);
  patchMessage(convId, msgId, (m) => ({ ...m, parts: m.parts.map((p, i) => (i === partIndex && p.kind === 'quiz' ? { ...p, selected, typed, submitted: true, correct } : p)) }));
  update((s) => ({ ...s, srs: { ...s.srs, [srsKey(part.item)]: schedule(s.srs[srsKey(part.item)], part.item, correct) } }));
  const label = item.choices?.length && selected != null ? `${'①②③④⑤⑥'[selected]} ${item.choices[selected]}` : (typed ?? '');
  sendUserMessage(convId, [{ kind: 'text', text: `${label}` }], { replyTo: msgId, meta: { quizAnswer: { messageId: msgId, item: part.item, correct, selected, typed } } });
}

// ------------------------------------------------------------------ runner
const isTerminal = (r: Run) => r.status === 'completed' || r.status === 'error' || r.status === 'cancelled';

function onAcked(m: Message) {
  const s = getState();
  const conv = s.convs.find((c) => c.id === m.convId);
  if (!conv) return;
  const members = s.bots.filter((b) => conv.botIds.includes(b.id));
  let targets: Bot[] = [];
  const quizOwner = m.meta?.quizAnswer && s.messages[m.convId].find((x) => x.id === m.meta!.quizAnswer!.messageId);
  if (quizOwner && quizOwner.author.type === 'bot') {
    const bid = quizOwner.author.botId;
    targets = members.filter((b) => b.id === bid);
  } else if (conv.kind === 'dm') targets = members;
  else {
    const text = m.parts.map((p) => (p.kind === 'text' ? p.text : '')).join(' ');
    targets = mentionedBots(text, members);
    if (!targets.length) { const r = routeGroup(text, members); if (r) targets = [r]; }
  }
  targets.forEach((b) => startRun(conv.id, b.id, m.id));
}

export function startRun(convId: string, botId: string, triggerId: string, input?: string) {
  const id = uid('run_');
  const run: Run = { id, convId, botId, triggerId, input, status: 'queued', createdAt: Date.now(), updatedAt: Date.now() };
  update((s) => ({ ...s, runs: { ...s.runs, [id]: run } }));
  void drive(id);
  return id;
}

const driving = new Set<string>();
const cancelled = new Set<string>();

export function cancelRun(id: string) {
  const r = getState().runs[id];
  if (!r || isTerminal(r)) return;
  cancelled.add(id);
  patchRun(id, { status: 'cancelled' });
  if (r.messageId) patchMessage(r.convId, r.messageId, (m) => ({ ...m, status: 'interrupted', error: '중지됨' }));
}

function earlierActive(r: Run) {
  return Object.values(getState().runs).some((o) => o.id !== r.id && o.botId === r.botId && o.convId === r.convId && !isTerminal(o) && o.createdAt < r.createdAt);
}

function textLen(parts: Part[]) { return parts.reduce((a, p) => a + (p.kind === 'text' ? p.text.length : 0), 0); }

/** Drive a run from whatever persisted status it is in. Safe to call repeatedly. */
async function drive(id: string) {
  if (driving.has(id)) return;
  driving.add(id);
  try {
    for (;;) {
      const r = getState().runs[id];
      if (!r || isTerminal(r) || cancelled.has(id)) return;
      if (connState() !== 'online') return;            // blocked; resumed by syncConnection
      if (earlierActive(r)) { await sleep(150); continue; } // one run at a time per bot per conversation

      if (r.status === 'queued') {
        setEph({ ackUntil: { ...getState().eph.ackUntil, [r.botId]: Date.now() + ACK_MS } });
        patchRun(id, { status: 'acknowledging' });
        await sleep(ACK_MS);
        continue;
      }
      if (r.status === 'acknowledging' || (r.status === 'thinking' && !r.messageId) || (r.status === 'working' && !r.messageId)) {
        patchRun(id, { status: 'thinking' });
        const t0 = Date.now();
        const s = getState();
        const conv = s.convs.find((c) => c.id === r.convId)!;
        const bot = s.bots.find((b) => b.id === r.botId);
        const trigger = s.messages[r.convId]?.find((m) => m.id === r.triggerId);
        if (!bot || !trigger || !conv) { patchRun(id, { status: 'error', error: '대상이 없어요' }); return; }
        const fromBot = trigger.author.type === 'bot' ? s.bots.find((b) => trigger.author.type === 'bot' && b.id === trigger.author.botId) : null;
        const raw = r.input ?? trigger.parts.map((p) => (p.kind === 'text' ? p.text : '')).join(' ');
        let out;
        try {
          out = await plan({ bot, bots: s.bots, conv, trigger, input: stripMentions(raw, s.bots), history: s.messages[r.convId] ?? [], srs: s.srs, settings: s.settings, seed: r.id, fromBot });
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          patchRun(id, { status: 'error', error: err });
          addMessage({ id: uid('m_'), convId: r.convId, author: { type: 'bot', botId: r.botId }, createdAt: Date.now(), seq: bumpSeq(), status: 'interrupted', runId: id, error: err,
            parts: [{ kind: 'text', text: `작업 중 오류가 났어요: ${err}` }, { kind: 'actions', actions: [{ label: '다시 시도', send: '__retry:' + id }] }] });
          return;
        }
        await sleep(Math.max(0, MIN_THINK_MS - (Date.now() - t0)));
        if (cancelled.has(id) || getState().runs[id]?.status === 'cancelled') return;
        if (out.focus) update((st) => ({ ...st, convs: st.convs.map((c) => (c.id === r.convId ? { ...c, focus: out.focus } : c)) }));
        const mid = uid('m_');
        addMessage({ id: mid, convId: r.convId, author: { type: 'bot', botId: r.botId }, createdAt: Date.now(), seq: bumpSeq(), status: 'streaming', parts: out.parts, runId: id, revealed: 0 });
        patchRun(id, { status: 'working', messageId: mid, plan: out.parts, followups: out.followups });
        continue;
      }
      if (r.status === 'working' && r.messageId) {
        const msg = getState().messages[r.convId]?.find((m) => m.id === r.messageId);
        if (!msg) { patchRun(id, { status: 'error', error: '메시지가 사라졌어요' }); return; }
        const total = textLen(msg.parts);
        let revealed = msg.revealed ?? 0;
        let last = performance.now();
        while (revealed < total) {
          await sleep(32);
          if (cancelled.has(id) || connState() !== 'online') return;
          const now = performance.now();
          const cps = getState().settings.streamCps;
          revealed = Math.min(total, revealed + Math.max(1, Math.round(((now - last) / 1000) * cps)));
          last = now;
          const rv = revealed;
          patchMessage(r.convId, r.messageId, (m) => ({ ...m, revealed: rv }));
        }
        patchMessage(r.convId, r.messageId, (m) => ({ ...m, status: 'complete', revealed: total }));
        patchRun(id, { status: 'completed' });
        setEph({ completedUntil: { ...getState().eph.completedUntil, [r.botId]: Date.now() + COMPLETE_MS } });
        setTimeout(() => setEph({}), COMPLETE_MS + 20);
        for (const f of r.followups ?? []) {
          await sleep(250);
          startRun(r.convId, f.botId, r.messageId, f.text);
        }
        return;
      }
      return;
    }
  } finally { driving.delete(id); }
}

function bumpSeq() { let n = 0; update((s) => { n = s.seq + 1; return { ...s, seq: n }; }); return n; }

export function retryRun(runId: string) {
  const r = getState().runs[runId];
  if (!r) return;
  startRun(r.convId, r.botId, r.triggerId, r.input);
}

/** Called once on startup: reconcile persisted state after a reload. */
export function resumeAfterReload() {
  const s = getState();
  const open = Object.values(s.runs).filter((r) => !isTerminal(r));
  // Messages left "streaming" by a run that no longer exists are marked interrupted, never "complete".
  for (const [cid, list] of Object.entries(s.messages)) {
    for (const m of list) {
      if (m.status === 'streaming' && (!m.runId || !s.runs[m.runId] || isTerminal(s.runs[m.runId]))) {
        patchMessage(cid, m.id, (x) => ({ ...x, status: 'interrupted', error: '새로고침으로 중단됨' }));
      }
    }
  }
  if (open.length) toast(`진행 중이던 답변 ${open.length}개를 이어서 받아요`);
  syncConnectionInitial();
  open.forEach((r) => void drive(r.id));
  flushOutbox();
}

function syncConnectionInitial() {
  setEph({ conn: wantOnline() ? 'online' : 'offline' });
  window.addEventListener('online', syncConnection);
  window.addEventListener('offline', syncConnection);
}

// ------------------------------------------------------------------ presence
export function botPresence(botId: string): import('./types').BotState {
  const s = getState();
  const now = Date.now();
  const runs = Object.values(s.runs).filter((r) => r.botId === botId);
  const active = runs.filter((r) => !isTerminal(r));
  if (active.length) {
    if (s.eph.conn !== 'online') return 'blocked';
    if ((s.eph.ackUntil[botId] ?? 0) > now) return 'acknowledging';
    if (active.some((r) => r.status === 'working')) return 'working';
    return active.some((r) => r.status === 'acknowledging') ? 'acknowledging' : 'thinking';
  }
  if ((s.eph.completedUntil[botId] ?? 0) > now) return 'completed';
  const latest = runs.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (latest?.status === 'error') return 'error';
  // Waiting: this bot's latest message in some conversation holds an unanswered quiz.
  for (const c of s.convs) {
    if (!c.botIds.includes(botId)) continue;
    const list = s.messages[c.id] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.author.type === 'bot' && m.author.botId === botId) {
        if (m.status === 'complete' && m.parts.some((p) => p.kind === 'quiz' && !p.submitted)) return 'waiting';
        break;
      }
    }
  }
  return 'idle';
}

export function activeRunFor(convId: string): Run | undefined {
  return Object.values(getState().runs).find((r) => r.convId === convId && !isTerminal(r));
}
