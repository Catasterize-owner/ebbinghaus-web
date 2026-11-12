// Minimal, safe markdown subset: paragraphs, **bold**, `code`, ```fences```, > quotes,
// numbered/bulleted lists, links, @mentions. No HTML injection (React escapes text).
import { Fragment, type ReactNode } from 'react';

function cleanMath(s: string) {
  // Item bank text is mostly Unicode math; tidy the occasional $\frac{a}{b}$.
  return s.replace(/\$([^$\n]{1,80})\$/g, (all, inner: string) => {
    if (!/[\\^_{}]/.test(inner)) return all;
    return inner.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)').replace(/\\(times|cdot)/g, '×').replace(/\\le/g, '≤').replace(/\\ge/g, '≥').replace(/[{}\\]/g, '');
  });
}

function inline(text: string, key: string, mentions: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)]+|@[^\s@.,!?]+)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k} className="md-code">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('http')) out.push(<a key={k} href={tok} target="_blank" rel="noreferrer noopener">{tok}</a>);
    else if (mentions.includes(tok.slice(1))) out.push(<span key={k} className="mention">{tok}</span>);
    else out.push(tok);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, mentions = [] }: { text: string; mentions?: string[] }) {
  const src = cleanMath(text);
  const blocks: ReactNode[] = [];
  const lines = src.split('\n');
  let i = 0; let b = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push(<pre key={b++} className="md-pre" data-lang={lang || undefined}><code>{body.join('\n')}</code></pre>);
      continue;
    }
    if (/^\s*(\d+\.|[-•])\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*(\d+\.|[-•])\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*(\d+\.|[-•])\s/, ''));
      const L = ordered ? 'ol' : 'ul';
      blocks.push(<L key={b++} className="md-list">{items.map((t, j) => <li key={j}>{inline(t, `l${b}-${j}`, mentions)}</li>)}</L>);
      continue;
    }
    if (line.startsWith('> ')) {
      blocks.push(<blockquote key={b++} className="md-quote">{inline(line.slice(2), `q${b}`, mentions)}</blockquote>);
      i++; continue;
    }
    if (!line.trim()) { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('```') && !lines[i].startsWith('> ') && !/^\s*(\d+\.|[-•])\s/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={b++}>{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, `p${b}-${j}`, mentions)}</Fragment>)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
