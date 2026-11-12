import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Message, Bot } from '../lib/types';
import { useStore, update, patchMessage, setEph, getState, toast } from '../lib/store';
import { retryMessage, discardMessage } from '../lib/runtime';
import { textOf } from '../lib/engine';
import { Avatar } from './Avatar';
import { Markdown } from './Markdown';
import { renderPart } from './Cards';
import { Popover, MenuItem } from './Popover';
import { IconReply, IconCopy, IconSmile, IconMore, IconDown } from './Icons';

const EMOJI = ['👍', '❤️', '😂', '🎉', '🤔', '👀'];
const GROUP_MS = 5 * 60_000;

function fmtTime(t: number) { return new Date(t).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }); }

export function jumpTo(id: string) {
  const el = document.querySelector(`[data-mid="${CSS.escape(id)}"]`);
  if (!el) { toast('원본 메시지를 찾을 수 없어요'); return; }
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  setEph({ highlight: id });
  setTimeout(() => { if (getState().eph.highlight === id) setEph({ highlight: null }); }, 1700);
}

function revealParts(m: Message) {
  // During streaming, show text up to `revealed` chars; cards appear once text is done.
  const streaming = m.status === 'streaming' || m.status === 'interrupted';
  let budget = streaming ? m.revealed ?? 0 : Infinity;
  const out: { text?: string; idx: number }[] = [];
  let textDone = true;
  m.parts.forEach((p, idx) => {
    if (p.kind === 'text') {
      if (budget <= 0) { textDone = false; return; }
      const t = p.text.slice(0, budget);
      budget -= p.text.length;
      if (t.length < p.text.length) textDone = false;
      out.push({ text: t, idx });
    } else if (textDone && (m.status !== 'streaming' || budget >= 0)) out.push({ idx });
  });
  return { out, textDone };
}

