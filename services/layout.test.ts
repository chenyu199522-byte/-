import {it, expect} from 'vitest';
import {defaultLayout, housekeeperLayout, readLayout, visibleColumns} from './layout';
import {createRequire} from 'node:module';
const {windowScale}=createRequire(import.meta.url)('../window-scale.cjs');

it('restores reference defaults for old layouts without losing their column order or font choice',()=>{
  const v=readLayout({version:1,font:85,columns:[{id:'reward',width:140,visible:true}]});
  expect(v.overallScale).toBe(100);expect(v.font).toBe(85);expect(v.columns[0].id).toBe('reward');
  expect(readLayout({...v,overallScale:50,font:60,rowHeight:36}).overallScale).toBe(50);
  expect(readLayout({...v,font:60}).font).toBe(60);
  expect(readLayout({...v,rowHeight:36}).rowHeight).toBe(36);
});
it('scales the whole UI while retaining proportional window resizing',()=>{
  expect(windowScale(2560,1440,true,80)).toBeCloseTo(1.28);
  expect(windowScale(2560,1440,true,50)).toBeCloseTo(.8);
  expect(windowScale(1440,900,true,80)).toBeCloseTo(.8);
  expect(windowScale(2560,1440,false,50)).toBe(.5);
  expect(windowScale(2560,1440,true,NaN)).toBeCloseTo(1.6);
});

it('reconciles missing, duplicate and unknown column entries while preserving user order',()=>{
  const restored=readLayout({version:1,columns:[{id:'reward',width:999},{id:'bank',visible:false},
    {id:'reward',width:115},{id:'missing'}],cards:[{id:'本月到账',visible:false}]});
  expect(restored.columns).toHaveLength(11);
  expect(restored.columns.slice(0,2)).toEqual([{id:'reward',width:460,visible:true},{id:'bank',width:215,visible:true}]);
  expect(restored.cards[0]).toEqual({id:'本月到账',visible:false});
});
it('keeps hidden columns hidden in full and compact views',()=>{
  const saved=defaultLayout();saved.adaptive=true;saved.columns.find(c=>c.id==='reward')!.visible=false;
  expect(visibleColumns(saved,800,true)).toHaveLength(10);
  expect(visibleColumns(saved,800,false).map(c=>c.id)).toEqual(['bank','progress','actions']);
  expect(visibleColumns(saved,4000,false)).toEqual(visibleColumns(saved,800,true));
});
it('handles earlier and malformed preferences',()=>{
  expect(readLayout({version:2})).toEqual(defaultLayout());
  expect(readLayout({version:1,margin:'wide',columns:null})).toEqual({...defaultLayout(),tableSizing:"custom",autoMargin:false});
  expect(readLayout({version:1,font:320}).font).toBe(150);
});

it('restores Housekeeper geometry while preserving names and chosen columns',()=>{
 const old=defaultLayout();old.appName='自定义';old.scaleWithWindow=true;old.overallScale=80;old.font=75;old.columns.reverse();old.cards[0].visible=false;
 const restored=housekeeperLayout(old);
 expect(restored).toMatchObject({appName:'自定义',overallScale:80,font:100,rowHeight:120,scaleWithWindow:true});
 expect(restored.columns).toEqual(old.columns);expect(restored.cards).toEqual(old.cards);expect(old.font).toBe(75);
});
