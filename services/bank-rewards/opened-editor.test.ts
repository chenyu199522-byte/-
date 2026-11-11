import {it,expect,vi,afterEach} from 'vitest';
import {rewardRepository} from './repository';
import {setTestState} from '../recordStore';
import {createTestBank} from './testBank';
afterEach(()=>{setTestState(null);vi.unstubAllGlobals();});
it('saves opened status and its dated account together, without duplicating an existing account',async()=>{
 const s=createTestBank('local','2026-11-11');s.accounts=[];s.ddEvents=[];
 setTestState(s);vi.stubGlobal('window',{dispatchEvent:vi.fn()});vi.stubGlobal('CustomEvent',class {});
 const offer={...s.offers[0],applicationStatus:'opened' as const};
 let result=await rewardRepository.saveOffer('local',offer,s.rules,{openedOn:'2026-11-05'});
 expect(result.accounts).toHaveLength(1);expect(result.accounts[0].openedOn).toBe('2026-11-05');
 const account=result.accounts[0];
 result=await rewardRepository.saveOffer('local',offer,s.rules,{openedOn:'2026-11-11'});
 expect(result.accounts).toEqual([account]);
});
it('rejects missing opening dates before committing any edits',async()=>{
 const s=createTestBank('local','2026-11-11');s.accounts=[];s.ddEvents=[];setTestState(s);
 await expect(rewardRepository.saveOffer('local',{...s.offers[0],applicationStatus:'opened'},s.rules,{openedOn:''})).rejects.toThrow('开户日期');
 expect(rewardRepository.read('local')).toEqual(s);
});
