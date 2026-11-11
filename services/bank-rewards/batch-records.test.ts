import {it,expect,vi,afterEach} from 'vitest';
import {rewardRepository as repo} from './repository';
import {setTestState} from '../recordStore';
import {createTestBank} from './testBank';
const setup=()=>{const s=createTestBank('local','2026-11-11');setTestState(s);vi.stubGlobal('window',{dispatchEvent:vi.fn()});vi.stubGlobal('CustomEvent',class {});return s;};
afterEach(()=>{setTestState(null);vi.unstubAllGlobals();});
it('does not relabel existing monetary records when offer currency changes',async()=>{
 const s=setup();await expect(repo.saveOffer('local',{...s.offers[0],currency:'EUR'},s.rules)).rejects.toThrow('币种');expect(repo.read('local')).toEqual(s);
});

it('saves mixed records together and keeps balances separate from payments',async()=>{
 const s=setup(),a=s.accounts[0];const result=await repo.saveRecordBatch('local',a.id,[{id:'new-dd',kind:'dd',date:'2026-11-11',amountCents:50000,note:'payroll'},{id:'new-credit',kind:'credit',date:'2026-11-11',amountCents:20000,note:'shop'},{id:'new-balance',kind:'balance',date:'2026-11-11',amountCents:800000,note:'balance'}]);
 expect(result.ddEvents).toHaveLength(s.ddEvents.length+2);expect(result.accounts[0].depositBalances!.at(-1)?.amountCents).toBe(800000);
});
it('rolls back the entire batch when a later balance date is duplicated',async()=>{
 const s=setup(),a=s.accounts[0];await expect(repo.saveRecordBatch('local',a.id,[{id:'new-dd',kind:'dd',date:'2026-11-11',amountCents:50000,note:''},{id:'bad-balance',kind:'balance',date:a.depositBalances![0].date,amountCents:1,note:''}])).rejects.toThrow('同一天');expect(repo.read('local')).toEqual(s);
});
it('rejects repeated submissions without duplicating records',async()=>{
 const s=setup(),rows=[{id:'stable-id',kind:'dd' as const,date:'2026-11-11',amountCents:50000,note:''}];await repo.saveRecordBatch('local',s.accounts[0].id,rows);const saved=repo.read('local');await expect(repo.saveRecordBatch('local',s.accounts[0].id,rows)).rejects.toThrow('重复');expect(repo.read('local')).toEqual(saved);
});
it('keeps currency editable before monetary records exist',async()=>{
 const s=setup();s.ddEvents=[];s.accounts[0].depositBalances=[];setTestState(s);expect((await repo.saveOffer('local',{...s.offers[0],currency:'EUR'},s.rules)).offers[0].currency).toBe('EUR');
});
