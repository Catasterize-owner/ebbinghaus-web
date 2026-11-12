// Small inline icon set (stroke icons, 18px default).
type P = { size?: number };
const S = ({ size = 18, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const IconSidebar = (p: P) => <S {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></S>;
export const IconSearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></S>;
export const IconPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IconUsers = (p: P) => <S {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" /></S>;
export const IconSettings = (p: P) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></S>;
export const IconMore = (p: P) => <S {...p}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></S>;
export const IconSend = (p: P) => <S {...p}><path d="M12 19V5M5 12l7-7 7 7" /></S>;
export const IconStop = (p: P) => <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" /></svg>;
export const IconClip = (p: P) => <S {...p}><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.6 8.5a2 2 0 0 1-2.8-2.8L15.5 7" /></S>;
export const IconMic = (p: P) => <S {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></S>;
export const IconReply = (p: P) => <S {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v4" /></S>;
export const IconCopy = (p: P) => <S {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></S>;
export const IconSmile = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" /></S>;
export const IconX = (p: P) => <S {...p}><path d="M18 6 6 18M6 6l12 12" /></S>;
export const IconPin = (p: P) => <S {...p}><path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4z" /></S>;
export const IconEdit = (p: P) => <S {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></S>;
export const IconTrash = (p: P) => <S {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></S>;
export const IconInfo = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></S>;
export const IconMenu = (p: P) => <S {...p}><path d="M4 7h16M4 12h16M4 17h16" /></S>;
export const IconDown = (p: P) => <S {...p}><path d="M12 5v14M5 12l7 7 7-7" /></S>;
export const IconRetry = (p: P) => <S {...p}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" /></S>;
export const IconFile = (p: P) => <S {...p}><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></S>;
