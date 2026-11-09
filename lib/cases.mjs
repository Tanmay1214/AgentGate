import {randomUUID} from 'node:crypto';
import {cents} from './paypal.mjs';
import {hash} from './store.mjs';
import {paymentEvidence,requestEvidence} from './case-evidence.mjs';
import {investigateCase} from './case-agent.mjs';

export function createCases(s,{elastic,execute,agent=investigateCase,apiKey,model}={}){
 s.db.exec(`CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, capture TEXT NOT NULL, message TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, draft TEXT, request_id TEXT, created TEXT NOT NULL, updated TEXT NOT NULL, duration_ms INTEGER);`);
 s.db.exec('CREATE TABLE IF NOT EXISTS return_reviews (capture TEXT PRIMARY KEY,reference TEXT NOT NULL,verified INTEGER NOT NULL,updated TEXT NOT NULL)');
 const running=new Map();
 const read=id=>{const c=s.get('SELECT * FROM cases WHERE id=?',id);if(!c)throw Error('Unknown case');return c;};
 const snapshot=id=>{
  const c=read(id),facts=paymentEvidence(s,c.capture),draft=c.draft?JSON.parse(c.draft):null;
  const request=c.request_id?s.get('SELECT * FROM requests WHERE id=?',c.request_id):null;
  const preview=draft?.status==='draft'?s.preview(c.capture,cents(draft.amount)):null;
  return {...c,draft,request,facts,preview,stale:!!draft&&draft.fingerprint!==facts.fingerprint,running:running.has(id)};
 };
 const create=({id=randomUUID(),capture,message})=>{
  if(typeof id!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(id)||typeof capture!=='string'||typeof message!=='string'||!message.trim()||message.length>4000)throw Error('Choose a payment and enter a customer request of 1–4000 characters');
  paymentEvidence(s,capture);
  const prior=s.get('SELECT * FROM cases WHERE id=?',id);
  if(prior){if(prior.capture!==capture||prior.message!==message)throw Error('Case key already used for different details');return snapshot(id);}
  s.tx(()=>{const now=new Date().toISOString();s.run('INSERT INTO cases(id,capture,message,created,updated) VALUES (?,?,?,?,?)',id,capture,message,now,now);s.event('CASE_OPENED',{caseId:id,capture});});
  return snapshot(id);
 };
 async function auditEvidence(capture){
  const facts=paymentEvidence(s,capture),requestIds=facts.history.map(r=>r.id);
  const local=s.all('SELECT * FROM events ORDER BY seq DESC').flatMap(e=>{const d=JSON.parse(e.body);return d.capture===capture||requestIds.includes(d.id)?[{id:'audit-'+e.seq,source:'local',seq:e.seq,hash:e.hash,type:d.type,status:d.status||'',reason:d.reason||'',at:d.at}]:[];}).filter(e=>!['AI_ATTEMPT','CASE_AI_ATTEMPT'].includes(e.type));
  if(!elastic?.info().configured)return {source:'local',notice:'Elastic is not configured; evidence comes from the local audit ledger.',citations:local.slice(0,12)};
  try{
   const result=await elastic.search(s,{kind:'event',capture,requestIds});
   const indexed=new Map(result.results.map(e=>[e.seq,e]));
   const citations=local.filter(e=>indexed.get(e.seq)?.hash===e.hash).slice(0,12).map(e=>({...e,source:'elastic-verified'}));
   return {source:'elastic-verified',total:result.total,lastSync:result.lastSync,citations};
  }catch{return {source:'local-fallback',notice:'Elastic search is unavailable. These citations are from the local ledger.',citations:local.slice(0,12)};}
 }
 async function investigate(id,{signal}={}){
  const c=read(id);if(c.request_id)throw Error('This case already has a submitted refund');
  if(running.has(id))throw Object.assign(Error('This case is already being investigated'),{httpStatus:409});
  const controller=new AbortController();running.set(id,controller);const began=Date.now();
  try{
   const facts=paymentEvidence(s,c.capture);
   const result=await agent({message:c.message,evidence:facts,searchEvidence:()=>auditEvidence(c.capture),apiKey,model,signal:AbortSignal.any([controller.signal,...(signal?[signal]:[])]),onAttempt:metadata=>s.tx(()=>s.event('CASE_AI_ATTEMPT',{caseId:id,...metadata}))});
   if(controller.signal.aborted||signal?.aborted||read(id).revision!==c.revision)throw Object.assign(Error('The case changed during investigation. Investigate again.'),{httpStatus:409});
   if(paymentEvidence(s,c.capture).fingerprint!==facts.fingerprint)throw Object.assign(Error('Payment facts or merchant limits changed. Investigate again.'),{httpStatus:409});
   s.tx(()=>{s.run('UPDATE cases SET draft=?,duration_ms=?,updated=? WHERE id=?',JSON.stringify({...result,fingerprint:facts.fingerprint}),Date.now()-began,new Date().toISOString(),id);s.event('CASE_INVESTIGATED',{caseId:id,capture:c.capture,status:result.status,model:result.model,amount:result.amount});});
  }finally{running.delete(id);}
  return snapshot(id);
 }
 function update({id,message}){
  const c=read(id);if(c.request_id)throw Error('Submitted cases cannot be edited');
  if(typeof message!=='string'||!message.trim()||message.length>4000)throw Error('Enter a customer request of 1–4000 characters');
  running.get(id)?.abort();
  s.tx(()=>{s.run('UPDATE cases SET message=?,revision=revision+1,draft=NULL,duration_ms=NULL,updated=? WHERE id=?',message,new Date().toISOString(),id);s.event('CASE_UPDATED',{caseId:id,capture:c.capture});});return snapshot(id);
 }
 async function submit(id){
  const operation=s.tx(()=>{
   const c=read(id);
   if(c.request_id)return {...s.get('SELECT * FROM requests WHERE id=?',c.request_id),duplicate:true};
   if(running.has(id))throw Error('Wait for the investigation to finish');
   const d=c.draft?JSON.parse(c.draft):null;
   if(d?.status!=='draft')throw Error('Investigate the case and resolve clarification before submitting');
   if(d.fingerprint!==paymentEvidence(s,c.capture).fingerprint)throw Object.assign(Error('Payment facts or merchant limits changed. Investigate again.'),{httpStatus:409});
   const request=s.propose({capture:c.capture,amount:cents(d.amount),note:c.message,idem:'case-'+hash(id)});
   s.run('UPDATE cases SET request_id=?,updated=? WHERE id=?',request.id,new Date().toISOString(),id);
   s.event('CASE_SUBMITTED',{caseId:id,id:request.id,capture:request.capture});
   return request;
  });
  const request=operation;
  await execute(request);return snapshot(id);
 }
 function recordReturn({id,verified,reference}){
  const c=read(id);if(typeof verified!=='boolean'||typeof reference!=='string'||reference.trim().length<3||reference.length>200)throw Error('Enter a return-review reference of 3–200 characters');
  s.tx(()=>{const now=new Date().toISOString();s.run('INSERT INTO return_reviews VALUES (?,?,?,?) ON CONFLICT(capture) DO UPDATE SET reference=excluded.reference,verified=excluded.verified,updated=excluded.updated',c.capture,reference.trim(),verified?1:0,now);s.run('UPDATE captures SET eligible=? WHERE id=?',verified?1:0,c.capture);s.event('MERCHANT_RETURN_REVIEW',{caseId:id,capture:c.capture,eligible:verified});});
  return snapshot(id);
 }
 return {create,update,investigate,submit,snapshot,auditEvidence,recordReturn,list:()=>s.all('SELECT id FROM cases ORDER BY created DESC').map(c=>snapshot(c.id)),async explain(id){const evidence=requestEvidence(s,id);const audit=await auditEvidence(evidence.request.capture);const relevant=audit.citations.filter(e=>evidence.events.some(local=>local.seq===e.seq&&local.hash===e.hash));return {...evidence,citations:relevant,source:audit.source,notice:audit.notice||'',explanation:evidence.explanation};}};
}
