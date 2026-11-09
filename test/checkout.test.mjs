import test from 'node:test';
import assert from 'node:assert/strict';
import {completeCheckout} from '../lib/checkout.mjs';
const completed={status:'COMPLETED',purchase_units:[{payments:{captures:[{id:'CAPTURE1',status:'COMPLETED',amount:{value:'30.00',currency_code:'USD'}}]}}]};
test('approved order captures with stable idempotency key',async()=>{const calls=[];const result=await completeCheckout('ORDER1234',async(path,opts)=>{calls.push({path,opts});return opts?completed:{status:'APPROVED'};});assert.equal(result.amount,3000);assert.equal(calls.length,2);assert.equal(calls[1].opts.key,'capture-ORDER1234');});
test('returning twice reads completed capture without another payment action',async()=>{let calls=0;await completeCheckout('ORDER1234',async(_,opts)=>{calls++;assert.equal(opts,undefined);return completed;});assert.equal(calls,1);});
test('unapproved or pending payments cannot become refundable captures',async()=>{for(const status of ['CREATED','PAYER_ACTION_REQUIRED','PENDING'])await assert.rejects(completeCheckout('ORDER1234',async()=>({status})),/Complete buyer approval/);});
test('returning after a refund recognises the historical capture without recapturing',async()=>{for(const status of ['REFUNDED','PARTIALLY_REFUNDED']){const order=structuredClone(completed);order.purchase_units[0].payments.captures[0].status=status;const result=await completeCheckout('ORDER1234',async(_,opts)=>{assert.equal(opts,undefined);return order;});assert.equal(result.id,'CAPTURE1');}});
