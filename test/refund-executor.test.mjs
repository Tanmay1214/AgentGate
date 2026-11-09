import test from 'node:test';
import assert from 'node:assert/strict';
import {store} from '../lib/store.mjs';
import {executeRefund} from '../lib/refund-executor.mjs';
function setup(){const s=store(':memory:');s.run('INSERT INTO captures VALUES (?,?,?,?,?)','CAP',3000,'USD',1,'Verified return');const r=s.propose({capture:'CAP',amount:500,idem:'executor-test',note:'Synthetic refund'});return {s,r};}
test('provider timeout retains budget and never retries automatically',async()=>{const {s,r}=setup();let calls=0;const result=await executeRefund(s,r,async()=>{calls++;throw Error('timeout');});assert.equal(result.status,'unknown');assert.equal(s.reserved(r.day),500);await executeRefund(s,{...result,duplicate:true},()=>{calls++;});assert.equal(calls,1);s.db.close();});
test('definite rejection releases reservation',async()=>{const {s,r}=setup();const result=await executeRefund(s,r,async()=>{const e=Error('Unprocessable');e.definite=true;throw e;});assert.equal(result.status,'failed');assert.equal(s.reserved(r.day),0);s.db.close();});
test('pending refund retains provider ID and reservation until reconciliation',async()=>{const {s,r}=setup();const result=await executeRefund(s,r,async(path,opts)=>{assert.equal(opts.key,r.id);assert.equal(opts.body.amount.value,'5.00');return {id:'REFUND',status:'PENDING'};});assert.equal(result.status,'pending');assert.equal(result.provider_id,'REFUND');assert.equal(s.reserved(r.day),500);s.settle(r.id,'failed','REFUND');assert.equal(s.reserved(r.day),0);s.db.close();});
test('missing provider ID is uncertain and preserves budget',async()=>{const {s,r}=setup();const result=await executeRefund(s,r,async()=>({status:'COMPLETED'}));assert.equal(result.status,'unknown');assert.equal(s.reserved(r.day),500);s.db.close();});
