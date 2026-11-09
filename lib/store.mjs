import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
export const hash = x => createHash('sha256').update(x).digest('hex');
export function store(path) {
 const db = new DatabaseSync(path);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS captures (id TEXT PRIMARY KEY, amount INTEGER NOT NULL, currency TEXT NOT NULL, eligible INTEGER NOT NULL, label TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, idem TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, capture TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL, note TEXT NOT NULL, day TEXT NOT NULL, created TEXT NOT NULL, provider_id TEXT, approved INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, prev TEXT NOT NULL, hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY);
 CREATE TRIGGER IF NOT EXISTS event_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;
 CREATE TRIGGER IF NOT EXISTS event_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;`);
 db.prepare('INSERT OR IGNORE INTO settings VALUES (1,?)').run(JSON.stringify({enabled:true,auto:2000,daily:10000,maximum:10000}));
 const get = (sql,...args)=>db.prepare(sql).get(...args);
 const all = (sql,...args)=>db.prepare(sql).all(...args);
 const run = (sql,...args)=>db.prepare(sql).run(...args);
 let transactionDepth=0;
 const tx = fn=>{if(transactionDepth)return fn();db.exec('BEGIN IMMEDIATE');transactionDepth++;try {const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}finally{transactionDepth--;}};
 const event = (type,data)=>{const body=JSON.stringify({at:new Date().toISOString(),type,...data});const prev=get('SELECT hash FROM events ORDER BY seq DESC LIMIT 1')?.hash||'GENESIS';run('INSERT INTO events(body,prev,hash) VALUES (?,?,?)',body,prev,hash(prev+body));};
 const policy=()=>JSON.parse(get('SELECT body FROM settings WHERE id=1').body);
 const reserved=(day)=>get("SELECT COALESCE(SUM(amount),0) n FROM requests WHERE status IN ('executing','unknown','pending','completed') AND (day=? OR status IN ('executing','unknown','pending'))",day).n;
 const remaining=id=>{const c=get('SELECT amount FROM captures WHERE id=?',id);if(!c)return null;const used=get("SELECT COALESCE(SUM(amount),0) n FROM requests WHERE capture=? AND status IN ('executing','unknown','pending','completed')",id).n;return Math.max(0,c.amount-used);};
 const evaluate=(capture,amount,approved=false)=>{
  const p=policy();const c=get('SELECT * FROM captures WHERE id=?',capture);const day=new Date().toISOString().slice(0,10);
  if(!p.enabled)return ['denied','AGENT_REVOKED'];
  if(!c || !c.eligible)return ['denied','CAPTURE_NOT_ELIGIBLE'];
  if(!Number.isSafeInteger(amount)||amount<=0)return ['denied','INVALID_AMOUNT'];
  const used=get("SELECT COALESCE(SUM(amount),0) n FROM requests WHERE capture=? AND status IN ('executing','unknown','pending','completed')",capture).n;
  if(amount>c.amount-used)return ['denied','EXCEEDS_REFUNDABLE_AMOUNT'];
  if(amount>p.maximum)return ['denied','PER_REFUND_LIMIT'];
  if(amount+reserved(day)>p.daily)return ['denied','DAILY_BUDGET_EXCEEDED'];
  if(amount>p.auto&&!approved)return ['approval','HUMAN_APPROVAL_REQUIRED'];
  return ['executing','POLICY_ALLOWED'];
 };
 const propose=(input)=>tx(()=>{
  const {capture,amount,note='',idem}=input;
  if(typeof idem!=='string'||idem.length<8||idem.length>100)throw Error('A request key of 8–100 characters is required');
  const fingerprint=hash(JSON.stringify({capture,amount,note})); const prior=get('SELECT * FROM requests WHERE idem=?',idem);
  if(prior){if(prior.fingerprint!==fingerprint)throw Error('Request key already used for different details');return {...prior,duplicate:true};}
  const [status,reason]=evaluate(capture,amount);const id=randomUUID();const now=new Date().toISOString();
  run('INSERT INTO requests(id,idem,fingerprint,capture,amount,status,reason,note,day,created) VALUES (?,?,?,?,?,?,?,?,?,?)',id,idem,fingerprint,capture,Number.isSafeInteger(amount)?amount:0,status,reason,note,now.slice(0,10),now);
  event('PROPOSAL',{id,capture,amount,status,reason,note});return get('SELECT * FROM requests WHERE id=?',id);
 });
 const approve=(id,accept)=>tx(()=>{const r=get('SELECT * FROM requests WHERE id=?',id);if(!r||r.status!=='approval')throw Error('Request is not awaiting approval');const [status,reason]=accept?evaluate(r.capture,r.amount,true):['denied','HUMAN_REJECTED'];run('UPDATE requests SET status=?,reason=?,approved=?,day=? WHERE id=?',status,reason,accept?1:0,new Date().toISOString().slice(0,10),id);event('REVIEW',{id,status,reason});return get('SELECT * FROM requests WHERE id=?',id);});
 const settle=(id,status,providerId=null)=>tx(()=>{const r=get('SELECT * FROM requests WHERE id=?',id);if(!r)throw Error('Unknown request');if(['completed','failed','denied'].includes(r.status))return r;if(!['executing','pending','unknown'].includes(r.status))throw Error('Invalid outcome transition');run('UPDATE requests SET status=?,reason=?,provider_id=COALESCE(?,provider_id) WHERE id=?',status,`PROVIDER_${status.toUpperCase()}`,providerId,id);event('OUTCOME',{id,status,providerId});return get('SELECT * FROM requests WHERE id=?',id);});
 const verify=()=>{let prev='GENESIS';for(const e of all('SELECT * FROM events ORDER BY seq')){if(e.prev!==prev||e.hash!==hash(prev+e.body))return {valid:false,brokenAt:e.seq};prev=e.hash;}return {valid:true,count:all('SELECT seq FROM events').length,head:prev};};
 return {db,get,all,run,tx,event,policy,reserved,remaining,propose,approve,settle,verify,preview:(capture,amount)=>{const [status,reason]=evaluate(capture,amount);return {status,reason};}};
}
