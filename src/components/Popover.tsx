// Anchored popover/menu: positions next to its anchor, flips to stay in the viewport,
// closes on outside click / Escape and returns focus to the anchor. Arrow keys move
// between [role=menuitem] children.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Popover({ anchor, onClose, children, align = 'start', label }: {
  anchor: HTMLElement | null; onClose: () => void; children: ReactNode; align?: 'start' | 'end'; label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const p = ref.current.getBoundingClientRect();
    let top = a.bottom + 6; let originY = 'top';
    if (top + p.height > window.innerHeight - 8) { top = a.top - p.height - 6; originY = 'bottom'; }
    let left = align === 'end' ? a.right - p.width : a.left;
    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8));
    setPos({ top: Math.max(8, top), left, origin: `${originY} ${align === 'end' ? 'right' : 'left'}` });
  }, [anchor, align]);

  useEffect(() => {
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[role=menuitem],button,input');
    first?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (el && !el.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); anchor?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(el?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []);
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true); };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={ref} className="popover" role="menu" aria-label={label}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, ['--origin' as string]: pos?.origin }}>
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({ children, onSelect, danger }: { children: ReactNode; onSelect: () => void; danger?: boolean }) {
  return <button role="menuitem" className={`menu-item${danger ? ' danger' : ''}`} onClick={onSelect}>{children}</button>;
}
