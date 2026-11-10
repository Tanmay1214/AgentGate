import {randomUUID} from 'node:crypto';
import {cents} from './paypal.mjs';
import {hash} from './store.mjs';
import {paymentEvidence,requestEvidence} from './case-evidence.mjs';
import {investigateCase} from './case-agent.mjs';
import {validateMerchantEvidence} from './merchant-evidence.mjs';

export function createCases(s,{elastic,execute,agent=investigateCase,apiKey,model}={}){
 s.db.exec(`CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, capture TEXT NOT NULL, message TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, draft TEXT, request_id TEXT, created TEXT NOT NULL, updated TEXT NOT NULL, duration_ms INTEGER);`);
 s.db.exec('CREATE TABLE IF NOT EXISTS return_reviews (capture TEXT PRIMARY KEY,reference TEXT NOT NULL,verified INTEGER NOT NULL,updated TEXT NOT NULL)');
 if(!s.all('PRAGMA table_info(cases)').some(c=>c.name==='parent_id'))s.db.exec('ALTER TABLE cases ADD COLUMN parent_id TEXT');
 s.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS case_one_followup ON cases(parent_id) WHERE parent_id IS NOT NULL;
 CREATE TABLE IF NOT EXISTS case_messages (id TEXT UNIQUE NOT NULL, case_id TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL, created TEXT NOT NULL, seq INTEGER PRIMARY KEY AUTOINCREMENT);`);
 for(const c of s.all('SELECT id,message,created FROM cases'))s.run('INSERT OR IGNORE INTO case_messages(id,case_id,kind,message,created) VALUES (?,?,?,?,?)','initial-'+c.id,c.id,'customer',c.message,c.created);
 const running=new Map();
 const messages=id=>s.all('SELECT id,kind,message,created FROM case_messages WHERE case_id=? ORDER BY seq',id);
 const read=id=>{const c=s.get('SELECT * FROM cases WHERE id=?',id);if(!c)throw Error('Unknown case');return c;};
 const snapshot=id=>{
  const c=read(id),facts=paymentEvidence(s,c.capture),draft=c.draft?JSON.parse(c.draft):null;
  const request=c.request_id?s.get('SELECT * FROM requests WHERE id=?',c.request_id):null;
  const preview=draft?.status==='draft'?s.preview(c.capture,cents(draft.amount)):null;
  const timeline=s.all('SELECT seq,body FROM events ORDER BY seq').flatMap(e=>{const v=JSON.parse(e.body);return v.caseId===id||(c.request_id&&v.id===c.request_id)?[{seq:e.seq,...v}]:[];}).filter(e=>e.type!=='CASE_AI_ATTEMPT');
  return {...c,messages:messages(id),timeline,followupId:s.get('SELECT id FROM cases WHERE parent_id=?',id)?.id||null,draft,request,facts,preview,stale:!!draft&&draft.fingerprint!==facts.fingerprint,running:running.has(id)};
 };
 const create=({id=randomUUID(),capture,message})=>{
  if(typeof id!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(id)||typeof capture!=='string'||typeof message!=='string'||!message.trim()||message.length>4000)throw Error('Choose a payment and enter a customer request of 1–4000 characters');
  paymentEvidence(s,capture);
  const prior=s.get('SELECT * FROM cases WHERE id=?',id);
  if(prior){if(prior.capture!==capture||prior.message!==message)throw Error('Case key already used for different details');return snapshot(id);}
  s.tx(()=>{const now=new Date().toISOString();s.run('INSERT INTO cases(id,capture,message,created,updated) VALUES (?,?,?,?,?)',id,capture,message,now,now);s.run('INSERT INTO case_messages(id,case_id,kind,message,created) VALUES (?,?,?,?,?)','initial-'+id,id,'customer',message,now);s.event('CASE_OPENED',{caseId:id,capture});});
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
  if(messages(id).reduce((n,m)=>n+m.message.length,0)>15500)throw Error('This conversation reached its investigation limit. Open a new case with a concise summary.');
  const controller=new AbortController();running.set(id,controller);const began=Date.now();
  try{
   const facts=paymentEvidence(s,c.capture);
   const result=await agent({message:JSON.stringify(messages(id).map(({kind,message})=>({kind,message}))),evidence:facts,searchEvidence:()=>auditEvidence(c.capture),apiKey,model,signal:AbortSignal.any([controller.signal,...(signal?[signal]:[])]),onAttempt:metadata=>s.tx(()=>s.event('CASE_AI_ATTEMPT',{caseId:id,...metadata}))});
   if(controller.signal.aborted||signal?.aborted||read(id).revision!==c.revision)throw Object.assign(Error('The case changed during investigation. Investigate again.'),{httpStatus:409});
   if(paymentEvidence(s,c.capture).fingerprint!==facts.fingerprint)throw Object.assign(Error('Payment facts or merchant limits changed. Investigate again.'),{httpStatus:409});
   s.tx(()=>{const now=new Date().toISOString();s.run('UPDATE cases SET draft=?,duration_ms=?,updated=? WHERE id=?',JSON.stringify({...result,fingerprint:facts.fingerprint}),Date.now()-began,now,id);if(result.status==='clarification')s.run('INSERT INTO case_messages(id,case_id,kind,message,created) VALUES (?,?,?,?,?)',randomUUID(),id,'question',result.question,now);s.event('CASE_INVESTIGATED',{caseId:id,capture:c.capture,status:result.status,model:result.model,amount:result.amount});});
  }finally{running.delete(id);}
  return snapshot(id);
 }
 function update({id,message}){
  const c=read(id);if(c.request_id)throw Error('Submitted cases cannot be edited');
  if(typeof message!=='string'||!message.trim()||message.length>4000)throw Error('Enter a customer request of 1–4000 characters');
  running.get(id)?.abort();
  return reply({id,message,kind:'correction'});
 }
 function reply({id,message,key=randomUUID(),kind='customer'}){
  const c=read(id);if(c.request_id)throw Error('Submitted cases cannot be edited');
  if(typeof message!=='string'||!message.trim()||message.length>4000||typeof key!=='string'||key.length<8||key.length>100)throw Error('Enter a reply of 1–4000 characters with a valid reply key');
  const prior=s.get('SELECT * FROM case_messages WHERE id=?',key);
  if(prior){if(prior.case_id!==id||prior.message!==message)throw Error('Reply key already used for different details');return snapshot(id);}
  if(messages(id).reduce((n,m)=>n+m.message.length,0)+message.length>16000)throw Error('This conversation reached its limit. Open a new case with a concise summary.');
  running.get(id)?.abort();
  s.tx(()=>{const now=new Date().toISOString();s.run('INSERT INTO case_messages(id,case_id,kind,message,created) VALUES (?,?,?,?,?)',key,id,kind==='correction'?'correction':'customer',message,now);s.run('UPDATE cases SET revision=revision+1,draft=NULL,duration_ms=NULL,updated=? WHERE id=?',now,id);s.event('CASE_REPLY',{caseId:id,capture:c.capture});});return snapshot(id);
 }
 function reconsider({id,reason}){
  const child=s.tx(()=>{
   const c=read(id),r=c.request_id?s.get('SELECT * FROM requests WHERE id=?',c.request_id):null;
   if(!r||r.status!=='denied')throw Error('Only a denied request can be reconsidered. Pending, uncertain and completed payments must not be retried.');
   const prior=s.get('SELECT id FROM cases WHERE parent_id=?',id);if(prior)return prior.id;
   if(typeof reason!=='string'||reason.trim().length<3||reason.length>1000)throw Error('Explain what changed before reconsidering this case');
   const next=randomUUID(),now=new Date().toISOString();
   create({id:next,capture:c.capture,message:c.message});
   const initial=messages(id)[0];if(initial)s.run('UPDATE case_messages SET created=? WHERE id=?',initial.created,'initial-'+next);
   s.run('UPDATE cases SET parent_id=? WHERE id=?',id,next);
   for(const m of messages(id).slice(1))s.run('INSERT INTO case_messages(id,case_id,kind,message,created) VALUES (?,?,?,?,?)',randomUUID(),next,m.kind,m.message,m.created);
   s.run('INSERT INTO case_messages(id,case_id,kind,message,created) VALUES (?,?,?,?,?)',randomUUID(),next,'merchant',reason,now);
   s.event('CASE_RECONSIDERED',{caseId:next,parentCase:id,capture:c.capture,previousRequest:r.id});return next;
  });return snapshot(child);
 }
 function importEvidence({id,record}){
  const c=read(id),capture=s.get('SELECT * FROM captures WHERE id=?',c.capture),validated=validateMerchantEvidence(record,capture);
  s.tx(()=>{s.run('INSERT INTO merchant_evidence VALUES (?,?,?) ON CONFLICT(capture) DO UPDATE SET body=excluded.body,updated=excluded.updated',c.capture,JSON.stringify(validated),new Date().toISOString());s.event('MERCHANT_EVIDENCE_IMPORTED',{caseId:id,capture:c.capture,itemCount:validated.order.items.length,returnStatus:validated.return.status});});return snapshot(id);
 }
 async function submit(id){
  const operation=s.tx(()=>{
   const c=read(id);
   if(c.request_id)return {...s.get('SELECT * FROM requests WHERE id=?',c.request_id),duplicate:true};
   if(running.has(id))throw Error('Wait for the investigation to finish');
   const d=c.draft?JSON.parse(c.draft):null;
   if(d?.status!=='draft')throw Error('Investigate the case and resolve clarification before submitting');
   if(d.fingerprint!==paymentEvidence(s,c.capture).fingerprint)throw Object.assign(Error('Payment facts or merchant limits changed. Investigate again.'),{httpStatus:409});
   const note=messages(id).filter(m=>m.kind!=='question').map(m=>m.message).join('\n');
   const request=s.propose({capture:c.capture,amount:cents(d.amount),note,idem:'case-'+hash(id)});
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
 return {create,update,reply,reconsider,importEvidence,investigate,submit,snapshot,auditEvidence,recordReturn,list:()=>s.all('SELECT id FROM cases ORDER BY created DESC').map(c=>snapshot(c.id)),async explain(id){const evidence=requestEvidence(s,id);const audit=await auditEvidence(evidence.request.capture);const relevant=audit.citations.filter(e=>evidence.events.some(local=>local.seq===e.seq&&local.hash===e.hash));return {...evidence,citations:relevant,source:audit.source,notice:audit.notice||'',explanation:evidence.explanation};}};
}
