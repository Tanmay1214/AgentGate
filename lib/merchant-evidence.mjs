import {cents} from './paypal.mjs';

const text=(v,label,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`${label} is required (maximum ${max} characters)`);return v.trim();};
const date=(v,label,optional=false)=>{if(optional&&(v===null||v===''))return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v||v>new Date().toISOString().slice(0,10))throw Error(`${label} must be a valid date, not in the future`);return v;};
export function validateMerchantEvidence(input,capture){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Import an order and return record');
 const o=input.order,r=input.return,p=input.policy;
 if(!o||!r||!p||input.capture!==capture.id||input.currency!=='USD')throw Error('The record must match this payment and use USD');
 if(!Array.isArray(o.items)||o.items.length<1||o.items.length>30)throw Error('Include 1–30 order items');
 const items=o.items.map(i=>{if(!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>100)throw Error('Item quantity must be 1–100');return {sku:text(i.sku,'SKU',60),name:text(i.name,'Item name'),quantity:i.quantity,unitCents:cents(i.unitAmount)};});
 if(new Set(items.map(i=>i.sku)).size!==items.length)throw Error('Order SKUs must be unique');
 const itemTotalCents=items.reduce((n,i)=>n+i.quantity*i.unitCents,0);
 if(itemTotalCents>capture.amount)throw Error('Order item total exceeds the captured payment');
 const purchasedAt=date(o.purchasedAt,'Purchase date'),deliveredAt=date(o.deliveredAt,'Delivery date',true);
 if(deliveredAt&&deliveredAt<purchasedAt)throw Error('Delivery cannot precede purchase');
 if(!['requested','received','accepted','rejected'].includes(r.status))throw Error('Choose a supported return status');
 const receivedAt=date(r.receivedAt,'Return received date',true);
 if(receivedAt&&receivedAt<(deliveredAt||purchasedAt))throw Error('Return receipt cannot precede delivery or purchase');
 if(['received','accepted'].includes(r.status)&&!receivedAt)throw Error('A received or accepted return needs its receipt date');
 if(!Array.isArray(r.items)||r.items.length>30)throw Error('Return items must be a list of at most 30 items');
 const returned=r.items.map(i=>{const original=items.find(x=>x.sku===i.sku);if(!original||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>original.quantity)throw Error('Return quantities must match purchased items');return {sku:i.sku,quantity:i.quantity};});
 if(new Set(returned.map(i=>i.sku)).size!==returned.length)throw Error('Return SKUs must be unique');
 if(!Number.isInteger(p.windowDays)||p.windowDays<1||p.windowDays>365||typeof p.requireReceived!=='boolean')throw Error('Policy needs a 1–365 day window and a receipt requirement');
 return {capture:capture.id,currency:'USD',order:{reference:text(o.reference,'Order reference'),purchasedAt,deliveredAt,items,itemTotalCents},return:{reference:text(r.reference,'Return reference'),status:r.status,receivedAt,items:returned,notes:typeof r.notes==='string'?r.notes.slice(0,1500):''},policy:{reference:text(p.reference,'Policy reference'),text:text(p.text,'Policy text',3000),windowDays:p.windowDays,requireReceived:p.requireReceived}};
}

export function merchantEvidence(db,capture){
 const row=db.prepare('SELECT body,updated FROM merchant_evidence WHERE capture=?').get(capture);
 if(!row)return {source:'not-imported',record:null,findings:[],returnItemCents:null};
 const record=JSON.parse(row.body),{order,return:r,policy}=record,findings=[];
 const add=(code,message)=>findings.push({code,message});
 if(r.status==='rejected')add('RETURN_REJECTED','The imported return inspection rejected this return.');
 if(policy.requireReceived&&!['received','accepted'].includes(r.status))add('RETURN_NOT_RECEIVED','The policy requires the return to be received before a refund.');
 if(!order.deliveredAt||!r.receivedAt)add('RETURN_DATES_MISSING','Delivery and return receipt dates are needed to check the return window.');
 else if((Date.parse(r.receivedAt)-Date.parse(order.deliveredAt))/86400000>policy.windowDays)add('RETURN_WINDOW_EXCEEDED',`The return arrived outside the ${policy.windowDays}-day window.`);
 if(!r.items.length)add('RETURN_ITEMS_MISSING','Identify the returned items before issuing a return refund.');
 const returnItemCents=r.items.reduce((n,i)=>n+order.items.find(x=>x.sku===i.sku).unitCents*i.quantity,0);
 return {source:'merchant-import',updated:row.updated,record,findings,returnItemCents,notice:'Merchant-supplied records, not independently verified. Written policy is context; structured checks and merchant eligibility govern execution. Item values exclude any unallocated shipping or tax.'};
}
