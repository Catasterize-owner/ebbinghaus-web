// Local tutor engine. Rule-based and deterministic: it serves real items from the
// item bank, grades them and schedules reviews. It is NOT an AI model; free-form
// questions get an honest "not connected" answer. Swap `plan()` for a model-backed
// adapter later without touching the UI (same Part[] output contract).
import type { Bot, Conversation, Message, Part, ItemRef, Settings, SrsEntry } from './types';
import { loadSubject, pickItem, ensureItem, answerLabel, subjectInfo, getIndex, loadIndex, type Item } from './bank';
import { dueEntries, srsKey, INTERVAL_DAYS } from './srs';

export interface PlanInput {
  bot: Bot; bots: Bot[]; conv: Conversation; trigger: Message; input: string;
  history: Message[]; srs: Record<string, SrsEntry>; settings: Settings; seed: string;
  fromBot?: Bot | null; // set when another bot handed this over
}
export interface PlanOutput {
  parts: Part[];
  followups?: { botId: string; text: string }[];
  focus?: Conversation['focus'];
}

const has = (t: string, ...ws: string[]) => ws.some((w) => t.includes(w));

export function stripMentions(text: string, bots: Bot[]): string {
  let t = text;
  for (const b of bots) t = t.split('@' + b.name).join(' ');
  return t.replace(/\s+/g, ' ').trim();
}

export function mentionedBots(text: string, bots: Bot[]): Bot[] {
  return bots.filter((b) => text.includes('@' + b.name));
}

/** In a group, which bot should pick the message up when nobody is mentioned. */
export function routeGroup(text: string, bots: Bot[]): Bot | undefined {
  return bots.find((b) => b.role === 'coach') ?? bots[0] ?? (text ? undefined : undefined);
}

/** Which tutor fits a request by subject keywords (used by the coach for handoffs). */
export function tutorFor(text: string, bots: Bot[]): Bot | undefined {
  const tutors = bots.filter((b) => b.role === 'tutor');
  const byName = tutors.find((b) => text.includes(b.name));
  if (byName) return byName;
  const idx = getIndex();
  for (const b of tutors) {
    for (const s of b.subjects) {
      const info = idx?.subjects.find((x) => x.id === s);
      if (info && text.includes(info.name.split(' ')[0])) return b;
    }
  }
  return undefined;
}

function lastQuiz(history: Message[], botId: string): { msg: Message; part: Extract<Part, { kind: 'quiz' }> } | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.author.type !== 'bot' || m.author.botId !== botId) continue;
    for (let j = m.parts.length - 1; j >= 0; j--) {
      const p = m.parts[j];
      if (p.kind === 'quiz') return { msg: m, part: p };
    }
  }
  return null;
}

function shownCodes(history: Message[]): Set<string> {
  const s = new Set<string>();
  for (const m of history) for (const p of m.parts) if (p.kind === 'quiz') s.add(p.item.code);
  return s;
}

function fmtDays(d: number) { return d === 1 ? '내일' : `${d}일 뒤`; }

const helpActions = (bot: Bot): Part => ({
  kind: 'actions',
  actions: bot.role === 'coach'
    ? [{ label: '오늘 복습', send: '복습' }, { label: '학습 기록', send: '기록' }]
    : [{ label: '문제 내 줘', send: '문제' }, { label: '단원 보기', send: '단원' }, { label: '학습 기록', send: '기록' }],
});

async function quizPlan(inp: PlanInput, subjectOverride?: string, standard?: string): Promise<PlanOutput> {
  const { bot, conv, history, srs, seed } = inp;
  const focus = standard ? { subject: subjectOverride!, standard } : conv.focus && bot.subjects.includes(conv.focus.subject) ? conv.focus : null;
  // Subject keyword in the request ("미적분 문제") narrows the subject.
  let subject = focus?.subject ?? subjectOverride;
  if (!subject) {
    subject = bot.subjects.find((s) => { const n = subjectInfo(s)?.name; return n && inp.input.includes(n.split(' ')[0]); });
  }
  if (!subject) {
    let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
    subject = bot.subjects[Math.abs(h) % bot.subjects.length];
  }
  if (!subject) return { parts: [{ kind: 'text', text: '이 Bot에는 아직 과목이 없어요. Bot 설정에서 과목을 추가해 주세요.' }] };
  const items = await loadSubject(subject);
  const pool = focus ? items.filter((i) => i.standard === focus.standard) : items;
  const exclude = shownCodes(history);
  for (const k of Object.keys(srs)) exclude.add(k.split(':')[1]);
  const it = pickItem(pool.length ? pool : items, seed, exclude);
  if (!it) return { parts: [{ kind: 'text', text: '낼 수 있는 문항이 없어요.' }] };
  const name = subjectInfo(subject)?.name ?? subject;
  const lead = focus && standard ? `좋아요, **${it.unit}** 단원으로 낼게요.` : `${name} · ${it.unit}`;
  return {
    parts: [{ kind: 'text', text: lead }, { kind: 'quiz', item: { subject, code: it.code } }],
    focus: standard ? { subject, standard } : undefined,
  };
}

