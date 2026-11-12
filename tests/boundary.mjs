// Regression test for the sample/private data boundary (no private data needed).
// 1) export a fake "private" bank containing a marker item into public/bank,
// 2) run a normal build WITHOUT ITEMBANK_DIR,
// 3) assert dist/ holds only the public sample and no marker.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MARK = 'PRIVATE-MARKER-' + Date.now();
const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'fakebank-'));
fs.mkdirSync(path.join(fake, 'items', 'ZZ'), { recursive: true });
fs.writeFileSync(path.join(fake, 'items', 'ZZ', 'x.jsonl'), JSON.stringify({ code: MARK, subject: 'ZZ', standard: 's', unit: 'u', type: 'MC', question: MARK, choices: ['a', 'b'], answer: 0, explanation: 'e' }) + '\n');
const run = (cmd, env = {}) => execSync(cmd, { stdio: 'pipe', env: { ...process.env, ITEMBANK_DIR: '', ...env } }).toString();
const fail = (m) => { console.error('FAIL', m); process.exit(1); };
const grepDist = () => { let hit = false; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : fs.readFileSync(p, 'utf8').includes(MARK) && (hit = true); } })('dist'); return hit; };

run('node scripts/build-bank.mjs public/bank', { ITEMBANK_DIR: fake });
if (!fs.readFileSync('public/bank/index.json', 'utf8').includes('"sample":false')) fail('setup: fake private export not written');
run('npx vite build');                      // direct vite build, no npm pre-hooks
if (grepDist()) fail('private marker leaked into dist/ via public/');
if (JSON.parse(fs.readFileSync('dist/bank/index.json', 'utf8')).sample !== true) fail('dist bank is not the sample');
run('node scripts/build-bank.mjs public/bank', { ITEMBANK_DIR: fake });
run('npm run build');                       // npm path too
if (grepDist()) fail('private marker leaked via npm run build');
fs.rmSync(fake, { recursive: true, force: true });
console.log('PASS boundary: stale private export never reaches a sample build (vite build and npm run build)');
