import {cents} from './paypal.mjs';

// Re-read first so returning twice never attempts a second capture.
export async function completeCheckout(id, provider) {
 if(typeof id!=='string'||!/^[A-Z0-9]{8,32}$/.test(id))throw Error('Invalid PayPal order ID');
 const path=`/v2/checkout/orders/${id}`;
 let order=await provider(path);
 if(order.status==='APPROVED')order=await provider(path+'/capture',{method:'POST',key:'capture-'+id,body:{}});
 const capture=order.purchase_units?.[0]?.payments?.captures?.[0];
 if(!['COMPLETED','PARTIALLY_REFUNDED','REFUNDED'].includes(capture?.status))throw Error(`Payment is ${capture?.status||order.status||'not approved'}. Complete buyer approval, then retry.`);
 if(capture.amount?.currency_code!=='USD')throw Error('Only USD captures are supported');
 return {id:capture.id,amount:cents(capture.amount.value),currency:'USD'};
}
