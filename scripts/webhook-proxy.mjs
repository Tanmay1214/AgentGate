// Tunnel only this listener. The merchant session and dashboard are never forwarded.
import http from 'node:http';
const targetPort=Number(process.env.PORT||4310);
http.createServer(async(req,res)=>{
 if(req.method!=='POST'||req.url!=='/api/webhook'){res.writeHead(404);return res.end('Not found');}
 try{
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>32000){res.writeHead(413);return res.end('Too large');}chunks.push(chunk);}
  const headers={'content-type':'application/json'};
  for(const key of ['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'])if(req.headers[key])headers[key]=req.headers[key];
  const response=await fetch(`http://127.0.0.1:${targetPort}/api/webhook`,{method:'POST',headers,body:Buffer.concat(chunks),signal:AbortSignal.timeout(45000)});
  res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());
 }catch{res.writeHead(502);res.end('Webhook upstream unavailable');}
}).listen(4311,'127.0.0.1',()=>console.log('Webhook-only listener: http://127.0.0.1:4311'));
