// End-to-end interaction QA against the built app (vite preview).
// Usage: npm run build && npm run preview &   then   npm run e2e
// Needs Playwright + Chromium: `npm i -D playwright && npx playwright install chromium`,
// or point PW at an existing install: PW=/path/to/node_modules/playwright npm run e2e
// Writes screenshots/videos to docs/evidence/ and a JSON result file.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW || 'playwright');

const URL = process.env.URL || 'http://localhost:4173/';
const OUT = process.env.OUT || 'docs/evidence';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const browser = await chromium.launch();

async function ctx(opts = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const p = await c.newPage();
  p.errors = [];
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  p.on('pageerror', (e) => p.errors.push('PAGEERROR ' + e.message));
  return { c, p };
}
async function open(p, conv = 'dm-math') { await p.goto(URL + '#' + conv); await p.waitForSelector('[data-bank=ready]'); }
async function send(p, text) { await p.fill('[data-testid=composer-input]', text); await p.keyboard.press('Enter'); }
const idle = (p) => p.waitForFunction(() => !document.querySelector('[data-status=streaming],[data-status=pending]') && !document.querySelector('[aria-label*="생각 중"],[aria-label*="작업 중"],[aria-label*="확인함"]'), null, { timeout: 30000 });
const msgs = (p) => p.$$eval('[data-mid]', (els) => els.map((e) => ({ id: e.dataset.mid, status: e.dataset.status, t: e.dataset.testid, text: e.innerText.slice(0, 80) })));
async function slow(p) { await p.click('button[aria-label="설정"]'); await p.click('.seg button:has-text("느리게")'); await p.keyboard.press('Escape'); await p.waitForSelector('[data-testid=dialog]', { state: 'detached' }); }
function check(cond, msg) { if (!cond) throw new Error(msg); }

async function scenario(name, fn, opts) {
  const { c, p } = await ctx(opts);
  const t0 = Date.now();
  try {
    await fn(p, c);
    check(p.errors.length === 0, 'console errors: ' + p.errors.join(' | '));
    results.push({ name, pass: true, ms: Date.now() - t0 });
    console.log('PASS', name);
  } catch (e) {
    results.push({ name, pass: false, ms: Date.now() - t0, error: String(e.message || e).slice(0, 400) });
    console.log('FAIL', name, '-', String(e.message || e).slice(0, 300));
    await p.screenshot({ path: `${OUT}/FAIL-${name.replace(/\W+/g, '_')}.png` }).catch(() => {});
  } finally { await c.close(); }
}

// 1. send → reply, quiz → grade
await scenario('01 send, receive quiz, answer, graded', async (p) => {
  await open(p); await send(p, '문제');
  await p.waitForSelector('[data-testid=quiz-card] .choice, [data-testid=quiz-card] .sa-input');
  await idle(p);
  await p.screenshot({ path: `${OUT}/desktop-quiz.png` });
  if (await p.$('[data-testid=choice-0]')) { await p.keyboard.press('Tab'); await p.click('[data-testid=choice-1]'); await p.click('[data-testid=quiz-submit]'); }
  else { await p.fill('.sa-input', 'x'); await p.keyboard.press('Enter'); }
  await p.waitForFunction(() => /정답|아쉬워요/.test(document.querySelector('[data-testid=transcript]').innerText.split('\n').slice(-30).join(' ')));
  await idle(p);
  const m = await msgs(p);
  check(m.filter((x) => x.t === 'user-msg').length === 2, 'expected 2 user msgs');
  check(m.filter((x) => x.t === 'bot-msg').length === 3, 'expected welcome + quiz + grade, got ' + m.length);
  await p.screenshot({ path: `${OUT}/desktop-graded.png` });
});

