import {cents} from './paypal.mjs';
export class DraftValidationError extends Error {
 constructor(message){super(message);this.code='AI_INVALID_DRAFT';this.httpStatus=502;}
}
export function parseDraft(data,{remainingCents,currency='USD'}={}){
 const invalid=message=>{throw new DraftValidationError(message);};
 const candidate=data.candidates?.[0];
 if(candidate?.finishReason!=='STOP')invalid('The model did not finish a usable draft. Retry or enter the proposal manually.');
 const text=candidate.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('');
 let draft;try{draft=JSON.parse(text);}catch{invalid('The model returned malformed JSON. Retry or enter the proposal manually.');}
 if(!draft||typeof draft!=='object'||Array.isArray(draft))invalid('The model returned an invalid draft.');
 const keys=['status','amount','currency','rationale','question'];
 if(Object.keys(draft).some(k=>!keys.includes(k))||keys.some(k=>!(k in draft)))invalid('The draft does not match the required fields.');
 if(draft.currency!==currency||currency!=='USD')invalid('The draft currency does not match the original payment.');
 if(typeof draft.rationale!=='string'||!draft.rationale.trim()||draft.rationale.length>1000)invalid('The draft explanation is missing or too long.');
 if(draft.status==='clarification'){
  if(draft.amount!==null||typeof draft.question!=='string'||!draft.question.trim()||draft.question.length>500)invalid('The clarification must include a question and no refund amount.');
 }else if(draft.status==='draft'){
  let amount;try{amount=cents(draft.amount);}catch{invalid('The draft contains an invalid refund amount.');}
  if(draft.question!==null)invalid('A refund draft cannot also ask for clarification.');
  if(!Number.isSafeInteger(remainingCents)||remainingCents<0)invalid('The remaining refundable balance is unavailable.');
  if(amount>remainingCents)invalid('The proposed refund exceeds the remaining refundable balance.');
  draft.amount=(amount/100).toFixed(2);
 }else invalid('The model returned an unsupported draft status.');
 return {status:draft.status,amount:draft.amount,currency:draft.currency,rationale:draft.rationale,question:draft.question};
}
