import {setTimeout as delay} from 'node:timers/promises';
import {mkdir,writeFile} from 'node:fs/promises';
import {investigateCase} from '../lib/case-agent.mjs';
import {evaluationCases} from '../test/fixtures/case-evaluation.mjs';
import {evidenceEvaluationCases} from '../test/fixtures/evidence-evaluation.mjs';
const expanded=process.argv.includes('--suite=evidence');
const dataset=expanded?evidenceEvaluationCases:evaluationCases;
if(!process.argv.includes('--live'))throw Error('Use --live to evaluate the configured Gemini model. This sends synthetic fixtures only, never calls PayPal or writes application records.');
const limit=Number(process.argv.find(v=>v.startsWith('--limit='))?.split('=')[1]||dataset.length);
if(!Number.isInteger(limit)||limit<1||limit>dataset.length)throw Error('Invalid evaluation limit');
const ids=process.argv.find(v=>v.startsWith('--ids='))?.slice(6).split(',');
if(ids?.some(id=>!dataset.some(c=>c.id===id)))throw Error('Unknown evaluation case ID');
const cases=(ids?dataset.filter(c=>ids.includes(c.id)):dataset).slice(0,limit),results=[];let next=0,lastRequest=0;
// Pace the live provider to avoid turning a semantic evaluation into a burst-limit test.
const pacedFetch=async(...args)=>{await delay(Math.max(0,3500-(Date.now()-lastRequest)));lastRequest=Date.now();return fetch(...args);};
async function worker(){while(next<cases.length){const item=cases[next++],start=Date.now();let result;const attempts=[];
 try{
  const output=await investigateCase({message:item.message,evidence:item.evidence||{payment:{id:'SYNTHETIC-PAYMENT',originalCents:10000,remainingCents:item.remainingCents,currency:'USD',returnVerified:false},history:[{id:'synthetic-prior',amount:10000-item.remainingCents,status:'completed'}],policy:{enabled:true,auto:2000,maximum:10000,daily:10000,available:10000}},searchEvidence:async()=>({source:'synthetic-fixture',citations:[{id:'audit-1',type:'MERCHANT_ELIGIBILITY',status:'unverified'}]}),apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL,fetchFn:pacedFetch,onAttempt:a=>attempts.push({round:a.round,attempt:a.attempt,httpStatus:a.httpStatus||null})});
  const correct=output.status===item.expected.status&&(item.expected.status!=='draft'||output.amount===item.expected.amount);
  result={id:item.id,category:item.category,expected:item.expected,actual:{status:output.status,amount:output.amount,rationale:output.rationale,question:output.question,citations:output.citations},passed:correct,toolCount:output.trace.length,durationMs:Date.now()-start};
 }catch(error){result={id:item.id,category:item.category,expected:item.expected,passed:false,errorCode:error.code||'ERROR',providerStatus:error.providerStatus||null,durationMs:Date.now()-start};}
 result.attempts=attempts;results.push(result);console.log(`${results.length}/${cases.length} ${result.id}: ${result.passed?'PASS':'FAIL'}${result.errorCode?' ('+result.errorCode+')':''}`);
}}
await worker();results.sort((a,b)=>cases.findIndex(c=>c.id===a.id)-cases.findIndex(c=>c.id===b.id));
const passed=results.filter(r=>r.passed).length,report={at:new Date().toISOString(),model:process.env.GEMINI_MODEL||'gemini-3.5-flash-lite',method:'Live model with synthetic payment, policy, history and audit tool responses; no PayPal or Elasticsearch calls.',limits:'Checks expected amount/status and tool protocol. Does not grade free-text factual accuracy, real-world intent, merchant time savings or production uptime.',total:results.length,passed,failed:results.length-passed,results};
await mkdir('docs',{recursive:true});const reportPath=expanded?(ids?'docs/EVIDENCE_AI_EVALUATION_FOLLOWUP.json':'docs/EVIDENCE_AI_EVALUATION.json'):ids?'docs/CASE_AI_EVALUATION_FOLLOWUP.json':'docs/CASE_AI_EVALUATION.json';await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(`Live case evaluation: ${passed}/${results.length} passed. Report: ${reportPath}`);process.exitCode=passed===results.length?0:1;
