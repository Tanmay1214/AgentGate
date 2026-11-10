// Conservative checks for explicit intent. These are not a general language parser.
// The model still interprets natural language; these checks prevent common silent changes.
export function intentConstraints(message,evidence){
 let text=message;
 try{const conversation=JSON.parse(message);if(Array.isArray(conversation))text=conversation.filter(m=>['customer','correction'].includes(m.kind)).at(-1)?.message||'';}catch{}
 text=String(text).toLowerCase();
 const clarify=reason=>({clarification:reason});
 if(/\b(eur|euros?|gbp|pounds?|inr|rupees?|jpy|yen|cad|aud)\b|[€£¥₹]/i.test(text))return clarify('The request names a currency other than USD. Ask the customer for a USD amount; do not convert or relabel it.');
 if(/\bone of (?:the |these |my )?items\b|\bnot (?:yet )?decided\b|\b(?:unsure|cannot decide)\b/i.test(text))return clarify('The customer has not identified the item or amount. Ask which item or amount; do not choose from the return record.');
 const amounts=[...text.matchAll(/(?:usd\s*|\$\s*)(-?\d+(?:\.\d+)?)/g)].map(m=>m[1]);
 if(amounts.some(v=>!/^\d+(?:\.\d{1,2})?$/.test(v)||Number(v)<=0))return clarify('Ask for a positive USD amount with at most two decimal places.');
 const unique=[...new Set(amounts.map(v=>Math.round(Number(v)*100)))];
 if(unique.length>1)return clarify('The latest message contains multiple amounts. Confirm the intended refund amount.');
 if(unique.length===1)return unique[0]>evidence.payment.remainingCents?clarify('The requested amount exceeds the remaining balance. Do not reduce it. Ask for clarification.'):{amountCents:unique[0],source:'explicit USD amount'};
 const order=evidence.merchant?.record?.order;
 if(order){
  const named=order.items.filter(i=>text.includes(i.name.toLowerCase())||new RegExp('\\b'+i.sku.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').toLowerCase()+'\\b').test(text));
  if(named.length===1){
   const item=named[0];let quantity=/\bboth\b/.test(text)?2:/\b(?:one|single)\b/.test(text)?1:item.quantity===1?1:null;
   if(quantity!==null){const amountCents=item.unitCents*quantity;if(quantity>item.quantity)return clarify('Requested quantity exceeds the purchased quantity.');if(amountCents>evidence.payment.remainingCents)return clarify('The requested item value exceeds the remaining balance. Do not cap the amount; ask for clarification.');return {amountCents,source:'explicit item and quantity'};}
  }
 }
 return {};
}
