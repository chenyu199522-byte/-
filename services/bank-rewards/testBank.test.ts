import {it,expect,vi} from 'vitest';
import {createTestBank,requirementGroups,toggleTestRequirement} from './testBank';
import {validateState} from './logic';
import {loadRecords,rewardStore,setTestState} from '../recordStore';

it('keeps every combination of supported test conditions valid, including removing all monetary conditions',()=>{
  const initial=createTestBank('local');
  expect(()=>validateState(initial)).not.toThrow();
  for(let mask=0;mask<1<<requirementGroups.length;mask++) {
    let s=initial;
    for(let i=0;i<requirementGroups.length;i++) if(!(mask&(1<<i)))s=toggleTestRequirement(s,requirementGroups[i].id,false);
    expect(()=>validateState(s)).not.toThrow();
  }
  let empty=initial;
  for(const g of requirementGroups)empty=toggleTestRequirement(empty,g.id,false);
  for(const g of requirementGroups)expect(()=>validateState(toggleTestRequirement(empty,g.id,true))).not.toThrow();
});
it('isolates test saves and restores the original real revision on exit',async()=>{
  const real=createTestBank('local');real.offers[0].bankName='Real record';
  const save=vi.fn().mockResolvedValue('revision-after');
  vi.stubGlobal('window',{goldenFleece:{read:async()=>({state:real,revision:'real-revision'}),save}});
  try {
    await loadRecords();setTestState(createTestBank('local'));
    const changed=structuredClone(rewardStore.read()!);changed.offers=[];changed.accounts=[];changed.ddEvents=[];changed.rules=[];
    await rewardStore.commit(changed);expect(save).not.toHaveBeenCalled();
    setTestState(null);expect(rewardStore.read()).toEqual(real);
    await rewardStore.commit(real);expect(save).toHaveBeenCalledExactlyOnceWith(real,'real-revision');
  } finally {setTestState(null);vi.unstubAllGlobals();}
});
