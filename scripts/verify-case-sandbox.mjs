// Read-only verification of an already completed case. Never creates or refunds a payment.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {paypal} from '../lib/paypal.mjs';
const prefix=process.argv.find(v=>v.startsWith('--case='))?.slice(7);
if(!prefix||!/^[a-zA-Z0-9-]{8,100}$/.test(prefix))throw Error('Supply --case=CASE_ID_OR_PREFIX for an already completed case');
const base='http://localhost:'+(process.env.PORT||4310),session=await(await fetch(base+'/api/session')).json();
const response=await fetch(base+'/api/state',{headers:{'x-agentgate-key':session.token}});assert.equal(response.status,200);
const state=await response.json();assert.equal(state.mode,'sandbox');
const matching=state.cases.filter(c=>c.id.startsWith(prefix));assert.equal(matching.length,1,'Case prefix must identify exactly one case');
const c=matching[0];assert.equal(c.request?.status,'completed');assert.equal(c.draft?.status,'draft');assert.ok(c.draft.model);assert.ok(c.draft.citations.includes('merchant'));
for(const tool of ['get_payment','get_refund_history','get_merchant_policy','search_audit_evidence','get_order_and_return'])assert.ok(c.draft.trace.some(t=>t.tool===tool));
const refund=await paypal('/v2/payments/refunds/'+encodeURIComponent(c.request.provider_id));assert.equal(refund.status,'COMPLETED');assert.equal(Math.round(Number(refund.amount.value)*100),c.request.amount);
assert.equal(state.integrity.valid,true);
const webhooks=state.events.filter(e=>e.data.type==='PAYPAL_WEBHOOK'&&[c.capture,c.request.provider_id].includes(e.data.resourceId));
const captureWebhook=webhooks.some(e=>e.data.resourceId===c.capture),refundWebhook=webhooks.some(e=>e.data.resourceId===c.request.provider_id);
const report={verifiedAt:new Date().toISOString(),environment:'PayPal Sandbox - test money only',caseId:c.id,captureId:c.capture,paymentUSD:(c.facts.payment.originalCents/100).toFixed(2),refundId:c.request.provider_id,refundUSD:refund.amount.value,remainingUSD:(c.facts.payment.remainingCents/100).toFixed(2),model:c.draft.model,investigationMs:c.duration_ms,citations:c.draft.citations,tools:c.draft.trace,providerStatus:refund.status,auditValid:state.integrity.valid,captureWebhook,refundWebhook,webhooks:webhooks.map(e=>({eventId:e.data.eventId,type:e.data.eventType,resourceId:e.data.resourceId,seq:e.seq})),limitations:['Order items, return inspection and policy are explicitly synthetic merchant records for the test purchase.','This verifies one live-model automatic refund on PayPal Sandbox, not production payment readiness or a live-model high-value approval flow.','Webhook-only Cloudflare Quick Tunnel is temporary.']};
await writeFile('docs/CASE_SANDBOX_VERIFICATION.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!captureWebhook||!refundWebhook){console.log('Signed webhook delivery is still pending. Rerun this read-only check after delivery.');process.exitCode=1;}
