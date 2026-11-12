// State-driven Bot avatar. The state comes from real run/presence data (botPresence),
// never from decorative timers. All motion lives in tokens.css/avatar keyframes; every
// keyframe starts and ends at the neutral pose so switching states mid-loop does not jump.
import { memo } from 'react';
import type { Bot, BotState, BotShape } from '../lib/types';
import { useStore } from '../lib/store';
import { botPresence } from '../lib/runtime';

const BODY: Record<BotShape, string> = {
  blob: 'M20 3c8.5 0 15.5 5.8 16.6 14 1.2 8.9-4.6 18-16.6 19.6C8 35 2.3 26.5 3.4 17.6 4.5 9 11.5 3 20 3z',
  pill: 'M12 5h16a9 9 0 0 1 9 9v12a9 9 0 0 1-9 9H12a9 9 0 0 1-9-9V14a9 9 0 0 1 9-9z',
  drop: 'M20 3c6 6.5 16 13 16 21a16 13 0 0 1-32 0C4 16 14 9.5 20 3z',
  square: 'M10 4h20a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V10a6 6 0 0 1 6-6z',
};

export const STATE_LABEL: Record<BotState, string> = {
  idle: '대기', acknowledging: '확인함', thinking: '생각 중', working: '작업 중',
  waiting: '답을 기다리는 중', blocked: '연결 대기', completed: '완료', error: '오류',
};

function Eyes({ state }: { state: BotState }) {
  if (state === 'completed') {
    return (
      <g className="av-eyes">
        <path d="M13 21q2.5-3 5 0M22 21q2.5-3 5 0" fill="none" stroke="var(--av-eye)" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    );
  }
  if (state === 'error') {
    return (
      <g className="av-eyes" stroke="var(--av-eye)" strokeWidth="2" strokeLinecap="round">
        <path d="M13.5 18.5l4 4M17.5 18.5l-4 4M22.5 18.5l4 4M26.5 18.5l-4 4" />
      </g>
    );
  }
  if (state === 'blocked') {
    return (
      <g className="av-eyes" stroke="var(--av-eye)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M13.5 20.5h4M22.5 20.5h4" />
      </g>
    );
  }
  const ry = state === 'working' ? 2 : 3.1;
  return (
    <g className="av-eyes">
      <g className="av-blink">
        <ellipse cx="15.5" cy="20" rx="2.3" ry={ry} fill="var(--av-eye)" />
        <ellipse cx="24.5" cy="20" rx="2.3" ry={ry} fill="var(--av-eye)" />
      </g>
    </g>
  );
}

export const AvatarView = memo(function AvatarView({ bot, state, size = 32, ring = false }: { bot: Pick<Bot, 'color' | 'shape' | 'name'>; state: BotState; size?: number; ring?: boolean }) {
  return (
    <span className={`avatar av-${state}${ring ? ' av-ring' : ''}`} style={{ width: size, height: size, ['--av-color' as string]: bot.color }} role="img" aria-label={`${bot.name} · ${STATE_LABEL[state]}`} data-state={state}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <g className="av-body">
          <path d={BODY[bot.shape]} fill="var(--av-color)" />
          <Eyes state={state} />
        </g>
      </svg>
      {(state === 'thinking' || state === 'waiting') && size >= 28 && <span className="av-dots" aria-hidden="true"><i /><i /><i /></span>}
    </span>
  );
});

export function Avatar({ bot, size, ring }: { bot: Bot; size?: number; ring?: boolean }) {
  const state = useStore(() => botPresence(bot.id));
  return <AvatarView bot={bot} state={state} size={size} ring={ring} />;
}

export function usePresence(botId: string) { return useStore(() => botPresence(botId)); }
