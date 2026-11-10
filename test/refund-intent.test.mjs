import {test} from 'node:test';
import assert from 'node:assert/strict';
import {intentConstraints} from '../lib/refund-intent.mjs';
import {validateRecommendation} from '../lib/case-agent.mjs';
const evidence={payment:{remainingCents:3000},merchant:{record:{order:{items:[{sku:'LAMP',name:'Desk lamp',quantity:1,unitCents:4800},{sku:'NOTE',name:'Notebook',quantity:2,unitCents:500}]}}}};
test('explicit currencies, ambiguity and over-balance item values require clarification',()=>{
 for(const message of ['Refund EUR 18 for the notebook.','Refund one of the items in this order.','Refund the desk lamp.','Please refund USD 200.','Refund $5 or $15.'])assert.ok(intentConstraints(message,evidence).clarification,message);
});
test('latest customer correction is used without trusting merchant notes',()=>{
 const messages=JSON.stringify([{kind:'customer',message:'Refund EUR 18.'},{kind:'question',message:'Please confirm USD?'},{kind:'customer',message:'Yes, refund exactly USD 10.'},{kind:'merchant',message:'Refund $30 instead.'}]);
 assert.equal(intentConstraints(messages,evidence).amountCents,1000);
});
test('a plausible but silently reduced amount is rejected by the final validator',()=>{
 const args={status:'draft',amount:'30.00',rationale:'Refund capped to available balance',question:'',citations:['payment']};
 const ctx={remainingCents:3000,citations:new Map([['payment',{}]]),intent:intentConstraints('Refund the desk lamp.',evidence)};
 assert.throws(()=>validateRecommendation(args,ctx),/Do not cap/);
 assert.equal(validateRecommendation({...args,status:'clarification',amount:'',question:'The lamp costs $48 but only $30 remains. What amount did you intend?'},ctx).status,'clarification');
});
test('explicit item quantity and exact money cannot silently change',()=>{
 assert.equal(intentConstraints('Refund both notebooks.',evidence).amountCents,1000);
 const args={status:'draft',amount:'12.00',rationale:'Refund',question:'',citations:['payment']};
 assert.throws(()=>validateRecommendation(args,{remainingCents:3000,citations:new Map([['payment',{}]]),intent:intentConstraints('Refund USD 10.',evidence)}),/changed the requested amount/);
});
