# Handoff: ebbinghaus-web baseline

**Status: PARTIAL (functional preview done; Grok Bot parity unverified; no backend).**

## Where things are
- Code: `src/` (see DESIGN_SYSTEM.md for the component map). Tests: `src/__tests__`, `tests/e2e.mjs`.
- Evidence: `docs/evidence/` (screenshots for each scenario, `e2e-results.json`).
- **Authoritative source: this repository (public).** The earlier copy in the owner's workspace repo is
  superseded and kept only as history.
- Data boundary: the public repo has 20 original sample questions (`fixtures/`). The private bank is used only via
  `ITEMBANK_DIR` at build time. See README → "Question data".
- Preview: a private claude.ai artifact built from the **private** bank with
  `ITEMBANK_DIR=… npm run build && npm run artifact`. Publish `dist-artifact/index.html` plus the
  files in `dist-artifact/files.json`. Never publish that bundle publicly.

## Ownership / execution record
- One lead session wrote all code and docs (sequential; the files are tightly coupled, so no parallel writers).
- One independent QA agent (separate context, read-only) reviewed the running build and found 7 defects,
  all fixed. Model routing: lead on the session model; reviewer on Sonnet. No other agents.
- No changes to Claude settings, compaction, skills or hooks.

## Gates
A identity: new repo by owner decision ✔ · B evidence: **blocked** (references unreachable) ·
C contracts ✔ (STATE_MACHINES.md) · D functional core ✔ (20/20 e2e) · E visual/motion parity: **blocked by B** ·
F independent QA ✔ (D1–D7 fixed and retested).

## Next steps (in order)
1. Owner: allow `x.ai` and `docs.x.ai` in the environment network settings → run a reference pass → tune `tokens.css` and
   `avatar.css` and update PARITY_MATRIX.md.
2. Add the GitHub Actions → Cloudflare deploy. Decide whether the public site uses the sample data or a
   private-bank build from a private pipeline. Point `ebbinghaus.study` at it only after approval.
3. Owner decision: add a LICENSE (none yet, which means all rights reserved).
4. Supabase: auth, plus server tables for conversations, messages and SRS (RLS). Replace `deliver()` and the persistence in `store.ts`.
5. An AI model adapter behind `engine.plan()` (needs an API key; costs money, so owner approval).
6. Media hosting, so the 2,606 figure and passage items can be included.
