import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import test from 'node:test';

const request=(port,path,headers={})=>new Promise((resolve,reject)=>{
 const req=http.request({host:'127.0.0.1',port,path,headers:{host:'agentgate.example.test',...headers}},res=>{
  let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));
 });req.on('error',reject);req.end();
});
test('hosted mode protects merchant APIs while allowing only its configured host',async()=>{
 const port=39000+Math.floor(Math.random()*1000),dataDir=await mkdtemp(join(os.tmpdir(),'agentgate-hosted-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PAYPAL_ENV:'demo',HOSTED_MODE:'true',PORT:String(port),PUBLIC_URL:'https://agentgate.example.test',AGENTGATE_ACCESS_KEY:'a-hosted-access-key-that-is-long-enough',DATA_DIR:dataDir},stdio:'ignore'});
 try{
  let ready;
  for(let attempt=0;attempt<40;attempt++){
   try{ready=await request(port,'/api/session');if(ready.status===401)break;}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(ready?.status,401);
  const opened=await request(port,'/api/session',{'x-agentgate-access-key':'a-hosted-access-key-that-is-long-enough'});
  assert.equal(opened.status,200);
  const token=JSON.parse(opened.body).token;
  const state=await request(port,'/api/state',{'x-agentgate-access-key':'a-hosted-access-key-that-is-long-enough','x-agentgate-key':token});
  assert.equal(state.status,200);
  const wrongHost=await new Promise((resolve,reject)=>{
   const req=http.request({host:'127.0.0.1',port,path:'/',headers:{host:'not-agentgate.example.test'}},res=>resolve(res.statusCode));req.on('error',reject);req.end();
  });
  assert.equal(wrongHost,403);
 }finally{const exited=once(child,'exit');child.kill();await exited;await rm(dataDir,{recursive:true,force:true});}
});
