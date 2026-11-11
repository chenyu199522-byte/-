import {it,expect} from 'vitest';
import {emptyOffer,emptyState,type RewardAccount} from './types';
import {rewardPayoutSchedule,depositProgress,qualificationProgress,transactionProgress,summary,validateState,accountStatus,addDays} from './logic';
const make=()=>{
 const o={...emptyOffer('u'),id:'o',bankName:'Test',depositGoalCents:500000,depositDeadlineDays:30,depositHoldBasis:'opening' as const,depositEndOffsetDays:60,transactionGoal:6,transactionDeadlineDays:60,bonusCents:40000};
 const a:RewardAccount={id:'a',userId:'u',offerId:'o',name:'',openedOn:'2026-01-01',bonusReceivedOn:null,bonusReceivedCents:null,closedOn:null,minHoldDays:null,notes:'',closureMethod:'',historyOnly:false,syncIncome:false,exchangeRate:null,incomeCurrency:'USD',createdAt:'',updatedAt:'',depositBalances:[{id:'b',date:'2026-01-21',amountCents:500000,note:''}]};
 const s={...emptyState('u'),offers:[o],accounts:[a]};return {o,a,s};
};
it('anchors US fixed holding deadline to opening, not funding, and keeps six transactions separate',()=>{
 const {o,a,s}=make();
 expect(depositProgress(a,o,'2026-02-10')).toMatchObject({start:'2026-01-21',end:'2026-03-02',days:40,elapsed:20,remaining:20,done:false});
 expect(depositProgress(a,o,'2026-03-02')?.done).toBe(true);
 expect(qualificationProgress(a,o,s,'2026-03-02').done).toBe(false);
 a.qualifyingTransactions=Array.from({length:6},(_,i)=>({id:String(i),date:'2026-02-01',note:'Confirmed eligible purchase'}));
 expect(qualificationProgress(a,o,s,'2026-03-02')).toMatchObject({done:true,last:'2026-03-02'});
});
it('counts only dated qualifying transactions before the deadline and never counts DD automatically',()=>{
 const {o,a,s}=make();s.ddEvents.push({id:'dd',userId:'u',accountId:a.id,date:'2026-02-01',amountCents:100000,sourceNote:''});
 a.qualifyingTransactions=[{id:'late',date:'2026-03-03',note:''}];
 expect(transactionProgress(a,o,'2026-03-04')).toMatchObject({count:0,done:false,late:true});
});
it('balance below the threshold on the final day breaks the condition; later withdrawals do not',()=>{
 for(const [date,done] of [['2026-03-02',false],['2026-03-03',true]] as const){
 const {o,a}=make();a.depositBalances!.push({id:'low',date,amountCents:0,note:''});
 expect(depositProgress(a,o,'2026-03-10')?.done).toBe(done);
 }
});
it('rejects late initial funding and never completes without a funded balance or known duration',()=>{
 const {o,a}=make();a.depositBalances![0].date='2026-02-02';
 expect(depositProgress(a,o,'2026-04-01')).toMatchObject({done:false,broken:true});
 a.depositBalances=[];expect(depositProgress(a,o,'2026-04-01')?.done).toBe(false);
 a.depositBalances=[{id:'b',date:'2026-01-05',amountCents:500000,note:''}];
 expect(depositProgress(a,{...o,depositEndOffsetDays:undefined},'2026-04-01')?.done).toBe(false);
});
it('calendar-month holding clamps month ends and only restarts when explicitly configured',()=>{
 const {o,a}=make();a.openedOn='2026-01-31';a.depositBalances=[{id:'b',date:a.openedOn,amountCents:500000,note:''}];
 const terms={...o,depositHoldBasis:'funded' as const,depositHoldMonths:3,depositDeadlineDays:null,transactionGoal:null};
 expect(depositProgress(a,terms,'2026-02-28')?.end).toBe('2026-04-30');
 a.depositBalances.push({id:'low',date:'2026-02-10',amountCents:0,note:''},{id:'back',date:'2026-02-12',amountCents:500000,note:''});
 expect(depositProgress(a,terms,'2026-06-01')).toMatchObject({done:false,broken:true});
 expect(depositProgress(a,{...terms,depositRestart:true},'2026-06-01')).toMatchObject({done:true,start:'2026-02-12',end:'2026-05-12'});
});
it('uses a fixed opening-day balance window without penalizing dips before it starts',()=>{
 const {o,a}=make();a.depositBalances!.push({id:'low',date:'2026-02-01',amountCents:0,note:''},{id:'back',date:'2026-02-14',amountCents:500000,note:''});
 const terms={...o,depositStartOffsetDays:45,depositEndOffsetDays:90,depositDeadlineDays:45};
 expect(depositProgress(a,terms,'2026-04-01')).toMatchObject({done:true,start:'2026-02-15',end:'2026-04-01'});
 a.depositBalances!.push({id:'drop',date:'2026-02-15',amountCents:0,note:''});
 expect(depositProgress(a,terms,'2026-04-01')).toMatchObject({done:false,broken:true});
});
it('does not finish a balance hold after the account was closed early',()=>{
 const {o,a}=make();a.closedOn='2026-02-01';
 expect(depositProgress(a,o,'2026-05-01')?.done).toBe(false);
});
it('requires independent DD, deposit and manually confirmed extra actions together',()=>{
 const {o,a,s}=make();Object.assign(o,{transactionGoal:null,ddAmountCents:500000,additionalConditions:'Enroll in online banking'});
 s.ddEvents.push({id:'dd',userId:'u',accountId:a.id,date:'2026-01-25',amountCents:500000,sourceNote:''});
 expect(qualificationProgress(a,o,s,'2026-04-01').done).toBe(false);
 a.additionalConditionsMetOn='2026-03-10';
 expect(qualificationProgress(a,o,s,'2026-04-01')).toMatchObject({done:true,last:'2026-03-10'});
});
it('counts independent component payments once and keeps partial payment active',()=>{
 const {o,a,s}=make();Object.assign(o,{rewardMode:'separate',depositBonusCents:150000,ddBonusCents:40000,bonusCents:190000,ddAmountCents:500000});
 a.componentReceipts={dd:{date:'2026-02-01',cents:40000}};a.bonusReceivedCents=40000;
 expect(summary(s,'USD','2026-02-15')).toMatchObject({total:40000});
 expect(accountStatus(a,o,s,'2026-02-15').label).toBe('部分奖励到账');
 a.componentReceipts.deposit={date:'2026-03-01',cents:150000};a.bonusReceivedOn='2026-03-01';a.bonusReceivedCents=190000;
 const result=summary(s,'USD','2026-03-15');expect(result.total).toBe(190000);
});
it('validates new record dates, duplicate daily balances, and old records with absent optional fields',()=>{
 const {o,a,s}=make();expect(()=>validateState(s,'2026-04-01')).not.toThrow();
 a.depositBalances!.push({...a.depositBalances![0],id:'copy'});
 expect(()=>validateState(s,'2026-04-01')).toThrow('同一天');
 a.depositBalances!.pop();a.qualifyingTransactions=[{id:'x',date:addDays(a.openedOn,-1),note:''}];
 expect(()=>validateState(s,'2026-04-01')).toThrow('存续');
});

