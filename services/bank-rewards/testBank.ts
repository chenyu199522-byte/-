import {emptyOffer, emptyState, type RewardOffer, type RewardState} from './types';
import {addDays, todayISO} from './logic';

export const testBankId = 'sandbox-bank';
export const requirementGroups: {id:string;label:string;keys:(keyof RewardOffer)[]}[] = [
  {id:'dd',label:'工资直存 DD',keys:['ddAmountCents','ddCount','ddAmountMode','deadlineDays']},
  {id:'debit',label:'借记卡消费',keys:['cycleDebitCents']},
  {id:'credit',label:'信用卡消费',keys:['cycleCreditCents']},
  {id:'cycles',label:'连续考核周期',keys:['rewardCycleCount','cycleBasis']},
  {id:'deposit',label:'存款金额与持有期限',keys:['depositGoalCents','depositDeadlineDays','depositHoldDays','depositHoldBasis','depositRestart']},
  {id:'transactions',label:'合格交易笔数',keys:['transactionGoal','transactionDeadlineDays','transactionMode','transactionCycleBasis','transactionCycleCount','transactionStatementDay']},
  {id:'fee',label:'月费与豁免条件',keys:['monthlyFee','feeNote','feeGoalCents','feeMetric','feeBasis','feeFreeCycles']},
  {id:'payout',label:'奖励到账期限',keys:['payoutDays','payoutAnchor','payoutTiming','payoutDayUnit']},
  {id:'hold',label:'最低持有与关户',keys:['minHoldDays','earlyClosePenalty','closureMethod']},
  {id:'repeat',label:'重复领奖冷却期',keys:['repeatable','repeatIntervalMonths','repeatAnchor']},
  {id:'promo',label:'开户优惠码',keys:['promoCode']},
  {id:'extra',label:'其他自定义要求',keys:['additionalConditions']},
  {id:'notes',label:'长备注与说明',keys:['notes','requirements']},
];

/** Entirely fictional terms: used only in a session-local sandbox. */
export function createTestBank(userId:string, today=todayISO()):RewardState {
  const state=emptyState(userId), openedOn=addDays(today,-10), stamp=new Date().toISOString();
  state.offers=[{...emptyOffer(userId), id:testBankId, bankName:'示例银行（虚拟）',
    productName:'全条件测试账户', bonusCents:150000, applicationStatus:'opened',
    ddAmountCents:200000,ddCount:2,deadlineDays:90,cycleDebitCents:50000,cycleCreditCents:100000,
    rewardCycleCount:3,cycleBasis:'opening',depositGoalCents:2500000,depositDeadlineDays:30,
    depositHoldDays:60,depositHoldBasis:'funded',depositRestart:true,
    transactionGoal:6,transactionDeadlineDays:90,monthlyFee:'30',feeFreeCycles:1,
    feeGoalCents:100000,feeMetric:'dd',feeBasis:'calendar',feeNote:'每月合格工资直存达到 $1,000 可免月费；退款、转账及撤销交易不计入。仅作测试。',
    payoutDays:30,payoutAnchor:'qualification_month_end',payoutTiming:'within',payoutDayUnit:'business',
    minHoldDays:180,earlyClosePenalty:'提前关户可能追回全部示例奖励。',closureMethod:'示例：在线或电话关户',
    repeatable:true,repeatIntervalMonths:24,repeatAnchor:'bonus',promoCode:'TEST1500',
    additionalConditions:'启用电子账单\n保持账户状态正常\n在期限内完成身份资料确认',
    requirements:'同一活动包含工资直存、消费、存款及交易要求，全部满足后领取奖励。',
    notes:'这是虚拟银行，用来测试长文字、多个条件、进度和窄窗口排版。所有金额与条款均为演示，不代表任何真实银行活动。',
    startsOn:openedOn,expiresOn:addDays(today,90),createdAt:stamp,updatedAt:stamp}];
  state.accounts=[{id:'sandbox-account',userId,offerId:testBankId,name:'测试账户',openedOn,
    closedOn:null,bonusReceivedOn:null,bonusReceivedCents:null,minHoldDays:180,notes:'虚拟测试记录',
    closureMethod:'示例：在线或电话关户',historyOnly:false,syncIncome:false,exchangeRate:null,incomeCurrency:'USD',
    depositBalances:[{id:'sample-balance',date:openedOn,amountCents:2500000,note:'示例入金'}],
    qualifyingTransactions:[{id:'sample-transaction',date:today,note:'示例合格交易'}],createdAt:stamp,updatedAt:stamp}];
  state.ddEvents=[{id:'sample-dd',userId,accountId:'sandbox-account',date:today,amountCents:100000,kind:'dd',sourceNote:'示例工资直存'}];
  state.rules=[{id:'sample-rule',userId,offerId:testBankId,kind:'account_history',months:12,anchor:'close',
    description:'过去 12 个月未持有该类账户（虚拟资格条件）',manualResult:'unknown'}];
  return state;
}

export function toggleTestRequirement(state:RewardState, groupId:string, enabled:boolean):RewardState {
  const next=structuredClone(state), offer=next.offers.find(o=>o.id===testBankId);
  const group=requirementGroups.find(g=>g.id===groupId);
  if (!offer || !group) return next;
  const sample=createTestBank(state.userId).offers[0];
  for (const key of group.keys) {
    if (enabled) Object.assign(offer,{[key]:sample[key]});
    else Object.assign(offer,{[key]:emptyOffer(state.userId)[key]});
  }
  // A cycle needs a monetary condition; separate awards need both components.
  if (!(offer.ddAmountCents || offer.cycleDebitCents || offer.cycleCreditCents)) {
    offer.rewardCycleCount=null;
    if(enabled && groupId==='cycles') offer.ddAmountCents=sample.ddAmountCents;
    if(enabled && groupId==='cycles') offer.rewardCycleCount=sample.rewardCycleCount;
  }
  if (!offer.depositGoalCents || !(offer.ddAmountCents || offer.ddCount || offer.cycleDebitCents || offer.cycleCreditCents)) offer.rewardMode='combined';
  if(groupId==='hold') for(const a of next.accounts.filter(a=>a.offerId===offer.id)) a.minHoldDays=offer.minHoldDays??null;
  return next;
}
