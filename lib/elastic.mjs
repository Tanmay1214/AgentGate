import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

export function evidenceDocuments(store, after=0) {
 const requests=store.all('SELECT * FROM requests').map(r=>({id:'refund-'+r.id,kind:'refund',requestId:r.id,capture:r.capture,amount:r.amount,status:r.status,reason:r.reason,at:r.created,providerId:r.provider_id||''}));
 const events=store.all('SELECT * FROM events WHERE seq>? ORDER BY seq',after).map(e=>{
  const d=JSON.parse(e.body),doc={id:'event-'+e.seq,kind:'event',seq:e.seq,hash:e.hash,at:d.at,type:d.type};
  for(const [source,target] of [['id','requestId'],['capture','capture'],['status','status'],['reason','reason'],['providerId','providerId'],['eventType','eventType'],['resourceId','resourceId']])if(typeof d[source]==='string')doc[target]=d[source].slice(0,200);
  if(Number.isSafeInteger(d.amount))doc.amount=d.amount;
  return doc;
 });
 return {documents:[...requests,...events],lastSeq:events.at(-1)?.seq??after};
}

export function searchBody({query='',kind='',status='',days='',capture='',requestIds=[]}={},workspace) {
 if(typeof query!=='string'||query.length>300)throw Error('Search must be at most 300 characters');
 if(!['','refund','event'].includes(kind))throw Error('Choose refunds, events, or both');
 if(!['','approval','completed','denied','executing','pending','unknown','failed'].includes(status))throw Error('Invalid refund status');
 if(!['','1','7','30','90'].includes(String(days)))throw Error('Invalid date window');
 if(typeof capture!=='string'||capture.length>200||!Array.isArray(requestIds)||requestIds.length>1000||requestIds.some(id=>typeof id!=='string'||id.length>200))throw Error('Invalid evidence scope');
 const filter=[{term:{workspace}}];
 if(kind)filter.push({term:{kind}});
 if(status)filter.push({term:{status}});
 if(days)filter.push({range:{at:{gte:`now-${days}d`}}});
 if(capture)filter.push({bool:{minimum_should_match:1,should:[{term:{capture}},...(requestIds.length?[{terms:{requestId:requestIds}}]:[])]}});
 const must=query.trim()?[{multi_match:{query:query.trim().replaceAll('_',' '),fields:['text'],operator:'and'}}]:[{match_all:{}}];
 return {size:50,track_total_hits:true,query:{bool:{filter,must}},sort:query.trim()?['_score',{at:'desc'}]:[{at:'desc'}]};
}

export function createElastic({url=process.env.ELASTICSEARCH_URL,key=process.env.ELASTICSEARCH_API_KEY,mode,dataDir,fetchFn=fetch}={}) {
 const configured=!!(url&&key),index=`agentgate-${mode}-evidence-v1`;
 const workspace=createHash('sha256').update(resolve(dataDir)).digest('hex').slice(0,24);
 let ready=false,cursor=0,inFlight,lastSync=null;
 async function call(path,body,method='POST',ndjson=false) {
  if(!configured)throw Object.assign(Error('Add ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY to .env, then restart.'),{httpStatus:503});
  let endpoint;try{endpoint=new URL(url);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error();}catch{throw Object.assign(Error('Elastic requires a valid HTTPS Elasticsearch endpoint.'),{httpStatus:503});}
  let response;
  try{response=await fetchFn(endpoint.href.replace(/\/$/,'')+path,{method,headers:{Authorization:'ApiKey '+key,'Content-Type':ndjson?'application/x-ndjson':'application/json'},...(body===undefined?{}:{body:ndjson?body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Object.assign(Error('Could not reach Elasticsearch. Check the endpoint and connection.'),{httpStatus:503});}
  const result=await response.json().catch(()=>({}));
  if(!response.ok&&!(method==='PUT'&&result.error?.type==='resource_already_exists_exception'))throw Object.assign(Error([401,403].includes(response.status)?'Elastic rejected access. The key needs create_index, write and read permissions for '+index+'.':'Elasticsearch could not complete this request.'),{httpStatus:503});
  return result;
 }
 async function sync(store) {
  if(inFlight)return inFlight;
  inFlight=(async()=>{
   if(!ready){await call('/'+index,{mappings:{dynamic:'strict',properties:Object.fromEntries([...['id','kind','workspace','requestId','capture','status','reason','providerId','type','hash','eventType','resourceId'].map(k=>[k,{type:'keyword'}]),['seq',{type:'long'}],['amount',{type:'long'}],['at',{type:'date'}],['text',{type:'text'}]])}},'PUT');ready=true;}
   const {documents,lastSeq}=evidenceDocuments(store,cursor);
   for(let start=0;start<documents.length;start+=200){
    const lines=documents.slice(start,start+200).flatMap(d=>[JSON.stringify({index:{_index:index,_id:workspace+'-'+d.id}}),JSON.stringify({...d,workspace,text:[d.kind,d.requestId,d.capture,d.status,d.reason,d.type,d.eventType,d.resourceId,d.providerId].filter(Boolean).join(' ').replaceAll('_',' ')})]).join('\n')+'\n';
    const result=await call('/_bulk?refresh=wait_for',lines,'POST',true);
    if(result.errors)throw Object.assign(Error('Elastic could not index all evidence. Retry sync; no payment records were changed.'),{httpStatus:503});
   }
   cursor=lastSeq;lastSync=new Date().toISOString();return {indexed:documents.length,lastSync};
  })();
  try{return await inFlight;}finally{inFlight=null;}
 }
 return {info:()=>({configured,index,lastSync}),sync,async search(store,input){const body=searchBody(input,workspace);await sync(store);const result=await call('/'+index+'/_search',body);return {total:result.hits.total.value,results:result.hits.hits.map(h=>h._source),lastSync,index};}};
}
