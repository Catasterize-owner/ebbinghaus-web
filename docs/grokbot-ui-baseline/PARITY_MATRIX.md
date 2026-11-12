# Parity matrix

Status values: **IMPL** = implemented and tested in a browser · **IMPL-UNTESTED** · **PARTIAL** · **BLOCKED**.
Every row's Grok Bot fidelity is **UNVERIFIED** (no reference reachable; see REFERENCE_EVIDENCE.md).
Test numbers refer to `tests/e2e.mjs`.

| Area | Behaviour | Where | Status | Evidence |
|---|---|---|---|---|
| Shell | Sidebar, header, transcript, composer, details panel | `App.tsx`, `app.css` | IMPL | desktop-*.png |
| Roster | Persistent Bots, pinned and other sections, stable order, presence line, unread badge | `Sidebar.tsx` | IMPL | e2e 12 (order survives reload) |
| Roster | Collapse/expand (Ctrl/⌘+.) with grid reflow | `Sidebar.tsx`, `app.css` | IMPL-UNTESTED | — |
| Roster | Context menu: pin, details, edit, move, delete | `Sidebar.tsx` | IMPL | e2e 12 (move) |
| Navigation | Hash routes; back/forward; selection survives reload | `lib/nav.ts` | IMPL | e2e 8, 12 |
| Navigation | Alt+↑/↓ switch, `/` focus composer, Ctrl/⌘+K search | `App.tsx` | IMPL | e2e 9, 15 |
| Avatar | 8 states, each with a distinct pose and motion; reduced-motion poses | `Avatar.tsx`, `avatar.css` | IMPL | avatar-states.png, e2e 15 |
| Avatar | Driven by real run state (ack → thinking → working → completed → idle; waiting = unanswered quiz; blocked = offline; error = failed run) | `runtime.ts botPresence` | IMPL | e2e 6b (blocked) |
| Composer | Enter sends, Shift+Enter adds a line, autosize, Korean IME guard, per-conversation drafts, ↑ recalls last message | `Composer.tsx` | IMPL | e2e 12 (draft) |
| Composer | @mention popover (groups), paste or drop files, attach, dictation (Web Speech) | `Composer.tsx` | IMPL (dictation untested; depends on the browser) | e2e 10 |
| Sending | Optimistic → pending → sent (seq) / failed → retry; dedupe by client id | `runtime.ts` | IMPL | e2e 2, 13 |
| Streaming | Progressive reveal, caret, cards appear after text, stop button | `runtime.ts`, `Transcript.tsx` | IMPL | desktop-streaming.png |
| Reload | Resumes mid-stream from the saved offset; no duplicates; stray streams marked interrupted | `runtime.ts resumeAfterReload` | IMPL | e2e 5 |
| Network | Offline banner, queued sends, reconnecting → online, flush; runs pause (blocked) and resume | `runtime.ts syncConnection` | IMPL | e2e 6, 6b |
| Scrolling | Follows when at the bottom, no yank when reading history, "new messages" pill, position saved per conversation | `Transcript.tsx` | IMPL | e2e 4 |
| Messages | Grouping, timestamps, reactions, reply with quote, jump to quoted message, copy, more menu | `Transcript.tsx` | IMPL | e2e 11 |
| Groups | Create group, distinct authors, @mention routing, coach handoff, Bot-to-Bot follow-up, per-Bot presence chips | `engine.ts`, `runtime.ts`, `App.tsx` | IMPL | e2e 7, desktop-group.png |
| Cards | Quiz (MC / O/X / short answer), units, stats, review list, actions, attachments, events | `Cards.tsx` | IMPL | e2e 1, 10 |
| Bot editing | Create and edit name, colour, shape, intro, subjects; live preview of every state | `Dialogs.tsx` | IMPL | e2e 16 |
| Skills | Per-Bot toggles (quiz, hints, review) that change engine behaviour | `Dialogs.tsx DetailsPanel`, `engine.ts` | IMPL-UNTESTED | — |
| Routines | Daily time and toggle; fires while the app is open | `App.tsx useRoutines` | PARTIAL: no push or server scheduling | — |
| Settings | Theme, motion, explanation style, stream speed, offline and failure simulation, reset | `Dialogs.tsx` | IMPL | e2e 9, 13 |
| Search | Bots, groups, message text; keyboard navigation | `Dialogs.tsx SearchPalette` | IMPL | e2e 9 |
| Responsive | 1440 / 1280 / 768 / 390 widths, mobile drawer nav | `app.css` | IMPL | e2e 14, 14b, 14c |
| AI replies | Free-form understanding | — | BLOCKED: no model or backend connected (honest fallback message) | — |
| Accounts / sync | Server persistence, multi-device | — | BLOCKED: no Supabase project connected | — |
| Cloud computer | — | — | OUT OF SCOPE (owner) | — |