const MessageRow = memo(function MessageRow({ m, grouped, bot, isNew, highlight, botNames, quoted }: {
  m: Message; grouped: boolean; bot?: Bot; isNew: boolean; highlight: boolean; botNames: string[]; quoted?: { author: string; text: string } | null;
}) {
  const [menu, setMenu] = useState<{ el: HTMLElement; kind: 'emoji' | 'more' } | null>(null);
  const [bumped, setBumped] = useState<string | null>(null);
  if (m.author.type === 'system') {
    return <div className="msg system" data-mid={m.id}>{m.parts.map((p, i) => renderPart(m, p, i))}</div>;
  }
  const isUser = m.author.type === 'user';
  const { out, textDone } = revealParts(m);
  const react = (e: string) => {
    patchMessage(m.convId, m.id, (x) => {
      const r = { ...(x.reactions ?? {}) };
      if (r[e]) delete r[e]; else r[e] = 1;
      return { ...x, reactions: r };
    });
    setBumped(e); setTimeout(() => setBumped(null), 400);
  };
  const reply = () => {
    update((s) => ({ ...s, ui: { ...s.ui, replyTo: { ...s.ui.replyTo, [m.convId]: m.id } } }));
    document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(textOf(m)); toast('복사했어요'); } catch { toast('복사하지 못했어요'); }
  };
  const content = out.map(({ text, idx }) => {
    const p = m.parts[idx];
    if (p.kind === 'text') {
      const last = m.status === 'streaming' && !textDone && idx === out[out.length - 1].idx;
      return (
        <div key={idx} className={isUser ? 'bubble' : undefined}>
          <Markdown text={text ?? ''} mentions={botNames} />
          {last && <span className="caret" aria-hidden="true" />}
        </div>
      );
    }
    return renderPart(m, p, idx);
  });
  return (
    <div className={`msg ${isUser ? 'user' : 'bot'}${grouped ? ' grouped' : ''}${m.status === 'pending' ? ' pending' : ''}${isNew ? ' msg-new' : ''}${highlight ? ' highlight' : ''}`}
      data-mid={m.id} data-status={m.status} data-testid={isUser ? 'user-msg' : 'bot-msg'} aria-busy={m.status === 'streaming'}>
      <div className="msg-gutter">{bot && <Avatar bot={bot} size={30} />}</div>
      <div className="msg-body">
        {!isUser && !grouped && bot && (
          <div className="msg-head"><span className="msg-author" style={{ color: bot.color }}>{bot.name}</span><span className="msg-time">{fmtTime(m.createdAt)}</span></div>
        )}
        {quoted && (
          <button className="reply-ref" onClick={() => jumpTo(m.replyTo!)} aria-label="원본 메시지로 이동">
            <span className="reply-line" /><b>{quoted.author}</b><span>{quoted.text || '카드'}</span>
          </button>
        )}
        {content}
        {m.status === 'streaming' && out.length === 0 && <span className="caret" aria-hidden="true" />}
        {m.status === 'interrupted' && <div className="interrupted-note">{m.error ?? '중단됨'}</div>}
        {m.reactions && Object.keys(m.reactions).length > 0 && (
          <div className="reactions">
            {Object.keys(m.reactions).map((e) => (
              <button key={e} className={`reaction${bumped === e ? ' bump' : ''}`} aria-pressed="true" onClick={() => react(e)} aria-label={`${e} 반응 취소`}>{e} <span>1</span></button>
            ))}
          </div>
        )}
        {isUser && (m.status === 'pending' || m.status === 'failed') && (
          <div className={`msg-status${m.status === 'failed' ? ' failed' : ''}`} role="status">
            {m.status === 'pending' ? '보내는 중…' : <>{m.error ?? '보내지 못했어요'} · <button onClick={() => retryMessage(m.convId, m.id)}>다시 보내기</button> · <button onClick={() => discardMessage(m.convId, m.id)}>삭제</button></>}
          </div>
        )}
        {isUser && m.status === 'sent' && !grouped && <div className="msg-status">{fmtTime(m.createdAt)}</div>}
      </div>
      {m.status !== 'pending' && (
        <div className={`msg-actions${menu ? ' open' : ''}`} role="toolbar" aria-label="메시지 동작">
          <button className="icon-btn" aria-label="반응 추가" title="반응" onClick={(e) => setMenu({ el: e.currentTarget, kind: 'emoji' })}><IconSmile size={16} /></button>
          <button className="icon-btn" aria-label="답장" title="답장" onClick={reply}><IconReply size={16} /></button>
          <button className="icon-btn" aria-label="복사" title="복사" onClick={copy}><IconCopy size={16} /></button>
          <button className="icon-btn" aria-label="더보기" title="더보기" aria-haspopup="menu" onClick={(e) => setMenu({ el: e.currentTarget, kind: 'more' })}><IconMore size={16} /></button>
        </div>
      )}
      {menu?.kind === 'emoji' && (
        <Popover anchor={menu.el} align="end" onClose={() => setMenu(null)} label="반응 고르기">
          <div className="emoji-row">{EMOJI.map((e) => <button key={e} role="menuitem" aria-label={e} onClick={() => { react(e); setMenu(null); }}>{e}</button>)}</div>
        </Popover>
      )}
      {menu?.kind === 'more' && (
        <Popover anchor={menu.el} align="end" onClose={() => setMenu(null)} label="메시지 메뉴">
          <MenuItem onSelect={() => { setMenu(null); reply(); }}><IconReply size={15} />답장</MenuItem>
          <MenuItem onSelect={() => { setMenu(null); void copy(); }}><IconCopy size={15} />텍스트 복사</MenuItem>
          <MenuItem onSelect={() => { setMenu(null); void navigator.clipboard?.writeText(m.id).catch(() => {}); toast('메시지 ID를 복사했어요'); }}>메시지 ID 복사</MenuItem>
          {m.replyTo && <MenuItem onSelect={() => { setMenu(null); jumpTo(m.replyTo!); }}>원본으로 이동</MenuItem>}
        </Popover>
      )}
    </div>
  );
});

