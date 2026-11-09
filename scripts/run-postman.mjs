import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
await mkdir('data/postman',{recursive:true});const dir=await mkdtemp(resolve('data/postman/run-'));
const env={...process.env,PAYPAL_ENV:'demo',PORT:String(port),PUBLIC_URL:`http://localhost:${port}`,DATA_DIR:dir,GEMINI_API_KEY:'',PAYPAL_CLIENT_ID:'',PAYPAL_CLIENT_SECRET:'',PAYPAL_WEBHOOK_ID:''};
const server=spawn(process.execPath,['server.mjs'],{env,stdio:['ignore','pipe','pipe']});let startup='';server.stderr.on('data',c=>{startup+=c;});
let cli;
const stop=()=>{cli?.kill();server.kill();};process.once('SIGINT',()=>{stop();process.exitCode=130;});
try{
 let ready=false;
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Demo server exited: '+startup);try{const r=await fetch(`http://localhost:${port}/api/session`);if(r.ok){ready=true;break;}}catch{}await delay(100);}
 if(!ready)throw Error('Demo server did not start');
 console.log('Running Postman against a disposable demo database. PayPal and AI credentials are disabled.');
 cli=spawn(process.execPath,['node_modules/postman-cli/bin/postman.js','collection','run','postman/AgentGate-Demo.postman_collection.json','--env-var',`base_url=http://localhost:${port}`,'--no-report-events','--no-insecure-file-read','--output',resolve(dir,'report'),'--timeout','60000','--timeout-request','10000','--timeout-script','10000'],{stdio:'inherit',env});
 const code=await new Promise((r,j)=>{cli.once('error',j);cli.once('exit',r);});
 console.log('Local run artifacts: '+dir);process.exitCode=code??1;
}finally{stop();}
