// Turn dist/ into a claude.ai Artifact preview bundle (dist-artifact/):
// the page file must be a fragment (the host adds doctype/html/head/body).
import fs from 'node:fs';
fs.rmSync('dist-artifact', { recursive: true, force: true });
fs.cpSync('dist', 'dist-artifact', { recursive: true });
const html = fs.readFileSync('dist/index.html', 'utf8');
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
const js = [...html.matchAll(/<script type="module"[^>]*src="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
const frag = `<title>Ebbinghaus</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Noto+Sans+KR:wght@400;500;700&display=swap">
${css.map((h) => `<link rel="stylesheet" href="${h}">`).join('\n')}
<div id="root"></div>
${js.map((s) => `<script type="module" src="${s}"></script>`).join('\n')}
`;
fs.writeFileSync('dist-artifact/index.html', frag);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = `${d}/${f}`; fs.statSync(p).isDirectory() ? walk(p) : files.push(p.slice('dist-artifact/'.length)); } })('dist-artifact');
fs.writeFileSync('dist-artifact/files.json', JSON.stringify(files.filter((f) => f !== 'index.html' && f !== 'files.json')));
console.log('artifact bundle:', files.length, 'files');
