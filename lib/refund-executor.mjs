import {providerState} from './paypal.mjs';
export async function executeRefund(store,request,provider){
 if(request.status!=='executing'||request.duplicate)return request;
 try {
  const result=await provider(`/v2/payments/captures/${encodeURIComponent(request.capture)}/refund`,{
   method:'POST',key:request.id,body:{amount:{value:(request.amount/100).toFixed(2),currency_code:'USD'}}
  });
  if(typeof result.id!=='string')throw Error('Provider returned no refund ID');
  return store.settle(request.id,providerState(result.status),result.id);
 }catch(error){return store.settle(request.id,error.definite?'failed':'unknown');}
}
