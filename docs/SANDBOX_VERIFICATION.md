# PayPal Sandbox verification

Verified 2026-11-08T20:38:42.992Z (9 November 2026 in Asia/Kolkata). All amounts are test money.

Order: 0VU946856F2200421

Capture: 8T920704X5999612M, USD 30.00

- PASS: Automatic refund — 3YR82629TW987361X, USD 5.00
- PASS: Human-approved refund — 0HW57321YX756260J, USD 25.00
- PASS: Duplicate returns original operation
- PASS: Over-refund blocked before execution
- PASS: Repeat checkout return after full refund
- PASS: Persistent records and valid audit chain after server restart
- PASS: Genuine signed capture and both refund webhooks received

## Limits of this verification

- Gemma draft failed during this end-to-end run; refund proposals were entered manually.
- Provider pending, timeout and rejection paths use automated fixtures; not deliberately induced on PayPal.
- Webhook uses a temporary Cloudflare Quick Tunnel.

The ledger still reserves USD 30.00 of today's allowance for completed refunds. Refunding does not restore the daily allowance.

Run `npm test` for policy, checkout recovery, and provider-failure tests. Run `node --env-file=.env scripts/verify-sandbox.mjs` to recheck this scenario against PayPal and regenerate this report. The script only repeats existing request keys and imports the existing captured order; it does not create another charge or refund.
