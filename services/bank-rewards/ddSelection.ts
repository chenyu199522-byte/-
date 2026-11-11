import type {RewardState} from './types';
export type DDCheckScope = 'activity' | 'bank' | 'all';
export function ddRecordsForSelection(state:RewardState,offerId:string,scope:DDCheckScope) {
 const offer=state.offers.find(o=>o.id===offerId);
 if(scope!=='all'&&!offer)return [];
 const normalize=(name:string)=>name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
 const offers=new Set(state.offers.filter(o=>o.activityType!=='long_term' && (scope==='all'||o.id===offerId||scope==='bank'&&normalize(o.bankName)===normalize(offer!.bankName))).map(o=>o.id));
 const accounts=new Set(state.accounts.filter(a=>offers.has(a.offerId)).map(a=>a.id));
 return state.ddEvents.filter(e=>accounts.has(e.accountId)&&(!e.kind||e.kind==='dd')).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