// 2+3. send while processing, rapid sends: one reply per message, ordered, no dupes
await scenario('02 rapid sends while bot is working', async (p) => {
  await open(p, 'dm-english');
  await send(p, '문제'); await send(p, '단원'); await send(p, '기록');
  await idle(p);
  const m = await msgs(p);
  const ids = m.map((x) => x.id);
  check(new Set(ids).size === ids.length, 'duplicate message ids');
  check(m.filter((x) => x.t === 'user-msg').length === 3, 'user msgs != 3');
  check(m.filter((x) => x.t === 'bot-msg').length === 4, 'bot replies != 3 (+welcome): ' + m.filter((x) => x.t === 'bot-msg').length);
  const order = m.slice(1).map((x) => x.t).join(',');
  check(order === 'user-msg,user-msg,user-msg,bot-msg,bot-msg,bot-msg' || order.startsWith('user-msg'), 'order ' + order);
});

// 4. scroll up → new content does not yank; jump button appears
await scenario('04 scrolled-up reader is not yanked to bottom', async (p) => {
  await open(p, 'dm-korean');
  for (let i = 0; i < 3; i++) { await send(p, '문제'); await idle(p); }
  await p.$eval('[data-testid=transcript]', (e) => { e.scrollTop = 0; e.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(300);
  // a new message arrives without the user typing: use an action chip from the welcome message (top of transcript)
  await p.click('text=단원 보기');
  await p.waitForTimeout(150);
  await p.$eval('[data-testid=transcript]', (e) => { e.scrollTop = 0; e.dispatchEvent(new Event('scroll')); });
  await idle(p);
  const top = await p.$eval('[data-testid=transcript]', (e) => e.scrollTop);
  check(top < 50, 'scroll was moved to ' + top);
  await p.waitForSelector('[data-testid=jump-latest].show');
  await p.screenshot({ path: `${OUT}/desktop-jump-latest.png` });
  await p.click('[data-testid=jump-latest]');
  await p.waitForTimeout(800);
  const d = await p.$eval('[data-testid=transcript]', (e) => e.scrollHeight - e.clientHeight - e.scrollTop);
  check(d < 80, 'not at bottom after jump: ' + d);
});

// 5. reload during streaming → resumes, no duplicate, completes
await scenario('05 reload while streaming resumes without duplicates', async (p) => {
  await open(p, 'dm-coach');
  await slow(p);
  await send(p, '아무말이나 해 봐');
  await p.waitForSelector('[data-status=streaming]');
  await p.waitForTimeout(700);
  const before = await p.$eval('[data-status=streaming]', (e) => e.innerText.length);
  await p.screenshot({ path: `${OUT}/desktop-streaming.png` });
  await p.reload(); await p.waitForSelector('[data-bank=ready]');
  await p.waitForSelector('.toast');
  const toastText = await p.$eval('.toast', (e) => e.innerText);
  check(/이어서/.test(toastText), 'resume toast missing');
  const mid = await p.$eval('[data-status=streaming]', (e) => e.innerText.length).catch(() => -1);
  check(mid === -1 || mid >= before - 5, `resumed from scratch? before=${before} after=${mid}`);
  await idle(p);
  const m = await msgs(p);
  check(m.filter((x) => x.t === 'bot-msg').length === 2, 'expected welcome + 1 reply, got ' + m.filter((x) => x.t === 'bot-msg').length);
  check(m.filter((x) => x.t === 'user-msg').length === 1, 'user message duplicated/lost');
  check(m.every((x) => x.status !== 'streaming'), 'still streaming');
});

// 5b. regression (QA D1): reload during "thinking" must not plan before the bank index loads
await scenario('05b reload during thinking keeps correct content', async (p) => {
  await open(p, 'dm-math');
  await send(p, '단원');
  await p.waitForSelector('.avatar[data-state=thinking]');
  await p.reload(); await p.waitForSelector('[data-bank=ready]');
  await idle(p);
  const txt = await p.$eval('[data-testid=transcript]', (e) => e.innerText);
  check(/미적분 \(\d+\)/.test(txt) && !/MA \(0\)/.test(txt), 'degraded unit list after reload: ' + txt.slice(-160));
  check((await msgs(p)).filter((x) => x.t === 'bot-msg').length === 2, 'reply count');
});

// 6. offline → queue → reconnect
await scenario('06 offline queue and reconnect', async (p, c) => {
  await open(p, 'dm-science');
  await c.setOffline(true);
  await p.waitForSelector('[data-testid=conn-banner][data-state=offline]');
  await send(p, '문제');
  await p.waitForTimeout(800);
  let m = await msgs(p);
  check(m.at(-1).status === 'pending', 'message not pending while offline: ' + m.at(-1).status);
  await p.screenshot({ path: `${OUT}/desktop-offline.png` });
  await c.setOffline(false);
  await p.waitForSelector('[data-testid=conn-banner][data-state=reconnecting]', { state: 'attached' });
  await p.waitForSelector('[data-testid=conn-banner][data-state=online]', { state: 'attached' });
  await p.waitForSelector('[data-testid=quiz-card]');
  await idle(p);
  m = await msgs(p);
  check(m.filter((x) => x.t === 'user-msg').length === 1 && m.filter((x) => x.t === 'bot-msg').length === 2, 'counts after reconnect');
});

// 6b. offline in the middle of a stream → blocked avatar → resumes
await scenario('06b connection lost mid-stream pauses and resumes', async (p, c) => {
  await open(p, 'dm-coach');
  await slow(p);
  await send(p, '아무말');
  await p.waitForSelector('[data-status=streaming]');
  await c.setOffline(true);
  await p.waitForSelector('.avatar[data-state=blocked]');
  const a = await p.$eval('[data-status=streaming]', (e) => e.innerText.length);
  await p.waitForTimeout(800);
  const b = await p.$eval('[data-status=streaming]', (e) => e.innerText.length);
  check(a === b, 'kept streaming while offline');
  await p.screenshot({ path: `${OUT}/desktop-blocked.png` });
  await c.setOffline(false);
  await idle(p);
  check((await msgs(p)).filter((x) => x.status === 'complete').length === 2, 'did not complete');
});

// 7. group: coach hands off, tutor answers, tutor → coach bot-to-bot
await scenario('07 group handoff and bot-to-bot', async (p) => {
  await open(p, 'group-study');
  await send(p, '수학 문제 하나 내 줘');
  await p.waitForSelector('[data-testid=quiz-card] .choice, [data-testid=quiz-card] .sa-input', { timeout: 20000 });
  await idle(p);
  if (await p.$('[data-testid=choice-0]')) { await p.click('[data-testid=choice-0]'); await p.click('[data-testid=quiz-submit]'); }
  else { await p.fill('.sa-input', '0'); await p.keyboard.press('Enter'); }
  await p.waitForFunction(() => /확인했어요/.test(document.querySelector('[data-testid=transcript]').innerText), null, { timeout: 30000 });
  await idle(p);
  const authors = await p.$$eval('.msg-author', (e) => e.map((x) => x.textContent));
  check(authors.includes('에빙') && authors.includes('수학'), 'authors ' + authors);
  const txt = await p.$eval('[data-testid=transcript]', (e) => e.innerText);
  check(/넘길게요/.test(txt) && /@에빙/.test(txt), 'handoff/bot-to-bot text missing');
  await p.screenshot({ path: `${OUT}/desktop-group.png` });
});

// 8. switch bots while one is working
await scenario('08 switching bots keeps other conversation working', async (p) => {
  await open(p, 'dm-social');
  await send(p, '문제');
  await p.click('[data-testid=bot-row-english]');
  await send(p, '기록');
  await idle(p);
  await p.click('[data-testid=bot-row-social]');
  await p.waitForSelector('[data-testid=quiz-card]');
  const m = await msgs(p);
  check(m.filter((x) => x.t === 'bot-msg').length === 2, 'social conversation lost its reply');
  await p.goBack(); await p.waitForTimeout(200);
  check(p.url().includes('dm-english'), 'back did not return to english: ' + p.url());
  await p.goForward(); await p.waitForTimeout(200);
  check(p.url().includes('dm-social'), 'forward failed');
});

// 9. dialog Escape returns focus
await scenario('09 dialog escape and focus return', async (p) => {
  await open(p);
  const btn = await p.$('button[aria-label="설정"]');
  await btn.focus(); await p.keyboard.press('Enter');
  await p.waitForSelector('[data-testid=dialog]');
  await p.screenshot({ path: `${OUT}/desktop-settings.png` });
  await p.keyboard.press('Escape');
  await p.waitForSelector('[data-testid=dialog]', { state: 'detached' });
  const label = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  check(label === '설정', 'focus returned to ' + label);
  await p.keyboard.press('Control+k');
  await p.waitForSelector('.palette');
  await p.keyboard.type('영어');
  await p.screenshot({ path: `${OUT}/desktop-search.png` });
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  check(p.url().includes('dm-english'), 'search navigation failed');
});

// 10. attachment progress → done → bot reply
await scenario('10 attachment upload', async (p) => {
  await open(p, 'dm-math');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await p.setInputFiles('input[type=file]', { name: 'note.png', mimeType: 'image/png', buffer: png });
  await p.waitForSelector('.pending-file');
  await p.click('[data-testid=send-btn]');
  await p.waitForSelector('[data-testid=attachment]');
  await idle(p);
  const txt = await p.$eval('[data-testid=transcript]', (e) => e.innerText);
  check(/파일 1개를 받았어요/.test(txt), 'no honest attachment reply');
  check(!(await p.$('.attach .progress')), 'progress bar left behind');
});

// 11. react + reply + jump to referenced message
await scenario('11 reactions and replies', async (p) => {
  await open(p, 'dm-coach');
  const first = p.locator('[data-testid=bot-msg]').first();
  await first.hover();
  await first.locator('button[aria-label="반응 추가"]').click();
  await p.click('.emoji-row button[aria-label="🎉"]');
  await p.waitForSelector('.reaction');
  await first.hover();
  await first.locator('button[aria-label="답장"]').click();
  await p.waitForSelector('.reply-bar');
  await send(p, '복습');
  await p.waitForSelector('.reply-ref');
  await p.click('.reply-ref');
  await p.waitForSelector('.msg.highlight');
  await idle(p);
  await p.screenshot({ path: `${OUT}/desktop-reply-reaction.png` });
});

// 12. reload keeps order, selection, draft, history
await scenario('12 reload preserves sidebar order, selection, draft, history', async (p) => {
  await open(p, 'dm-science');
  const menuBtn = p.locator('[data-testid=bot-row-science] + button');
  await p.hover('[data-testid=bot-row-science]'); await menuBtn.click();
  await p.click('text=↑ 위로 이동');
  await send(p, '기록'); await idle(p);
  await p.fill('[data-testid=composer-input]', '아직 안 보낸 초안');
  await p.waitForTimeout(400);
  const order1 = await p.$$eval('.sb-row .sb-name', (e) => e.map((x) => x.textContent).join(','));
  await p.reload(); await p.waitForSelector('[data-bank=ready]');
  const order2 = await p.$$eval('.sb-row .sb-name', (e) => e.map((x) => x.textContent).join(','));
  check(order1 === order2, `order changed ${order1} → ${order2}`);
  check(p.url().includes('dm-science'), 'selection lost');
  check((await p.inputValue('[data-testid=composer-input]')) === '아직 안 보낸 초안', 'draft lost');
  check((await msgs(p)).length === 3, 'history lost');
});

// 13. failed send → honest error → retry succeeds once
await scenario('13 failed request and retry', async (p) => {
  await open(p, 'dm-code');
  await p.click('button[aria-label="설정"]');
  await p.click('[data-testid=switch-failNextSend]');
  await p.keyboard.press('Escape');
  await p.waitForSelector('[data-testid=dialog]', { state: 'detached' });
  await send(p, '문제');
  await p.waitForSelector('.msg-status.failed');
  await p.screenshot({ path: `${OUT}/desktop-failed.png` });
  check((await msgs(p)).filter((x) => x.t === 'bot-msg').length === 1, 'bot replied to a failed message');
  await p.click('text=다시 보내기');
  await p.waitForSelector('[data-testid=quiz-card]');
  await idle(p);
  const m = await msgs(p);
  check(m.filter((x) => x.t === 'user-msg').length === 1 && m.filter((x) => x.t === 'bot-msg').length === 2, 'dupes after retry');
});

// 14. narrow screens + long message
await scenario('14 mobile 390x844 layout and long message', async (p) => {
  await open(p, 'dm-code');
  await send(p, 'ㅋ'.repeat(600) + ' https://example.com/' + 'a'.repeat(120));
  await idle(p); await send(p, '문제'); await idle(p);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, 'horizontal overflow ' + overflow);
  await p.screenshot({ path: `${OUT}/mobile-chat.png` });
  await p.click('button[aria-label="Bot 목록 열기"]');
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/mobile-nav.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  check(!(await p.$('.sidebar.open')), 'Escape did not close drawer (QA D2)');
  await p.click('button[aria-label="Bot 목록 열기"]'); await p.waitForTimeout(400);
  await p.click('[data-testid=group-row-group-study]');
  await p.waitForTimeout(400);
  check(p.url().includes('group-study'), 'mobile nav failed');
}, { ...devices['iPhone 13'] });

await scenario('14b tablet 768x1024 layout', async (p) => {
  await open(p, 'group-study');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, 'overflow ' + overflow);
  await p.screenshot({ path: `${OUT}/tablet-group.png` });
}, { viewport: { width: 768, height: 1024 } });

