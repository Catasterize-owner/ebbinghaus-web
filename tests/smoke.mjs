import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const URL = process.env.URL || 'http://localhost:4173/';
const out = process.env.OUT || '/tmp/claude-0/shots';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto(URL + '#dm-math');
await p.waitForSelector('[data-bank=ready]');
await p.screenshot({ path: out + '/01-math-empty.png' });
await p.fill('[data-testid=composer-input]', '문제');
await p.keyboard.press('Enter');
await p.waitForTimeout(700);
await p.screenshot({ path: out + '/02-thinking.png' });
await p.waitForSelector('[data-testid=quiz-card] .choice, [data-testid=quiz-card] .sa-input', { timeout: 15000 });
await p.waitForSelector('[data-testid=bot-msg][data-status=complete] >> nth=-1');
await p.screenshot({ path: out + '/03-quiz.png' });
const hasChoice = await p.$('[data-testid=choice-0]');
if (hasChoice) { await p.click('[data-testid=choice-0]'); await p.click('[data-testid=quiz-submit]'); }
else { await p.fill('.sa-input', '1'); await p.keyboard.press('Enter'); }
await p.waitForTimeout(3500);
await p.screenshot({ path: out + '/04-graded.png' });
console.log('msgs', await p.$$eval('[data-mid]', (e) => e.map((x) => x.dataset.status + ':' + x.textContent.slice(0, 50))));
console.log('errors', errs);
await b.close();
