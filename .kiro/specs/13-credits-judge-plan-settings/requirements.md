# Requirements: 13 credits, judge plan and settings

Credits that are real: a server-side ledger that every cloud action draws from, never below zero, with refunds when a call fails. The free plan's 20 credits and the judge plan's larger allowance come from Remote Config. A creator who runs out sees Pip with empty pockets and keeps editing on the device for free. The Settings page shows the account, the credits and their history, the AI preference, and a usage chart that splits on-device and cloud calls, which is the proof of the hybrid story for judges. Lands by **Fri Nov 27, 2026**; the ledger core (tasks 1–5) lands first, before spec 09's Generate task.

Written headlessly by Kiro CLI (`motionpop-builder`, Opus 5.5) on 2026-11-16. Not yet approved by the founder.

Sources: `product.md` (Credits), `ai-tasks.md` (cost table), `security-and-cost.md`, `data-model.md` (UserDoc, CreditTx, UsageEvent, rules sketch), `hybrid-ai.md` (usage logging), `screens.md` (Settings, Out of credits, credits chips), `pip-mascot.md` (`empty-pockets`), `hackathon-compliance.md` (judge access), `handoff.md` §10 (Settings belongs here), D-019, D-027 (usage needs a server route), D-032 (plan allowance).

**Already built, reused, not re-specified:** `POST /api/users/bootstrap` with 20 free credits, the judge allow-list (`JUDGE_EMAILS` secret, verified email required) and the first ledger entry (spec 01 tasks 6 and 8); `UserDocSchema`, `CreditTxSchema`, `CreditReasonSchema`; Remote Config `freeCredits`, `judgeCredits`, `killSwitch`, `dailyBudgetCredits` (client and server); `verifyRequest` (ID token + App Check); `users/{uid}/limits/{day}` with the plan allowance transaction; Firestore rules that keep credits, plan, ledger, usage and limits server-written; `CreditsChip` with the rolling number; `Modal`, `Toggle`, `Pip` with `empty-pockets`; the `CreditsClient` seam and `LocalCredits` (spec 09).

**Out of scope:** real payments, plans other than free and judge, buying credits, BYOK, team accounts, an automatic global budget counter (the kill switch stays a manual Remote Config flag with GCP budget alerts), export pricing details (spec 08 calls the same ledger).

## R1 Ledger
_As the founder, I want credits to be exact, so nobody gets free cloud work by accident and nobody is charged for a failure._
1. **R1.1** THE SYSTEM SHALL change a balance only in server code (Admin SDK) inside a Firestore transaction that, in one commit, updates `users/{uid}.credits` and writes one ledger entry `users/{uid}/credits/{txId}` with `delta`, `reason`, `refId`, `balanceAfter` and a server timestamp.
2. **R1.2** WHEN a client asks to spend THE SYSTEM SHALL compute the cost on the server from the action and its units (never from a client-sent amount), and IF the balance is below the cost THEN it SHALL refuse with `insufficient` and write nothing.
3. **R1.3** THE SYSTEM SHALL make a spend idempotent by a client key: a repeated request with the same key returns the first result and charges once.
4. **R1.4** WHEN a client asks to refund a spend THE SYSTEM SHALL refund it at most once, only for the caller's own AI spends that are at most 15 minutes old, and at most 10 client refunds per user per UTC day.
5. **R1.5** THE SYSTEM SHALL keep `balanceAfter ≥ 0` on every entry, and the balance SHALL equal the sum of the user's ledger deltas, under any concurrency.
6. **R1.6** THE SYSTEM SHALL expose the same transaction to server code (`spendCredits`, `refundCredits`) so spec 08's export and render refund use it without an HTTP hop.

## R2 Costs
_As a creator, I want the price of every cloud action shown before I click, and to pay exactly that._
1. **R2.1** THE SYSTEM SHALL keep one cost table in `packages/ai/src/cost.ts` matching `ai-tasks.md` (generate 3, edit 1, pip-plan 2, custom 3, slots-detect 1 per 200 words, tts 2 per minute, transcribe 1 per minute, image from `imageCredits`, export by resolution), with Remote Config able to override single entries through one JSON key.
2. **R2.2** THE SYSTEM SHALL use the same table for the chip shown before an action and for the server charge.

## R3 Limits
_As the founder, I want spend capped so one account or one bug can't drain the budget._
1. **R3.1** THE SYSTEM SHALL refuse AI spends past 30 per user per UTC hour with `rate-limit` (Remote Config `rateLimitCloudPerHour`), and the client SHALL show "Pip needs a short break. Try again in a few minutes."
2. **R3.2** WHILE the Remote Config kill switch is on THE SYSTEM SHALL refuse AI spends with `paused` (exports still run), and the client SHALL disable cloud actions with "Cloud AI is paused".

