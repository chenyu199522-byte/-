import {it,expect,vi,afterEach} from 'vitest';
import {createTestBank} from './testBank';
import {ddRecordsForSelection} from './ddSelection';
import {rewardRepository as repo} from './repository';
import {setTestState} from '../recordStore';

function sample(){
 const s=createTestBank('local','2026-11-11'),o=s.offers[0],a=s.accounts[0],e=s.ddEvents[0];
 o.bankName='Example Bank';
 s.offers.push({...o,id:'second',bankName:' EXAMPLE  BANK ',archived:true},{...o,id:'other',bankName:'Other Bank'});
 s.accounts.push({...a,id:'a2',offerId:'second'},{...a,id:'a3',offerId:'other'});
 s.ddEvents.push({...e,id:'dd2',accountId:'a2'}, {...e,id:'dd3',accountId:'a3'}, {...e,id:'debit',kind:'debit'}, {...e,id:'credit',kind:'credit'});
 return s;
}
afterEach(()=>{setTestState(null);vi.unstubAllGlobals();});
it('checks only DDs in the chosen activity, bank or all activities, including archived offers',()=>{
 const s=sample();
 expect(ddRecordsForSelection(s,s.offers[0].id,'activity').map(e=>e.id)).toEqual(['sample-dd']);
 expect(ddRecordsForSelection(s,s.offers[0].id,'bank').map(e=>e.id)).toEqual(['dd2','sample-dd']);
 expect(ddRecordsForSelection(s,'','all').map(e=>e.id)).toEqual(['dd2','dd3','sample-dd']);
 expect(ddRecordsForSelection(s,'deleted','activity')).toEqual([]);
});
it('saves notes together without changing amounts, dates or qualification',async()=>{
 const s=sample();setTestState(s);vi.stubGlobal('window',{dispatchEvent:vi.fn()});vi.stubGlobal('CustomEvent',class {});
 const result=await repo.saveDdSources('local',[{id:'sample-dd',note:' Payroll A '},{id:'dd2',note:'Payroll B'}]);
 expect(result.ddEvents).toEqual(s.ddEvents.map(e=>e.id==='sample-dd'?{...e,sourceNote:'Payroll A'}:e.id==='dd2'?{...e,sourceNote:'Payroll B'}:e));
});
it('does not partially save notes when a later record is invalid or is not a DD',async()=>{
 const s=sample();setTestState(s);vi.stubGlobal('window',{dispatchEvent:vi.fn()});vi.stubGlobal('CustomEvent',class {});
 for(const bad of [{id:'dd2',note:' '},{id:'debit',note:'not DD'},{id:'missing',note:'gone'}]) {
  await expect(repo.saveDdSources('local',[{id:'sample-dd',note:'changed'},bad])).rejects.toThrow();
  expect(repo.read('local')).toEqual(s);
 }
});
