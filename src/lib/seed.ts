import type { Bot, Conversation, Message } from './types';
import type { Persisted } from './store';

const now = () => Date.now();

const BOTS: Omit<Bot, 'createdAt' | 'order' | 'pinned'>[] = [
  { id: 'coach', name: '에빙', color: '#e8e8e8', shape: 'blob', role: 'coach', subjects: [], persona: '복습 코치. 망각 곡선에 맞춰 복습할 문항을 챙기고, 과목 Bot에게 일을 넘겨요.', skills: { quiz: false, hints: false, review: true } },
  { id: 'math', name: '수학', color: '#7aa2ff', shape: 'drop', role: 'tutor', subjects: ['MA', 'MA2', 'MAM', 'CAL'], persona: '수학·미적분 문항을 내고 채점해요.', skills: { quiz: true, hints: true, review: true } },
  { id: 'korean', name: '국어', color: '#ff9f6b', shape: 'pill', role: 'tutor', subjects: ['KO', 'KOR', 'KOL', 'KOSW'], persona: '독해·문학·화법과 작문 문항을 다뤄요.', skills: { quiz: true, hints: true, review: true } },
  { id: 'english', name: '영어', color: '#5fd3a5', shape: 'square', role: 'tutor', subjects: ['EN', 'ENG', 'ENV', 'ENL', 'ENM', 'CVEN', 'SEN', 'TOEIC'], persona: '어휘·어법·독해·회화 문항을 다뤄요.', skills: { quiz: true, hints: true, review: true } },
  { id: 'science', name: '과학', color: '#c792ff', shape: 'blob', role: 'tutor', subjects: ['PH1', 'PH2', 'BIO1', 'ES1', 'ES2', 'SC'], persona: '물리·생명·지구과학 문항을 다뤄요.', skills: { quiz: true, hints: true, review: true } },
  { id: 'social', name: '사회', color: '#f2c94c', shape: 'pill', role: 'tutor', subjects: ['SO', 'HI', 'EC', 'PL', 'WG', 'KG', 'ET', 'LE', 'SC2'], persona: '한국사·경제·지리·윤리 문항을 다뤄요.', skills: { quiz: true, hints: true, review: true } },
  { id: 'code', name: '코딩', color: '#ff6b8b', shape: 'square', role: 'tutor', subjects: ['PY'], persona: '파이썬 코드 읽기 문항을 다뤄요.', skills: { quiz: true, hints: true, review: true } },
];

export function welcomeText(bot: Bot): string {
  if (bot.role === 'coach') {
    return '안녕하세요, 복습 코치 **에빙**이에요.\n배운 문항을 잊어버리기 전에 다시 보여 드려요 (1일 → 2일 → 4일 → 7일 → 15일 → 30일).\n\n"복습"이라고 보내면 오늘 복습할 문항을 모아 드려요. 스터디 그룹에서는 과목 Bot에게 문제를 부탁해 드릴게요.';
  }
  return `안녕하세요, **${bot.name}** Bot이에요. ${bot.persona}\n\n"문제"라고 보내면 바로 한 문항 낼게요. "단원"이라고 보내면 고를 수 있는 단원을 보여 드려요.`;
}

export function seedState(): Persisted {
  const t = now();
  const bots: Bot[] = BOTS.map((b, i) => ({ ...b, order: i, pinned: i < 3, createdAt: t }));
  const convs: Conversation[] = bots.map((b, i) => ({
    id: `dm-${b.id}`, kind: 'dm', botIds: [b.id], title: b.name, createdAt: t, lastActivity: t - i, unread: 0, focus: null,
  }));
  convs.push({ id: 'group-study', kind: 'group', botIds: ['coach', 'math', 'english'], title: '스터디 그룹', createdAt: t, lastActivity: t, unread: 0, focus: null });
  const messages: Record<string, Message[]> = {};
  let seq = 0;
  for (const b of bots) {
    messages[`dm-${b.id}`] = [{
      id: `welcome-${b.id}`, convId: `dm-${b.id}`, author: { type: 'bot', botId: b.id }, createdAt: t, seq: ++seq, status: 'complete',
      parts: [{ kind: 'text', text: welcomeText(b) }, ...(b.role === 'tutor'
        ? [{ kind: 'actions' as const, actions: [{ label: '문제 내 줘', send: '문제' }, { label: '단원 보기', send: '단원' }] }]
        : [{ kind: 'actions' as const, actions: [{ label: '오늘 복습', send: '복습' }, { label: '학습 기록', send: '기록' }] }])],
    }];
  }
  messages['group-study'] = [
    { id: 'group-created', convId: 'group-study', author: { type: 'system' }, createdAt: t, seq: ++seq, status: 'sent', parts: [{ kind: 'event', text: '에빙, 수학, 영어가 그룹에 참여했어요', tone: 'info' }] },
    { id: 'group-welcome', convId: 'group-study', author: { type: 'bot', botId: 'coach' }, createdAt: t, seq: ++seq, status: 'complete', parts: [
      { kind: 'text', text: '여기는 여러 Bot이 함께 일하는 방이에요. **@수학** 이나 **@영어** 처럼 부르면 그 Bot이 답해요. 아무도 부르지 않으면 제가 받아서 알맞은 Bot에게 넘겨 드려요.' },
      { kind: 'actions', actions: [{ label: '수학 한 문제', send: '수학 문제 하나 내 줘' }, { label: '@영어 문제', send: '@영어 문제' }, { label: '복습', send: '복습' }] },
    ] },
  ];
  return {
    v: 1, bots, convs, messages, runs: {}, srs: {},
    routines: [{ id: 'r-daily', botId: 'coach', label: '매일 복습 알림', hour: 20, minute: 0, enabled: true }],
    settings: { theme: 'dark', motion: 'system', explanation: 'friendly', simulateOffline: false, failNextSend: false, latencyMs: 350, streamCps: 90 },
    ui: { sidebarCollapsed: false, selectedConvId: 'dm-coach', drafts: {}, scroll: {}, replyTo: {} },
    seq, acked: [],
  };
}
