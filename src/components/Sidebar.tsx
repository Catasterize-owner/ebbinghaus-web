import { memo, useState } from 'react';
import { useStore, update, setEph, shallowArr, getState, toast, askConfirm } from '../lib/store';
import type { Bot, Conversation } from '../lib/types';
import { Avatar, usePresence, STATE_LABEL } from './Avatar';
import { IconSidebar, IconSearch, IconPlus, IconUsers, IconSettings, IconMore, IconPin, IconEdit, IconInfo, IconTrash } from './Icons';
import { Popover, MenuItem } from './Popover';
import { openConv } from '../lib/nav';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

function BotRow({ bot, conv }: { bot: Bot; conv: Conversation }) {
  const selected = useStore((s) => s.ui.selectedConvId === conv.id);
  const unread = useStore((s) => s.convs.find((c) => c.id === conv.id)?.unread ?? 0);
  const state = usePresence(bot.id);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const collapsed = useStore((s) => s.ui.sidebarCollapsed);
  return (
    <div className="sb-row-wrap" style={{ position: 'relative' }}>
      <button className="sb-row" aria-current={selected ? 'page' : undefined} onClick={() => openConv(conv.id)} title={collapsed ? `${bot.name} · ${STATE_LABEL[state]}` : undefined}
        onContextMenu={(e) => { e.preventDefault(); setMenu(e.currentTarget); }} data-testid={`bot-row-${bot.id}`}>
        <Avatar bot={bot} size={30} />
        <span className="sb-label">
          <span className="sb-name">{bot.name}</span>
          <span className="sb-status" data-state={state}>{state === 'idle' ? bot.persona : STATE_LABEL[state]}</span>
        </span>
        <span className="sb-meta">
          {unread > 0 && <span className="badge" aria-label={`읽지 않은 메시지 ${unread}개`}>{unread}</span>}
        </span>
      </button>
      <button className="icon-btn row-menu" style={{ position: 'absolute', right: 6, top: 8, width: 26, height: 26 }} aria-label={`${bot.name} 메뉴`} aria-haspopup="menu" aria-expanded={!!menu}
        onClick={(e) => setMenu(menu ? null : e.currentTarget)}><IconMore size={16} /></button>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)} label={`${bot.name} 메뉴`}>
          <MenuItem onSelect={() => { setMenu(null); update((s) => ({ ...s, bots: s.bots.map((b) => (b.id === bot.id ? { ...b, pinned: !b.pinned } : b)) })); }}><IconPin size={15} />{bot.pinned ? '고정 해제' : '고정'}</MenuItem>
          <MenuItem onSelect={() => { setMenu(null); setEph({ dialog: { type: 'details', botId: bot.id } }); }}><IconInfo size={15} />Bot 정보</MenuItem>
          <MenuItem onSelect={() => { setMenu(null); setEph({ dialog: { type: 'bot', botId: bot.id } }); }}><IconEdit size={15} />이름·모양 편집</MenuItem>
          <MenuItem onSelect={() => { setMenu(null); moveBot(bot.id, -1); }}>↑ 위로 이동</MenuItem>
          <MenuItem onSelect={() => { setMenu(null); moveBot(bot.id, 1); }}>↓ 아래로 이동</MenuItem>
          {bot.role !== 'coach' && <><div className="menu-sep" /><MenuItem danger onSelect={() => { setMenu(null); deleteBot(bot.id); }}><IconTrash size={15} />Bot 삭제</MenuItem></>}
        </Popover>
      )}
    </div>
  );
}

function moveBot(id: string, dir: number) {
  update((s) => {
    const b = s.bots.find((x) => x.id === id)!;
    const peers = s.bots.filter((x) => x.pinned === b.pinned).sort((a, c) => a.order - c.order);
    const i = peers.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= peers.length) return s;
    const other = peers[j];
    return { ...s, bots: s.bots.map((x) => (x.id === id ? { ...x, order: other.order } : x.id === other.id ? { ...x, order: b.order } : x)) };
  });
}

function deleteBot(id: string) {
  const b = getState().bots.find((x) => x.id === id);
  if (!b) return;
  askConfirm(`${b.name} Bot과 1:1 대화를 삭제할까요? 그룹 대화의 기록은 남아요.`, '삭제', () => doDeleteBot(id, b.name));
}