function explanationText(it: Item, settings: Settings): string {
  const ex = it.explanation?.trim() || '이 문항에는 아직 해설이 없어요.';
  const steps = settings.explanation === 'friendly' && it.steps?.length ? '\n\n' + it.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : '';
  const tip = it.tip ? `\n\n> 팁: ${it.tip}` : '';
  return ex + steps + tip;
}

async function gradePlan(inp: PlanInput): Promise<PlanOutput> {
  const qa = inp.trigger.meta!.quizAnswer!;
  const it = await ensureItem(qa.item);
  if (!it) return { parts: [{ kind: 'text', text: '문항을 찾지 못했어요. 문항은행이 바뀌었을 수 있어요.' }] };
  const stage = inp.srs[srsKey(qa.item)]?.stage ?? 0;
  const next = INTERVAL_DAYS[stage];
  const parts: Part[] = [];
  if (qa.correct) {
    parts.push({ kind: 'text', text: `정답이에요! 이 문항은 ${fmtDays(next)} 다시 보여 드릴게요.\n\n${explanationText(it, inp.settings)}` });
  } else {
    let why = '';
    const w = it.wrongAnswerReasons;
    if (w && qa.selected != null) {
      const r = Array.isArray(w) ? w[qa.selected] : w[String(qa.selected)] ?? w[String(qa.selected + 1)];
      if (r) why = `\n\n고른 답이 틀린 이유: ${r}`;
    }
    parts.push({ kind: 'text', text: `아쉬워요. 정답은 **${answerLabel(it)}** 이에요.${why}\n\n${explanationText(it, inp.settings)}\n\n틀린 문항은 ${fmtDays(next)} 다시 나와요.` });
  }
  const actions: Part = { kind: 'actions', actions: [{ label: '다음 문제', send: '다음 문제' }, { label: '단원 바꾸기', send: '단원' }, { label: '학습 기록', send: '기록' }] };
  const coach = inp.conv.kind === 'group' ? inp.bots.find((b) => b.role === 'coach' && inp.conv.botIds.includes(b.id)) : undefined;
  if (coach && coach.id !== inp.bot.id) {
    parts.push({ kind: 'text', text: `@${coach.name} 이 문항 복습 일정 확인 부탁해요.` }, actions);
    return { parts, followups: [{ botId: coach.id, text: `복습 확인 ${qa.item.code}` }] };
  }
  parts.push(actions);
  return { parts };
}