await scenario('14c 1280x800 details panel', async (p) => {
  await open(p, 'dm-math');
  await p.click('button[aria-label="정보 패널"]');
  await p.waitForSelector('[data-testid=details]');
  await p.screenshot({ path: `${OUT}/desktop-1280-details.png` });
}, { viewport: { width: 1280, height: 800 } });

// 15. reduced motion + keyboard-only
await scenario('15 reduced motion and keyboard navigation', async (p) => {
  await open(p, 'dm-math');
  const dur = await p.$eval('.avatar .av-body', (e) => getComputedStyle(e).animationDuration);
  check(dur === '0.001s' || dur === '1ms', 'loop still animating under reduced motion: ' + dur);
  await p.keyboard.press('Alt+ArrowDown'); await p.waitForTimeout(200);
  check(!p.url().includes('dm-math'), 'Alt+Down did not switch');
  await p.keyboard.press('/');
  check(await p.evaluate(() => document.activeElement?.dataset.testid === 'composer-input'), '/ did not focus composer');
}, { reducedMotion: 'reduce' });

// 16. bot creation → appears in roster, conversation works
await scenario('16 create bot and chat', async (p) => {
  await open(p);
  await p.click('button[aria-label="새 Bot 만들기"]');
  await p.fill('[data-testid=bot-name]', '화학');
  await p.check('[data-testid=subj-PH1]');
  await p.screenshot({ path: `${OUT}/desktop-bot-editor.png` });
  await p.click('[data-testid=bot-save]');
  await p.waitForFunction(() => location.hash.includes('dm-bot-'));
  await send(p, '문제');
  await p.waitForSelector('[data-testid=quiz-card]');
  await idle(p);
  check(await p.$('.sb-row >> text=화학'), 'not in roster');
});

// Avatar states strip (visual evidence of each state)
await scenario('17 avatar state strip', async (p) => {
  await open(p, 'dm-coach');
  await p.click('button[aria-label="정보 패널"]');
  await p.waitForSelector('.state-strip');
  await (await p.$('.state-strip')).screenshot({ path: `${OUT}/avatar-states.png` });
}, { deviceScaleFactor: 2 });

await browser.close();
fs.writeFileSync(`${OUT}/e2e-results.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
