import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import test from 'node:test';
import {chromium} from '@playwright/test';

const request=(port,path,headers={})=>new Promise((resolve,reject)=>{
 const req=http.request({host:'127.0.0.1',port,path,headers:{host:'agentgate.example.test',...headers}},res=>{
  let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));
 });req.on('error',reject);req.end();
});
test('hosted mode protects merchant APIs while allowing only its configured host',async()=>{
 const port=39000+Math.floor(Math.random()*1000),dataDir=await mkdtemp(join(os.tmpdir(),'agentgate-hosted-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PAYPAL_ENV:'demo',HOSTED_MODE:'true',RENDER:'true',PUBLIC_URL:'',PORT:String(port),RENDER_EXTERNAL_URL:'https://agentgate.example.test/',AGENTGATE_ACCESS_KEY:'a-hosted-access-key-that-is-long-enough',GEMINI_API_KEY:'',ELASTICSEARCH_URL:'',ELASTICSEARCH_API_KEY:'',PAYPAL_WEBHOOK_ID:'',DATA_DIR:dataDir},stdio:'ignore'});
 try{
  let ready;
  for(let attempt=0;attempt<40;attempt++){
   try{ready=await request(port,'/api/session');if(ready.status===401)break;}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(ready?.status,401);
  assert.equal((await request(port,'/api/state')).status,401);
  assert.equal((await request(port,'/api/session',{'x-agentgate-access-key':'wrong-key'})).status,401);
  assert.equal((await request(port,'/healthz',{host:'internal-render-health-check'})).body,'{"ok":true}');
  assert.equal((await request(port,'/checkout-return?token=fixture')).status,200);
  const opened=await request(port,'/api/session',{'x-agentgate-access-key':'a-hosted-access-key-that-is-long-enough'});
  assert.equal(opened.status,200);
  const token=JSON.parse(opened.body).token;
  const state=await request(port,'/api/state',{'x-agentgate-access-key':'a-hosted-access-key-that-is-long-enough','x-agentgate-key':token});
  assert.equal(state.status,200);
  assert.equal((await request(port,'/api/state',{'x-agentgate-key':token})).status,401);
  assert.equal((await request(port,'/api/state',{'x-agentgate-access-key':'a-hosted-access-key-that-is-long-enough','x-agentgate-key':token,origin:'https://evil.example'})).status,403);
  assert.equal((await request(port,'/api/session',{'x-agentgate-access-key':'a-hosted-access-key-that-is-long-enough','sec-fetch-site':'cross-site'})).status,403);
  const wrongHost=await new Promise((resolve,reject)=>{
   const req=http.request({host:'127.0.0.1',port,path:'/',headers:{host:'not-agentgate.example.test'}},res=>resolve(res.statusCode));req.on('error',reject);req.end();
  });
  assert.equal(wrongHost,403);
 }finally{const exited=once(child,'exit');child.kill();await exited;await rm(dataDir,{recursive:true,force:true});}
});

test('hosted entry screen unlocks on desktop and mobile and remembers the tab session', {timeout:45000}, async()=>{
 const port=40000+Math.floor(Math.random()*1000),dataDir=await mkdtemp(join(os.tmpdir(),'agentgate-hosted-ui-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PAYPAL_ENV:'demo',HOSTED_MODE:'true',PUBLIC_URL:'',RENDER_EXTERNAL_URL:'https://agentgate.example.test',PORT:String(port),DATA_DIR:dataDir,AGENTGATE_ACCESS_KEY:'a-hosted-access-key-that-is-long-enough',GEMINI_API_KEY:'',ELASTICSEARCH_URL:'',ELASTICSEARCH_API_KEY:''},stdio:'ignore'});
 let browser;
 // Emulate Render's reverse proxy with the configured upstream Host.
 const proxy=http.createServer((req,res)=>{
  const upstream=http.request({host:'127.0.0.1',port,path:req.url,method:req.method,headers:{...req.headers,host:'agentgate.example.test',...(req.headers.origin?{origin:'https://agentgate.example.test'}:{})}},response=>{
   res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });
  upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
 });
 try{
  for(let attempt=0;attempt<40;attempt++){try{if((await request(port,'/healthz')).status===200)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
  browser=await chromium.launch({headless:true});
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:900}});
   const page=await context.newPage();
   page.setDefaultTimeout(10000);
   page.on('pageerror',error=>console.error('Hosted UI error:',error.message));
   await page.goto(`http://127.0.0.1:${proxy.address().port}/`);
   await page.locator('#access-form').waitFor();
   assert.equal(await page.locator('.app-sidebar').evaluate(element=>element.inert),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.locator('#access-form input').fill('wrong-key');
   await page.locator('#access-form button').click();
   await page.waitForFunction(()=>document.querySelector('.access-message').textContent.includes('access key')&&!document.querySelector('#access-form button').disabled);
   await page.locator('#access-form input').fill('a-hosted-access-key-that-is-long-enough');
   await page.locator('#access-form button').click();
   await page.locator('#view[data-view="overview"]').waitFor();
   assert.equal(await page.locator('.access-screen').count(),0);
   assert.equal(await page.locator('.app-sidebar').evaluate(element=>element.inert),false);
   assert.equal(await page.locator('#workspace-location').textContent(),'Hosted Sandbox workspace');
   await page.reload();
   await page.locator('#view[data-view="overview"]').waitFor();
   assert.equal(await page.locator('.access-screen').count(),0);
   await context.close();
  }
 }finally{
  if(browser)await browser.close();
  if(proxy.listening){const closed=once(proxy,'close');proxy.close();await closed;}
  const exited=once(child,'exit');child.kill();await exited;await rm(dataDir,{recursive:true,force:true});
 }
});
