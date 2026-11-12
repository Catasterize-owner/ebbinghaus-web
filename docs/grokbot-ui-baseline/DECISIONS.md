# Decisions

1. **New app instead of the original Ebbinghaus frontend** (owner, 2026-11-12). The original lives
   only on the Mac. This repo is the new web.
2. **Vite + React 18 + TypeScript, no UI or state libraries.** Small bundle (≈75 KB gzip). Every
   interaction state is in our code, so motion and state stay connected. It deploys as static files
   to Cloudflare (STACK.md).
3. **Local-first runtime for the preview.** Transport and runs persist in localStorage, so reload and
   offline behaviour are real and testable without a backend. Supabase (STACK.md) is the next step:
   replace `deliver()` and persistence, keep the UI.
4. **Rule-based engine, labelled honestly.** Quizzes, grading, hints, explanations and review
   scheduling are real (item bank data). Free-form chat is not faked: the reply says no AI model is
   connected. The composer footer says the same.
5. **Item export drops media and passage items** (2,606 of 17,226). No media hosting yet.
   14,620 items in 32 subject shards, loaded only when needed.
6. **Visuals are approximations**, because the Grok Bot references weren't reachable
   (REFERENCE_EVIDENCE.md). Tokens are centralised so the parity pass changes one file.
7. **Deterministic planning (seed = run id)**, so a run resumed after reload produces identical output.
8. **Public repo, private data** (2026-11-12). The repository is public, so it ships only 20 original
   sample questions. The private bank is used only through `ITEMBANK_DIR` at build time, and its output is gitignored.
   History was restarted for the public repo, because the earlier private history held screenshots of bank items.
   The engine uses only the subjects present in the loaded data.
