# AgentGate

A local merchant control desk for evidence-backed PayPal refund cases. The support agent drafts a proposal; deterministic policy code checks it; a provider adapter executes it. Demo mode works without credentials. Sandbox mode uses PayPal test money.

## Run

Requires Node.js 24 or later. Install the pinned dependencies before starting.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Open http://localhost:4310. `npm test` runs the policy and accounting tests.

## Refund case workflow

Open **Refund cases** to record a customer request and merchant return review. Gemini investigates the selected payment using read-only tools, retrieves prior refunds and policy, searches verified audit evidence, and prepares a cited recommendation. Review the amount and policy decision, then submit through the existing refund engine. Individual approval and outcome tracking stay in the same case. See [CASE_WORKFLOW.md](docs/CASE_WORKFLOW.md) for data flow, controls, evaluation and limitations.

The review grid has named approval, uncertain-outcome and blocked-request queues, plus a payment/evidence detail pane. `npm run eval:cases` evaluates 50 labeled synthetic scenarios against the configured live model; it does not call PayPal.

## Order evidence and case recovery

Import order items, return status and written policy from a JSON file or the merchant form. Gemini calculates item-specific recommendations and asks for missing information; the server enforces structured return rules and the returned-item ceiling. Customer replies remain in the case conversation. A blocked request can open one linked follow-up without rewriting the original decision. See [ORDER_RETURN_WORKFLOW.md](docs/ORDER_RETURN_WORKFLOW.md) for the import example, safeguards and live evaluation scope.

`npm run eval:cases -- --suite=evidence` runs the 16-scenario evidence/conversation evaluation. Merchant records are supplied locally, not fetched from an ecommerce connector. No additional API key is needed.

## Sponsor tools

The refund review screen uses AG Grid Community with search, filters, sorting, pagination and individual review actions. Import the collections under `postman/`, or run `npm run test:postman` for the repeatable demo suite against an isolated database. See [SPONSOR_INTEGRATIONS.md](docs/SPONSOR_INTEGRATIONS.md) for setup, safety gates, Sandbox walkthrough and verification.

## Connect PayPal

Edit `.env` locally:

```dotenv
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
```

Restart the server. In Connections, create a test checkout and sign in with the sandbox Personal buyer. The app captures the approved order, saves the capture ID, and initially marks it unverified. In Refund requests, the merchant can mark it eligible after reviewing the simulated return. Submit a refund for that capture. All money is USD.

The sandbox app must belong to the test Business merchant. There is no live payment mode. An OAuth token is obtained server-side; secrets are never returned to the browser.

## Optional AI

Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` (default `gemini-3.5-flash-lite`), then restart. Draft with AI sends the selected capture and customer message to Gemini. Review and submit the result. Without a key the application explicitly uses manual proposals, not simulated AI. The model never receives payment credentials and cannot update merchant eligibility or policy.

## AI reliability

See [AI_RELIABILITY.md](docs/AI_RELIABILITY.md) for bounded retries, structured validation, remaining-balance checks, cancellation, manual entry, and diagnostics. Gemini 3.5 Flash-Lite passed three live synthetic drafting checks on 10 November 2026. The earlier Gemma checks returned 503 UNAVAILABLE; AgentGate reports those provider failures accurately.

## Webhooks

Local development webhook setup uses `scripts/webhook-proxy.mjs` on port 4311. It accepts only POST `/api/webhook`; every other path returns 404. Start it with `node --env-file=.env scripts/webhook-proxy.mjs`, then point a Cloudflare Quick Tunnel at `http://127.0.0.1:4311`. Register the printed HTTPS URL plus `/api/webhook` using `node --env-file=.env scripts/register-webhook.mjs https://YOUR-TUNNEL.trycloudflare.com/api/webhook`. The helper reuses an exact matching registration, saves its ID into `.env`, and verifies it by fetching it from PayPal. Restart AgentGate afterward. Quick Tunnel URLs are temporary and change when restarted, so a new URL must be registered again. Never point the public tunnel directly at the dashboard port 4310.

Expose only `/api/webhook` through a public HTTPS endpoint on port 443 and register it on the same sandbox REST app. Save its `PAYPAL_WEBHOOK_ID` in `.env`. Subscribe to relevant capture/refund events. `PUBLIC_URL` sets checkout return URLs if needed. Keep the merchant dashboard on localhost; never configure a tunnel to rewrite public requests into a trusted localhost Host header. This local prototype has no internet-facing merchant authentication.

Webhooks are verified via PayPal before recording them. Matching known pending refund IDs are re-fetched from PayPal. Use real sandbox events to test verification; simulator events do not support PayPal's postback signature verification endpoint. Pending requests can also be reconciled with Check outcome.

## Controls

- Transactional SQLite reservations serialize budget checks and writes before provider execution.
- Default auto threshold $20, daily allowance $100, per-refund maximum $100.
- Human approvals re-evaluate current eligibility, permissions, and available funds.
- Each logical request has a unique application key; altered reuse is rejected. PayPal requests use a stable operation UUID as `PayPal-Request-Id`.
- Uncertain outcomes and pending refunds keep reservations, including across UTC day boundaries. Process restarts turn executing records into unknown.
- A timeout without a refund ID requires inspection in PayPal Sandbox; the app will not automatically release funds or issue a fresh refund.
- SHA-256 chained audit events and SQL triggers detect local modification. This is not proof against a database administrator rewriting the complete database; checkpoints are not externally anchored.
- Demo and sandbox use separate SQLite databases under ignored `data/`.

## Demo

1. Propose $12 on DEMO-1042: completes through the simulated provider.
2. Propose $45 on DEMO-1043: requires merchant approval.
3. Propose a refund on DEMO-1045: denied because eligibility is unverified.
4. Repeat the same request key and identical details: returns the original operation.
5. Inspect Audit trail and its chain verification.

## Scope and limits

This is a single-merchant local prototype. Eligibility is explicitly set by the merchant; it is not inferred from customer text or a real returns integration. Budget accounting covers operations initiated here. PayPal still enforces its own refundable amount; external refunds are not yet fully imported into local capture balances. There is no customer identity verification, multi-user login, autonomous inbox processing, distributed worker queue, or PostgreSQL deployment yet. The AI investigator prepares evidence-backed recommendations; submitting a payment action is explicit and merchant approval is required above the configured threshold.

No credentials are bundled. The PayPal sandbox checkout, capture, automatic refund, approved refund and genuine signed webhooks were verified on 9 November 2026 (Asia/Kolkata). See docs/SANDBOX_VERIFICATION.md and docs/sandbox-verification.json for evidence and exact scope. Gemma drafting failed during that run; refund proposals were submitted manually. Test data is persistent; use distinct request keys for genuinely new requests.

Elastic evidence search is available from the sidebar. Configure the two ELASTICSEARCH fields in .env and restart. See [sponsor integration setup](docs/SPONSOR_INTEGRATIONS.md#elasticsearch-evidence-search) for indexed fields, permissions, and limits.
