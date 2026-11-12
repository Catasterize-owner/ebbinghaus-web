// Hash routing (#<convId>; ids are [a-z0-9-] so they survive artifact/plain-hash hosts) so browser back/forward and reload restore the selection.
import { getState, update, setEph } from './store';

export function openConv(id: string, opts: { replace?: boolean } = {}) {
  const target = `#${id}`;
  if (location.hash === target) { applyRoute(); return; }
  if (opts.replace) history.replaceState(null, '', target); else location.hash = target;
  applyRoute();
}

export function applyRoute() {
  const m = location.hash.match(/^#(?:\/c\/)?([a-z0-9-]+)$/);
  const s = getState();
  let id = m ? decodeURIComponent(m[1]) : s.ui.selectedConvId;
  if (!id || !s.convs.some((c) => c.id === id)) id = s.convs[0]?.id ?? null;
  if (id && location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  if (s.ui.selectedConvId !== id || s.convs.find((c) => c.id === id)?.unread) {
    update((st) => ({ ...st, ui: { ...st.ui, selectedConvId: id }, convs: st.convs.map((c) => (c.id === id ? { ...c, unread: 0 } : c)) }));
  }
  if (s.eph.mobileNav) setEph({ mobileNav: false });
}

export function initRouting() {
  window.addEventListener('hashchange', applyRoute);
  applyRoute();
}

export function dmFor(botId: string) { return getState().convs.find((c) => c.kind === 'dm' && c.botIds[0] === botId); }
