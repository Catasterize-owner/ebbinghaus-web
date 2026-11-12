import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, update, getState, patchMessage, toast } from '../lib/store';
import { sendUserMessage, releaseMessage, activeRunFor, cancelRun } from '../lib/runtime';
import { textOf } from '../lib/engine';
import { getIndex } from '../lib/bank';
import type { Part } from '../lib/types';
import { AvatarView } from './Avatar';
import { IconClip, IconMic, IconSend, IconStop, IconX } from './Icons';

const plain = (t: string) => t.replace(/\*\*|`|^> /gm, '').replace(/\s+/g, ' ');
const MAX_INLINE = 1_500_000; // bytes kept inline (local storage); larger files keep metadata only

interface SpeechRec { start(): void; stop(): void; lang: string; interimResults: boolean; continuous: boolean; onresult: (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void; onend: () => void; onerror: (e: { error: string }) => void }

export function Composer({ convId }: { convId: string }) {
  const conv = useStore((s) => s.convs.find((c) => c.id === convId));
  const bots = useStore((s) => s.bots);
  const replyTo = useStore((s) => s.ui.replyTo[convId] ?? null);
  const replyMsg = useStore((s) => (replyTo ? s.messages[convId]?.find((m) => m.id === replyTo) : undefined));
  const running = useStore(() => activeRunFor(convId));
  const [text, setText] = useState(() => getState().ui.drafts[convId] ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [mention, setMention] = useState<{ q: string; start: number; i: number } | null>(null);
  const [listening, setListening] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const rec = useRef<SpeechRec | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Switching conversation: load that conversation's draft and focus.
  useEffect(() => {
    setText(getState().ui.drafts[convId] ?? '');
    setFiles([]); setMention(null);
    if (matchMedia('(pointer: fine)').matches) ta.current?.focus({ preventScroll: true });
  }, [convId]);

  useLayoutEffect(() => {
    const el = ta.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }, [text]);

  const saveDraft = (v: string) => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => update((s) => ({ ...s, ui: { ...s.ui, drafts: { ...s.ui.drafts, [convId]: v } } })), 250);
  };

  const members = bots.filter((b) => conv?.botIds.includes(b.id));
  const mentionList = mention ? members.filter((b) => b.name.includes(mention.q)) : [];

  const onChange = (v: string, caret: number) => {
    setText(v); saveDraft(v);
    const before = v.slice(0, caret);
    const m = before.match(/@([^\s@]*)$/);
    if (m && conv?.kind === 'group') setMention({ q: m[1], start: caret - m[0].length, i: 0 });
    else setMention(null);
  };

  const pickMention = (name: string) => {
    if (!mention) return;
    const el = ta.current!;
    const caret = el.selectionStart;
    const v = text.slice(0, mention.start) + '@' + name + ' ' + text.slice(caret);
    setText(v); saveDraft(v); setMention(null);
    requestAnimationFrame(() => { const p = mention.start + name.length + 2; el.setSelectionRange(p, p); el.focus(); });
  };

  const canSend = text.trim().length > 0 || files.length > 0;

  const send = () => {
    if (!canSend) return;
    const parts: Part[] = [];
    if (text.trim()) parts.push({ kind: 'text', text: text.trim() });
    const atts = files.map((f): Part => ({ kind: 'attachment', name: f.name, size: f.size, mime: f.type || 'application/octet-stream', progress: 0, state: 'uploading' }));
    parts.push(...atts);
    const id = sendUserMessage(convId, parts, { replyTo, hold: files.length > 0 });
    if (files.length) readAttachments(convId, id, files, parts.length - files.length);
    setText(''); setFiles([]); setMention(null);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    update((s) => ({ ...s, ui: { ...s.ui, drafts: { ...s.ui.drafts, [convId]: '' }, replyTo: { ...s.ui.replyTo, [convId]: null } } }));
    window.dispatchEvent(new Event('ebb:to-bottom'));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // Korean IME: Enter confirms the syllable, not send
    if (mention && mentionList.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setMention({ ...mention, i: (mention.i + (e.key === 'ArrowDown' ? 1 : -1) + mentionList.length) % mentionList.length }); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionList[mention.i].name); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return; }
    if (e.key === 'Escape' && replyTo) { update((s) => ({ ...s, ui: { ...s.ui, replyTo: { ...s.ui.replyTo, [convId]: null } } })); }
    if (e.key === 'ArrowUp' && !text) {
      // Recall last sent text for quick edit (like many chat apps).
      const mine = (getState().messages[convId] ?? []).filter((m) => m.author.type === 'user' && !m.meta);
      const last = mine[mine.length - 1];
      if (last) { e.preventDefault(); const t = textOf(last); setText(t); saveDraft(t); }
    }
  };

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list).slice(0, 6);
    if (arr.length) setFiles((f) => [...f, ...arr].slice(0, 6));
  };

  const toggleMic = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) { toast('이 브라우저는 음성 입력을 지원하지 않아요'); return; }
    if (listening) { rec.current?.stop(); return; }
    const r = new Ctor();
    r.lang = 'ko-KR'; r.interimResults = true; r.continuous = false;
    const base = text ? text + ' ' : '';
    r.onresult = (e) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText(base + t); saveDraft(base + t);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => { setListening(false); toast(e.error === 'not-allowed' ? '마이크 권한이 필요해요' : '음성 입력 오류'); };
    rec.current = r;
    try { r.start(); setListening(true); toast('듣는 중이에요 · 다시 누르면 멈춰요'); }
    catch { setListening(false); toast('음성 입력을 시작하지 못했어요'); }
  };

  if (!conv) return null;
  const placeholder = conv.kind === 'group' ? `${conv.title}에 메시지 보내기 · @로 Bot 부르기` : `${members[0]?.name ?? 'Bot'}에게 메시지 보내기`;
  return (
    <div className="composer-wrap">
      <div className={`composer${drag ? ' drag' : ''}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
        {replyMsg && (
          <div className="reply-bar">
            <span>답장: {plain(textOf(replyMsg)).slice(0, 80) || '카드'}</span>
            <button className="icon-btn" style={{ width: 22, height: 22 }} aria-label="답장 취소" onClick={() => update((s) => ({ ...s, ui: { ...s.ui, replyTo: { ...s.ui.replyTo, [convId]: null } } }))}><IconX size={14} /></button>
          </div>
        )}
        {files.length > 0 && (
          <div className="pending-files">
            {files.map((f, i) => (
              <span key={i} className="pending-file"><span>{f.name}</span>
                <button className="icon-btn" style={{ width: 20, height: 20 }} aria-label={`${f.name} 빼기`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><IconX size={12} /></button>
              </span>
            ))}
          </div>
        )}
        {mention && mentionList.length > 0 && (
          <div className="popover mention-pop" role="listbox" aria-label="Bot 부르기" style={{ position: 'absolute' }}>
            {mentionList.map((b, i) => (
              <button key={b.id} role="option" aria-selected={i === mention.i} className="menu-item" data-active={i === mention.i} onMouseDown={(e) => { e.preventDefault(); pickMention(b.name); }}>
                <AvatarView bot={b} state="idle" size={20} />{b.name}<span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>{b.role === 'coach' ? '코치' : '과목'}</span>
              </button>
            ))}
          </div>
        )}
        <textarea ref={ta} rows={1} value={text} placeholder={placeholder} aria-label="메시지 입력" data-testid="composer-input"
          onChange={(e) => onChange(e.target.value, e.target.selectionStart)} onKeyDown={onKeyDown}
          onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }} />
        <div className="composer-bar">
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
          <button className="icon-btn" aria-label="파일 첨부" title="파일 첨부" onClick={() => fileInput.current?.click()}><IconClip /></button>
          <button className={`icon-btn${listening ? ' mic-on' : ''}`} aria-label={listening ? '음성 입력 끄기' : '음성 입력'} aria-pressed={listening} title="음성 입력 (ko-KR)" onClick={toggleMic}><IconMic /></button>
          <span className="spacer" />
          {running && !canSend ? (
            <button className="send-btn stop" aria-label="응답 중지" title="응답 중지" onClick={() => cancelRun(running.id)} data-testid="stop-btn"><IconStop /></button>
          ) : (
            <button className="send-btn" aria-label="보내기" disabled={!canSend} onClick={send} data-testid="send-btn"><IconSend /></button>
          )}
        </div>
      </div>
      <div className="composer-hint">Enter 보내기 · Shift+Enter 줄바꿈 · Bot 응답은 문항은행 기반 규칙 엔진이에요 (AI 미연결){getIndex()?.sample ? ` · 공개 샘플 문항 ${getIndex()!.subjects.reduce((a, s) => a + s.count, 0)}개` : ''}</div>
    </div>
  );
}

/** Read attachments with real FileReader progress, then release the held message. */
function readAttachments(convId: string, msgId: string, files: File[], offset: number) {
  let left = files.length;
  files.forEach((f, k) => {
    const idx = offset + k;
    const setPart = (patch: Partial<Extract<Part, { kind: 'attachment' }>>) =>
      patchMessage(convId, msgId, (m) => ({ ...m, parts: m.parts.map((p, i) => (i === idx && p.kind === 'attachment' ? { ...p, ...patch } : p)) }));
    const done = () => { if (--left === 0) releaseMessage(convId, msgId); };
    const r = new FileReader();
    r.onprogress = (e) => { if (e.lengthComputable) setPart({ progress: Math.round((e.loaded / e.total) * 100) }); };
    r.onload = () => { setPart({ progress: 100, state: 'done', dataUrl: f.size <= MAX_INLINE && f.type.startsWith('image/') ? String(r.result) : undefined }); done(); };
    r.onerror = () => { setPart({ state: 'failed' }); done(); };
    r.readAsDataURL(f);
  });
}
