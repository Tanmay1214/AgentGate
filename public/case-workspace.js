import {decisionLabel,statusLabel,eventLabel} from './merchant-labels.js';
import {evidenceForm,recordFromForm,fillEvidenceForm,sampleRecord} from './evidence-form.js';
const when=v=>new Date(v).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v/100);
let selected='',active=null;
export function destroyCaseWorkspace(){active?.abort();active=null;}
const fields=items=>'<dl class="case-facts">'+items.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>';
export function mountCaseWorkspace({host,data,api,onState=()=>{}}){
 const controller=new AbortController();active=controller;let busy=false,message='';
 let c=data.cases?.find(c=>c.id===selected)||data.cases?.[0]||null;if(c)selected=c.id;
 const card=(title,body)=>'<section class="card"><h2>'+esc(title)+'</h2>'+body+'</section>';
 function draw(){
  if(controller.signal.aborted)return;
  const facts=c?.facts,d=c?.draft,r=c?.request;
  const stage=r?statusLabel(r.status):d?(c.stale?'Evidence changed':d.status==='clarification'?'Needs a reply':c.preview?.status==='denied'?'Needs merchant attention':'Ready for review'):'Needs investigation';
  host.innerHTML='<div class="case-layout"><div class="case-sidebar">'+card('Open a refund case',`<form id="case-create"><label>Payment<select name="capture" required>${data.captures.map(p=>`<option value="${esc(p.id)}">${esc(p.id)} · ${money(p.remaining)} remaining</option>`).join('')}</select></label><label>Customer request<textarea name="message" rows="4" maxlength="4000" required placeholder="My order arrived damaged. Please refund the remaining amount."></textarea></label><button class="primary" ${busy?'disabled':''}>Open case</button></form>`)+card('Your cases',(data.cases||[]).map(item=>`<button class="case-list-item ${item.id===c?.id?'selected':''}" data-case-select="${esc(item.id)}"><strong>${esc(item.id.slice(0,8))}</strong><span>${esc(statusLabel(item.request?.status||item.draft?.status||'new'))} · ${esc(item.capture)}</span></button>`).join('')||'<p class="muted">New cases appear here.</p>')+'</div><div class="case-main">'+(message?'<p class="case-message" role="status">'+esc(message)+'</p>':'')+(c?
   card('Case '+c.id.slice(0,8),'<p class="badge">'+esc(stage)+'</p>'+(c.parent_id?`<p>Follow-up review of <button class="secondary" data-case-select="${esc(c.parent_id)}">the original blocked case</button></p>`:'')+(c.followupId?`<p><button class="secondary" data-case-select="${esc(c.followupId)}">View follow-up review</button></p>`:'')+`<ol class="case-conversation">${(c.messages||[]).map(m=>`<li><strong>${esc(({customer:'Customer',question:'Agent question',correction:'Customer correction',merchant:'Merchant review note'})[m.kind]||'Message')}</strong><small>${esc(when(m.created))}</small><p>${esc(m.message)}</p></li>`).join('')}</ol>`+(!r?`<form id="case-reply"><label>${d?.status==='clarification'?'Customer answer':'Add a customer reply or correction'}<textarea name="message" rows="2" maxlength="4000" required></textarea></label><button class="secondary">Save reply</button><p class="muted">This clears the old recommendation. Investigate again using the complete conversation.</p></form>`:''))+
   card('Payment & merchant evidence',fields([['Payment',facts.payment.id],['Original payment',money(facts.payment.originalCents)],['Remaining refundable',money(facts.payment.remainingCents)],['Return eligibility',facts.payment.returnVerified?'Merchant verified':'Unverified'],['Return reference',facts.payment.returnReview?.reference||'No case review reference recorded'],['Automatic limit',money(facts.policy.auto)],['Maximum per refund',money(facts.policy.maximum)],['Daily budget available',money(facts.policy.available)]])+`<details><summary>Record merchant eligibility review</summary><p class="muted">Use a reference from your reviewed return records. Customer claims alone do not verify eligibility.</p><form id="case-return"><label>Return-review reference<input name="reference" required minlength="3" maxlength="200" value="${esc(facts.payment.returnReview?.reference||'')}" placeholder="RETURN-123 / inspection record"></label><label>Review decision<select name="verified"><option value="false" ${!facts.payment.returnVerified?'selected':''}>Not verified / ineligible</option><option value="true" ${facts.payment.returnVerified?'selected':''}>Verified eligible</option></select></label><button class="secondary">Save eligibility review</button></form></details>`)+
   card('Order, return & policy',evidenceForm(c,data.mode))+
   card('AI investigation',(!r?`<button class="primary" data-case-action="investigate" ${busy||!data.ai?'disabled':''}>${busy?'Working…':d?'Investigate again':'Investigate case'}</button> <button class="secondary" data-case-action="reload" ${busy?'disabled':''}>Refresh evidence</button>`:'')+(!data.ai?'<p class="muted">Configure Gemini in Connections to investigate.</p>':'')+(c.stale&&!r?'<p class="case-warning">Payment facts or merchant limits changed. Investigate again before submitting.</p>':'')+(d?`<p>${esc(d.rationale)}</p>${d.status==='clarification'?'<p class="case-warning">'+esc(d.question)+'</p>':fields([['Proposed refund',money(Math.round(Number(d.amount)*100))],['Decision',decisionLabel(r?r.reason:c.preview.reason)]])}<p class="muted">${esc(d.model)} · investigation ${(c.duration_ms/1000).toFixed(1)} seconds</p><details><summary>Investigation steps & cited evidence</summary><ol>${d.trace.map(t=>'<li>'+esc(t.tool.replaceAll('_',' '))+' · '+esc(t.source)+'</li>').join('')}</ol>${d.evidence.filter(e=>d.citations.includes(e.id)).map(e=>'<div class="case-citation"><strong>'+esc(e.id)+'</strong><pre>'+esc(JSON.stringify(e.data||e,null,2))+'</pre></div>').join('')}</details>`:'<p class="muted">The investigator reads payment facts, prior refunds, policy, order and return records, and audit evidence before preparing a recommendation.</p>'))+
   card('Policy, review & outcome',r?fields([['Status',statusLabel(r.status)],['Amount',money(r.amount)],['Decision',decisionLabel(r.reason)],['Provider refund',r.provider_id||'No provider ID recorded']])+`<div class="case-actions">${r.status==='approval'?'<button class="primary" data-case-action="approve">Approve this refund</button><button class="secondary" data-case-action="reject">Reject</button>':''}${['pending','unknown'].includes(r.status)?'<button class="secondary" data-case-action="reconcile">Check provider outcome</button>':''}<button class="secondary" data-case-action="explain">Explain decision with evidence</button><button class="secondary" data-case-action="reload">Refresh outcome</button></div><div id="case-explanation"></div>`+(r.status==='denied'&&!c.followupId?`<form id="case-reconsider"><label>What changed since this request was blocked?<textarea name="reason" rows="2" minlength="3" maxlength="1000" required></textarea></label><button class="secondary">Start a follow-up review</button><p class="muted">Keeps the original decision and opens a linked case for fresh investigation.</p></form>`:''):d?.status==='draft'?`<p>${c.preview.status==='approval'?'Submission creates a proposal that waits for merchant approval.':c.preview.status==='denied'?'Current policy blocks this proposal. You can record the blocked attempt for investigation.':'Submission runs the policy checks and executes an allowed refund.'}</p><button class="primary" data-case-action="submit" ${busy||c.stale?'disabled':''}>${c.preview.status==='approval'?'Submit for approval':c.preview.status==='denied'?'Record blocked proposal':'Submit & execute refund'}</button>`:'<p class="muted">A clear recommendation is required before submission.</p>')+
   card('Case timeline',`<ol class="case-timeline">${(c.timeline||[]).map(e=>`<li><strong>${esc(eventLabel(e.type))}</strong><small>${esc(when(e.at))} / #${e.seq}</small>${e.reason?'<p>'+esc(decisionLabel(e.reason))+'</p>':''}${e.status?'<p>'+esc(statusLabel(e.status))+'</p>':''}</li>`).join('')}</ol>`)+
   card('Prior refunds',facts.history.length?facts.history.map(p=>'<p>'+money(p.amount)+' · '+esc(statusLabel(p.status))+' · '+esc(decisionLabel(p.reason))+'</p>').join(''):'<p class="muted">No previous refund requests on this payment.</p>'):
   card('One case, from request to outcome','<p>Select a payment, enter the customer’s request, and open a case. The investigator collects evidence and prepares a proposal for merchant review.</p>'))+'</div></div>';
  if(busy)host.querySelectorAll('button,input,textarea,select').forEach(b=>b.disabled=true);
 }
 async function run(fn){
  if(busy)return;
  const savedForms=[...host.querySelectorAll('form')].map(f=>({id:f.id,values:[...new FormData(f)].filter(([,v])=>typeof v==='string'),open:f.closest('details')?.open}));
  let failed=false;busy=true;message='';draw();
  try{await fn();}catch(e){failed=true;if(!controller.signal.aborted)message=e.message;}
  finally{busy=false;if(!controller.signal.aborted){draw();if(failed)for(const saved of savedForms){const f=host.querySelector('#'+saved.id);if(!f)continue;for(const [k,v] of saved.values){const field=f.elements.namedItem(k);if(field&&field.type!=='file')field.value=v;}if(saved.open&&f.closest('details'))f.closest('details').open=true;}}}
 }
 host.onclick=async e=>{
  const b=e.target.closest('button');if(!b)return;e.stopPropagation();
  if(b.dataset.caseSelect){selected=b.dataset.caseSelect;c=data.cases.find(c=>c.id===selected);message='';draw();return;}
  if(!b.dataset.caseAction||!c)return;
  if(b.dataset.caseAction==='sample'){fillEvidenceForm(host.querySelector('#case-evidence'),sampleRecord(c),c.capture);return;}
  await run(async()=>{
   const action=b.dataset.caseAction;
   if(action==='explain'){const result=await api('cases/explain',{id:c.request.id},controller.signal);message=result.explanation+' Evidence: '+result.citations.map(e=>'audit #'+e.seq).join(', ')+' ('+result.source+'). '+(result.notice||'');return;}
   if(['approve','reject'].includes(action))await api('review',{id:c.request.id,accept:action==='approve'},controller.signal);
   else if(action==='reconcile')await api('reconcile',{id:c.request.id},controller.signal);
   else if(action==='submit')await api('cases/submit',{id:c.id},controller.signal);
   else if(action==='investigate'){c=await api('cases/investigate',{id:c.id},controller.signal);}
   c=await api('cases/get',{id:c.id},controller.signal);const updated=await api('state',undefined,controller.signal);data=updated;onState(data);
  });
 };
 host.onsubmit=async e=>{
  e.preventDefault();e.stopPropagation();const f=e.target,values=Object.fromEntries(new FormData(f));
  await run(async()=>{
   if(f.id==='case-create'){c=await api('cases/create',{id:crypto.randomUUID(),...values},controller.signal);selected=c.id;}
   if(f.id==='case-reply')c=await api('cases/reply',{id:c.id,message:values.message,key:crypto.randomUUID()},controller.signal);
   if(f.id==='case-evidence')c=await api('cases/evidence',{id:c.id,record:recordFromForm(values,c.capture)},controller.signal);
   if(f.id==='case-reconsider'){c=await api('cases/reconsider',{id:c.id,reason:values.reason},controller.signal);selected=c.id;}
   if(f.id==='case-return')c=await api('cases/return-review',{id:c.id,reference:values.reference,verified:values.verified==='true'},controller.signal);
   data=await api('state',undefined,controller.signal);onState(data);
  });
 };
 host.onchange=async e=>{if(e.target.name!=='evidenceFile')return;const file=e.target.files?.[0];if(!file)return;const box=host.querySelector('#import-message');try{if(file.size>24000)throw Error('Use a JSON file smaller than 24 KB');fillEvidenceForm(host.querySelector('#case-evidence'),JSON.parse(await file.text()),c.capture);box.textContent='Record loaded. Review the fields and save.';}catch(error){box.textContent='Could not load record: '+error.message;}};
 draw();
}
