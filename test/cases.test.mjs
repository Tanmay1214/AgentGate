import {test} from 'node:test';
import assert from 'node:assert/strict';
import {store} from '../lib/store.mjs';
import {createCases} from '../lib/cases.mjs';
import {executeRefund} from '../lib/refund-executor.mjs';

function setup(overrides={}){
 const s=store(':memory:');s.run('INSERT INTO captures VALUES (?,?,?,?,?)','PAY',10000,'USD',1,'Test payment');let calls=0;
 const agent=async()=>({status:'draft',amount:'12.00',rationale:'Customer requested $12.',question:'',citations:['payment'],evidence:[{id:'payment'}],trace:[],model:'fixture'});
 const cases=createCases(s,{agent,execute:r=>executeRefund(s,r,async()=>{calls++;return {id:'TEST-REFUND',status:'COMPLETED'};}),...overrides});
 const c=cases.create({id:'test-case-01',capture:'PAY',message:'Please refund $12.'});
 return {s,c,cases,calls:()=>calls};
}
test('one case reaches provider completion and repeated submission cannot refund twice',async()=>{
 const {s,c,cases,calls}=setup();await cases.investigate(c.id);const first=await cases.submit(c.id);const second=await cases.submit(c.id);
 assert.equal(first.request.status,'completed');assert.equal(second.request.id,first.request.id);assert.equal(calls(),1);assert.equal(s.remaining('PAY'),8800);assert.equal(s.verify().valid,true);s.db.close();
});
test('case opening is idempotent and altered reuse is rejected',()=>{
 const {s,c,cases}=setup();assert.equal(cases.create({id:c.id,capture:'PAY',message:c.message}).id,c.id);assert.throws(()=>cases.create({id:c.id,capture:'PAY',message:'other'}),/different details/);s.db.close();
});
test('policy or balance changes invalidate a case recommendation before any provider call',async()=>{
 const {s,c,cases,calls}=setup();await cases.investigate(c.id);s.run('UPDATE captures SET eligible=0 WHERE id=?','PAY');assert.equal(cases.snapshot(c.id).stale,true);await assert.rejects(cases.submit(c.id),/changed/);assert.equal(calls(),0);s.db.close();
});
test('editing a customer message removes the old recommendation',async()=>{
 const {s,c,cases}=setup();await cases.investigate(c.id);const changed=cases.update({id:c.id,message:'Maybe $5 or $15.'});assert.equal(changed.draft,null);await assert.rejects(cases.submit(c.id),/clarification/);s.db.close();
});
test('clarification cannot become a submitted refund',async()=>{
 const {s,c,cases,calls}=setup({agent:async()=>({status:'clarification',amount:'',rationale:'Ambiguous',question:'Which amount?',citations:['payment'],evidence:[],trace:[]})});
 await cases.investigate(c.id);await assert.rejects(cases.submit(c.id),/clarification/);assert.equal(calls(),0);s.db.close();
});
test('a high-value case waits for human approval and approval rechecks permissions',async()=>{
 const {s,c,cases,calls}=setup({agent:async()=>({status:'draft',amount:'45.00',rationale:'Requested',question:'',citations:['payment'],evidence:[],trace:[]})});
 await cases.investigate(c.id);const result=await cases.submit(c.id);assert.equal(result.request.status,'approval');assert.equal(calls(),0);
 const p=s.policy();s.run('UPDATE settings SET body=?',JSON.stringify({...p,enabled:false}));assert.equal(s.approve(result.request.id,true).reason,'AGENT_REVOKED');s.db.close();
});
test('case linkage and budget reservation roll back together on a write failure',async()=>{
 const {s,c,cases}=setup();await cases.investigate(c.id);
 s.db.exec("CREATE TRIGGER reject_case_submission BEFORE UPDATE OF request_id ON cases BEGIN SELECT RAISE(ABORT,'test failure'); END;");
 await assert.rejects(cases.submit(c.id),/test failure/);assert.equal(s.all('SELECT * FROM requests').length,0);assert.equal(s.remaining('PAY'),10000);assert.equal(cases.snapshot(c.id).request,null);assert.equal(s.verify().valid,true);s.db.close();
});
test('edits during investigation invalidate late AI output',async()=>{
 let finish;const pending=new Promise(r=>finish=r);const {s,c,cases}=setup({agent:async()=>{await pending;return {status:'draft',amount:'12.00'};}});
 const run=cases.investigate(c.id);cases.update({id:c.id,message:'Changed to $5.'});finish();await assert.rejects(run,/changed/);assert.equal(cases.snapshot(c.id).draft,null);s.db.close();
});
test('merchant return review has a reference and changes eligibility without trusting customer text',()=>{
 const {s,c,cases}=setup();assert.throws(()=>cases.recordReturn({id:c.id,verified:true,reference:''}),/reference/);
 const result=cases.recordReturn({id:c.id,verified:false,reference:'RETURN-1'});assert.equal(result.facts.payment.returnVerified,false);assert.equal(result.facts.payment.returnReview.reference,'RETURN-1');s.db.close();
});
test('Elastic citations must match a local event hash and belong to the selected payment',async()=>{
 const {s,c,cases}=setup({elastic:{info:()=>({configured:true}),search:async()=>({total:2,results:[{seq:1,hash:'fabricated'},{seq:999,hash:'unrelated'}]})}});
 const result=await cases.auditEvidence('PAY');assert.equal(result.source,'elastic-verified');assert.deepEqual(result.citations,[]);s.db.close();
});
test('Elastic outage falls back explicitly to local evidence',async()=>{
 const {s,c,cases}=setup({elastic:{info:()=>({configured:true}),search:async()=>{throw Error('offline');}}});
 const result=await cases.auditEvidence('PAY');assert.equal(result.source,'local-fallback');assert.ok(result.notice);assert.ok(result.citations.length);s.db.close();
});
