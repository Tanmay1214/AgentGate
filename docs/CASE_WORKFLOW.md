# Refund case investigation

Open **Refund cases**, select a payment and enter the customer request. The case is persisted separately from refund requests. Opening or investigating a case does not call PayPal.

The Gemini investigator uses four read-only tools: retrieve payment and merchant return status, retrieve prior refunds, retrieve current limits and allowance, and search audit evidence. Tool calls are restricted to the case's selected payment. It must retrieve all four sources before finishing with a cited draft or a clarification question. The model cannot change eligibility, limits, approvals or provider outcomes.

Record a merchant return review with a reference to your inspected return record when appropriate. This is an explicit merchant action, not an inference from the customer's text. Existing verified captures remain usable without a newly recorded reference; the screen distinguishes them.

Review the recommendation, proposed amount and current policy decision together. Clear amounts can be drafted even if eligibility is unverified, but the policy engine blocks execution until the merchant verifies eligibility. Ambiguity, an unsupported currency, exhausted balance and excess amounts require clarification. Editing the case invalidates its draft. Changing payment history, return status, daily allowance or limits makes a draft stale and requires reinvestigation.

Submission rechecks the evidence snapshot and policy, then atomically creates a reservation and links one refund request to the case. The operation uses a stable idempotency key. Repeated submission returns that same request. Above-threshold proposals wait for an individual merchant approval; approval rechecks current policy. Uncertain outcomes retain reservations and offer provider reconciliation. Cases display the actual linked request's current outcome after refresh or reload.

## Evidence and explanations

When Elastic is configured, the investigator searches events related to the selected capture or its refund requests. Each returned citation must match an event sequence and hash in the local ledger and belong to this payment. Search results with an invented or mismatched hash are not cited. Elastic outages produce an explicit local-ledger fallback. Payment balances and policy always come from SQLite.

The case recommendation includes a model-written rationale with validated citation IDs. The **Explain decision** action in the review queue and case view uses a deterministic explanation of the recorded decision, with audit citations; it does not ask a model to invent a reason. The review pane shows the customer request, current remaining balance, eligibility and decision beside the grid on wide screens and beneath it on smaller screens. Named queues cover approvals, uncertain outcomes and policy blocks. The selected queue is remembered in this browser tab.

## AI limits and data flow

Investigations use the configured Gemini model with a 90-second overall deadline, at most seven model rounds and three attempts per round for transient failures. The model only has the four read-only tools and a final recommendation tool. A final recommendation that fails validation receives one corrective tool response and may be regenerated once. It still must pass the same amount, clarification and citation checks; a second invalid recommendation fails closed. Incomplete tool protocols and unsupported arguments fail closed. Cancelling the request or navigating away cancels the investigation where supported; edits invalidate a late response even if upstream cancellation fails.

Gemini receives the customer request and retrieved operational facts, including the selected payment ID, sanitized refund history, merchant return reference, limits and sanitized audit citations. Credentials and raw audit bodies are not included. Elastic continues to receive operational metadata only; customer text and return references are excluded from its index. A valid citation does not prove that every sentence of a model's explanation is accurate; the merchant can inspect the underlying evidence.

## Evaluation

`npm test` covers case state transitions, atomic reservation/linkage rollback, duplicate submission, stale drafts, editing during investigation, approval rechecks, evidence verification and tool restrictions.

`npm run eval:cases` runs 50 labeled synthetic cases against the configured live Gemini model. It uses synthetic tool responses and never calls PayPal or Elastic. It sends requests at a controlled pace to reduce burst-limit effects. The generated report includes failures and provider statuses. It checks amount/status decisions and the enforced tool protocol; it is not a benchmark of free-text accuracy, merchant productivity or production uptime. `--limit=N` can be supplied through npm for a smaller run.

The first burst run is retained in `CASE_AI_EVALUATION_BASELINE.json`. It scored 13/50, with 34 provider failures and three unnecessary clarification responses. Baseline failures lacked HTTP-status detail; their provider cause cannot be established from that report alone. The follow-up adds HTTP diagnostics, slower pacing, and instructions that distinguish a clear requested amount from eligibility restrictions.

Investigations record elapsed time in each case. This is the measured AI investigation latency, not time saved relative to a merchant. Real merchant feedback and a timed manual comparison are still needed before claiming productivity gains.

## Recorded results — 10 November 2026

The paced full live-model run passed 48/50 labeled cases. One failed with HTTP 429 after bounded retries. One produced an invalid clarification containing an amount and no question; validation rejected it. No failed case produced an actionable proposal. The invalid-clarification investigation led to a single bounded correction round, still subject to the same validator. A targeted live follow-up of those two failing examples passed 2/2; that follow-up is not a rerun of the entire 50-case set. The three unnecessary clarification examples from the baseline passed in the paced run. These are development fixtures, not an independently held-out benchmark.

Browser checks used live Gemini and Elastic with disposable simulated payments: a reviewed $45 case waited for merchant approval before completion; a $12 case completed through the automatic policy path. Both persisted across reload. Decision explanations retrieved verified audit citations. No new PayPal Sandbox purchase or refund was made for these checks.
