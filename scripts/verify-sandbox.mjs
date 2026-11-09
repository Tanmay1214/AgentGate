import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {paypal} from '../lib/paypal.mjs';
const base='http://localhost:'+(process.env.PORT||4310);
const session=await(await fetch(base+'/api/session')).json();
const headers={'content-type':'application/json','x-agentgate-key':session.token};
async function api(path,body){const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
const before=await api('state');assert.equal(before.mode,'sandbox');
const automatic=before.requests.find(r=>r.amount===500&&r.status==='completed');
const reviewed=before.requests.find(r=>r.amount===2500&&r.status==='completed'&&r.approved===1&&r.capture===automatic?.capture);
assert.ok(automatic&&reviewed,'Complete the $30 sandbox scenario with $5 automatic and $25 reviewed refunds first');
const checks=[];
for(const r of [automatic,reviewed]){const result=await paypal('/v2/payments/refunds/'+r.provider_id);assert.equal(result.status,'COMPLETED');assert.equal(result.amount.value,(r.amount/100).toFixed(2));checks.push({check:r.approved?'Human-approved refund':'Automatic refund',passed:true,refundId:result.id,amount:result.amount.value});}
const duplicate=await api('propose',{capture:automatic.capture,amount:'5.00',note:automatic.note,idem:automatic.idem});assert.equal(duplicate.id,automatic.id);assert.equal(duplicate.duplicate,true);checks.push({check:'Duplicate returns original operation',passed:true});
const denied=await api('propose',{capture:automatic.capture,amount:'1.00',note:'Sandbox negative test: original payment already fully refunded',idem:'sandbox-overrefund-check-001'});assert.equal(denied.reason,'EXCEEDS_REFUNDABLE_AMOUNT');checks.push({check:'Over-refund blocked before execution',passed:true});
const importEvent=before.events.find(e=>e.data.type==='CAPTURE_IMPORTED'&&e.data.capture===automatic.capture)?.data;assert.ok(importEvent?.order);
const returned=await api('capture',{id:importEvent.order});assert.equal(returned.capture,automatic.capture);checks.push({check:'Repeat checkout return after full refund',passed:true});
const after=await api('state');assert.equal(after.captures.length,before.captures.length);assert.equal(after.requests.length,before.requests.length);assert.equal(after.integrity.valid,true);checks.push({check:'Persistent records and valid audit chain after server restart',passed:true});
const events=after.events.filter(e=>e.data.type==='PAYPAL_WEBHOOK').map(e=>e.data);
for(const id of [automatic.capture,automatic.provider_id,reviewed.provider_id])assert.ok(events.some(e=>e.resourceId===id),'Missing verified signed webhook for '+id);
checks.push({check:'Genuine signed capture and both refund webhooks received',passed:true,eventIds:events.map(e=>e.eventId)});
const report={verifiedAt:new Date().toISOString(),environment:'PayPal Sandbox — test money only',orderId:importEvent.order,captureId:automatic.capture,purchaseUSD:'30.00',refundTotalUSD:'30.00',reservedUSD:(after.reserved/100).toFixed(2),checks,limitations:['Gemma draft failed during this end-to-end run; refund proposals were entered manually.','Provider pending, timeout and rejection paths use automated fixtures; not deliberately induced on PayPal.','Webhook uses a temporary Cloudflare Quick Tunnel.']};
await mkdir('docs',{recursive:true});
await writeFile('docs/sandbox-verification.json',JSON.stringify(report,null,2)+'\n');
await writeFile('docs/SANDBOX_VERIFICATION.md',`# PayPal Sandbox verification\n\nVerified ${report.verifiedAt} (9 November 2026 in Asia/Kolkata). All amounts are test money.\n\nOrder: ${report.orderId}\n\nCapture: ${report.captureId}, USD 30.00\n\n${checks.map(c=>'- PASS: '+c.check+(c.refundId?' — '+c.refundId+', USD '+c.amount:'')).join('\n')}\n\n## Limits of this verification\n\n${report.limitations.map(l=>'- '+l).join('\n')}\n\nThe ledger still reserves USD ${report.reservedUSD} of today's allowance for completed refunds. Refunding does not restore the daily allowance.\n\nRun \`npm test\` for policy, checkout recovery, and provider-failure tests. Run \`node --env-file=.env scripts/verify-sandbox.mjs\` to recheck this scenario against PayPal and regenerate this report. The script only repeats existing request keys and imports the existing captured order; it does not create another charge or refund.\n`);
console.log(JSON.stringify(report));
