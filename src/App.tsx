import { useEffect } from 'react';
import { useStore, update, setEph, getState, shallowArr, uid, addMessage, toast } from './lib/store';
import { loadIndex } from './lib/bank';
import { botPresence } from './lib/runtime';
import { Sidebar, MOD } from './components/Sidebar';
import { Transcript } from './components/Transcript';
import { Composer } from './components/Composer';
import { DialogHost, DetailsPanel } from './components/Dialogs';
import { Avatar, STATE_LABEL } from './components/Avatar';
import { IconMenu, IconInfo, IconUsers } from './components/Icons';
import { openConv } from './lib/nav';
import type { Bot } from './lib/types';

function PresenceChip({ bot }: { bot: Bot }) {
  const st = useStore(() => botPresence(bot.id));
  return <span className="presence-chip"><span className="dot" data-state={st} />{bot.name} {STATE_LABEL[st]}</span>;
}

function Header({ convId }: { convId: string }) {
  const conv = useStore((s) => s.convs.find((c) => c.id === convId));
  const bots = useStore((s) => s.bots.filter((b) => conv?.botIds.includes(b.id)), shallowArr);
  const lead = bots[0];
  const leadState = useStore(() => (lead ? botPresence(lead.id) : 'idle'));
  if (!conv) return null;
  const openDetails = () => lead && setEph({ dialog: getState().eph.dialog?.type === 'details' ? null : { type: 'details', botId: conv.kind === 'dm' ? lead.id : bots.find((b) => b.role === 'coach')?.id ?? lead.id } });
  return (
    <header className="header">
      <button className="icon-btn mobile-only" aria-label="Bot 목록 열기" onClick={() => setEph({ mobileNav: true })}><IconMenu /></button>
      <button className="header-title" onClick={openDetails} aria-label={`${conv.title} 정보`}>
        {conv.kind === 'dm' && lead ? <Avatar bot={lead} size={34} /> : <span className="group-stack" style={{ width: 34, height: 34 }}>{bots.slice(0, 2).map((b) => <Avatar key={b.id} bot={b} size={22} />)}</span>}
        <span style={{ minWidth: 0 }}>
          <h1>{conv.title}</h1>
          <span className="header-sub">
            {conv.kind === 'dm' && lead ? <span className="presence-chip"><span className="dot" data-state={leadState} />{STATE_LABEL[leadState]}{conv.focus ? ` · 단원 고정됨` : ''}</span>
              : <span className="presence-chips">{bots.map((b) => <PresenceChip key={b.id} bot={b} />)}</span>}
          </span>
        </span>
      </button>
      {conv.kind === 'group' && <span className="chip" title="참여 Bot 수"><IconUsers size={13} />&nbsp;{bots.length}</span>}
      <button className="icon-btn" aria-label="정보 패널" title="정보" onClick={openDetails}><IconInfo /></button>
    </header>
  );
}

function ConnectionBanner() {
  const conn = useStore((s) => s.eph.conn);
  const queued = useStore((s) => Object.values(s.messages).reduce((a, l) => a + l.filter((m) => m.status === 'pending').length, 0));
  return (
    <div className="conn" data-state={conn} role="status" aria-live="polite" data-testid="conn-banner">
      {conn === 'offline' && <>연결이 끊겼어요{queued ? ` · 보낼 메시지 ${queued}개 대기 중` : ''} · Bot 작업 일시정지</>}
      {conn === 'reconnecting' && <><span className="spinner" />다시 연결하는 중…</>}
    </div>
  );
}

function useThemeAndMotion() {
  const theme = useStore((s) => s.settings.theme);
  const motion = useStore((s) => s.settings.motion);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => { root.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme; };
    apply();
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => { document.documentElement.dataset.motion = motion; }, [motion]);
}

/** Routines fire while the app is open (no server push yet). */
function useRoutines() {
  useEffect(() => {
    const tick = () => {
      const s = getState();
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      for (const r of s.routines) {
        if (!r.enabled || r.lastFired === today) continue;
        if (now.getHours() * 60 + now.getMinutes() < r.hour * 60 + r.minute) continue;
        update((st) => ({ ...st, routines: st.routines.map((x) => (x.id === r.id ? { ...x, lastFired: today } : x)) }));
        const conv = s.convs.find((c) => c.kind === 'dm' && c.botIds[0] === r.botId);
        if (!conv) continue;
        const due = Object.values(s.srs).filter((e) => e.due <= Date.now()).length;
        addMessage({ id: uid('m_'), convId: conv.id, author: { type: 'bot', botId: r.botId }, createdAt: Date.now(), seq: s.seq + 1, status: 'complete',
          parts: [{ kind: 'event', text: `루틴 · ${r.label}`, tone: 'info' }, { kind: 'text', text: due ? `복습할 문항이 ${due}개 있어요. 지금 볼까요?` : '오늘은 복습할 문항이 없어요. 새 문제를 풀어 볼까요?' }, { kind: 'actions', actions: [{ label: '복습 시작', send: '복습' }] }] });
      }
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape' && getState().eph.mobileNav) { setEph({ mobileNav: false }); document.querySelector<HTMLElement>('button[aria-label="Bot 목록 열기"]')?.focus(); return; }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setEph({ dialog: getState().eph.dialog?.type === 'search' ? null : { type: 'search' } }); return; }
      if (mod && e.key === '.') { e.preventDefault(); update((s) => ({ ...s, ui: { ...s.ui, sidebarCollapsed: !s.ui.sidebarCollapsed } })); return; }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const s = getState();
        const order = [...s.bots].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order).map((b) => `dm-${b.id}`).concat(s.convs.filter((c) => c.kind === 'group').map((c) => c.id)).filter((id) => s.convs.some((c) => c.id === id));
        const i = order.indexOf(s.ui.selectedConvId ?? '');
        const next = order[(i + (e.key === 'ArrowDown' ? 1 : -1) + order.length) % order.length];
        if (next) openConv(next);
      }
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault(); document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const collapsed = useStore((s) => s.ui.sidebarCollapsed);
  const convId = useStore((s) => s.ui.selectedConvId);
  const dialog = useStore((s) => s.eph.dialog);
  const t = useStore((s) => s.eph.toast);
  const bankReady = useStore((s) => s.eph.bankReady);
  useThemeAndMotion();
  useRoutines();
  useShortcuts();
  useEffect(() => { loadIndex().then(() => setEph({ bankReady: true })).catch((e) => toast(String(e.message ?? e))); }, []);
  return (
    <div className={`app${collapsed ? ' collapsed' : ''}`} data-bank={bankReady ? 'ready' : 'loading'}>
      <Sidebar />
      <main className="main">
        {convId ? (
          <>
            <Header convId={convId} />
            <ConnectionBanner />
            <Transcript convId={convId} />
            <Composer convId={convId} />
          </>
        ) : (
          <div className="empty"><h2>Ebbinghaus</h2><p>왼쪽에서 Bot을 고르거나 새 Bot을 만들어 보세요.</p><p><kbd>{MOD}K</kbd> 검색</p></div>
        )}
      </main>
      {dialog?.type === 'details' && <DetailsPanel key={dialog.botId} botId={dialog.botId} />}
      <DialogHost />
      {t && <div className="toast" role="status" key={t.id}>{t.text}</div>}
    </div>
  );
}
