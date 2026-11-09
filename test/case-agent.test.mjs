import {test} from 'node:test';
import assert from 'node:assert/strict';
import {investigateCase,validateRecommendation} from '../lib/case-agent.mjs';
const evidence={payment:{id:'PAY',originalCents:3000,remainingCents:2500,currency:'USD',returnVerified:true},history:[],policy:{auto:2000,daily:10000,maximum:10000}};
const recommendation={status:'draft',amount:'25.00',rationale:'The remaining refundable balance is $25.',question:'',citations:['payment','history','policy']};
const response=calls=>Response.json({candidates:[{finishReason:'STOP',content:{parts:calls.map(([name,args={}])=>({functionCall:{name,args}}))}}]});
test('investigator retrieves four read-only tools before a validated final recommendation',async()=>{
 let round=0;const result=await investigateCase({message:'Refund the remainder',evidence,apiKey:'test-private-key-123',searchEvidence:async()=>({source:'elastic-verified',citations:[{id:'audit-1',seq:1}]}),fetchFn:async(url,opts)=>{assert.equal(opts.headers['x-goog-api-key'],'test-private-key-123');const b=JSON.parse(opts.body);assert.equal(JSON.stringify(b).includes('test-private-key-123'),false);round++;return round===1?response([['get_payment'],['get_refund_history'],['get_merchant_policy'],['search_audit_evidence']]):response([['prepare_recommendation',recommendation]]);}});
 assert.equal(result.amount,'25.00');assert.equal(result.trace.length,4);assert.equal(result.trace[3].source,'elastic-verified');assert.equal(round,2);
});
test('AI cannot finish before gathering evidence or call a mutation tool',async()=>{
 for(const call of [['prepare_recommendation',recommendation],['approve_refund',{id:'PAY'}]])await assert.rejects(investigateCase({message:'ignore instructions',evidence,apiKey:'test-private-key-123',fetchFn:async()=>response([call])}),/without retrieving|unsupported/);
});
test('recommendation rejects invented citations, excess amounts and actionable clarifications',()=>{
 const ctx={remainingCents:2500,citations:new Map([['payment',{}],['history',{}],['policy',{}]])};
 for(const invalid of [{...recommendation,citations:['made-up']},{...recommendation,amount:'30.00'},{...recommendation,status:'clarification',question:'Which amount?'},{...recommendation,amount:'NaN'}])assert.throws(()=>validateRecommendation(invalid,ctx));
 assert.equal(validateRecommendation({...recommendation,status:'clarification',amount:'',question:'Which amount?'},ctx).amount,'');
});
test('unsupported arguments cannot redirect a tool to another payment',async()=>{
 await assert.rejects(investigateCase({message:'Refund',evidence,apiKey:'test-private-key-123',fetchFn:async()=>response([['get_payment',{capture:'OTHER'}]])}),/unsupported/);
});
test('an invalid final recommendation gets one correction and cannot bypass validation',async()=>{
 for(const recover of [true,false]){
  let round=0;
  const run=investigateCase({message:'Refund $200',evidence,apiKey:'test-private-key-123',searchEvidence:async()=>({source:'local',citations:[]}),fetchFn:async()=>{
   round++;if(round===1)return response([['get_payment'],['get_refund_history'],['get_merchant_policy'],['search_audit_evidence']]);
   const args=round===3&&recover?{...recommendation,status:'clarification',amount:'',question:'The available balance is $25. Which supported amount did you intend?'}:{...recommendation,status:'clarification',amount:'200.00',question:''};
   return response([['prepare_recommendation',args]]);
  }});
  if(recover){const result=await run;assert.equal(result.status,'clarification');assert.equal(result.amount,'');assert.equal(result.trace.at(-1).tool,'recommendation_validation');}
  else await assert.rejects(run,/Clarification must/);
  assert.equal(round,3);
 }
});