export function Transcript({ convId }: { convId: string }) {
  const messages = useStore((s) => s.messages[convId] ?? []);
  const bots = useStore((s) => s.bots);
  const highlight = useStore((s) => s.eph.highlight);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const seenCount = useRef(messages.length);
  const mountedAt = useRef(Date.now());
  const [newCount, setNewCount] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toBottom = useCallback((smooth = false) => {
    const el = scrollRef.current; if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    stuck.current = true; setNewCount(0);
  }, []);

  // Restore scroll per conversation (reload, switching back).
  useLayoutEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const saved = getState().ui.scroll[convId];
    if (saved === undefined || saved < 0) { el.scrollTop = el.scrollHeight; stuck.current = true; }
    else { el.scrollTop = saved; stuck.current = el.scrollHeight - el.clientHeight - saved < 80; }
    seenCount.current = (getState().messages[convId] ?? []).length;
    mountedAt.current = Date.now();
    setNewCount(0);
  }, [convId]);

  // Keep pinned to bottom while content grows (streaming, cards loading) only if the user is there.
  useEffect(() => {
    const inner = innerRef.current; if (!inner) return;
    const ro = new ResizeObserver(() => { if (stuck.current) { const el = scrollRef.current!; el.scrollTop = el.scrollHeight; } });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [convId]);

  // New messages while scrolled up → counter on the jump button, no forced jump.
  useEffect(() => {
    const added = messages.length - seenCount.current;
    seenCount.current = messages.length;
    if (added <= 0) return;
    const last = messages[messages.length - 1];
    if (last?.author.type === 'user' && last.status === 'pending') { toBottom(); return; } // own message: always show it
    if (!stuck.current) setNewCount((n) => n + added);
  }, [messages, toBottom]);

  useEffect(() => {
    const h = () => toBottom(true);
    window.addEventListener('ebb:to-bottom', h);
    return () => window.removeEventListener('ebb:to-bottom', h);
  }, [toBottom]);

  const onScroll = () => {
    const el = scrollRef.current!;
    const dist = el.scrollHeight - el.clientHeight - el.scrollTop;
    stuck.current = dist < 80;
    if (stuck.current && newCount) setNewCount(0);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const v = stuck.current ? -1 : Math.round(el.scrollTop);
      update((s) => (s.ui.scroll[convId] === v ? s : { ...s, ui: { ...s.ui, scroll: { ...s.ui.scroll, [convId]: v } } }));
    }, 200);
  };

  const botNames = bots.map((b) => b.name);
  const byId = new Map(messages.map((m) => [m.id, m]));
  return (
    <div className="transcript" ref={scrollRef} onScroll={onScroll} data-testid="transcript" aria-live="polite" aria-relevant="additions">
      <div className="transcript-inner conv-enter" ref={innerRef} key={convId}>
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const sameAuthor = prev && prev.author.type === m.author.type && (m.author.type !== 'bot' || (prev.author.type === 'bot' && prev.author.botId === m.author.botId));
          const grouped = !!sameAuthor && m.author.type !== 'system' && m.createdAt - prev.createdAt < GROUP_MS && !m.replyTo;
          const bot = m.author.type === 'bot' ? bots.find((b) => b.id === (m.author as { botId: string }).botId) : undefined;
          const q = m.replyTo ? byId.get(m.replyTo) : null;
          const quoted = q ? { author: q.author.type === 'user' ? '나' : q.author.type === 'bot' ? bots.find((b) => q.author.type === 'bot' && b.id === q.author.botId)?.name ?? 'Bot' : '시스템', text: textOf(q).replace(/\*\*|`/g, '').replace(/\s+/g, ' ').slice(0, 80) } : m.replyTo ? { author: '', text: '삭제된 메시지' } : null;
          return <MessageRow key={m.id} m={m} grouped={grouped} bot={bot} isNew={m.createdAt > mountedAt.current} highlight={highlight === m.id} botNames={botNames} quoted={quoted} />;
        })}
        <div style={{ height: 8 }} />
      </div>
      <button className={`jump-latest${newCount > 0 || !stuck.current ? (newCount > 0 ? ' show' : '') : ''}`} onClick={() => toBottom(true)} aria-hidden={newCount === 0} tabIndex={newCount ? 0 : -1} data-testid="jump-latest">
        <IconDown size={15} />새 메시지 {newCount}개
      </button>
    </div>
  );
}
