# Ebbinghaus: instructions for Claude

- Read `docs/grokbot-ui-baseline/HANDOFF.md` first.
- **This repository is PUBLIC.** Never commit the private question bank, `public/bank/`, built bundles,
  secrets, or screenshots that show private bank items. Sample data lives only in `fixtures/`.
- Stack: Vite + React 18 + TS, no UI or state libraries. Deploy target is Cloudflare static assets.
  Don't add frameworks without a concrete reason.
- Visual values live in `src/styles/tokens.css` and `src/styles/avatar.css`. They are UNVERIFIED
  approximations of Grok Bot. Don't call anything "matched" without reference evidence.
- Bot state must come from real run/presence data (`botPresence`), never from decorative timers.
- Never fake AI. The engine is rule-based and must say so.
- Before claiming done: `npm run typecheck && npm test && npm run build`, plus `npm run e2e`.
