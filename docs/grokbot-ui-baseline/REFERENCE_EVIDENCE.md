# Reference evidence: Grok Bot UI/UX

Reference date: 2026-11-12. **No Grok Bot source was directly inspected.**

| Source | Status |
|---|---|
| x.ai/news/designing-grok-bot | NOT REACHED: `x.ai` is not on the session's network allowlist (DNS refused) |
| x.ai/bot/guides/designing-grok-bot-with-grok-bot | NOT REACHED (same host) |
| docs.x.ai/grok-bot/{chat-and-collaboration, bots, skills-routines-and-automations, overview} | NOT REACHED: `docs.x.ai` not allowlisted |
| x.ai/changelog/bot | NOT REACHED |
| A logged-in Grok Bot session | NOT AVAILABLE: no authorized session in this cloud container |

## What the build is based on
Only the owner's brief (`CLAUDE_GROKBOT_UI_UX_MOTION_IMPLEMENTATION` rev 2.0). It names these patterns:
- Persistent Bots as the main navigation objects (a roster, not a chat list)
- Animated avatars that show identity and working state: idle, thinking, working, waiting, blocked, done
- 1:1 and group conversations; Bot-to-Bot messages, handoffs and per-Bot presence
- Skills, routines, cards and artifacts; voice and dictation; settings

Everything visual (sizes, colours, type, radii, timings, easing, avatar shapes and poses) is a
**tuned approximation, labelled UNVERIFIED**. None of it is a measurement of Grok Bot. Values live in
`src/styles/tokens.css` and `src/styles/avatar.css`, so a later parity pass can change them in one place.

## Open evidence gaps (to close once the hosts are allowlisted)
1. Real layout measurements: sidebar width, header height, composer shape, message spacing.
2. Typeface and colour palette, light and dark.
3. Avatar art and per-state motion: shape deformation, eye behaviour, timing, springs.
4. Message send sequence: optimistic look, pending marker, where streaming starts.
5. Group chat presentation: how simultaneous Bot activity is shown.
6. Keyboard shortcut set.
7. Mobile behaviour.

To close them: allow `x.ai` and `docs.x.ai` in the environment's network settings, then run a
reference pass that captures screenshots and frame sequences into `docs/evidence/reference/`.
After that, update PARITY_MATRIX.md.
