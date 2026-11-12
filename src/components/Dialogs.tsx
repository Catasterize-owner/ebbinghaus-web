import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore, update, setEph, getState, uid, resetAll, toast, askConfirm } from '../lib/store';
import { getIndex, loadIndex } from '../lib/bank';
import { syncConnection } from '../lib/runtime';
import { textOf } from '../lib/engine';
import { welcomeText } from '../lib/seed';
import { openConv } from '../lib/nav';
import type { Bot, BotShape, BotState, Conversation, Settings } from '../lib/types';
import { AvatarView, Avatar } from './Avatar';
import { IconX, IconSearch } from './Icons';
import { jumpTo } from './Transcript';

/** Modal with focus trap, Escape/scrim close, coordinated exit animation and focus return. */
export function Modal({ title, onClose, children, footer, className = '', labelledBy }: { title?: string; onClose: () => void; children: ReactNode; footer?: (close: () => void) => ReactNode; className?: string; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const opener = useRef<HTMLElement | null>(document.activeElement as HTMLElement);
  const close = () => {
    if (closing) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
    setClosing(true);
    setTimeout(() => { onClose(); opener.current?.focus?.({ preventScroll: true }); }, reduced ? 0 : 150);
  };
  useEffect(() => {
    const el = ref.current!;
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])'));
    (el.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(
    <div className={`scrim${closing ? ' closing' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={ref} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} aria-labelledby={labelledBy} data-testid="dialog">
        {title && <div className="dialog-head"><h2>{title}</h2><button className="icon-btn" aria-label="닫기" onClick={close}><IconX /></button></div>}
        {children}
        {footer && <div className="dialog-foot">{footer(close)}</div>}
      </div>
    </div>,
    document.body,
  );
}

const COLORS = ['#e8e8e8', '#7aa2ff', '#5fd3a5', '#ff9f6b', '#c792ff', '#f2c94c', '#ff6b8b', '#4dd0e1'];
const SHAPES: BotShape[] = ['blob', 'pill', 'drop', 'square'];
const STATES: BotState[] = ['idle', 'acknowledging', 'thinking', 'working', 'waiting', 'blocked', 'completed', 'error'];

function BotEditor({ botId }: { botId?: string }) {
  const existing = useStore((s) => s.bots.find((b) => b.id === botId));
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? COLORS[1]);
  const [shape, setShape] = useState<BotShape>(existing?.shape ?? 'blob');
  const [persona, setPersona] = useState(existing?.persona ?? '');
  const [subjects, setSubjects] = useState<string[]>(existing?.subjects ?? []);
  const [preview, setPreview] = useState<BotState>('idle');
  const [idx, setIdx] = useState(getIndex());
  useEffect(() => { if (!idx) loadIndex().then(setIdx).catch(() => {}); }, [idx]);
  const taken = useStore((s) => s.bots.some((b) => b.name === name.trim() && b.id !== botId));
  const valid = name.trim().length > 0 && name.trim().length <= 12 && !/[\s@]/.test(name.trim()) && !taken && (existing?.role === 'coach' || subjects.length > 0);
  const save = (close: () => void) => {
    if (!valid) return;
    const n = name.trim();
    if (existing) {
      update((s) => ({ ...s, bots: s.bots.map((b) => (b.id === existing.id ? { ...b, name: n, color, shape, persona: persona.trim() || b.persona, subjects } : b)), convs: s.convs.map((c) => (c.kind === 'dm' && c.botIds[0] === existing.id ? { ...c, title: n } : c)) }));
      toast('Bot을 저장했어요');
      close();
    } else {
      const id = uid('bot-');
      const s0 = getState();
      const bot: Bot = { id, name: n, color, shape, role: 'tutor', subjects, persona: persona.trim() || '새로 만든 과목 Bot이에요.', pinned: false, order: Math.max(0, ...s0.bots.map((b) => b.order)) + 1, skills: { quiz: true, hints: true, review: true }, createdAt: Date.now() };
      const conv: Conversation = { id: `dm-${id}`, kind: 'dm', botIds: [id], title: n, createdAt: Date.now(), lastActivity: Date.now(), unread: 0, focus: null };
      update((s) => ({ ...s, bots: [...s.bots, bot], convs: [...s.convs, conv], seq: s.seq + 1, messages: { ...s.messages, [conv.id]: [{ id: uid('m_'), convId: conv.id, author: { type: 'bot', botId: id }, createdAt: Date.now(), seq: s.seq + 1, status: 'complete', parts: [{ kind: 'text', text: welcomeText(bot) }, { kind: 'actions', actions: [{ label: '문제 내 줘', send: '문제' }, { label: '단원 보기', send: '단원' }] }] }] } }));
      close();
      setTimeout(() => openConv(conv.id), 160);
    }
  };
  return (
    <Modal title={existing ? 'Bot 편집' : '새 Bot 만들기'} onClose={() => setEph({ dialog: null })} footer={(close: () => void) => (
      <><button className="btn btn-ghost" onClick={close}>취소</button><button className="btn btn-primary" disabled={!valid} onClick={() => save(close)} data-testid="bot-save">{existing ? '저장' : '만들기'}</button></>
    )}>
      <div className="dialog-body">
        <div className="preview-avatar">
          <AvatarView bot={{ name: name || 'Bot', color, shape }} state={preview} size={72} ring />
          <div className="seg" role="radiogroup" aria-label="상태 미리보기" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {STATES.map((st) => <button key={st} role="radio" aria-checked={preview === st} onClick={() => setPreview(st)} style={{ fontSize: 11, padding: '3px 7px' }}>{st}</button>)}
          </div>
        </div>
        <label className="field"><span>이름 (공백 없이 12자 이내 · @이름으로 불러요)</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} data-autofocus maxLength={12} placeholder="예: 화학" data-testid="bot-name" />
          {taken && <small style={{ color: 'var(--danger)' }}>이미 있는 이름이에요</small>}
        </label>
        <div className="field"><span>색</span>
          <div className="swatches" role="radiogroup" aria-label="색">{COLORS.map((c) => <button key={c} role="radio" aria-checked={color === c} aria-label={c} className="swatch" style={{ background: c }} onClick={() => setColor(c)} />)}</div>
        </div>
        <div className="field"><span>모양</span>
          <div className="swatches" role="radiogroup" aria-label="모양">{SHAPES.map((sh) => <button key={sh} role="radio" aria-checked={shape === sh} aria-label={sh} className="shape-opt" onClick={() => setShape(sh)}><AvatarView bot={{ name: sh, color, shape: sh }} state="idle" size={28} /></button>)}</div>
        </div>
        <label className="field"><span>소개</span><textarea rows={2} value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="이 Bot이 맡을 일" /></label>
        {existing?.role !== 'coach' && (
          <div className="field"><span>과목 (문항은행) · {subjects.length}개 선택</span>
            <div className="check-grid">
              {idx ? idx.subjects.map((s) => (
                <label key={s.id} className="check"><input type="checkbox" checked={subjects.includes(s.id)} onChange={(e) => setSubjects(e.target.checked ? [...subjects, s.id] : subjects.filter((x) => x !== s.id))} data-testid={`subj-${s.id}`} />{s.name} <small style={{ color: 'var(--text-3)' }}>{s.count}</small></label>
              )) : <div className="skeleton" />}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function NewGroup() {
  const bots = useStore((s) => s.bots);
  const [title, setTitle] = useState('');
  const [sel, setSel] = useState<string[]>(['coach']);
  const valid = sel.length >= 2;
  const create = (close: () => void) => {
    if (!valid) return;
    const id = uid('group-');
    const names = bots.filter((b) => sel.includes(b.id)).map((b) => b.name);
    const conv: Conversation = { id, kind: 'group', botIds: sel, title: title.trim() || names.join(', '), createdAt: Date.now(), lastActivity: Date.now(), unread: 0, focus: null };
    update((s) => ({ ...s, convs: [...s.convs, conv], seq: s.seq + 1, messages: { ...s.messages, [id]: [{ id: uid('m_'), convId: id, author: { type: 'system' }, createdAt: Date.now(), seq: s.seq + 1, status: 'sent', parts: [{ kind: 'event', text: `${names.join(', ')}이(가) 그룹에 참여했어요`, tone: 'info' }] }] } }));
    close();
    setTimeout(() => openConv(id), 160);
  };
  return (
    <Modal title="새 그룹" onClose={() => setEph({ dialog: null })} footer={(close: () => void) => (
      <><button className="btn btn-ghost" onClick={close}>취소</button><button className="btn btn-primary" disabled={!valid} onClick={() => create(close)} data-testid="group-create">그룹 만들기</button></>
    )}>
      <div className="dialog-body">
        <label className="field"><span>그룹 이름 (선택)</span><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 수능 대비" data-autofocus /></label>
        <div className="field"><span>참여할 Bot (2개 이상)</span>
          <div className="check-grid">
            {bots.slice().sort((a, b) => a.order - b.order).map((b) => (
              <label key={b.id} className="check"><input type="checkbox" checked={sel.includes(b.id)} onChange={(e) => setSel(e.target.checked ? [...sel, b.id] : sel.filter((x) => x !== b.id))} /><AvatarView bot={b} state="idle" size={20} />{b.name}</label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Seg<K extends keyof Settings>({ st, set, k, opts }: { st: Settings; set: (p: Partial<Settings>) => void; k: K; opts: [Settings[K], string][] }) {
  return <div className="seg" role="radiogroup">{opts.map(([v, l]) => <button key={String(v)} role="radio" aria-checked={st[k] === v} onClick={() => set({ [k]: v } as Partial<Settings>)}>{l}</button>)}</div>;
}
function Switch({ st, set, k, label, hint }: { st: Settings; set: (p: Partial<Settings>) => void; k: 'simulateOffline' | 'failNextSend'; label: string; hint: string }) {
  return <div className="switch-row"><div>{label}<small>{hint}</small></div><button className="switch" role="switch" aria-checked={st[k]} aria-label={label} onClick={() => set({ [k]: !st[k] })} data-testid={`switch-${k}`} /></div>;
}

function SettingsDialog() {
  const st = useStore((s) => s.settings);
  const set = (p: Partial<Settings>) => { update((s) => ({ ...s, settings: { ...s.settings, ...p } })); if ('simulateOffline' in p) setTimeout(syncConnection, 0); };
  return (
    <Modal title="설정" onClose={() => setEph({ dialog: null })}>
      <div className="dialog-body">
        <div className="switch-row"><div>테마</div><Seg st={st} set={set} k="theme" opts={[['dark', '다크'], ['light', '라이트'], ['system', '시스템']]} /></div>
        <div className="switch-row"><div>움직임<small>‘줄이기’는 반복 애니메이션을 끄고 상태만 표시</small></div><Seg st={st} set={set} k="motion" opts={[['system', '시스템'], ['reduced', '줄이기'], ['full', '전체']]} /></div>
        <div className="switch-row"><div>해설 방식<small>친절: 풀이 단계까지 · 평가원식: 해설만</small></div><Seg st={st} set={set} k="explanation" opts={[['friendly', '친절'], ['official', '평가원식']]} /></div>
        <div className="switch-row"><div>답변 표시 속도<small>초당 글자 수</small></div><Seg st={st} set={set} k="streamCps" opts={[[45, '느리게'], [90, '보통'], [240, '빠르게']]} /></div>
        <div className="details-sec" style={{ padding: '12px 0 0', gap: 12 }}>
          <h3>개발자 · 연결 테스트</h3>
          <Switch st={st} set={set} k="simulateOffline" label="오프라인 흉내" hint="전송은 대기열에 쌓이고, 다시 켜면 이어서 보내요" />
          <Switch st={st} set={set} k="failNextSend" label="다음 전송 실패시키기" hint="실패 → 다시 보내기 흐름 확인용" />
        </div>
        <div className="details-sec" style={{ padding: '12px 0 0' }}>
          <h3>데이터</h3>
          <small style={{ color: 'var(--text-3)' }}>모든 기록은 이 브라우저(localStorage)에만 저장돼요. 계정·서버 동기화는 아직 연결 전이에요.</small>
          <div><button className="btn btn-danger" onClick={() => askConfirm('모든 대화·기록·Bot을 처음 상태로 되돌릴까요? 되돌릴 수 없어요.', '초기화', () => { resetAll(); openConv('dm-coach', { replace: true }); })}>처음 상태로 초기화</button></div>
        </div>
      </div>
    </Modal>
  );
}

function SearchPalette() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const s = getState();
  const results = useMemo(() => {
    const t = q.trim();
    const out: { group: string; key: string; label: string; sub?: string; bot?: Bot; go: () => void }[] = [];
    const bots = s.bots.slice().sort((a, b) => a.order - b.order);
    for (const b of bots) if (!t || b.name.includes(t) || b.persona.includes(t)) out.push({ group: 'Bot', key: 'b' + b.id, label: b.name, sub: b.persona, bot: b, go: () => openConv(`dm-${b.id}`) });
    for (const c of s.convs.filter((c) => c.kind === 'group')) if (!t || c.title.includes(t)) out.push({ group: '그룹', key: 'c' + c.id, label: c.title, go: () => openConv(c.id) });
    if (t) {
      let n = 0;
      for (const [cid, list] of Object.entries(s.messages)) {
        for (const m of list) {
          const tx = textOf(m);
          const i = tx.indexOf(t);
          if (i >= 0 && n < 30) {
            n++;
            const conv = s.convs.find((c) => c.id === cid);
            out.push({ group: '메시지', key: 'm' + m.id, label: tx.slice(Math.max(0, i - 20), i + 60), sub: conv?.title, go: () => { openConv(cid); setTimeout(() => jumpTo(m.id), 250); } });
          }
        }
      }
    }
    return out;
  }, [q, s]);
  const go = (i: number) => { const r = results[i]; if (!r) return; setEph({ dialog: null }); r.go(); };
  let lastGroup = '';
  return (
    <Modal onClose={() => setEph({ dialog: null })} className="palette" title={undefined}>
      <div className="palette-input">
        <IconSearch />
        <input data-autofocus value={q} placeholder="Bot, 그룹, 메시지 검색" aria-label="검색어" onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); go(active); }
          }} />
        <kbd>Esc</kbd>
      </div>
      <div className="palette-list" role="listbox">
        {results.length === 0 && <div className="palette-empty">“{q}” 결과가 없어요</div>}
        {results.map((r, i) => {
          const head = r.group !== lastGroup ? <div className="palette-group">{r.group}</div> : null;
          lastGroup = r.group;
          return (
            <div key={r.key}>{head}
              <button className="palette-item" role="option" aria-selected={i === active} data-active={i === active} onMouseMove={() => setActive(i)} onClick={() => go(i)}>
                {r.bot ? <Avatar bot={r.bot} size={24} /> : null}
                <span className="pi-text">{r.label}{r.sub && <small>{r.sub}</small>}</span>
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function DetailsPanel({ botId }: { botId: string }) {
  const bot = useStore((s) => s.bots.find((b) => b.id === botId));
  const routines = useStore((s) => s.routines.filter((r) => r.botId === botId), (a, b) => a.length === b.length && a.every((x, i) => x === b[i]));
  const srs = useStore((s) => s.srs);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.scrim, .popover')) setEph({ dialog: null }); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  if (!bot) return null;
  const idx = getIndex();
  const solved = Object.values(srs).filter((e) => bot.role === 'coach' || bot.subjects.includes(e.item.subject));
  const setSkill = (k: keyof Bot['skills']) => update((s) => ({ ...s, bots: s.bots.map((b) => (b.id === botId ? { ...b, skills: { ...b.skills, [k]: !b.skills[k] } } : b)) }));
  return (
    <aside className="details" ref={ref} aria-label={`${bot.name} 정보`} data-testid="details">
      <div className="details-head"><button className="icon-btn" aria-label="정보 닫기" onClick={() => setEph({ dialog: null })}><IconX /></button></div>
      <div className="details-hero">
        <Avatar bot={bot} size={72} ring />
        <h2>{bot.name}</h2>
        <p>{bot.persona}</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setEph({ dialog: { type: 'bot', botId } })}>편집</button>
          <button className="btn btn-ghost" onClick={() => { update((s) => ({ ...s, bots: s.bots.map((b) => (b.id === botId ? { ...b, pinned: !b.pinned } : b)) })); }}>{bot.pinned ? '고정 해제' : '고정'}</button>
        </div>
      </div>
      <div className="details-sec">
        <h3>기능 (Skills)</h3>
        {([['quiz', '문제 내기', '문항은행에서 문항을 골라 내고 채점'], ['hints', '힌트', '문항의 힌트·풀이 단계를 하나씩'], ['review', '복습', '망각 곡선 일정으로 다시 보여 주기']] as const).map(([k, l, h]) => (
          <div key={k} className="switch-row"><div>{l}<small>{h}</small></div><button className="switch" role="switch" aria-label={l} aria-checked={bot.skills[k]} onClick={() => setSkill(k)} /></div>
        ))}
      </div>
      <div className="details-sec">
        <h3>루틴 (Routines)</h3>
        {routines.length === 0 && <small style={{ color: 'var(--text-3)' }}>이 Bot에는 루틴이 없어요.</small>}
        {routines.map((r) => (
          <div key={r.id} className="routine">
            <span>{r.label}</span>
            <input type="time" value={`${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}`} aria-label="알림 시각"
              onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); update((s) => ({ ...s, routines: s.routines.map((x) => (x.id === r.id ? { ...x, hour: h, minute: m } : x)) })); }} />
            <button className="switch" role="switch" aria-label={`${r.label} 켜기`} aria-checked={r.enabled} onClick={() => update((s) => ({ ...s, routines: s.routines.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)) }))} />
          </div>
        ))}
        <button className="btn btn-ghost" onClick={() => update((s) => ({ ...s, routines: [...s.routines, { id: uid('r_'), botId, label: '복습 알림', hour: 19, minute: 0, enabled: true }] }))}>루틴 추가</button>
        <small style={{ color: 'var(--text-3)' }}>앱이 열려 있을 때 그 시각에 Bot이 복습 메시지를 보내요. 푸시 알림은 서버 연결 후 가능해요.</small>
      </div>
      {bot.subjects.length > 0 && (
        <div className="details-sec">
          <h3>과목</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{bot.subjects.map((s) => <span key={s} className="chip">{idx?.subjects.find((x) => x.id === s)?.name ?? s}</span>)}</div>
        </div>
      )}
      <div className="details-sec">
        <h3>기록</h3>
        <small style={{ color: 'var(--text-2)' }}>푼 문항 {solved.length}개 · 정답 {solved.filter((e) => e.lastResult).length}개</small>
      </div>
      <div className="details-sec">
        <h3>상태 모션</h3>
        <div className="state-strip">{STATES.map((st) => <figure key={st}><AvatarView bot={bot} state={st} size={34} />{st}</figure>)}</div>
      </div>
    </aside>
  );
}

function ConfirmDialog({ text, ok, onOk }: { text: string; ok: string; onOk: () => void }) {
  return (
    <Modal title="확인" onClose={() => setEph({ dialog: null })} footer={(close) => (
      <><button className="btn btn-ghost" onClick={close} data-autofocus>취소</button><button className="btn btn-danger" onClick={() => { close(); setTimeout(onOk, 160); }} data-testid="confirm-ok">{ok}</button></>
    )}>
      <div className="dialog-body"><p style={{ margin: 0 }}>{text}</p></div>
    </Modal>
  );
}

export function DialogHost() {
  const d = useStore((s) => s.eph.dialog);
  if (!d || d.type === 'details') return null;
  if (d.type === 'bot') return <BotEditor key={d.botId ?? 'new'} botId={d.botId} />;
  if (d.type === 'group') return <NewGroup />;
  if (d.type === 'settings') return <SettingsDialog />;
  if (d.type === 'search') return <SearchPalette />;
  if (d.type === 'confirm') return <ConfirmDialog text={d.text} ok={d.ok} onOk={d.onOk} />;
  return null;
}