it('calculates a month-end payout after all requirements instead of after the DD date',()=>{
 expect(rewardPayoutSchedule({payoutDays:30,payoutAnchor:'qualification_month_end'},'2026-01-01','2026-03-02')).toMatchObject({start:'2026-03-31',date:'2026-04-30'});
 expect(rewardPayoutSchedule({payoutDays:30,payoutAnchor:'qualification_month_end'},'2026-01-01',null).date).toBeNull();
});
it('does not permanently fail a fixed future window before it begins',()=>{
 const {o,a}=make();a.depositBalances!.push({id:'low',date:'2026-02-01',amountCents:0,note:''});
 const terms={...o,depositStartOffsetDays:45,depositEndOffsetDays:90,depositDeadlineDays:45};
 expect(depositProgress(a,terms,'2026-02-10')).toMatchObject({broken:false,done:false});
 a.depositBalances!.push({id:'back',date:'2026-02-14',amountCents:500000,note:''});
 expect(depositProgress(a,terms,'2026-04-01')?.done).toBe(true);
});

it('allows an explicitly permitted restart after the initial funding deadline was already satisfied',()=>{
 const {o,a}=make();a.depositBalances!.push({id:'low',date:'2026-02-10',amountCents:0,note:''},{id:'back',date:'2026-02-12',amountCents:500000,note:''});
 expect(depositProgress(a,{...o,depositHoldBasis:'funded',depositHoldMonths:3,depositRestart:true},'2026-06-01')).toMatchObject({done:true,start:'2026-02-12'});
});
it('keeps per-period transaction counts independent and never carries excess into another month',()=>{
 const {o,a,s}=make();Object.assign(o,{transactionMode:'periodic',transactionCycleBasis:'calendar',transactionCycleCount:2,transactionGoal:5,transactionDeadlineDays:null,depositGoalCents:null});
 a.qualifyingTransactions=Array.from({length:10},(_,i)=>({id:'jan'+i,date:'2026-01-15',note:''}));
 let p=transactionProgress(a,o,'2026-02-10');expect(p).toMatchObject({done:false,completedPeriods:1,ratio:0.5});expect(p.periods.map(x=>x.count)).toEqual([10,0]);
 a.qualifyingTransactions.push(...Array.from({length:5},(_,i)=>({id:'feb'+i,date:'2026-02-01',note:''})));
 expect(transactionProgress(a,o,'2026-02-10')).toMatchObject({done:true,completedPeriods:2,last:'2026-02-01'});expect(qualificationProgress(a,o,s,'2026-02-10').done).toBe(true);
 delete (o as any).transactionMode;expect(transactionProgress(a,o,'2026-02-10')).toMatchObject({done:true,last:'2026-01-15'});
});
it('supports opening and statement transaction cycles and open-ended current-period tracking',()=>{
 const {o,a}=make();a.openedOn='2026-01-11';Object.assign(o,{transactionMode:'periodic',transactionCycleBasis:'opening',transactionCycleCount:2,transactionGoal:1,transactionDeadlineDays:null});
 a.qualifyingTransactions=[{id:'a',date:'2026-02-10',note:''},{id:'b',date:'2026-02-11',note:''}];
 let p=transactionProgress(a,o,'2026-02-11');expect(p.periods.map(x=>x.count)).toEqual([1,1]);expect(p.done).toBe(true);
 Object.assign(o,{transactionCycleBasis:'statement',transactionStatementDay:10});expect(transactionProgress(a,o,'2026-02-11').periods.map(x=>x.count)).toEqual([1,1]);
 Object.assign(o,{transactionCycleCount:null});p=transactionProgress(a,o,'2026-02-11');expect(p).toMatchObject({done:false,count:1,ratio:1});
});
