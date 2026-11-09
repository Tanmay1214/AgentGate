import {test} from 'node:test';
import assert from 'node:assert/strict';
import {store} from '../lib/store.mjs';
import {evidenceDocuments,searchBody,createElastic} from '../lib/elastic.mjs';

test('evidence projection excludes customer text, request keys and arbitrary event fields',()=>{
 const s=store(':memory:');
 s.run('INSERT INTO captures VALUES (?,?,?,?,?)','C',1000,'USD',1,'private label');
 s.propose({capture:'C',amount:100,note:'private customer text',idem:'private-request-key'});
 s.event('TEST',{apiKey:'secret',message:'private text',status:'denied'});
 const serialized=JSON.stringify(evidenceDocuments(s));
 for(const value of ['private','secret','apiKey','note','idem'])assert.equal(serialized.includes(value),false);
 assert.equal(evidenceDocuments(s,1).documents.filter(d=>d.kind==='event').length,1);
 s.db.close();
});
test('queries always scope workspace and use structured filters, not query-string DSL',()=>{
 const b=searchBody({query:'* OR status:completed',kind:'refund',status:'denied',days:'7'},'scope');
 assert.deepEqual(b.query.bool.filter,[{term:{workspace:'scope'}},{term:{kind:'refund'}},{term:{status:'denied'}},{range:{at:{gte:'now-7d'}}}]);
 assert.equal(b.query.bool.must[0].multi_match.query,'* OR status:completed');
 assert.equal(searchBody({query:'PROVIDER_COMPLETED'},'scope').query.bool.must[0].multi_match.query,'PROVIDER COMPLETED');
 for(const input of [{query:'x'.repeat(301)},{kind:'other'},{status:'oops'},{days:'100000'}])assert.throws(()=>searchBody(input,'scope'));
});
test('failed bulk sync retries the event batch and deterministic IDs avoid duplicates',async()=>{
 const s=store(':memory:');s.event('TEST',{status:'denied'});
 const batches=[];let fail=true;
 const elastic=createElastic({url:'https://elastic.example',key:'hidden',mode:'demo',dataDir:'data/test',fetchFn:async(url,opts)=>{
  if(url.includes('_bulk')){batches.push(opts.body);const errors=fail;fail=false;return Response.json({errors});}
  return Response.json({acknowledged:true});
 }});
 await assert.rejects(elastic.sync(s),/could not index/);
 assert.equal(elastic.info().lastSync,null);
 await elastic.sync(s);assert.equal(batches[0],batches[1]);
 assert.ok(elastic.info().lastSync);s.db.close();
});
test('provider errors hide keys and response bodies',async()=>{
 const elastic=createElastic({url:'https://elastic.example',key:'secret',mode:'demo',dataDir:'data',fetchFn:async()=>Response.json({error:{reason:'secret'}},{status:403})});
 await assert.rejects(elastic.sync({}),e=>e.httpStatus===503&&!e.message.includes('secret')&&e.message.includes('permissions'));
});
test('search validates input before indexing and reports actual Elastic results',async()=>{
 let calls=0;
 const elastic=createElastic({url:'https://elastic.example',key:'secret',mode:'demo',dataDir:'data',fetchFn:async(url)=>{calls++;return Response.json(url.endsWith('_search')?{hits:{total:{value:1},hits:[{_source:{kind:'refund',status:'completed'}}]}}:{acknowledged:true});}});
 await assert.rejects(elastic.search({}, {days:'bad'}));assert.equal(calls,0);
 const result=await elastic.search({all:()=>[]},{});assert.equal(result.total,1);assert.equal(result.results[0].status,'completed');
});
test('missing configuration fails clearly without network access',async()=>{
 const elastic=createElastic({url:'',key:'',mode:'demo',dataDir:'data'});
 assert.equal(elastic.info().configured,false);await assert.rejects(elastic.sync({}),/Add ELASTICSEARCH/);
});