## R4 Plans
_As a judge, I want a generous allowance that doesn't run out mid-review._
1. **R4.1** THE SYSTEM SHALL keep granting 20 credits (`freeCredits`) on sign-up and `judgeCredits` (default 500) to verified allow-listed accounts (built in spec 01).
2. **R4.2** WHEN an existing free account signs in with a verified email that is now on the allow-list THE SYSTEM SHALL upgrade it to `judge` and grant the difference up to `judgeCredits`, once.
3. **R4.3** WHEN a judge account signs in with fewer than 20 % of `judgeCredits` THE SYSTEM SHALL top it up to `judgeCredits`, at most once per UTC day.
4. **R4.4** THE SYSTEM SHALL record every grant in the ledger (`judge-grant`, with `refId` `upgrade` or `refill-{yyyy-mm-dd}`).

## R5 Balance in the app
_As a creator, I want to always see my balance and understand what happened when it runs out._
1. **R5.1** THE SYSTEM SHALL show the live balance in the editor's credits chip ("⚡ 120") and offer it to the dashboard chip ("✦ 120 credits", spec 11) and the export modal ("120 available", spec 08), rolling the number when it changes.
2. **R5.2** WHEN the user clicks a credits chip THE SYSTEM SHALL open Settings at the Credits section.
3. **R5.3** WHEN a cloud action is attempted with a balance below its cost, or the server answers `insufficient`, THE SYSTEM SHALL open the out-of-credits modal: Pip with empty pockets, "Pip needs a recharge", "You can still make small edits on your device for free.", "Keep editing" (closes it), and no charge.
4. **R5.4** WHILE the balance is loading THE SYSTEM SHALL show the chip without a number (a soft shimmer) and treat cloud actions as not yet allowed.

## R6 Settings
_As a creator, I want one place for my account, my credits and how my AI runs._
1. **R6.1** THE SYSTEM SHALL provide `/settings` and the same content as the editor's Settings left panel (340 px), opened from the account menu (avatar) in the editor, the dashboard and Settings itself. The editor rail keeps its eight designed items.
2. **R6.2** THE SYSTEM SHALL show an **Account** section: avatar (Pip face fallback), display name, email, plan chip ("Free" or "Judge"), and "Sign out".
3. **R6.3** THE SYSTEM SHALL show an **AI & models** section with the toggle "Prefer on-device AI" (`settings.preferOnDevice`, default on, saved to `users/{uid}` by the client under the rules), the on-device status ("Ready", "Setting up · 34 %", "Can be set up" with "Set up on-device AI", or "Not available in this browser" with a link to the README's Chrome flag instructions), and the usage chart (R7).
4. **R6.4** THE SYSTEM SHALL show a **Credits** section: the balance (large, mono), the plan's allowance line ("Free plan · 20 credits on sign-up" or "Judge plan · topped up daily"), the cost list of cloud actions, and the last 20 ledger entries (reason in words, signed delta in mono, relative time).
5. **R6.5** WHEN "Prefer on-device AI" is off THE SYSTEM SHALL route quick edits and notes to the cloud with their ☁ 1 chip (spec 09 `chooseRoute`), and leave auto-fill on the device.

## R7 Usage
_As a judge, I want to see that small edits really ran on the device._
1. **R7.1** THE SYSTEM SHALL persist every router usage event to `users/{uid}/usage/{eventId}` through `POST /api/usage` (batches of at most 50, server timestamp, at most 1,000 events per user per UTC day), because the rules block client writes.
2. **R7.2** THE SYSTEM SHALL buffer events on the client and flush them every 15 s, at 20 events, and when the page is hidden (keepalive), dropping nothing on a failed flush until the next one succeeds or the buffer passes 200 events.
3. **R7.3** THE SYSTEM SHALL show a 14-day chart of AI calls per day, stacked on-device (mint) and cloud (violet), with three figures: calls on the device, median latency on the device and in the cloud, and credits saved (the cloud cost of the calls that ran on the device).
4. **R7.4** WHERE Firebase is not configured (local mode) THE SYSTEM SHALL show the current session's usage only, labelled "This session".

## Non-functional
- A spend round trip (route + transaction) under 400 ms p50 against the deployed backend (measured in task 4's manual check, not assumed).
- Credits are a cost and UX guard, not a security boundary, for AI calls made from the browser: a modified client that passes App Check could call AI Logic without spending. App Check, AI Logic's per-user limits, the rate limit, GCP budget alerts and the kill switch are the real caps. The write-up says so.
- No secrets in the repo; the judge allow-list and test account password stay in Secret Manager / the founder's hands.
- Rules tests for every path this spec writes or validates.
