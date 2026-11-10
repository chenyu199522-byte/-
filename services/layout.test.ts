import {it, expect} from 'vitest';
import {defaultLayout, readLayout, visibleColumns} from './layout';

it('reconciles missing, duplicate and unknown column entries while preserving user order',()=>{
  const restored=readLayout({version:1,columns:[{id:'reward',width:999},{id:'bank',visible:false},
    {id:'reward',width:115},{id:'missing'}],cards:[{id:'本月到账',visible:false}]});
  expect(restored.columns).toHaveLength(11);
  expect(restored.columns.slice(0,2)).toEqual([{id:'reward',width:460,visible:true},{id:'bank',width:215,visible:true}]);
  expect(restored.cards[0]).toEqual({id:'本月到账',visible:false});
});
it('keeps hidden columns hidden in full and compact views',()=>{
  const saved=defaultLayout();saved.columns.find(c=>c.id==='reward')!.visible=false;
  expect(visibleColumns(saved,800,true)).toHaveLength(10);
  expect(visibleColumns(saved,800,false).map(c=>c.id)).toEqual(['bank','progress','actions']);
  expect(visibleColumns(saved,4000,false)).toEqual(visibleColumns(saved,800,true));
});
it('handles earlier and malformed preferences',()=>{
  expect(readLayout({version:2})).toEqual(defaultLayout());
  expect(readLayout({version:1,margin:'wide',columns:null})).toEqual(defaultLayout());
  expect(readLayout({version:1,font:320}).font).toBe(150);
});
