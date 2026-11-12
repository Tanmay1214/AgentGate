# Host AgentGate for judges on Render

The public app uses the same PayPal Sandbox and Gemini workflow as localhost. A shared merchant access key protects workspace APIs. Anyone with this key can use merchant controls, including changing demo limits and submitting permitted Sandbox refunds; it is not a read-only viewer password. Share it only in Devpost's private judge instructions.

## 1. Create the service

Push the current code to GitHub. In Render choose **New → Blueprint**, select `Tanmay1214/AgentGate`, and use branch `main` and `render.yaml`.

The Blueprint sets Node 24, Sandbox mode, hosted mode, the build/start commands, and the `/healthz` health check. It generates `AGENTGATE_ACCESS_KEY` automatically. Reveal that value in Render's Environment settings after creation and save it privately for judges. Do not put it in the README, repository, or public project description.

## 2. Set integration secrets in Render

| Variable | What to enter |
| --- | --- |
| `PAYPAL_CLIENT_ID` | The Sandbox Business app's client ID |
| `PAYPAL_CLIENT_SECRET` | The same app's Sandbox secret |
| `GEMINI_API_KEY` | Your existing Gemini key |
| `GEMINI_MODEL` | The Blueprint defaults to `gemini-3.5-flash-lite`; use the model verified with your key |
| `PAYPAL_WEBHOOK_ID` | Leave blank until the hosted endpoint is registered in step 4 |
| `ELASTICSEARCH_URL` | Optional HTTPS Elasticsearch endpoint |
| `ELASTICSEARCH_API_KEY` | Optional encoded Elasticsearch API key |

Do not upload the local `.env` file. In particular, leave `PORT` and `PUBLIC_URL` unset on Render: Render supplies its port and `RENDER_EXTERNAL_URL` automatically. `HOSTED_MODE` must remain `true`. For a custom domain, set `PUBLIC_URL` to its HTTPS origin instead (no path).

## 3. Choose storage before collecting demo cases

The included Blueprint uses a **free** web service. Free instances can sleep and their local filesystem is ephemeral. Cases, captures, audit events, idempotency records, and webhook de-duplication state may disappear after a restart or redeploy. The hosted service starts with a fresh database; existing localhost cases are not automatically uploaded.

For a stable judging workspace with SQLite, upgrade to a Render plan that supports a persistent disk, add a disk mounted at `/var/data/agentgate`, and set `DATA_DIR=/var/data/agentgate`. This is a paid Render option; the Blueprint does not purchase it. Run only one service instance with this SQLite store. Keep this paid plan/disk configuration in sync with your Blueprint settings before applying future Blueprint updates.

If you stay on free hosting, expect to create new Sandbox test purchases after a reset and mention the possible cold start in judge instructions. Do not present it as a persistent hosted ledger.

## 4. Register the hosted PayPal webhook

After deployment, copy the Render HTTPS service address. In the PayPal Developer Dashboard, open the same **Sandbox** REST app and add a webhook with this address:

```text
https://YOUR-SERVICE.onrender.com/api/webhook
```

Subscribe to the capture/refund events used by the demo, including `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.REFUND.PENDING`, `PAYMENT.REFUND.COMPLETED`, and `PAYMENT.REFUND.FAILED` where available in the Sandbox event picker. Copy the new webhook registration ID into Render's `PAYPAL_WEBHOOK_ID`, then restart/redeploy. The old local tunnel registration ID is not the hosted endpoint's registration ID.

The webhook endpoint is public because PayPal must reach it. Its signature is verified with PayPal before an event is recorded. A tunnel or local computer is no longer required for delivery.

## 5. Verify the hosted workflow

1. Open the public URL in a private browser window. It must ask for the merchant access key before loading workspace data.
2. Enter the generated key. Confirm **PayPal Sandbox** is shown and that Connections reports the expected integrations.
3. Create a small Sandbox test checkout in Connections. Approve it with a Sandbox Personal buyer. The return must land on the Render URL and import the captured payment.
4. Open a new refund case, add synthetic order/return records, record the merchant's eligibility review, and run Gemini investigation.
5. Review the recommendation and policy checks, submit once, and inspect the actual provider status. Reconcile uncertain outcomes through the app.
6. Inspect Refund requests and Audit trail, including a fresh verified webhook if received.

Do not claim hosted end-to-end verification until these steps have completed on the deployed service. The repository's prior Sandbox evidence describes earlier local runs.

## Private Devpost testing instructions template

Replace the placeholders after deployment. Do not include PayPal app secrets or Gemini/Elastic API keys.

```text
Hosted app: https://YOUR-SERVICE.onrender.com
Merchant access key: INSERT_RENDER_GENERATED_ACCESS_KEY

Open the app and enter the access key. This is a shared Sandbox merchant workspace; all payments use test money. Existing completed cases can be reviewed in Refund cases, Refund requests, and Audit trail.

For a new end-to-end case, open Connections, create a small PayPal Sandbox test checkout, and approve it with a Sandbox Personal buyer. Open a case against the captured payment, enter a customer request, add synthetic order and return evidence, and record an eligibility review. Run Investigate case, inspect the cited recommendation and separate policy decision, then submit the refund once. Amounts above the automatic threshold require individual approval.

The access key does not sign into PayPal. Fresh checkout approval requires a separate Sandbox Personal buyer. Follow the README for creating your own Sandbox buyer, or use separately supplied test-buyer credentials if provided by the submitter.

Demo video: https://youtu.be/FIbAFTaE1Gg
Code and local setup: https://github.com/Tanmay1214/AgentGate
```

If using the free plan, add: `The free instance may take a moment to wake up; its demo history may reset after restarts or redeployments.`
