import {test} from 'node:test';
import assert from 'node:assert/strict';
import {store} from '../lib/store.mjs';
import {createCases} from '../lib/cases.mjs';
import {validateMerchantEvidence} from '../lib/merchant-evidence.mjs';
import {executeRefund} from '../lib/refund-executor.mjs';
const record=()=>({capture:'PAY',currency:'USD',order:{reference:'ORDER-1',purchasedAt:'2026-01-01',deliveredAt:'2026-01-03',items:[{sku:'BLUE',name:'Blue notebook',quantity:2,unitAmount:'20.00'},{sku:'RED',name:'Red notebook',quantity:1,unitAmount:'60.00'}]},return:{reference:'RETURN-1',status:'accepted',receivedAt:'2026-01-10',items:[{sku:'BLUE',quantity:1}],notes:'Blue notebook inspected'},policy:{reference:'POLICY-v1',text:'Return within 30 days of delivery.',windowDays:30,requireReceived:true}});
const setup=()=>{const s=store(':memory:');s.run('INSERT INTO captures VALUES (?,?,?,?,?)','PAY',10000,'USD',1,'test');let calls=0;const cases=createCases(s,{agent:async()=>({status:'draft',amount:'20.00',question:'',rationale:'Return item',citations:['merchant'],evidence:[],trace:[]}),execute:r=>executeRefund(s,r,async()=>{calls++;return {id:'SIM-REFUND',status:'COMPLETED'};})});const c=cases.create({id:'evidence-case-1',capture:'PAY',message:'Refund the returned blue notebook.'});return {s,c,cases,calls:()=>calls};};
test('merchant import derives returned item value, never grants eligibility, and invalidates old drafts',async()=>{
 const {s,c,cases}=setup();await cases.investigate(c.id);s.run('UPDATE captures SET eligible=0');const out=cases.importEvidence({id:c.id,record:record()});assert.equal(out.facts.merchant.returnItemCents,2000);assert.equal(out.facts.payment.returnVerified,false);assert.equal(out.stale,true);await assert.rejects(cases.submit(c.id),/changed/);s.db.close();
});
test('invalid or mismatched import cannot overwrite existing evidence',()=>{
 const {s,c,cases}=setup();cases.importEvidence({id:c.id,record:record()});
 for(const mutate of [r=>r.capture='OTHER',r=>r.currency='EUR',r=>r.order.items[0].unitAmount='500.00',r=>r.return.items[0].quantity=3,r=>r.order.deliveredAt='2026-02-30',r=>r.order.items.push(r.order.items[0])]){const r=record();mutate(r);assert.throws(()=>cases.importEvidence({id:c.id,record:r}));}
 assert.equal(cases.snapshot(c.id).facts.merchant.returnItemCents,2000);assert.equal(s.verify().valid,true);s.db.close();
});
test('structured return restrictions block even an eligible payment and manual proposals',()=>{
 for(const [change,reason] of [[r=>r.return.status='rejected','RETURN_REJECTED'],[r=>{r.return.status='requested';r.return.receivedAt=null;},'RETURN_NOT_RECEIVED'],[r=>r.order.deliveredAt=null,'RETURN_DATES_MISSING'],[r=>r.return.receivedAt='2026-03-10','RETURN_WINDOW_EXCEEDED'],[r=>r.return.items=[],'RETURN_ITEMS_MISSING']]){
  const {s,c,cases}=setup(),r=record();change(r);cases.importEvidence({id:c.id,record:r});const request=s.propose({capture:'PAY',amount:2000,note:'test',idem:'restriction-test'});assert.equal(request.reason,reason);assert.equal(request.status,'denied');assert.equal(s.remaining('PAY'),10000);s.db.close();
 }
});
test('new conflicting evidence is rechecked at approval',()=>{
 const {s,c,cases}=setup();const eligible=record();eligible.return.items=[{sku:'RED',quantity:1}];cases.importEvidence({id:c.id,record:eligible});const r=s.propose({capture:'PAY',amount:4500,note:'test',idem:'approval-test-key'});assert.equal(r.status,'approval');const changed=record();changed.return.status='rejected';cases.importEvidence({id:c.id,record:changed});assert.equal(s.approve(r.id,true).reason,'RETURN_REJECTED');s.db.close();
});
test('returned-item ceiling includes previous refunds and unresolved reservations',async()=>{
 const {s,c,cases}=setup();cases.importEvidence({id:c.id,record:record()});
 const first=s.propose({capture:'PAY',amount:1500,note:'partial',idem:'return-ceiling-1'});s.settle(first.id,'unknown');
 assert.equal(s.propose({capture:'PAY',amount:600,note:'too much',idem:'return-ceiling-2'}).reason,'RETURN_VALUE_EXCEEDED');
 assert.equal(cases.snapshot(c.id).facts.merchant.availableReturnCents,500);
 s.settle(first.id,'completed','SIM-PREVIOUS');assert.equal(s.propose({capture:'PAY',amount:600,note:'still too much',idem:'return-ceiling-3'}).reason,'RETURN_VALUE_EXCEEDED');s.db.close();
});
test('changed merchant records during investigation reject a late recommendation',async()=>{
 const s=store(':memory:');s.run('INSERT INTO captures VALUES (?,?,?,?,?)','PAY',10000,'USD',1,'test');let finish;const barrier=new Promise(r=>finish=r);
 const cases=createCases(s,{agent:async()=>{await barrier;return {status:'draft',amount:'20.00'};}});const c=cases.create({id:'changed-evidence',capture:'PAY',message:'Refund the returned item'});
 const investigation=cases.investigate(c.id);cases.importEvidence({id:c.id,record:record()});finish();await assert.rejects(investigation,/changed/);assert.equal(cases.snapshot(c.id).draft,null);s.db.close();
});
test('blocked case reconsideration preserves original and creates only one linked review',async()=>{
 const {s,c,cases,calls}=setup();s.run('UPDATE captures SET eligible=0');await cases.investigate(c.id);const original=await cases.submit(c.id);assert.equal(original.request.status,'denied');
 const child=cases.reconsider({id:c.id,reason:'Inspection now complete'});assert.equal(cases.reconsider({id:c.id,reason:'Retry same action'}).id,child.id);assert.equal(child.parent_id,c.id);assert.equal(cases.snapshot(c.id).request.id,original.request.id);assert.equal(child.draft,null);await assert.rejects(cases.submit(child.id),/Investigate/);
 cases.importEvidence({id:child.id,record:record()});cases.recordReturn({id:child.id,verified:true,reference:'INSPECTION-1'});await cases.investigate(child.id);const completed=await cases.submit(child.id);await cases.submit(child.id);assert.equal(completed.request.status,'completed');assert.equal(calls(),1);assert.equal(cases.snapshot(c.id).request.status,'denied');assert.equal(s.remaining('PAY'),8000);s.db.close();
});
test('completed, approval, pending and unknown requests cannot be reconsidered',async()=>{
 for(const status of ['completed','approval','pending','unknown']){const {s,c,cases}=setup();await cases.investigate(c.id);const result=await cases.submit(c.id);s.run('UPDATE requests SET status=? WHERE id=?',status,result.request.id);assert.throws(()=>cases.reconsider({id:c.id,reason:'Retry'}),/Only a denied/);assert.equal(s.all('SELECT * FROM cases').length,1);s.db.close();}
});
test('reply history persists, duplicate replies are idempotent, and old draft is cleared',async()=>{
 const {s,c,cases}=setup();await cases.investigate(c.id);const reply={id:c.id,key:'reply-key-0001',message:'I only want one blue notebook refunded.'};const out=cases.reply(reply);assert.equal(out.draft,null);assert.equal(out.messages.length,2);assert.equal(cases.reply(reply).messages.length,2);assert.equal(out.messages[0].message,c.message);assert.throws(()=>cases.reply({...reply,message:'Different'}),/different details/);const reloaded=createCases(s);assert.equal(reloaded.snapshot(c.id).messages.length,2);s.db.close();
});
test('merchant import sanitizes unsupported fields and enforces valid dates',()=>{
 const r=record();r.apiKey='private';r.order.items[0].secret='private';const out=validateMerchantEvidence(r,{id:'PAY',amount:10000});assert.equal(JSON.stringify(out).includes('private'),false);r.return.receivedAt='2099-01-01';assert.throws(()=>validateMerchantEvidence(r,{id:'PAY',amount:10000}),/future/);
});
