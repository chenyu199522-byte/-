import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import ConditionProgress from '../../pages/bank-rewards/ConditionProgress';
import BankRewards from '../../pages/bank-rewards/BankRewards';
import {createTestBank,requirementGroups,toggleTestRequirement} from './testBank';
import {qualificationProgress} from './logic';
import {setTestState} from '../recordStore';
import {defaultLayout} from '../layout';
const day='2026-11-11';
function progress(s= createTestBank('local',day)) {const o=s.offers[0],a=s.accounts[0];return renderToStaticMarkup(<ConditionProgress offer={o} account={a} dd={qualificationProgress(a,o,s,day)} today={day}/>);}
function row(s:ReturnType<typeof createTestBank>) {
 vi.stubGlobal('window',{innerWidth:2560});setTestState(s);
 return renderToStaticMarkup(<BankRewards user={{id:'local',username:'本机',language:'zh',currency:'USD'}} initialLayout={defaultLayout()}/>).match(/<tr data-testid="reward-row"[\s\S]*?<\/tr>/)?.[0]||'';
}
afterEach(()=>{setTestState(null);vi.unstubAllGlobals();});
it('removes the reminder sidebar and puts each deadline beside its own meter',()=>{
 const html=progress();expect(html).not.toContain('规则与提醒');
 const deposit=html.match(/<section class="br-condition-period br-deposit-condition"[\s\S]*?<\/section>/)?.[0]||'';
 expect(deposit).toContain('存入截止');expect(deposit).toContain('2026-12-01');expect(deposit).toContain('还剩 20 天');
 expect(html).toContain('交易截止');expect(html).toContain('2027-01-30');
 expect(html.match(/2027-01-30/g)).toHaveLength(1);
});
it('uses one short DD cell for multiple conditions, but keeps a single DD and pending accounts unchanged',()=>{
 const s=createTestBank('local',day);expect(row(s)).toContain('已在下方展示');expect(row(s)).not.toContain('每期工资');
 let single=s;for(const g of requirementGroups)if(!['dd','fee'].includes(g.id))single=toggleTestRequirement(single,g.id,false);
 expect(row(single)).not.toContain('已在下方展示');expect(row(single)).toContain('免月费');expect(row(single)).toContain('US$2,000');
 s.accounts=[];s.ddEvents=[];expect(row(s)).not.toContain('已在下方展示');expect(row(s)).toContain('每期工资');
});

it('keeps supplementary terms accessible and preserves the full account detail view',()=>{
 const s=createTestBank('local',day),o=s.offers[0],a=s.accounts[0];
 const html=progress(s);expect(html).not.toContain('br-condition-notes');expect(html).not.toContain('TEST1500');expect(html).not.toContain(o.earlyClosePenalty!);
 const detail=renderToStaticMarkup(<ConditionProgress offer={o} account={a} dd={qualificationProgress(a,o,s,day)} today={day} detail/>);expect(detail).toContain('规则与提醒');expect(detail).toContain('TEST1500');expect(detail).toContain(o.earlyClosePenalty!);
 let single=s;for(const g of requirementGroups)if(!['dd','notes'].includes(g.id))single=toggleTestRequirement(single,g.id,false);
 expect(progress(single)).not.toContain('规则与提醒');
});
it('retains a DD meter when a non-monthly DD is combined with a deposit condition',()=>{
 let s=createTestBank('local',day);for(const g of requirementGroups)if(!['dd','deposit'].includes(g.id))s=toggleTestRequirement(s,g.id,false);
 expect(row(s)).toContain('已在下方展示');expect(progress(s)).toContain('aria-label="工资 DD"');expect(progress(s)).toContain('DD 截止');
});

it('shows only the fee meter and remaining time in the main row for multiple conditions',()=>{
 const s=createTestBank('local',day);s.offers[0].feeBasis='opening';
 const html=row(s);
 expect(html).toContain('aria-label="免月费进度"');
 expect(html).not.toContain('aria-label="DD 进度"');
 expect(html).not.toContain(' · 0/3 期');
 let single=s;for(const g of requirementGroups)if(!['dd','fee'].includes(g.id))single=toggleTestRequirement(single,g.id,false);
 expect(row(single)).toContain('aria-label="DD 进度"');
});

it('shows one dot per period and counts completed periods without using the next transaction deadline',()=>{
 const s=createTestBank('local',day);const o=s.offers[0];
 s.ddEvents=[{id:'dd',userId:'local',accountId:s.accounts[0].id,date:day,kind:'dd',amountCents:200000,sourceNote:''},{id:'debit',userId:'local',accountId:s.accounts[0].id,date:day,kind:'debit',amountCents:50000,sourceNote:''},{id:'credit',userId:'local',accountId:s.accounts[0].id,date:day,kind:'credit',amountCents:100000,sourceNote:''}];
 const html=row(s);expect(html).toContain('已完成 1/3 期');
 expect(html.match(/class="br-cycle-dot"/g)).toHaveLength(3);
 expect(html.match(/data-complete="true"/g)).toHaveLength(1);
 expect(html.match(/<td class="br-progress-cell">[\s\S]*?<\/td>/)?.[0]).not.toContain('还剩');
 const dates=progress(createTestBank('local',day));expect(dates).toContain('剩 19 天');expect(dates).toContain('本期进行中');
});
it('counts a $500 DD for the fee threshold separately from two $5000 qualifying deposits',()=>{
 let s=createTestBank('local',day);for(const g of requirementGroups)if(!['dd','fee'].includes(g.id))s=toggleTestRequirement(s,g.id,false);
 Object.assign(s.offers[0],{ddAmountCents:500000,ddCount:2,feeGoalCents:50000,feeFreeCycles:0,feeBasis:'opening'});
 s.ddEvents[0].amountCents=50000;
 let html=row(s);expect(html).toContain('aria-label="免月费进度" max="1" value="1"');expect(html).toContain('aria-label="DD 进度" max="1" value="0"');
 s.offers[0].feeBasis=undefined;html=row(s);expect(html).toContain('aria-label="免月费进度" max="1" value="1"');expect(html).toContain('已记录 US$500 / US$500');expect(html).not.toContain('本期已达标');expect(html).not.toContain('设置免月费周期');
 s.offers[0].feeBasis='statement';html=row(s);expect(html).toContain('已记录 US$500 / US$500');expect(html).not.toContain('待填结账日');
 s.offers[0].feeStatementDay=15;expect(row(s)).toContain('免月费进度');
 s.offers[0].feeGoalCents=null;expect(row(s)).not.toContain('免月费进度');
});
it('labels cumulative and per-deposit DD requirements distinctly',()=>{
 let s=createTestBank('local',day);for(const g of requirementGroups)if(!['dd'].includes(g.id))s=toggleTestRequirement(s,g.id,false);
 Object.assign(s.offers[0],{ddAmountCents:500000,ddCount:2,ddAmountMode:'total'});
 expect(row(s)).toContain('累计 US$5,000 · 至少 2 笔');expect(row(s)).not.toContain('×');
 s.offers[0].ddAmountMode='per_deposit';expect(row(s)).toContain('每笔 US$5,000 · 至少 2 笔');
});
it('renders independent transaction periods without changing DD assessment periods',()=>{
 const s=createTestBank('local',day);Object.assign(s.offers[0],{transactionMode:'periodic',transactionCycleBasis:'opening',transactionCycleCount:2,transactionGoal:5});
 const html=progress(s);expect(html).toContain('aria-label="合格交易第 1 期进度"');expect(html).toContain('aria-label="合格交易第 2 期进度"');
 expect(html.match(/aria-label="工资 DD"/g)).toHaveLength(3);
});
