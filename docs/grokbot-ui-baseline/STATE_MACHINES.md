# Interaction state machines

## Data separation (`src/lib/store.ts`)
- **Persisted** (localStorage `ebbinghaus.v1`): bots, convs, messages, runs, srs, routines,
  settings, ui (selection, drafts, scroll positions, reply targets), seq, acked ids.
- **Ephemeral** (`eph`): connection state, acknowledging/completed pose timers, highlight,
  open dialog, mobile nav, toast, bank-ready flag.
- Writes are debounced (120 ms) and flushed on `pagehide` or when the tab is hidden.

## User message (transport, `runtime.ts`)
```
compose ─Enter→ pending (client id, optimistic, dimmed)
pending ─online & ack→ sent (canonical seq; id recorded in `acked`) ─→ starts bot run(s)
pending ─offline→ pending (queued; banner shows count) ─reconnect→ flushed in createdAt order
pending ─server reject→ failed ─"다시 보내기"→ pending (same id → no duplicates) | "삭제" → removed
attachments: message is held until FileReader finishes (real progress), then released
```

## Bot run (`runtime.ts drive`)
```
queued ─(no earlier active run for this bot+conversation)→ acknowledging (520 ms nod)
acknowledging → thinking (engine plans the output; at least 650 ms)
thinking → working (bot message created as `streaming`, revealed at streamCps)
working → completed (message `complete`; completed pose for 1.5 s; follow-up runs start)
any → cancelled (stop button; message `interrupted`)
plan failure → error (bot message with "다시 시도" action)
offline at any point → loop pauses; presence = blocked; resumes on reconnect
reload → resumeAfterReload(): unfinished runs continue from their saved state.
         Planning is deterministic (seed = run id), so a re-plan gives the same output, and
         streaming resumes from the saved `revealed` offset.
```

## Bot presence (derived, never timer-driven; `botPresence`)
Checked in this order. Active run + offline → **blocked**. Ack window → **acknowledging**.
Run working → **working**. Run queued/thinking → **thinking**. Completed window → **completed**.
Latest run failed → **error**. Latest message holds an unanswered quiz → **waiting**. Otherwise **idle**.

## Connection
```
online ─browser offline or "오프라인 흉내"→ offline ─back online→ reconnecting (900 ms) → online (flush outbox, resume runs)
```

## Navigation
`#/c/<convId>` is the source of truth. Back and forward work. An unknown id falls back to the first
conversation. Opening a conversation clears its unread count. Each conversation keeps its own
draft, scroll position and reply target.

## Group routing (`engine.ts`, `runtime.ts onAcked`)
- Answering a quiz goes to the Bot that asked it.
- @mentions go to the mentioned Bots (they run in parallel, one run per Bot).
- Otherwise the coach (에빙) takes it. If the request names a subject, or asks for a 문제, the coach
  hands off: a visible text plus an event, then a follow-up run for the tutor with the original request.
- After grading in a group, the tutor @mentions the coach. A follow-up run has the coach confirm the review date.
