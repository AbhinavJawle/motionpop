---
inclusion: always
---

# Security and cost

## Secrets
- Never commit keys, tokens, service accounts or App Check debug tokens. `.env.example` lists names only.
- Server secrets (Claude key, admin config) live in Secret Manager, read by App Hosting and Cloud Run. Never logged, never returned to the client.
- The Firebase web config is public by design; protection comes from App Check + rules.

## Firebase
- App Check enforced on AI Logic, Firestore, Storage and our API routes from day one.
- Firestore + Storage rules: owner-only. `credits`, `plan`, `renders` and the credit ledger are server-written only. Share pages read through a server route with signed URLs.
- Rules are tested on the emulator (`testing.md`).

## Generated code (tier 2)
- Runs only in a sandboxed iframe (`sandbox="allow-scripts"`, no same-origin), strict CSP, no network.
- The render service runs it in an isolated container with no credentials beyond writing its own output.
- Lint rejects `Date.now`, `Math.random`, timers, `fetch`, CSS animations/transitions and external URLs.

## Uploads
- Audio ≤ 50 MB (`audio/*`: MP3, WAV, M4A), images ≤ 10 MB (`image/*`). Validate type and size client-side and in rules.
- Stock media only CC0 / CC-BY with stored attribution.

## Cost controls
- Show the cost before every credited action. Credits never go negative (server transaction + property test).
- Rate limit: 30 cloud generations per hour per user. Global daily budget kill switch in Remote Config.
- GCP budget alerts on the project. Keep judge access funded until Jan 29, 2027.
