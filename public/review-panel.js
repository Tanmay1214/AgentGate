const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
let selected='';
export function mountReviewPanel({host,data,api}){
 let revision=0;
 function select(id){
  const r=data.requests.find(r=>r.id===id);selected=id;revision++;
  if(!r){host.innerHTML='<h2>Review a request</h2><p class="muted">Select a grid row to inspect its payment, decision and evidence.</p>';return;}
  const payment=data.captures.find(c=>c.id===r.capture);
  host.innerHTML='<h2>Review this request</h2><span class="badge">'+esc(r.status)+'</span><h3>'+money(r.amount)+'</h3><p class="muted">'+esc(r.capture)+'</p><p>'+esc(r.note)+'</p><dl><dt>Remaining refundable now</dt><dd>'+money(payment?.remaining||0)+'</dd><dt>Return eligibility</dt><dd>'+(payment?.eligible?'Merchant verified':'Unverified')+'</dd><dt>Decision</dt><dd>'+esc(r.reason)+'</dd></dl><div class="case-actions">'+(r.status==='approval'?'<button class="primary" data-approve="'+esc(r.id)+'">Approve this refund</button><button class="secondary" data-reject="'+esc(r.id)+'">Reject</button>':'')+(['pending','unknown'].includes(r.status)?'<button class="secondary" data-reconcile="'+esc(r.id)+'">Check outcome</button>':'')+'<button class="secondary" id="explain-review">Explain decision</button></div><div id="review-explanation" aria-live="polite"></div>';
  host.querySelector('#explain-review').onclick=async e=>{
   e.stopPropagation();const ticket=revision,button=e.currentTarget,box=host.querySelector('#review-explanation');button.disabled=true;box.textContent='Retrieving evidence...';
   try{const result=await api('cases/explain',{id:r.id});if(ticket!==revision||!host.isConnected)return;box.innerHTML='<p>'+esc(result.explanation)+'</p><p class="muted">'+esc(result.source)+' '+esc(result.notice)+'</p>'+result.citations.map(c=>'<details><summary>Audit #'+esc(c.seq)+' · '+esc(c.type)+'</summary><p>'+esc(c.reason||c.status)+'</p><code>'+esc(c.hash)+'</code></details>').join('')+(!result.citations.length?'<p>No matching verified audit citations were retrieved.</p>':'');}
   catch(error){if(ticket===revision)box.textContent=error.message;}finally{button.disabled=false;}
  };
 }
 select(selected||data.requests[0]?.id);return select;
}
