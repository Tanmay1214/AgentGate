# AI drafting reliability

Updated 10 November 2026. The selected model is now `gemini-3.5-flash-lite` on Google's API.

## Behaviour

- At most three attempts (one request and two retries), with 1s / 2s backoff. Retries apply to network failures, timeouts, HTTP 429 and 5xx. HTTP 400/401/403/404 and malformed output do not retry blindly.
- `Retry-After` is honoured. A delay beyond the 90-second total deadline ends the request with a rate-limit message instead of retrying early. Each attempt has a 25-second timeout.
- The draft must contain exactly `status`, `amount`, `currency`, `rationale`, and `question`. Thought-tagged parts are excluded. Incomplete responses, invalid amounts, other currencies, extra fields, and amounts above the remaining balance are rejected.
- Full-refund prompts receive both original amount and remaining refundable amount. In-flight, uncertain, pending and completed refunds reduce that balance. The server checks the balance again after generation. Payment execution always rechecks policy.
- Ambiguous requests can return `status: clarification` with a question and `amount: null`. Fully refunded payments get that result locally without spending an AI request.
- Drafting clears the amount and disables submission. Edits to the customer message or payment cancel the draft and invalidate its result. Closing/reopening the dialog cannot reuse an old response. Enter manually cancels drafting and requires a new amount.
- There is at most one in-flight draft per capture. Cancelling the browser request aborts its upstream generation request where supported. No automatic model switch or refund execution is performed.

## Diagnostics

`AI_ATTEMPT` audit entries contain model, request identifier, attempt number, HTTP status, provider status code (for example `UNAVAILABLE`), application error code and latency. They exclude API keys, customer messages, model thoughts and raw provider error messages. `AI_DRAFT` records the resulting status/amount and model, not its rationale. The merchant can inspect diagnostics under Audit trail.

Errors distinguish configuration, access, rate limits, network failures, timeout, invalid response, invalid draft and changed balance. Manual entry remains explicit, with all policy checks still enforced.

## Verification

Automated tests cover retry limits, Retry-After, errors, cancellation, parsing, balance validation, and stale-response invalidation. The existing fully refunded sandbox capture was also checked through the UI and API: clarification was shown, the amount stayed blank, and no generation or refund occurred.

A live synthetic full-refund test on 10 November 2026 reached Google three times. All three returned HTTP 503 with provider code `UNAVAILABLE`. The client stopped after its two retries and returned a specific manual-fallback message. This verifies failure handling, not successful current model availability or semantic accuracy. No additional PayPal transactions were made for these AI checks.

Google availability remains outside the application. Model accuracy on ambiguous language and adversarial prompts still needs a broader live evaluation when the model is available; deterministic validation does not prove the model inferred the correct customer intent.

## Gemini 3.5 Flash-Lite verification

On 10 November 2026, the Google model list confirmed access to `gemini-3.5-flash-lite`. Three live synthetic checks through the same draftRefund client used by AgentGate passed on their first attempts:

- Full remaining refund: USD 30 original, USD 5 already refunded → USD 25 draft.
- Explicit partial refund: USD 5 request → USD 5 draft.
- Undecided USD 5 or USD 15 → clarification question and no amount.

The server was restarted and its state confirmed the selected model. These checks generated proposals only and made no PayPal transactions. Three successful examples establish current functionality, not a broad accuracy benchmark or an uptime guarantee.
