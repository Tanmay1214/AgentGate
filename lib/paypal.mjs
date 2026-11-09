const base='https://api-m.sandbox.paypal.com';
export async function paypal(path,{method='GET',body,key}={}){
 if(!process.env.PAYPAL_CLIENT_ID||!process.env.PAYPAL_CLIENT_SECRET)throw Error('Set PayPal sandbox credentials in .env and restart');
 const auth=Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
 const tokenResponse=await fetch(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
 if(!tokenResponse.ok)throw Error('PayPal sandbox authentication failed');const token=(await tokenResponse.json()).access_token;
 const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(key?{'PayPal-Request-Id':key}: {})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok){const e=Error(`PayPal ${response.status}: ${result.name||'request failed'}`);e.definite=[400,401,403,404,422].includes(response.status);throw e;}return result;
}
export const providerState=s=>s==='COMPLETED'?'completed':['FAILED','CANCELLED'].includes(s)?'failed':'pending';
export function cents(value){if(typeof value!=='string'||!/^\d+(\.\d{1,2})?$/.test(value))throw Error('Invalid USD amount');const [a,b='']=value.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n<=0)throw Error('Invalid USD amount');return n;}