function doDeleteBot(id: string, name: string) {
  update((s) => {
    const convs = s.convs.filter((c) => !(c.kind === 'dm' && c.botIds[0] === id)).map((c) => (c.kind === 'group' ? { ...c, botIds: c.botIds.filter((x) => x !== id) } : c));
    const messages = { ...s.messages }; delete messages[`dm-${id}`];
    return { ...s, bots: s.bots.filter((x) => x.id !== id), convs, messages, ui: { ...s.ui, selectedConvId: s.ui.selectedConvId === `dm-${id}` ? convs[0]?.id ?? null : s.ui.selectedConvId } };
  });
  toast(`${name} Bot을 삭제했어요`);
  if (location.hash === `#dm-${id}`) openConv(getState().convs[0].id, { replace: true });
}

const GroupRow = memo(function GroupRow({ conv }: { conv: Conversation }) {
  const selected = useStore((s) => s.ui.selectedConvId === conv.id);
  const unread = useStore((s) => s.convs.find((c) => c.id === conv.id)?.unread ?? 0);
  const bots = useStore((s) => s.bots.filter((b) => conv.botIds.includes(b.id)), shallowArr);
  return (
    <button className="sb-row" aria-current={selected ? 'page' : undefined} onClick={() => openConv(conv.id)} data-testid={`group-row-${conv.id}`} title={conv.title}>
      <span className="group-stack">{bots.slice(0, 2).map((b) => <Avatar key={b.id} bot={b} size={20} />)}</span>
      <span className="sb-label">
        <span className="sb-name">{conv.title}</span>
        <span className="sb-status">{bots.map((b) => b.name).join(', ')}</span>
      </span>
      <span className="sb-meta">{unread > 0 && <span className="badge">{unread}</span>}</span>
    </button>
  );
});

export function Sidebar() {
  const collapsed = useStore((s) => s.ui.sidebarCollapsed);
  const open = useStore((s) => s.eph.mobileNav);
  const bots = useStore((s) => s.bots, Object.is);
  const convs = useStore((s) => s.convs, Object.is);
  const sorted = bots.slice().sort((a, b) => a.order - b.order);
  const pinned = sorted.filter((b) => b.pinned);
  const others = sorted.filter((b) => !b.pinned);
  const groups = convs.filter((c) => c.kind === 'group').sort((a, b) => a.createdAt - b.createdAt);
  const dm = (b: Bot) => convs.find((c) => c.kind === 'dm' && c.botIds[0] === b.id);
  const toggle = () => update((s) => ({ ...s, ui: { ...s.ui, sidebarCollapsed: !s.ui.sidebarCollapsed } }));
  return (
    <>
      {open && <div className="nav-scrim" onClick={() => setEph({ mobileNav: false })} />}
      <nav className={`sidebar${open ? ' open' : ''}`} aria-label="Bot 목록">
        <div className="sb-top">
          <span className="brand">Ebbinghaus</span>
          <button className="icon-btn collapse-btn" onClick={toggle} aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'} title={`사이드바 (${MOD}+.)`} aria-pressed={!collapsed}><IconSidebar /></button>
        </div>
        <button className="sb-search" onClick={() => setEph({ dialog: { type: 'search' } })} aria-label="검색"><IconSearch size={16} /><span>검색</span><kbd>{MOD}K</kbd></button>
        <div className="sb-scroll">
          <div className="sb-section-title">고정됨<button className="icon-btn" aria-label="새 Bot 만들기" title="새 Bot" onClick={() => setEph({ dialog: { type: 'bot' } })}><IconPlus size={15} /></button></div>
          {pinned.map((b) => { const c = dm(b); return c ? <BotRow key={b.id} bot={b} conv={c} /> : null; })}
          {others.length > 0 && <div className="sb-section-title">Bot</div>}
          {others.map((b) => { const c = dm(b); return c ? <BotRow key={b.id} bot={b} conv={c} /> : null; })}
          <div className="sb-section-title">그룹<button className="icon-btn" aria-label="새 그룹 만들기" title="새 그룹" onClick={() => setEph({ dialog: { type: 'group' } })}><IconPlus size={15} /></button></div>
          {groups.map((c) => <GroupRow key={c.id} conv={c} />)}
        </div>
        <div className="sb-foot">
          <button onClick={() => setEph({ dialog: { type: 'bot' } })} aria-label="새 Bot"><IconPlus size={16} /><span className="sb-foot-label">새 Bot</span></button>
          <button onClick={() => setEph({ dialog: { type: 'group' } })} aria-label="새 그룹"><IconUsers size={16} /><span className="sb-foot-label">그룹</span></button>
          <button onClick={() => setEph({ dialog: { type: 'settings' } })} aria-label="설정" style={{ marginLeft: 'auto' }}><IconSettings size={16} /></button>
        </div>
      </nav>
    </>
  );
}
