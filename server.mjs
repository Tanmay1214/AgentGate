import {createCases} from './lib/cases.mjs';
import {createElastic} from './lib/elastic.mjs';
import {executeRefund} from './lib/refund-executor.mjs';
import {completeCheckout} from './lib/checkout.mjs';
import {draftRefund,AIServiceError} from './lib/ai-client.mjs';
import http from 'node:http';
import {join} from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {store} from './lib/store.mjs';
import {paypal,providerState,cents} from './lib/paypal.mjs';
const mode=process.env.PAYPAL_ENV||'demo';if(!['demo','sandbox'].includes(mode))throw Error('Only demo and sandbox environments are supported');
const dataDir=process.env.DATA_DIR||'data';await mkdir(dataDir,{recursive:true});const s=store(join(dataDir,mode+'.sqlite'));const session=randomBytes(32).toString('hex');
const elastic=createElastic({mode,dataDir});
const aiInFlight=new Set();
const port=Number(process.env.PORT||4310);const origin=process.env.PUBLIC_URL||`http://localhost:${port}`;
if(mode==='demo')for(const [id,amount,label] of [['DEMO-1042',1200,'Canvas notebook · damaged item'],['DEMO-1043',4500,'Desk organiser · returned'],['DEMO-1044',9000,'Studio headphones · returned'],['DEMO-1045',6000,'Laptop stand · return unverified']])s.run('INSERT OR IGNORE INTO captures VALUES (?,?,?,?,?)',id,amount,'USD',id==='DEMO-1045'?0:1,label);
// A crashed process may have called the provider. Preserve its reservation.
for(const r of s.all("SELECT id FROM requests WHERE status='executing'"))s.settle(r.id,'unknown');
async function execute(r){return executeRefund(s,r,mode==='demo'?async()=>{await new Promise(resolve=>setTimeout(resolve,250));return {id:'SIM-'+r.id.slice(0,8),status:'COMPLETED'};}:paypal);}
const cases=createCases(s,{elastic,execute,apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||'gemini-3.5-flash-lite'});
async function readBody(req){let text='';for await(const c of req){text+=c;if(text.length>32000)throw Error('Request too large');}return text?JSON.parse(text):{};}
function state(){const day=new Date().toISOString().slice(0,10);return {mode,cases:cases.list(),elastic:elastic.info(),ai:!!process.env.GEMINI_API_KEY,aiModel:process.env.GEMINI_MODEL||'gemini-3.5-flash-lite',configured:!!(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET),webhook:!!process.env.PAYPAL_WEBHOOK_ID,policy:s.policy(),reserved:s.reserved(day),captures:s.all('SELECT * FROM captures').map(c=>({...c,remaining:s.remaining(c.id)})),requests:s.all('SELECT * FROM requests ORDER BY created DESC'),events:s.all('SELECT * FROM events ORDER BY seq DESC LIMIT 100').map(e=>({...e,data:JSON.parse(e.body)})),integrity:s.verify()};}
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
try{
 if(url.pathname==='/api/webhook'&&req.method==='POST'){
  if(mode!=='sandbox'||!process.env.PAYPAL_WEBHOOK_ID)return send(503,{error:'Webhook not configured'});
  const body=await readBody(req);const verified=await paypal('/v1/notifications/verify-webhook-signature',{method:'POST',body:{auth_algo:req.headers['paypal-auth-algo'],cert_url:req.headers['paypal-cert-url'],transmission_id:req.headers['paypal-transmission-id'],transmission_sig:req.headers['paypal-transmission-sig'],transmission_time:req.headers['paypal-transmission-time'],webhook_id:process.env.PAYPAL_WEBHOOK_ID,webhook_event:body}});
  if(verified.verification_status!=='SUCCESS')return send(401,{error:'Invalid signature'});
  if(typeof body.id!=='string')throw Error('Missing webhook ID');
  s.tx(()=>{if(s.get('SELECT id FROM seen WHERE id=?',body.id))return;s.run('INSERT INTO seen VALUES (?)',body.id);s.event('PAYPAL_WEBHOOK',{eventId:body.id,eventType:body.event_type,resourceId:body.resource?.id});});
  // Reconcile provider status by ID; a webhook body never grants refund permission.
  const r=s.get("SELECT * FROM requests WHERE provider_id=? AND status IN ('pending','unknown')",body.resource?.id||'');
  if(r){const p=await paypal(`/v2/payments/refunds/${encodeURIComponent(r.provider_id)}`);s.settle(r.id,providerState(p.status),p.id);}return send(200,{received:true});
 }
 if(url.pathname==='/checkout-return'&&req.headers.host===new URL(origin).host&&req.headers.host!==`localhost:${port}`){res.writeHead(302,{Location:`http://localhost:${port}/checkout-return?token=${encodeURIComponent(url.searchParams.get('token')||'')}`});return res.end();}
 if(req.headers.host!==`localhost:${port}`&&req.headers.host!==`127.0.0.1:${port}`)return send(403,{error:'Merchant dashboard is local-only'});
 if(req.headers.origin&&![origin,`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin))return send(403,{error:'Invalid origin'});
 if(req.headers['sec-fetch-site']==='cross-site'&&url.pathname.startsWith('/api/'))return send(403,{error:'Cross-site access denied'});
 if(url.pathname==='/api/session'&&req.method==='GET')return send(200,{token:session});
 if(url.pathname.startsWith('/api/')){
  if(req.headers['x-agentgate-key']!==session)return send(401,{error:'Reload the local dashboard to establish a session'});
  if(req.method==='GET'&&url.pathname==='/api/state')return send(200,state());
  const b=await readBody(req);
  if(req.method!=='POST')return send(405,{error:'Method not allowed'});
  if(url.pathname==='/api/cases/create')return send(200,cases.create(b));
  if(url.pathname==='/api/cases/return-review')return send(200,cases.recordReturn(b));
  if(url.pathname==='/api/cases/update')return send(200,cases.update(b));
  if(url.pathname==='/api/cases/reply')return send(200,cases.reply(b));
  if(url.pathname==='/api/cases/reconsider')return send(200,cases.reconsider(b));
  if(url.pathname==='/api/cases/evidence')return send(200,cases.importEvidence(b));
  if(url.pathname==='/api/cases/submit')return send(200,await cases.submit(b.id));
  if(url.pathname==='/api/cases/get')return send(200,cases.snapshot(b.id));
  if(url.pathname==='/api/cases/explain')return send(200,await cases.explain(b.id));
  if(url.pathname==='/api/cases/investigate'){
   const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
   return send(200,await cases.investigate(b.id,{signal:controller.signal}));
  }
  if(url.pathname==='/api/evidence/search')return send(200,await elastic.search(s,b));
  if(url.pathname==='/api/evidence/sync')return send(200,await elastic.sync(s));
  if(url.pathname==='/api/propose'){if(typeof b.capture!=='string'||typeof b.note!=='string'||b.note.length>4000)throw Error('Invalid request');return send(200,await execute(s.propose({capture:b.capture,amount:cents(b.amount),note:b.note,idem:b.idem})));}
  if(url.pathname==='/api/review'){if(typeof b.accept!=='boolean')throw Error('Choose approve or reject');return send(200,await execute(s.approve(b.id,b.accept)));}
  if(url.pathname==='/api/policy'){if(typeof b.enabled!=='boolean'||![b.auto,b.daily,b.maximum].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=100000000)||b.auto>b.maximum)throw Error('Invalid policy limits');s.tx(()=>{s.run('UPDATE settings SET body=? WHERE id=1',JSON.stringify({enabled:b.enabled,auto:b.auto,daily:b.daily,maximum:b.maximum}));s.event('POLICY_UPDATED',b);});return send(200,{ok:true});}
  if(url.pathname==='/api/eligibility'){if(typeof b.eligible!=='boolean'||!s.get('SELECT id FROM captures WHERE id=?',b.id))throw Error('Unknown capture');s.tx(()=>{s.run('UPDATE captures SET eligible=? WHERE id=?',b.eligible?1:0,b.id);s.run('DELETE FROM return_reviews WHERE capture=?',b.id);s.event('MERCHANT_ELIGIBILITY',{capture:b.id,eligible:b.eligible});});return send(200,{ok:true});}
  if(url.pathname==='/api/reconcile'){const r=s.get('SELECT * FROM requests WHERE id=?',b.id);if(!r||!['pending','unknown'].includes(r.status))throw Error('Nothing to reconcile');if(!r.provider_id)throw Error('Outcome unknown: inspect PayPal Sandbox activity before taking further action. Budget remains reserved.');const p=await paypal(`/v2/payments/refunds/${encodeURIComponent(r.provider_id)}`);return send(200,s.settle(r.id,providerState(p.status),p.id));}
  if(url.pathname==='/api/checkout'){if(mode!=='sandbox')throw Error('Switch to sandbox mode to create a PayPal checkout');const amount=cents(b.amount);if(amount>10000)throw Error('Demo checkout maximum is $100');const p=await paypal('/v2/checkout/orders',{method:'POST',key:randomUUID(),body:{intent:'CAPTURE',purchase_units:[{amount:{currency_code:'USD',value:(amount/100).toFixed(2)}}],payment_source:{paypal:{experience_context:{return_url:origin+'/checkout-return',cancel_url:origin+'/?cancelled=1',user_action:'PAY_NOW'}}}}});s.run('INSERT INTO orders VALUES (?)',p.id);return send(200,{id:p.id,url:p.links?.find(l=>['payer-action','approve'].includes(l.rel))?.href});}
  if(url.pathname==='/api/capture'){if(mode!=='sandbox'||typeof b.id!=='string'||!s.get('SELECT id FROM orders WHERE id=?',b.id))throw Error('Order was not created by this application');const c=await completeCheckout(b.id,paypal);s.tx(()=>{const inserted=s.run('INSERT OR IGNORE INTO captures VALUES (?,?,?,?,?)',c.id,c.amount,c.currency,0,'Sandbox purchase · merchant review required');if(inserted.changes)s.event('CAPTURE_IMPORTED',{order:b.id,capture:c.id,amount:c.amount});});return send(200,{ok:true,capture:c.id});}
  if(url.pathname==='/api/agent'){
   const capture=typeof b.capture==='string'?s.get('SELECT * FROM captures WHERE id=?',b.capture):null;
   if(!capture)throw new AIServiceError('AI_INVALID_INPUT','Choose an existing payment.',{httpStatus:400});
   if(aiInFlight.has(capture.id))throw new AIServiceError('AI_BUSY','A draft for this payment is already running. Wait or cancel it before retrying.',{httpStatus:429});
   const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
   const requestId=randomUUID();aiInFlight.add(capture.id);
   try {
    const remaining=s.remaining(capture.id);
    const draft=await draftRefund({capture:{...capture,remaining},message:b.message,apiKey:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||'gemini-3.5-flash-lite',signal:controller.signal,onAttempt:metadata=>s.tx(()=>s.event('AI_ATTEMPT',{requestId,...metadata}))});
    if(draft.status==='draft'&&cents(draft.amount)>s.remaining(capture.id))throw new AIServiceError('AI_BALANCE_CHANGED','The refundable balance changed while drafting. Refresh and try again.',{httpStatus:409});
    s.tx(()=>s.event('AI_DRAFT',{requestId,capture:capture.id,amount:draft.amount,status:draft.status,model:draft.model,attempts:draft.attempts}));
    return send(200,{...draft,requestId});
   }finally{aiInFlight.delete(capture.id);}
  }
  return send(404,{error:'Endpoint not found'});
 }
 const files={'/':'index.html','/checkout-return':'index.html','/app.js':'app.js','/draft-state.js':'draft-state.js','/style.css':'style.css','/case-workspace.js':'case-workspace.js','/review-panel.js':'review-panel.js','/merchant-labels.js':'merchant-labels.js','/evidence-form.js':'evidence-form.js','/refund-grid.js':'refund-grid.js','/vendor/ag-grid-community.js':'vendor/ag-grid-community.js','/vendor/ag-grid.css':'vendor/ag-grid.css','/vendor/ag-theme-quartz.css':'vendor/ag-theme-quartz.css'};const file=files[url.pathname];if(!file)return send(404,{error:'Not found'});const content=await readFile(new URL('./public/'+file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(content);
}catch(e){if(!res.destroyed){if(e.retryAfterSeconds)res.setHeader('Retry-After',String(e.retryAfterSeconds));send(e.httpStatus||400,{error:e.message,...(e.code?{code:e.code}: {})});}}});
server.listen(port,'127.0.0.1',()=>console.log(`AgentGate (${mode}): http://localhost:${port}`));
