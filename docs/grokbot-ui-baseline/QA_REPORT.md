# QA report: 2026-11-12

Environment: cloud container, Node 22, Chromium (preinstalled Playwright), `vite preview` serving the production build.

**Data:** the e2e run and the screenshots in `docs/evidence/` use the **public sample set** (20 questions). The same 20
scenarios also passed against the private bank (14,620 items) before the public migration. Those screenshots stay private and are not in this repo.

## Commands and results
| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 7/7 passed (SRS schedule, deterministic pick, grading, mention parsing, code fencing) |
| `npx vite build` | exit 0. JS ≈ 225 KB (≈ 75 KB gzip), CSS ≈ 34 KB |
| `PW=… node tests/e2e.mjs` | **20/20 passed**, 0 console errors (`docs/evidence/e2e-results.json`) |

## E2E scenarios (brief §15 → test)
1 create/send/receive → 01, 16 · 2 send while processing → 02 · 3 rapid sends → 02 · 4 scroll up and new content → 04 ·
5 reload mid-stream → 05, 05b · 6 disconnect/reconnect → 06, 06b · 7 group with several authors → 07 · 8 switch Bots while
one works → 08 · 9 dialog Escape and focus → 09 · 10 attachment progress → 10 · 11 react and reply → 11 · 12 reload keeps
order, selection, draft, history → 12 · 13 failed request and retry → 13 · 14 narrow screens and long messages → 14, 14b, 14c ·
15 reduced motion and keyboard → 15.

## Independent review
A separate QA agent tested the running build without seeing my tests or conclusions.
It found these defects. All are fixed and retested:

| # | Sev | Defect | Fix | Retest |
|---|---|---|---|---|
| D1 | P1 | Reload during "thinking": the resumed run planned before the bank index loaded, so it showed `MA (0)` and saved that as complete | `plan()` awaits `loadIndex()` | new e2e 05b |
| D2 | P2 | Escape didn't close the mobile drawer | global Escape handler | e2e 14 |
| D3 | P2 | Settings segment labels broke one letter per line at 390 px | nowrap; stacked rows on mobile | `mobile-settings.png` |
| D4 | P2 | Mic gave no feedback | toast on start and failure; try/catch | manual |
| D5 | P2 | Raw `**markdown**` in reply previews | stripped | manual |
| D6 | P2 | Focus lost after closing the details panel | focus returns to the opener | manual |
| D7 | P2 | Internal item codes cluttered quiz cards | moved to a tooltip | manual |

During development I also found and fixed: the transcript didn't scroll (flex `min-height`), which also hid the composer.
The Settings dialog lost focus and couldn't close with Escape after a toggle (components were defined inside render).

## NOT RUN or limits
- Korean IME composition (it is guarded in code with `isComposing` and keyCode 229; not automated).
- Dictation on a real device. Routines firing at the scheduled clock time.
- Visual or motion parity against Grok Bot: **not possible**, because there is no reference (REFERENCE_EVIDENCE.md).
- Performance profiling (60 fps) was not measured. The animations are transform and filter only.
- Real backend, multi-device sync, AI replies: not connected.

## Account-transfer verification (2026-11-12, branch `migration/public-baseline`)
Run on a clean tree (`rm -rf public/bank dist`), sample mode, Node 22, Chromium:

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | 7/7 passed |
| `npm run test:boundary` | PASS: a fake private export placed in `public/bank` never reaches `dist/` (both `vite build` and `npm run build`) |
| `npm run build` | exit 0. `bank-boundary: dist/bank is PUBLIC SAMPLE` (20 items) |
| `npm run e2e` | 20/20 passed, 0 console errors |
| Fresh clone in an empty directory: `npm ci && npm run typecheck && npm test && npm run build` | passes; nothing needed from outside the repo |

**New defect found during the handoff (fixed):** a sample `npm run build` after a private `ITEMBANK_DIR` export shipped
the full private bank (14,620 items), because `public/` is copied verbatim and the old pre-build hook skipped
regeneration (`--if-missing`). Fix: the `bank-boundary` Vite plugin plus the `test:boundary` regression test.
