# Order evidence and case recovery

Refund cases now retain a conversation, imported order/return evidence, a cited AI recommendation, and a readable timeline. This is a single-merchant hackathon prototype. It does not require another API key or an ecommerce account.

## Try the workflow

1. Open **Refund cases**, select a payment and enter the customer request.
2. Under **Order, return & policy**, enter records or load a JSON file. In simulated demo mode, **Fill synthetic example** fills a clearly labeled example; review it and save. The example is not a real order import.
3. Record a merchant eligibility review with an inspection reference when appropriate. Importing records alone never verifies eligibility.
4. Investigate. Gemini reads five sources: payment, previous refunds, permissions, audit evidence, and order/return records. It can calculate an item refund from quantity and unit price, identify missing facts, or ask a clarification question.
5. If asked a question, enter **Customer answer** and save the reply. The original message and question stay visible. Investigate again before submitting.
6. Submit an allowed recommendation. Amounts above the automatic threshold still require an individual approval.
7. For a denied request, describe what changed and choose **Start a follow-up review**. The original request remains denied. A linked case opens with the conversation and current evidence, but no old actionable recommendation.

The AI does not read attachments directly. JSON loading fills the local form; **Save merchant records** persists the validated record. Records are merchant-supplied, not independently authenticated through an order or shipping service.

## Import format

See `examples/merchant-order-return.json`. Change `capture` to a payment in your workspace. The form uses one order item per line as `SKU | name | quantity | unit price in USD`; returned items use `SKU | quantity`. Dates use `YYYY-MM-DD`.

- 1–30 unique purchased SKUs; quantities from 1 to 100.
- Return quantities cannot exceed purchased quantities or repeat a SKU.
- Exact positive USD unit prices; item totals cannot exceed the captured amount.
- Dates must be valid, not in the future, and in chronological order.
- Status is `requested`, `received`, `accepted`, or `rejected`. Received/accepted records need a receipt date.
- Policy has a reference, written text, a 1–365 day receipt window after delivery, and a boolean `requireReceived`.

Every imported record applies to its selected payment. Saving a changed record invalidates recommendations for that payment, including investigations already running. The AI receives the imported item names, notes, policy and references when investigation is requested. These text fields are untrusted content, not tool instructions.

## Execution rules

Existing limits, eligibility, balance accounting and idempotency still apply. Once a record is imported, the backend also blocks a rejected return, missing delivery/receipt dates, receipt outside the configured window, missing returned items, and a missing received status when required. It conservatively caps cumulative refunds at the imported returned-item value. Completed and unresolved refunds count against that ceiling, including earlier refunds on the payment. It does not allocate historical refunds to individual SKUs. Shipping, tax, goodwill credits and exceptions require a richer policy model; this return workflow does not automatically refund those amounts.

Written policy is context for the merchant and AI. The prototype enforces the structured rules above; it does not compile arbitrary legal or policy prose into executable permissions. A merchant must resolve conflicts or unsupported exceptions. Payments without imported evidence retain the original merchant-eligibility workflow.

The model must cite the merchant record when it is present. Citation validation checks source IDs, not the truth of every sentence. Conservative intent checks catch explicitly unsupported currencies, multiple USD amounts, some ambiguous item requests, exact USD amounts and clearly named item quantities. They prevent silent amount reduction in those recognized cases; they are not a general natural-language verifier. The model still interprets other phrasing, and the merchant reviews every recommendation.

## Conversation and follow-up safeguards

Replies append to the conversation, clear the old recommendation, and invalidate late AI output. Reply keys prevent accidental duplicate messages. Conversations have a bounded size. Existing cases migrate with an initial customer message and keep their existing request links.

Only denied requests can start a follow-up. Completed, processing, pending, uncertain and awaiting-approval requests cannot be retried through reconsideration. Each denied case has at most one direct follow-up. A follow-up needs fresh investigation and all current execution checks; it uses its own stable request key. Repeated submission of either case cannot execute it twice.

Audit events for imports and replies contain operational metadata, not item names, policy text or message bodies. Elastic continues to index only its allowlisted operational fields. Full records and conversation history remain in local SQLite; relevant facts are sent to Gemini for investigation.

## Verification commands

```powershell
npm test
npm run test:postman
npm run eval:cases
npm run eval:cases -- --suite=evidence
node --env-file=.env scripts/verify-case-sandbox.mjs --case=CASE_ID
```

The evidence suite contains 16 synthetic item, currency, conversation and hostile-text scenarios authored before its first live run. The first run passed 13/16 and exposed three intent errors. The full rerun after adding conservative intent checks passed 16/16. Both reports are retained as `EVIDENCE_AI_EVALUATION_BASELINE.json` and `EVIDENCE_AI_EVALUATION.json`. These are development evaluations, not a held-out benchmark after the fixes, and do not measure merchant time savings or production uptime.

The Sandbox verifier is read-only: it checks an already completed AI case, reads the refund from PayPal, and checks signed webhook evidence. It cannot create a charge or refund. A report with a pending webhook must not be described as fully verified.
