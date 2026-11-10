const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const input=(label,name,value='',type='text',attrs='')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const area=(label,name,value='',attrs='')=>`<label>${esc(label)}<textarea name="${name}" rows="3" ${attrs}>${esc(value)}</textarea></label>`;
export function evidenceForm(c,mode){
 const m=c.facts.merchant,record=m?.record,o=record?.order,r=record?.return,p=record?.policy;
 const summary=record?`<p><strong>${esc(o.reference)}</strong> · Return ${esc(r.reference)} · ${esc(r.status)}</p><ul>${o.items.map(i=>`<li>${esc(i.name)} (${esc(i.sku)}): ${i.quantity} purchased, ${r.items.find(x=>x.sku===i.sku)?.quantity||0} returned · $${(i.unitCents/100).toFixed(2)} each</li>`).join('')}</ul><p>Returned item value: <strong>$${(m.returnItemCents/100).toFixed(2)}</strong> / available after earlier refunds: $${((m.availableReturnCents??m.returnItemCents)/100).toFixed(2)}</p><p>Delivered: ${esc(o.deliveredAt||'Not recorded')} · Return received: ${esc(r.receivedAt||'Not recorded')}</p><p>${esc(r.notes)}</p><details><summary>Written policy · ${esc(p.reference)}</summary><p>${esc(p.text)}</p><p class="muted">${esc(m.notice)}</p></details>`:'<p class="muted">No order or return records imported. Payment facts alone cannot identify returned items or verify return dates.</p>';
 return summary+(m?.findings||[]).map(f=>'<p class="case-warning">'+esc(f.message)+'</p>').join('')+`<details><summary>Add or update order and return records</summary><p class="muted">Enter facts from your order export and return inspection. These are merchant-supplied records, not independently verified. Saving does not grant eligibility. Investigation sends them to Gemini.</p><form id="case-evidence">
 <label>Load a JSON record (optional)<input name="evidenceFile" type="file" accept=".json,application/json"></label><p id="import-message" role="status"></p>
 ${input('Order reference','orderReference',o?.reference||'','text','required maxlength="200"')}
 <div class="evidence-filters">${input('Purchased on','purchasedAt',o?.purchasedAt||'','date','required')}${input('Delivered on','deliveredAt',o?.deliveredAt||'','date')}</div>
 ${area('Order items: SKU | item name | quantity | unit price (USD), one per line','items',o?.items.map(i=>[i.sku,i.name,i.quantity,(i.unitCents/100).toFixed(2)].join(' | ')).join('\n')||'','required placeholder="NOTE | Notebook | 2 | 6.00"')}
 ${input('Return reference','returnReference',r?.reference||'','text','required maxlength="200"')}
 <label>Return status<select name="returnStatus">${['requested','received','accepted','rejected'].map(v=>`<option value="${v}" ${r?.status===v?'selected':''}>${({requested:'Requested — not received',received:'Received — awaiting inspection',accepted:'Inspection accepted',rejected:'Inspection rejected'})[v]}</option>`).join('')}</select></label>
 ${input('Return received on','receivedAt',r?.receivedAt||'','date')}
 ${area('Returned items: SKU | quantity, one per line','returnedItems',r?.items.map(i=>[i.sku,i.quantity].join(' | ')).join('\n')||'','placeholder="NOTE | 1"')}
 ${area('Inspection notes','notes',r?.notes||'','maxlength="1500"')}
 ${input('Policy reference / version','policyReference',p?.reference||'','text','required maxlength="200"')}
 ${area('Written refund policy','policyText',p?.text||'','required maxlength="3000"')}
 <p class="muted">Structured rules below are enforced independently of the AI. Written terms provide additional context.</p>
 ${input('Maximum days from delivery to return receipt','windowDays',p?.windowDays||30,'number','required min="1" max="365"')}
 <label>Return status requirement<select name="requireReceived"><option value="true" ${p?.requireReceived!==false?'selected':''}>Received or inspection accepted</option><option value="false" ${p?.requireReceived===false?'selected':''}>No status requirement (dates and items still required)</option></select></label>
 <button class="secondary">Save merchant records</button>${mode==='demo'?'<button type="button" class="secondary" data-case-action="sample">Fill synthetic example</button>':''}</form></details>`;
}
export function recordFromForm(v,capture){
 const lines=value=>value.split('\n').filter(v=>v.trim()).map(v=>v.split('|').map(s=>s.trim()));
 const items=lines(v.items).map(i=>{if(i.length!==4)throw Error('Each order item needs SKU | name | quantity | unit price');return {sku:i[0],name:i[1],quantity:Number(i[2]),unitAmount:i[3]};});
 const returned=lines(v.returnedItems).map(i=>{if(i.length!==2)throw Error('Each returned item needs SKU | quantity');return {sku:i[0],quantity:Number(i[1])};});
 return {capture,currency:'USD',order:{reference:v.orderReference,purchasedAt:v.purchasedAt,deliveredAt:v.deliveredAt||null,items},return:{reference:v.returnReference,status:v.returnStatus,receivedAt:v.receivedAt||null,items:returned,notes:v.notes},policy:{reference:v.policyReference,text:v.policyText,windowDays:Number(v.windowDays),requireReceived:v.requireReceived==='true'}};
}
export function fillEvidenceForm(form,record,capture){
 if(record.capture!==capture||record.currency!=='USD')throw Error('Choose a USD record matching this payment');
 const o=record.order,r=record.return,p=record.policy;
 const values={orderReference:o.reference,purchasedAt:o.purchasedAt,deliveredAt:o.deliveredAt||'',items:o.items.map(i=>[i.sku,i.name,i.quantity,i.unitAmount].join(' | ')).join('\n'),returnReference:r.reference,returnStatus:r.status,receivedAt:r.receivedAt||'',returnedItems:r.items.map(i=>[i.sku,i.quantity].join(' | ')).join('\n'),notes:r.notes||'',policyReference:p.reference,policyText:p.text,windowDays:p.windowDays,requireReceived:String(p.requireReceived)};
 for(const [k,v] of Object.entries(values))form.elements.namedItem(k).value=v;
}
export function sampleRecord(c){
 const today=new Date().toISOString().slice(0,10),unit=(Math.floor(c.facts.payment.originalCents/2)/100).toFixed(2);
 return {capture:c.capture,currency:'USD',order:{reference:'SYNTHETIC-ORDER',purchasedAt:today,deliveredAt:today,items:[{sku:'ITEM-1',name:'Synthetic example item',quantity:2,unitAmount:unit}]},return:{reference:'SYNTHETIC-RETURN',status:'received',receivedAt:today,items:[{sku:'ITEM-1',quantity:1}],notes:'Synthetic demo evidence.'},policy:{reference:'SYNTHETIC-POLICY-v1',text:'Return items within 30 days of delivery. Refund the returned item value only. Merchant eligibility review is required.',windowDays:30,requireReceived:true}};
}
