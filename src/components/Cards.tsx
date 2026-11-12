// Typed part renderers (component registry). Add a new Part kind in types.ts and a
// renderer here; the transcript, grouping and scrolling don't need to change.
import { useEffect, useState, type ReactNode } from 'react';
import type { Part, Message } from '../lib/types';
import { ensureItem, subjectInfo, loadIndex, type Item, type SubjectInfo } from '../lib/bank';
import { answerQuiz, sendUserMessage, retryRun } from '../lib/runtime';
import { useStore } from '../lib/store';
import { summary, INTERVAL_DAYS } from '../lib/srs';
import { openConv } from '../lib/nav';
import { Markdown } from './Markdown';
import { IconFile } from './Icons';

const NUM = '①②③④⑤⑥⑦⑧';

/** Python items often carry code without fences: fence Hangul-free code-like paragraphs. */
export function fenceCode(subject: string, text: string) {
  if (subject !== 'PY' || text.includes('```')) return text;
  return text.split('\n\n').map((para) => (!/[가-힣]/.test(para) && /[=():\[\]]/.test(para) ? '```python\n' + para + '\n```' : para)).join('\n\n');
}

function QuizCard({ msg, index, part }: { msg: Message; index: number; part: Extract<Part, { kind: 'quiz' }> }) {
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [sel, setSel] = useState<number | null>(part.selected ?? null);
  const [typed, setTyped] = useState(part.typed ?? '');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { let on = true; ensureItem(part.item).then((it) => on && setItem(it ?? null)).catch((e) => on && setErr(String(e.message ?? e))); return () => { on = false; }; }, [part.item]);
  if (err) return <div className="card"><div className="card-body">문항을 불러오지 못했어요: {err}</div></div>;
  if (item === undefined) return <div className="card"><div className="card-body"><div className="skeleton" style={{ width: '70%' }} /><div className="skeleton" style={{ width: '45%', marginTop: 8 }} /></div></div>;
  if (item === null) return <div className="card"><div className="card-body">이 문항은 문항은행에 더 이상 없어요 ({part.item.code}).</div></div>;
  const done = !!part.submitted;
  const isSA = item.type === 'SA' && !item.choices?.length;
  const canSubmit = !done && (isSA ? typed.trim().length > 0 : sel !== null);
  const submit = () => { if (canSubmit) void answerQuiz(msg.convId, msg.id, index, isSA ? null : sel, isSA ? typed.trim() : undefined); };
  return (
    <div className="card quiz" data-testid="quiz-card" onKeyDown={(e) => {
      if (done || isSA) return;
      const n = Number(e.key);
      if (n >= 1 && n <= (item.choices?.length ?? 0)) { setSel(n - 1); e.preventDefault(); }
      if (e.key === 'Enter' && canSubmit) { e.preventDefault(); submit(); }
    }}>
      <div className="card-head">
        <span className="chip">{subjectInfo(item.subject)?.name ?? item.subject}</span>
        <span className="chip">{item.type === 'MC' ? '객관식' : item.type === 'TF' ? 'O/X' : '단답형'}</span>
        {item.difficulty && <span className="chip">난이도 {item.difficulty}</span>}
        <span style={{ marginLeft: 'auto' }} title={item.code} aria-label={`문항 코드 ${item.code}`}>#</span>
      </div>
      <div className="card-body">
        <div className="quiz-q"><Markdown text={fenceCode(item.subject, item.question)} /></div>
        {isSA ? (
          <div className="quiz-foot" style={{ marginTop: 0 }}>
            <input className="sa-input" value={done ? part.typed ?? '' : typed} disabled={done} onChange={(e) => setTyped(e.target.value)} placeholder="답을 입력하세요"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} aria-label="답 입력" />
            {!done && <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>제출</button>}
          </div>
        ) : (
          <div className="choices" role="radiogroup" aria-label="보기">
            {item.choices!.map((c, i) => {
              const cls = done ? (i === item.answer ? ' correct' : i === part.selected ? ' wrong' : '') : '';
              return (
                <button key={i} role="radio" aria-checked={(done ? part.selected : sel) === i} className={`choice${cls}`} disabled={done} onClick={() => setSel(i)} data-testid={`choice-${i}`}>
                  <span className="num">{NUM[i]}</span><span>{c}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="quiz-foot">
          {done ? <span className={`result ${part.correct ? 'ok' : 'bad'}`}>{part.correct ? '정답' : '오답'}{isSA && !part.correct ? ` · 정답 ${item.answer}` : ''}</span>
            : <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>{isSA ? 'Enter로 제출' : '숫자키로 고르고 Enter로 제출'}</span>}
          {!done && !isSA && <button className="btn btn-primary" disabled={!canSubmit} onClick={submit} data-testid="quiz-submit">제출</button>}
        </div>
      </div>
    </div>
  );
}

function UnitsCard({ subject, convId }: { subject: string; convId: string }) {
  const [info, setInfo] = useState<SubjectInfo | undefined>(subjectInfo(subject));
  useEffect(() => { if (!info) loadIndex().then(() => setInfo(subjectInfo(subject))).catch(() => {}); }, [subject, info]);
  if (!info) return <div className="card"><div className="card-body"><div className="skeleton" /></div></div>;
  return (
    <div className="card">
      <div className="card-head"><span className="chip">{info.name}</span><span>단원 {info.units.length}개 · 문항 {info.count}개</span></div>
      <div className="card-body">
        <div className="unit-list">
          {info.units.map((u) => (
            <button key={u.standard} className="unit-btn" onClick={() => sendUserMessage(convId, [{ kind: 'text', text: `단원 선택: ${subject}/${u.standard}` }])}>
              <span>{u.unit}</span><small>{u.count}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatsCard() {
  const srs = useStore((s) => s.srs);
  const sm = summary(srs);
  const max = Math.max(1, ...sm.byStage);
  return (
    <div className="card" data-testid="stats-card">
      <div className="card-body">
        <div className="stats">
          <div className="stat"><b>{sm.items}</b><span>푼 문항</span></div>
          <div className="stat"><b>{sm.accuracy}%</b><span>정답률</span></div>
          <div className="stat"><b>{sm.due}</b><span>지금 복습</span></div>
          <div className="stat"><b>{sm.nextDue ? new Date(sm.nextDue).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '—'}</b><span>다음 복습</span></div>
        </div>
        <div className="stage-bars" aria-label="복습 단계별 문항 수">
          {sm.byStage.map((n, i) => <div key={i} title={`${INTERVAL_DAYS[i]}일 단계: ${n}개`}><i style={{ height: `${(n / max) * 100}%` }} />{INTERVAL_DAYS[i]}일</div>)}
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ items }: { items: { subject: string; code: string }[] }) {
  return (
    <div className="card">
      <div className="card-head"><span className="chip">복습 목록</span></div>
      <div className="card-body review-list">
        {items.map((r, i) => <div key={r.code}>{i + 1}. {subjectInfo(r.subject)?.name ?? r.subject} · {r.code}</div>)}
      </div>
    </div>
  );
}

function Actions({ part, convId }: { part: Extract<Part, { kind: 'actions' }>; convId: string }) {
  return (
    <div className="action-row">
      {part.actions.map((a) => (
        <button key={a.label} className="action-chip" onClick={() => {
          if (a.open) { openConv(a.open); return; }
          if (!a.send) return;
          if (a.send.startsWith('__retry:')) { retryRun(a.send.slice(8)); return; }
          sendUserMessage(convId, [{ kind: 'text', text: a.send }]);
        }}>{a.label}</button>
      ))}
    </div>
  );
}

export function AttachmentView({ part }: { part: Extract<Part, { kind: 'attachment' }> }) {
  const kb = part.size > 1e6 ? `${(part.size / 1e6).toFixed(1)}MB` : `${Math.max(1, Math.round(part.size / 1e3))}KB`;
  return (
    <div className="attach" data-testid="attachment">
      {part.dataUrl && part.mime.startsWith('image/') ? <img src={part.dataUrl} alt={part.name} /> : <span className="file-ico"><IconFile /></span>}
      <div className="attach-meta">
        <div>{part.name}</div>
        <small>{part.state === 'uploading' ? `올리는 중 ${part.progress}%` : part.state === 'failed' ? '실패' : kb}</small>
        {part.state === 'uploading' && <div className="progress"><i style={{ width: `${part.progress}%` }} /></div>}
      </div>
    </div>
  );
}

export function renderPart(msg: Message, part: Part, index: number): ReactNode {
  switch (part.kind) {
    case 'quiz': return <QuizCard key={index} msg={msg} index={index} part={part} />;
    case 'units': return <UnitsCard key={index} subject={part.subject} convId={msg.convId} />;
    case 'stats': return <StatsCard key={index} />;
    case 'review': return <ReviewCard key={index} items={part.items} />;
    case 'actions': return <Actions key={index} part={part} convId={msg.convId} />;
    case 'attachment': return <AttachmentView key={index} part={part} />;
    case 'event': return <span key={index} className="event" data-tone={part.tone}>{part.text}</span>;
    case 'confirm': return null;
    case 'text': return null; // handled by MessageRow (streaming reveal)
  }
}
