import {emptyOffer, type RewardOffer, type RewardState} from './bank-rewards/types';
import {validateState, isISO} from './bank-rewards/logic';
export type AIProvider={id:string;name:string;protocol:'openai'|'compatible'|'anthropic'|'gemini';endpoint:string;model:string;hasKey:boolean};
export type AIConfig={providers:AIProvider[];hasSearchKey:boolean};
export type AIRequest={kind:'offer'|'dd';providerId:string;query:string;sourceNote?:string;requirements?:string;date?:string};
export type AIResult={pageText?:string;name?:string;kind:'offer'|'dd';fields:Partial<RewardOffer>;verdict:'supported'|'unsupported'|'mixed'|'unknown';summary:string;
  uncertainties:string[];citations:{field?:string;url:string;title:string;quote:string}[];
  proposals?:{name:string;fields:Partial<RewardOffer>;citations:AIResult['citations'];summary:string;uncertainties:string[]}[];
  sources:{url:string;title:string;retrieval:string}[];failures:string[];checkedAt:string;provider:string};
export const fieldLabels:Record<string,string>={depositGoalCents:'需保持的存款',depositDeadlineDays:'存入期限',depositHoldDays:'持有天数',depositHoldMonths:'持有月数',depositStartOffsetDays:'开户后开始维持天数',depositEndOffsetDays:'开户后维持至天数',depositHoldBasis:'持有起算方式',rewardMode:'奖励关系',depositBonusCents:'存款奖励',ddBonusCents:'DD / 消费奖励',transactionGoal:'合格交易笔数',transactionDeadlineDays:'交易期限',promoCode:'优惠码',additionalConditions:'其他必须完成的条件',bankName:'银行',productName:'活动',accountType:'账户类型',currency:'币种',bonusCents:'奖励金额',
  ddAmountCents:'DD 门槛',ddCount:'DD 笔数',rewardCycleCount:'考核期数',cycleDebitCents:'借记卡消费',cycleCreditCents:'信用卡消费',
  deadlineDays:'条件期限',minHoldDays:'最低持有天数',monthlyFee:'月费',feeGoalCents:'免月费门槛',feeFreeCycles:'免费期数',feeStatementDay:'免月费结账日',
  statementDay:'结账日',payoutDays:'奖励等待天数',repeatIntervalMonths:'重复奖励间隔',requirements:'要求说明',feeNote:'免月费说明',
  earlyClosePenalty:'提前关户惩罚',startsOn:'开始日期',expiresOn:'截止日期',cycleBasis:'考核周期',feeMetric:'免月费累计项目',
  feeBasis:'免月费周期',payoutAnchor:'到账起算日',payoutTiming:'发放时间',payoutDayUnit:'天数单位',repeatAnchor:'重奖起算日',repeatable:'可重复奖励'};
export function offerFromAI(result:AIResult,userId:string):RewardOffer {
  const fields={...result.fields};
  // Unknown period boundaries remain explicitly unconfigured until the user chooses them.
  if(fields.rewardCycleCount && !fields.cycleBasis)fields.cycleBasis='custom';
  const base=emptyOffer(userId),offer={...base,...fields};
  if(offer.rewardMode==='separate'&&offer.depositBonusCents!=null&&offer.ddBonusCents!=null)offer.bonusCents=offer.depositBonusCents+offer.ddBonusCents;
  const links=[...new Set(result.citations.map(c=>c.url))];
  offer.sourceUrl=links[0]||'';
  offer.productName=offer.productName||result.name||'';
  offer.requirements=offer.requirements||result.summary;
  offer.docCheckedOn=isISO(result.checkedAt.slice(0,10))?result.checkedAt.slice(0,10):null;
  offer.notes=['AI 查询：'+result.checkedAt+' · '+result.provider,result.summary,
    ...result.uncertainties.map(s=>'待核实：'+s),
    ...result.citations.map(c=>(fieldLabels[c.field||'']||'依据')+'：'+c.quote+'\n'+c.url),
    ...(result.pageText?['查询时的活动网页原文（包含页面上的所有奖励档位，保留完整条款供核对）：\n'+result.pageText]:[])].join('\n\n');
  // Use the same validation as a manual save. Generated values never bypass record rules.
  const sample={...offer,id:'ai-draft',bankName:offer.bankName||'待填写'};
  validateState({version:1,userId,offers:[sample],accounts:[],ddEvents:[],rules:[]} as RewardState);
  return offer;
}

export function displayAIField(field:string,value:unknown,currency='USD'):string {
  const labels:Record<string,string>={qualification_month_end:'全部条件达标的当月月底',funded:'余额达标日起',combined:'全部条件满足后领一笔',separate:'两项奖励分别领取，可叠加',opening:'开户日',qualification:'全部条件达标日',within:'期限内到账',after:'满期后发放',
    calendar:'自然月',statement:'账单周期',custom:'自定义日期',dd:'工资 DD',debit:'借记卡消费',credit:'信用卡消费',
    business:'工作日',open:'开户日',close:'关户日',bonus:'奖励到账日',checking:'支票账户',savings:'储蓄账户'};
  if(field==='payoutDayUnit'&&value==='calendar')return '自然日';
  if(field==='cycleBasis'&&value==='opening'||field==='feeBasis'&&value==='opening')return '开户日逐月';
  if(field.endsWith('Cents'))return new Intl.NumberFormat('en-US',{style:'currency',currency:['USD','EUR','CNY','GBP','JPY','CHF','CAD','AUD'].includes(currency)?currency:'USD',maximumFractionDigits:Number(value)%100?2:0}).format(Number(value)/100);
  if(field.endsWith('Days'))return String(value)+' 天';
  if(['rewardCycleCount','feeFreeCycles'].includes(field))return String(value)+' 期';
  if(field==='depositHoldMonths')return String(value)+' 个月';
  if(field==='ddCount'||field==='transactionGoal')return String(value)+' 笔';
  if(typeof value==='boolean')return value?'是':'否';
  return labels[String(value)]||String(value);
}
