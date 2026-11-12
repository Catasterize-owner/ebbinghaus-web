# Ebbinghaus

A Bot-centred learning app. Tutor Bots give you questions, grade your answers and bring each
question back on an Ebbinghaus forgetting curve (1 → 2 → 4 → 7 → 15 → 30 days). The interface is a
baseline modelled on the Grok Bot interaction style: a persistent roster of Bots, avatars that show
what each Bot is doing, 1:1 and group chats, and Bot-to-Bot handoffs.

> **Status: preview (v0.1).** Data is stored only in your browser. No AI model is connected: the Bots
> run on a rule-based engine and say so. The Grok Bot visual fidelity is unverified (see
> `docs/grokbot-ui-baseline/REFERENCE_EVIDENCE.md`).

## Requirements
- Node.js 20 or newer, npm

## Quick start
```bash
npm ci
npm run dev          # http://localhost:5173 (builds the sample question data on first run)
```

Production build:
```bash
npm run build        # typecheck + build into dist/
npm run preview      # serve dist/ on http://localhost:4173
```

## Question data (data boundary)
This repository ships only **20 original sample questions** (`fixtures/sample-items.jsonl`) so the app runs
out of the box. The full question bank is private and is **not** included. Build-time data goes to
`public/bank/`, which is gitignored.

| Mode | Command | Data |
|---|---|---|
| Public sample (default) | `npm run bank` | `fixtures/sample-items.jsonl` |
| Private bank | `ITEMBANK_DIR=/path/to/itembank npm run bank` | `items/<SUBJECT>/*.jsonl` in that checkout |

Never commit `public/bank/`, `dist/` or `dist-artifact/`. A build made with the private bank must not be
deployed anywhere public without the owner's approval.

## Tests
```bash
npm run typecheck
npm test                                   # vitest unit tests
npm run build && npm run preview &         # then, in another shell:
npm run e2e                                # Playwright browser scenarios → docs/evidence/
```
`npm run e2e` needs Playwright and Chromium: `npm i -D playwright && npx playwright install chromium`.
If Playwright is already installed somewhere else, run `PW=/path/to/node_modules/playwright npm run e2e`.

## Project layout
```
src/lib/        store (persistence), runtime (send/ack/retry, bot runs, presence), engine (rule-based tutor),
                bank (lazy subject shards), srs (review schedule), nav (hash routes), seed (default Bots)
src/components/ Sidebar, Avatar, Transcript, Composer, Cards (part registry), Dialogs, Popover, Markdown
src/styles/     tokens.css (all design tokens), avatar.css (state motion), app.css
scripts/        build-bank.mjs (data boundary), artifact.mjs (claude.ai preview bundle)
fixtures/       public sample questions
tests/          e2e.mjs (Playwright), smoke.mjs
docs/           grokbot-ui-baseline/ (reference evidence, parity matrix, state machines, design system,
                decisions, QA report, handoff), evidence/ (screenshots from the sample-data e2e run)
```

## What is real and what isn't (yet)
- **Real:** quizzes (multiple choice, O/X, short answer), grading, explanations and hints, the review
  schedule, Bots and groups, persistence across reloads, the offline queue, and resuming a stream after reload.
- **Local only:** everything is stored in localStorage. No accounts or server sync yet.
- **Not connected:** an AI model, media hosting (questions with figures are excluded).
