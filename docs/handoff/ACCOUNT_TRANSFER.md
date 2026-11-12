# Ebbinghaus: account transfer handoff

Written 2026-11-12 by the outgoing Claude session (cloud, iPad account) for the incoming Claude account (Mac + iPad).
**Start here. Everything you need is in this repository; you don't need the old conversation.**

## 1. Commits
| What | Commit |
|---|---|
| Destination base: `origin/main` "Initial commit" (README stub by the owner) | `71291bb` |
| Audited public source (staged locally, never pushed) | `aba51eb` |
| Migration branch `migration/public-baseline` | builds on `71291bb`; contains the `aba51eb` tree plus the boundary fix and this handoff (see `git log`) |

- The private development history (in the owner's private workspace repo) was **deliberately not copied**.
  It contained screenshots of private question-bank items.
- The migration branch is a normal fast-forward from `main`. Nothing was force-pushed.
- Merge it into `main` with a PR.

## 2. What the app is
A Bot-centred learning app. Tutor Bots serve questions, grade them, and reschedule each question on an
Ebbinghaus curve (1 → 2 → 4 → 7 → 15 → 30 days). The UI is a baseline in the style of Grok Bot (the owner's
explicit choice), with fidelity unverified. The owner will redesign features later. **Do not restart it from scratch.**

## 3. Architecture (Vite + React 18 + TypeScript, no UI or state libraries)
```
src/lib/store.ts    one persisted document (localStorage 'ebbinghaus.v1', debounced 120 ms, flushed on pagehide)
                    + ephemeral UI state; useStore(selector)
src/lib/runtime.ts  transport: optimistic send → pending → sent/failed, retry with the same id, offline outbox
                    runner: run lifecycle queued→acknowledging→thinking→working→completed|error|cancelled,
                            progressive reveal, resume after reload; botPresence() derives avatar state
src/lib/engine.ts   rule-based tutor: plan() → Part[] (quiz, grading, hints, units, stats, review, group handoffs)
src/lib/bank.ts     lazy per-subject shards from bank/*.json; deterministic item pick
src/lib/srs.ts      spaced-repetition schedule; nav.ts hash routes (#<convId>); seed.ts default Bots/groups
src/components/     Sidebar, Avatar, Transcript, Composer, Cards (typed Part registry), Dialogs, Popover, Markdown
src/styles/         tokens.css (all design tokens), avatar.css (per-state motion), app.css
scripts/            build-bank.mjs (data export), artifact.mjs (claude.ai preview bundle)
vite.config.ts      bank-boundary plugin (see §6)
```
Details: `docs/grokbot-ui-baseline/STATE_MACHINES.md`, `DESIGN_SYSTEM.md`.

## 4. Working features (verified in a browser)
- Roster: 7 default Bots plus a group. Stable order, pinning, reordering, unread badges, collapse, mobile drawer.
- Avatars: 8 states (idle, acknowledging, thinking, working, waiting, blocked, completed, error), always derived
  from real run, connection and quiz state.
- Messaging:
  - Enter sends, Shift+Enter adds a line, Korean IME guard, per-conversation drafts, @mentions in groups.
  - Attachments with real read progress, dictation (Web Speech), reactions, replies with jump-to, copy, search (Ctrl/⌘+K).
- Reliability:
  - Optimistic send with dedupe; a failed send can be retried.
  - Offline queue: the banner shows the count, then reconnecting, then flush.
  - Runs pause while offline (avatar shows blocked).
  - Reload mid-stream resumes from the saved offset with no duplicates.
- Learning:
  - MC, O/X and short-answer quizzes; grading; explanations (friendly or official style); hints; unit focus.
  - Spaced-repetition review list; stats card.
- Groups: the coach (에빙) hands requests to subject Bots. A tutor @mentions the coach after grading, and the
  coach confirms the review date (a visible Bot-to-Bot exchange).
- Bot editor (name, colour, shape, subjects, live state preview), details panel (skills toggles, routines, stats),
  settings (theme, motion, explanation style, stream speed, offline/failure simulation, reset via an in-page confirm).
- Responsive at 1440, 1280, 768 and 390 widths. Reduced-motion mode keeps the state poses but stops the loops.

## 5. Build / run / test (verified results at handoff: see §11)
```bash
npm ci                         # Node >= 20
npm run dev                    # http://localhost:5173  (bank regenerated automatically from the current env)
npm run typecheck && npm test  # tsc + vitest
npm run test:boundary          # data-boundary regression (no private data needed)
npm run build                  # → dist/ (sample data unless ITEMBANK_DIR is set)
npm run preview &              # :4173
npm run e2e                    # 20 Playwright scenarios → docs/evidence/
```
- `npm run e2e` needs Playwright and Chromium: `npm i -D playwright && npx playwright install chromium`.
  Or use an existing install: `PW=/path/to/node_modules/playwright npm run e2e`. It is not a devDependency
  (the cloud sandbox ships its own).

## 6. Data and storage boundaries (must stay intact)
- **The repo is public.** It ships only `fixtures/sample-items.jsonl`: 20 original questions with 0 matches to the
  private bank. The private bank (the owner's private itembank repository) is used only via
  `ITEMBANK_DIR=/path/to/itembank` at build time.
- `public/bank/` is generated and gitignored. Vite copies `public/` into `dist/` verbatim. A stale private export
  once leaked into a sample build: this was found during the handoff and fixed.
  - The `bank-boundary` plugin in `vite.config.ts` regenerates `public/bank` from the **current** environment at
    every build and dev start.
  - After the build, it fails and deletes `dist/` if a sample build contains non-sample data.
  - `npm run test:boundary` proves this with a fake private bank.
- **Never** commit `public/bank/`, `dist/` or `dist-artifact/`. Never publish a private-bank build publicly.
  Never commit screenshots taken on the private bank.
- Browser storage: all user data (conversations, SRS, Bots, settings, drafts) lives in **one localStorage key per
  browser origin**. There is no server, account or sync.
  - Images up to 1.5 MB are stored inline, so the localStorage quota (about 5 MB) can be exhausted. Writes then
    fail silently (they are caught) and the app keeps working in memory. This is a known issue.

## 7. Existing preview and access limits
- Private claude.ai artifact: https://claude.ai/artifact/Uqc37xyaBp8yrxQEnWvbH2. It is built from the **private**
  bank and owned by the **outgoing** account.
- The incoming account cannot edit or republish it unless the owner shares it with edit access. Treat it as frozen.
  **Do not modify or deploy it** (owner instruction).
- To make a new private preview from the incoming account: `ITEMBANK_DIR=… npm run build && npm run artifact`, then
  publish `dist-artifact/index.html` with the files listed in `dist-artifact/files.json` as a new private artifact.
- Artifact hosts allow only plain `#name` hashes and block `window.confirm`. The app already complies (routes are
  `#<convId>` with `[a-z0-9-]` ids; confirmations are in-page).
- Nothing is deployed. `ebbinghaus.study` is **not** connected. Deploying or touching DNS requires owner approval.

## 8. Known deficiencies and open issues
1. **Grok Bot fidelity unverified.** The outgoing cloud session could not reach x.ai or docs.x.ai (network
   allowlist). All visual values are approximations (`docs/grokbot-ui-baseline/REFERENCE_EVIDENCE.md`).
2. No AI model: free text gets an honest "not connected" reply. No backend or accounts; localStorage only (quota issue in §6).
3. 2,606 private items that need figures or passages are excluded (no media hosting).
4. Routines fire only while the app is open (no push).
5. Not automated: Korean IME composition, dictation on real devices, 60 fps profiling.
6. No LICENSE (the owner must decide; currently all rights reserved).
7. Subject codes are hard-coded in `seed.ts` and the `SUBJECT_NAMES` in `scripts/build-bank.mjs` (they reveal which
   subjects exist, not content).
8. Store schema is `v: 1` with no migration path yet. Changing persisted shapes needs a migration.
9. Group routing is keyword-based (the coach detects subject names, 문제 or 퀴즈).

## 9. Relevant documents
- `README.md`: setup and the data boundary.
- `CLAUDE.md`: working rules for Claude in this repo.
- `docs/grokbot-ui-baseline/`:
  - `REFERENCE_EVIDENCE.md`: sources and gaps.
  - `PARITY_MATRIX.md`: every behaviour, its status and evidence.
  - `STATE_MACHINES.md`: message, run, presence, connection and navigation states.
  - `DESIGN_SYSTEM.md`: tokens and components.
  - `DECISIONS.md`: accepted decisions.
  - `QA_REPORT.md`: commands, results, independent-review defects D1–D7 and fixes.
  - `HANDOFF.md`: gates and next steps.
- `docs/evidence/`: screenshots from the sample-data e2e run, plus `e2e-results.json`.

## 10. Decisions that must remain intact
- Keep the existing implementation; iterate, don't rewrite. The owner decides redesigns.
- Public repo, private data (§6). Keep the boundary plugin and `test:boundary` green.
- Never fake AI. Never drive avatar state from decorative timers (it must come from `botPresence`).
- Tokens stay central in `tokens.css` and `avatar.css`. Don't call anything "matched to Grok Bot" without reference evidence.
- Routes are `#<convId>` with `[a-z0-9-]` ids. No `window.confirm`/`alert`.
- Deterministic planning (seed = run id), so resumed runs reproduce their output.
- No force-push; no deploys, DNS changes, paid services or credential changes without the owner's approval.
- Stack (owner's STACK.md): Cloudflare for hosting and DNS, Supabase for backend/auth/DB, GitHub. No Vercel.

## 11. Verified results at handoff
See `docs/grokbot-ui-baseline/QA_REPORT.md` (section "Account-transfer verification") for the exact commands and
results on the migration branch.

## 12. Next tasks (priority order)
1. Open a PR `migration/public-baseline` → `main` and merge it (fast-forward, no force).
2. **Grok Bot reference pass.** The Mac account can open the real product. Capture screens and motion into
   `docs/evidence/reference/` (no private data), then tune `tokens.css` and `avatar.css` and update `PARITY_MATRIX.md`.
3. CI: a GitHub Action running `npm ci`, typecheck, test, `test:boundary`, build (and e2e with `npx playwright install chromium`).
4. Owner decisions: LICENSE; whether the public site serves sample data only.
5. Cloudflare deploy of the sample build, after approval. Connect `ebbinghaus.study` only after approval.
6. Supabase: auth, server-side conversations/SRS with RLS, and the private bank served **behind auth** (so it
   never ships in public static assets). Replace `deliver()` and the store persistence; keep the UI.
7. Store schema migration plus storage-quota handling (move attachments out of localStorage).
8. AI model adapter behind `engine.plan()` (costs money: owner approval).
9. Media hosting so the excluded items can return.
