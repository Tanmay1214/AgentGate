# Sponsor integrations

## AG Grid Community

The Refund requests screen uses AG Grid Community 36.3.0, installed from npm and served locally. It supports text search, exact status filtering, per-column text/number/date filters, numeric sorting, resizing and pagination. A pinned Actions column exposes Details and the existing per-request Approve, Reject or Check outcome actions as appropriate. It does not offer bulk approval or editable amounts.

Grid filters, column state and page position are preserved while reviewing requests or navigating views in the current browser session. The Details dialog renders customer text as escaped text. Normal backend authorisation, approval rechecks and budget reservations apply to grid actions.

The pinned npm dependency and its MIT licence are copied to ignored `public/vendor/` by `npm ci`, `npm install`, `npm run dev` or `npm start`. No CDN, Enterprise trial, licence key or remote data service is required. Only inline style attributes and local/data fonts are permitted for grid layout and icons; scripts remain restricted to this server.

## Postman

Import these files into Postman:

- `postman/AgentGate-Demo.postman_collection.json`
- `postman/AgentGate-Sandbox.postman_collection.json`
- `postman/AgentGate-Local.postman_environment.json`

No Postman account or API key is needed for the local CLI run. No PayPal/Gemini credentials are included in either collection: those stay on the backend.

### Repeatable automated demo

```powershell
npm ci
npm run test:postman
```

The runner starts a separate local server on an available port, explicitly selects demo mode, disables payment/AI credentials, and uses a new SQLite database in ignored `data/postman/run-*`. It executes the actual exported collection using the official Postman CLI, disables event reporting with `--no-report-events`, and stops the owned server afterward. Local run reports remain under that ignored directory and can contain temporary local session tokens; do not publish them.

The collection's 19 requests include 33 assertions for automatic refunds, approval before execution, completed approved refunds, duplicate prevention, conflicting request keys, merchant eligibility, over-refund denial, daily budgets, invalid money, revoked access, restored policy, audit integrity, missing sessions and cross-site requests. Each write also verifies the server is in demo mode. Running it against Sandbox stops at the initial mode check before writes. Run the entire collection, not an isolated middle request. The automated runner always supplies a fresh database because repeating the complete scenario against an already-used demo balance is not equivalent to a fresh run.

### Manual PayPal Sandbox walkthrough

Select the Local environment and use the Sandbox collection against `http://localhost:4310`. By default, its mutation requests are skipped. First run Establish local session and Verify Sandbox connection.

1. Set `sandbox_writes_enabled=true` only when you want to make test-money operations.
2. Send Create test checkout. The collection stores `order_id` and `approval_url` in its current collection variables. Open approval_url in a browser and approve with a sandbox Personal buyer.
3. Set `buyer_approved=true`, then send Capture. The response stores `capture_id`.
4. Review the synthetic return; set `merchant_return_verified=true`, then send Mark reviewed return eligible.
5. Review `refund_amount`, then send Propose sandbox refund. Repeating the identical request uses the same `refund_request_key`; for a genuinely different proposal clear that variable and establish a new session to generate a new key. Changing a key may create a new logical refund.
6. If approval is required, review the request, set `approval_granted=true`, then send Approve refund. Unknown outcomes require investigation; the test does not count them as completed refunds.
7. Inspect transactions and webhook evidence after delivery. Audit trail verification is automatic; matching a specific real webhook remains a manual inspection in this walkthrough because delivery is asynchronous.

The collection never logs into the buyer account or automatically bypasses these manual checkpoints. A default complete CLI run skips mutation requests and performs five read-only assertions.

## Verification — 10 November 2026

- Disposable demo: 19 collection requests, 33 assertions, zero failures.
- Sandbox collection default mode: five assertions, zero failures; payment writes skipped.
- Demo collection pointed at Sandbox: deliberately failed its demo-mode assertion and stopped after two reads. The sandbox request count and audit head were unchanged.
- Browser QA on a separate demo instance: pagination through 14 synthetic rows, approval filtering, request details, individual approval, text search and descending numeric amount sorting.
- Unit tests cover safe cell rendering, valid action visibility and numeric values alongside existing payment/AI controls.

These are product integrations, not a claim of eligibility for any particular sponsor prize. Check the event's exact prize rules before submitting.

References: https://www.ag-grid.com/javascript-data-grid/getting-started/ and https://learning.postman.com/docs/postman-cli/postman-cli-overview/

## Elasticsearch evidence search

Set ELASTICSEARCH_URL to the HTTPS Elasticsearch endpoint and ELASTICSEARCH_API_KEY to the encoded key, without an ApiKey prefix. Restart AgentGate, then open Evidence search. The key needs create_index, write, and read permissions for agentgate-sandbox-evidence-v1 (or agentgate-demo-evidence-v1). Credentials remain server-side.

Search payment IDs, request IDs, statuses, policy reasons and event types. Use record type, status and rolling date filters; each search returns at most 50 records and the total count. This is keyword search with structured filters, not a natural-language AI assistant. Open refund details from a result to inspect the original local record. Audit results include the source sequence and hash for comparison with Audit trail.

Before searching, the backend upserts refund snapshots and incrementally indexes new audit events, with deterministic document IDs and retries after partial bulk failures. Sync errors are shown rather than presenting stale results as current. SQLite remains the source of truth. Indexing and search do not execute payments or change the local audit chain. Search is limited to this data directory and execution mode. Moving or resetting the database requires a fresh namespace/index before reusing it; old documents are not automatically deleted. The index is a search projection, not an independent audit integrity verifier.

Only operational metadata is sent to your configured Elastic deployment: IDs, amounts in cents, timestamps, statuses, decision codes, event types, sequence numbers and hashes. Customer notes, payment labels, raw event bodies, request keys and credentials are excluded. Search terms are sent to Elastic. No metadata is sent until a search or explicit sync is requested. On-demand sync reindexes all refund snapshots; this is intended for this single-merchant prototype, not a large production history.

API routes use the existing local session and origin checks: POST /api/evidence/search accepts query, kind, status and days; POST /api/evidence/sync refreshes the projection. Automated Postman demo tests do not invoke either endpoint.