export async function plan(inp: PlanInput): Promise<PlanOutput> {
  await loadIndex(); // subject names/counts are needed; after a reload a resumed run can start before App loads it
  // Only use subjects present in the loaded bank (the public sample set has a subset).
  inp = { ...inp, bot: { ...inp.bot, subjects: inp.bot.subjects.filter((s) => subjectInfo(s)) } };
  const { bot, bots, conv, history, srs, settings } = inp;
  const t = inp.input;

  if (inp.trigger.meta?.quizAnswer && inp.trigger.author.type === 'user') return gradePlan(inp);

  // Coach receiving a bot-to-bot request.
  if (inp.fromBot && bot.role === 'coach' && t.startsWith('복습 확인')) {
    const code = t.split(' ').pop()!;
    const e = Object.values(srs).find((x) => x.item.code === code);
    const when = e ? new Date(e.due).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '곧';
    return { parts: [{ kind: 'text', text: `@${inp.fromBot.name} 확인했어요. ${e?.lastResult ? '맞힌' : '틀린'} 문항이라 **${when}** 복습 목록에 올렸어요.` }] };
  }

  const attachments = inp.trigger.parts.filter((p) => p.kind === 'attachment');
  if (attachments.length && !t) {
    return { parts: [{ kind: 'text', text: `파일 ${attachments.length}개를 받았어요. 파일 내용을 읽고 설명하려면 AI 모델 연결이 필요해요. 지금은 이 대화에 보관만 해 둘게요.` }] };
  }

  if (has(t, '복습')) {
    const subjects = bot.role === 'coach' ? undefined : bot.subjects;
    const due = dueEntries(srs, Date.now(), subjects);
    if (!due.length) {
      const future = Object.values(srs).filter((e) => !subjects || subjects.includes(e.item.subject)).sort((a, b) => a.due - b.due)[0];
      const msg = future
        ? `지금 복습할 문항은 없어요. 다음 복습은 **${new Date(future.due).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric' })}** 이에요.`
        : '아직 푼 문항이 없어서 복습할 게 없어요. 과목 Bot에게 문제를 받아 보세요.';
      return { parts: [{ kind: 'text', text: msg }, helpActions(bot)] };
    }
    const first = due[0];
    return { parts: [
      { kind: 'text', text: `복습할 문항이 **${due.length}개** 있어요. 첫 문항부터 볼게요.` },
      { kind: 'review', items: due.slice(0, 8).map((e) => e.item) },
      { kind: 'quiz', item: first.item },
    ] };
  }

  if (has(t, '기록', '통계', '진도')) {
    return { parts: [{ kind: 'text', text: '지금까지의 학습 기록이에요.' }, { kind: 'stats' }] };
  }

  // Coach in a group: hand over to the right tutor.
  if (bot.role === 'coach') {
    const members = bots.filter((b) => conv.botIds.includes(b.id));
    const target = tutorFor(t, members) ?? (has(t, '문제', '퀴즈') ? members.find((b) => b.role === 'tutor') : undefined);
    if (conv.kind === 'group' && target) {
      return {
        parts: [
          { kind: 'text', text: `이 부탁은 @${target.name} 에게 넘길게요.` },
          { kind: 'event', text: `에빙 → ${target.name}: 작업을 넘겼어요`, tone: 'handoff' },
        ],
        followups: [{ botId: target.id, text: t }],
      };
    }
    if (has(t, '문제', '퀴즈') || target) {
      const tutor = target ?? bots.find((b) => b.role === 'tutor');
      return { parts: [
        { kind: 'text', text: '저는 복습 일정을 맡고 있어서 새 문제는 과목 Bot이 내요.' },
        { kind: 'actions', actions: tutor ? [{ label: `${tutor.name} Bot 열기`, open: `dm-${tutor.id}` }, { label: '스터디 그룹 열기', open: 'group-study' }] : [] },
      ] };
    }
  }

  if (bot.role === 'tutor') {
    if (!bot.skills.quiz && has(t, '문제')) return { parts: [{ kind: 'text', text: '이 Bot은 문제 내기 기능이 꺼져 있어요. Bot 설정 → 기능에서 켤 수 있어요.' }] };
    const pick = t.match(/^단원 선택: (\w+)\/(.+)$/);
    if (pick) return quizPlan(inp, pick[1], pick[2]);
    const subjMatch = t.match(/^단원 (\w+)$/);
    if (subjMatch && bot.subjects.includes(subjMatch[1])) {
      return { parts: [{ kind: 'text', text: `${subjectInfo(subjMatch[1])?.name ?? subjMatch[1]} 단원이에요. 하나를 고르면 그 단원에서만 낼게요.` }, { kind: 'units', subject: subjMatch[1] }] };
    }
    if (has(t, '단원', '주제', '범위')) {
      if (bot.subjects.length === 1) return { parts: [{ kind: 'text', text: '단원을 골라 주세요.' }, { kind: 'units', subject: bot.subjects[0] }] };
      return { parts: [
        { kind: 'text', text: '어느 과목 단원을 볼까요?' },
        { kind: 'actions', actions: bot.subjects.map((s) => ({ label: `${subjectInfo(s)?.name ?? s} (${subjectInfo(s)?.count ?? 0})`, send: `단원 ${s}` })) },
      ] };
    }
    if (has(t, '힌트')) {
      if (!bot.skills.hints) return { parts: [{ kind: 'text', text: '힌트 기능이 꺼져 있어요.' }] };
      const q = lastQuiz(history, bot.id);
      if (!q) return { parts: [{ kind: 'text', text: '아직 낸 문항이 없어요. "문제"라고 보내 주세요.' }] };
      const it = await ensureItem(q.part.item);
      const hint = it?.hints?.[0] ?? it?.steps?.[0] ?? it?.tip;
      return { parts: [{ kind: 'text', text: hint ? `힌트: ${hint}` : '이 문항에는 준비된 힌트가 없어요. 보기를 하나씩 지워 보세요.' }] };
    }
    if (has(t, '정답', '해설', '설명', '모르겠')) {
      const q = lastQuiz(history, bot.id);
      if (!q) return { parts: [{ kind: 'text', text: '설명할 문항이 아직 없어요.' }] };
      const it = await ensureItem(q.part.item);
      if (!it) return { parts: [{ kind: 'text', text: '문항을 찾지 못했어요.' }] };
      return { parts: [{ kind: 'text', text: `정답은 **${answerLabel(it)}** 이에요.\n\n${explanationText(it, settings)}` }, { kind: 'actions', actions: [{ label: '다음 문제', send: '다음 문제' }] }] };
    }
    if (has(t, '문제', '퀴즈', '다음', '하나 더', '또', '풀래', '시작')) return quizPlan(inp);
  }

  if (has(t, '안녕', '하이', 'hi', 'hello', '도움', '뭐 할', '사용법') || !t) {
    return { parts: [{ kind: 'text', text: `안녕하세요! 저는 **${bot.name}** 이에요. ${bot.persona}` }, helpActions(bot)] };
  }

  return { parts: [
    { kind: 'text', text: `지금은 AI 모델이 연결되지 않아 자유 대화는 이해하지 못해요. 이 Bot은 문항은행에서 문제를 내고 채점하는 기능만 진짜로 동작해요.\n\n이렇게 보내 보세요: ${bot.role === 'coach' ? '"복습", "기록"' : '"문제", "단원", "힌트", "해설", "기록"'}` },
    helpActions(bot),
  ] };
}

export function textOf(m: Message): string {
  return m.parts.map((p) => (p.kind === 'text' ? p.text : '')).join(' ').trim();
}

export type { ItemRef };
