import {hash} from './store.mjs';
import {merchantEvidence} from './merchant-evidence.mjs';

export const decisions={
 POLICY_ALLOWED:'The amount is within the merchant’s automatic refund limit and available budget.',
 HUMAN_APPROVAL_REQUIRED:'The amount exceeds the automatic limit. A merchant must approve it before execution.',
 CAPTURE_NOT_ELIGIBLE:'The merchant has not verified this payment’s return eligibility.',
 RETURN_REJECTED:'The imported return inspection rejected this return.',
 RETURN_NOT_RECEIVED:'The merchant policy requires receipt of the returned items first.',
 RETURN_DATES_MISSING:'Delivery and return receipt dates are needed to check the return window.',
 RETURN_WINDOW_EXCEEDED:'The return arrived outside the merchant’s allowed return window.',
 RETURN_ITEMS_MISSING:'The returned items have not been identified.',
 RETURN_VALUE_EXCEEDED:'The amount exceeds the imported returned-item value after completed and unresolved refunds.',
 EXCEEDS_REFUNDABLE_AMOUNT:'The amount exceeds the balance available after completed and unresolved refunds.',
 AGENT_REVOKED:'The merchant has disabled agent refunds.',
 INVALID_AMOUNT:'A positive, exact USD amount is required.',
 PER_REFUND_LIMIT:'The amount exceeds the merchant’s maximum per refund.',
 DAILY_BUDGET_EXCEEDED:'The amount exceeds the remaining daily allowance, including unresolved reservations.',
 HUMAN_REJECTED:'The merchant rejected this proposal.',
 PROVIDER_COMPLETED:'The payment provider confirmed the refund completed.',
 PROVIDER_PENDING:'The provider has not confirmed a final outcome. Its budget reservation remains.',
 PROVIDER_UNKNOWN:'The outcome is uncertain. Inspect the provider result before taking another action.',
 PROVIDER_FAILED:'The provider reported failure.'
};

export function paymentEvidence(s,captureId){
 const c=s.get('SELECT * FROM captures WHERE id=?',captureId);
 if(!c)throw Error('Choose an existing payment');
 const history=s.all('SELECT id,capture,amount,status,reason,provider_id,created FROM requests WHERE capture=? ORDER BY created',captureId);
 const policy=s.policy(),day=new Date().toISOString().slice(0,10),reserved=s.reserved(day);
 const review=s.get("SELECT name FROM sqlite_master WHERE type='table' AND name='return_reviews'")?s.get('SELECT reference,verified,updated FROM return_reviews WHERE capture=?',c.id):null;
 const payment={id:c.id,originalCents:c.amount,remainingCents:s.remaining(c.id),currency:c.currency,returnVerified:!!c.eligible,returnReview:review?{...review,verified:!!review.verified}:null};
 const merchant=merchantEvidence(s.db,captureId);
 merchant.availableReturnCents=merchant.record?Math.max(0,merchant.returnItemCents-history.filter(r=>['executing','unknown','pending','completed'].includes(r.status)).reduce((n,r)=>n+r.amount,0)):null;
 const facts={payment,history,merchant,policy:{...policy,reserved,available:Math.max(0,policy.daily-reserved),day}};
 return {...facts,fingerprint:hash(JSON.stringify(facts))};
}

export function requestEvidence(s,id){
 const r=s.get('SELECT * FROM requests WHERE id=?',id);if(!r)throw Error('Unknown refund request');
 const payment=paymentEvidence(s,r.capture);
 const events=s.all('SELECT * FROM events ORDER BY seq').flatMap(e=>{const d=JSON.parse(e.body);return (d.id===id||d.capture===r.capture||d.resourceId===r.provider_id)&&d.type!=='AI_ATTEMPT'?[{seq:e.seq,hash:e.hash,type:d.type,status:d.status||'',reason:d.reason||'',at:d.at}]:[];});
 return {request:{id:r.id,capture:r.capture,amount:r.amount,status:r.status,reason:r.reason,providerId:r.provider_id},explanation:decisions[r.reason]||'Inspect the recorded decision and provider outcome.',...payment,events,integrity:s.verify()};
}
