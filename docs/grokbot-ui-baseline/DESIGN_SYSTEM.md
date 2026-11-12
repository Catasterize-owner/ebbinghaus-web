# Components and design tokens

## Tokens: `src/styles/tokens.css`
Type scale, spacing (4 px grid), radii, layout sizes (sidebar 268/64, header 56, content 780,
details 320), z-layers, motion durations (90/160/240/380 ms), easings (`--ease-out`,
`--ease-in-out`, `--ease-spring`), and dark/light colour sets. **All values are approximations.**
To rebrand, change the variables, not the components.

## Avatar motion: `src/styles/avatar.css`
One animation per state, on `.av-body` (body) and `.av-eyes` (eyes). Every keyframe starts and ends
at the neutral pose, so switching state mid-loop doesn't jump. Reduced motion removes the loops but
keeps the per-state pose (eye shape, filter, ring). New avatar shapes go in `BODY` in `Avatar.tsx`.

## Components
| Component | Role | Extend by |
|---|---|---|
| `Sidebar` | roster sections, group list, row context menu | add a section |
| `Avatar` / `AvatarView` | state-driven avatar (live / presentational) | new shape or state CSS |
| `Transcript` / `MessageRow` | grouping, streaming reveal, actions, reactions, replies, scroll | — |
| `Cards.renderPart` | **component registry** for typed parts | new `Part` kind in `types.ts` + case here (e.g. diagrams, practice sets) |
| `Composer` | input, mentions, attachments, dictation, stop | — |
| `Popover` / `MenuItem` | anchored menus with arrow keys, Escape and focus return | — |
| `Modal` | focus trap, Escape/scrim close, exit animation, focus return | — |
| `DetailsPanel` | Bot profile, skills, routines, stats, state strip | — |
| `lib/engine.ts` | rule-based tutor (`plan()` → `Part[]`) | swap for a model-backed adapter with the same output |
| `lib/runtime.ts` | transport and run lifecycle | replace the `deliver()` body with a real API |
| `lib/bank.ts` | lazy subject shards from `public/bank` | point at a CDN or Supabase storage |
