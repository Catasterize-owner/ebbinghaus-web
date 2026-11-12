// Build the app-facing item shards in public/bank/.
//
// DATA BOUNDARY: the real item bank is private and is NOT part of this repository.
//   - Default: the public sample set in fixtures/sample-items.jsonl (original demo items).
//   - Private: set ITEMBANK_DIR=/path/to/itembank (a checkout with items/<SUBJECT>/*.jsonl).
// Output (public/bank/) is gitignored and must never be committed.
//
// Usage: node scripts/build-bank.mjs [out-dir]   (vite.config.ts runs this automatically on every build/dev start)
// Drops private keys (only KEEP fields are exported) and items that need media/passages.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) || 'public/bank';
const src = process.env.ITEMBANK_DIR || '';
const sample = !src;
if (src && !fs.existsSync(path.join(src, 'items'))) { console.error(`ITEMBANK_DIR=${src} has no items/ directory`); process.exit(1); }
const KEEP = ['code', 'subject', 'standard', 'unit', 'topic', 'type', 'difficulty', 'question', 'choices',
  'answer', 'explanation', 'hints', 'steps', 'tip', 'wrongAnswerReasons', 'origin', 'tags'];
const SUBJECT_NAMES = {
  MA: '수학', MA2: '수학Ⅱ', MAM: '중학 수학', CAL: '미적분', SC: '과학 (기출)', SC2: '사회·문화', PH1: '물리학Ⅰ', PH2: '물리학Ⅱ',
  BIO1: '생명과학Ⅰ', ES1: '지구과학Ⅰ', ES2: '지구과학Ⅱ', SO: '사회 (기출)', HI: '한국사', EC: '경제', PL: '정치와 법',
  WG: '세계지리', KG: '한국지리', ET: '윤리와 사상', LE: '생활과 윤리', KO: '국어 (기출)', KOR: '국어 독해', KOL: '문학',
  KOSW: '화법과 작문', EN: '영어 기초', ENG: '영어 어법', ENL: '영어 듣기 대본', ENM: '영어 안내문', ENV: '영어 어휘',
  CVEN: '영어 독해 근거', SEN: '영어 회화', TOEIC: 'TOEIC', PY: '파이썬'
};
const bySubject = {};
let skipped = 0, total = 0;
const files = sample
  ? [path.join('fixtures', 'sample-items.jsonl')]
  : fs.readdirSync(path.join(src, 'items')).flatMap((subj) => fs.readdirSync(path.join(src, 'items', subj)).sort()
      .filter((f) => f.endsWith('.jsonl')).map((f) => path.join(src, 'items', subj, f)));
{
  for (const file of files) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const it = JSON.parse(line); total++;
      if (it.media || it.figures || it.mediaParts || it.passageIds || it.out_of_scope) { skipped++; continue; }
      const slim = {};
      for (const k of KEEP) if (it[k] !== undefined && it[k] !== null && !(Array.isArray(it[k]) && !it[k].length)) slim[k] = it[k];
      (bySubject[it.subject] ??= []).push(slim);
    }
  }
}
fs.mkdirSync(out, { recursive: true });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const index = { generatedAt: new Date().toISOString(), sample, total, skipped, subjects: [] };
for (const [s, items] of Object.entries(bySubject).sort()) {
  fs.writeFileSync(path.join(out, `${s}.json`), JSON.stringify(items));
  const units = {};
  for (const it of items) { const u = (units[it.standard] ??= { standard: it.standard, unit: it.unit, count: 0 }); u.count++; }
  index.subjects.push({ id: s, name: SUBJECT_NAMES[s] || s, count: items.length, units: Object.values(units) });
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index));
console.log(`bank (${sample ? 'PUBLIC SAMPLE' : 'private ITEMBANK_DIR'}): ${total - skipped} items in ${index.subjects.length} subjects (skipped ${skipped} media/passage items)`);
