import React, {useState} from 'react';
import type {RewardOffer, RewardAccount} from '../../services/bank-rewards/types';
import {ddProgress,feeProgress,money,depositProgress,transactionProgress,addDays,countdown,daysBetween} from '../../services/bank-rewards/logic';

export function hasMultipleConditions(o:RewardOffer) {
  return [o.ddAmountCents || o.ddCount,o.cycleDebitCents,o.cycleCreditCents,o.depositGoalCents,o.transactionGoal,o.additionalConditions].filter(Boolean).length > 1 || (o.rewardCycleCount ?? 0) > 1 || (o.transactionMode==='periodic' && !!o.transactionGoal);
}

function Meter({label,amount,goal,currency}:{label:string;amount:number;goal:number;currency:string}) {
  const remaining=Math.max(0,goal-amount);
  return <div className="br-condition-meter" data-met={remaining===0}>
    <div><span>{label}</span><strong>{money(amount,currency)} / {money(goal,currency)}</strong></div>
    <progress aria-label={label} max={goal} value={Math.min(amount,goal)} />
    <small>{remaining ? `还差 ${money(remaining,currency)}` : '✓ 已达标'}</small>
  </div>;
}

type SummaryProps = {offer:RewardOffer;account:RewardAccount;dd:ReturnType<typeof ddProgress>;today:string};

function SummaryMeter({label,ratio,caption,title,inlineCaption=false}:{label:string;ratio:number|null;caption:string;title:string;inlineCaption?:boolean}) {
  return <div className="br-summary-meter" title={title}><div className="br-summary-heading"><b>{label}</b>{inlineCaption && <span>{caption}</span>}</div>
    {ratio===null ? <progress aria-label={label} aria-valuetext={caption} max={1} value={0} data-pending="true"/> :
      <progress aria-label={label} max={1} value={Math.max(0,Math.min(1,ratio))}/>}
    {!inlineCaption && <small>{caption}</small>}</div>;
}

export function hasFeeRequirement(o:RewardOffer) {
  return !!(o.feeGoalCents || o.feeFreeCycles);
}

export function SplitProgress({offer:o,account,dd,today,feeOnly=false}:SummaryProps & {feeOnly?:boolean}) {
  const fee=feeProgress(account,o,dd.all,today);
  const period=dd.periods.find(p=>p.start && p.start<=today && today<=p.end);
  const moneyHere=(amount:number)=>money(amount,o.currency);
  const depositRatio=dd.periods.length ? (period && o.ddAmountCents ? period.deposits/o.ddAmountCents : null) : o.ddCount ? Math.min(dd.count/o.ddCount, o.ddAmountMode==='total' && o.ddAmountCents ? dd.totalCents/o.ddAmountCents : 1) : dd.known && o.ddAmountCents ? Math.min(1,dd.totalCents/o.ddAmountCents) : null;
  const depositCaption=dd.periods.length ? (period ? moneyHere(period.deposits)+' / '+moneyHere(o.ddAmountCents ?? 0) : '当前无考核期') :
    o.ddCount ? `${o.ddAmountMode==='total' ? moneyHere(dd.totalCents)+' / '+moneyHere(o.ddAmountCents??0)+' · ' : ''}${dd.count}/${o.ddCount} 笔` : dd.known ? moneyHere(dd.totalCents)+' / '+moneyHere(o.ddAmountCents ?? 0) : '要求待核对';
  let feeRatio:number|null=null;
  let feeCaption=`开户前 ${o.feeFreeCycles || 0} 期免月费`;
  // With no usable cycle, show recorded amounts only; never infer monthly qualification.
  if (!fee && o.feeGoalCents) {
    const until=account.closedOn && account.closedOn<today ? account.closedOn : today;
    const recorded=dd.all.filter(e=>e.accountId===account.id && e.date>=account.openedOn && e.date<=until &&
      (e.kind || 'dd')===(o.feeMetric || 'dd')).reduce((sum,e)=>sum+e.amountCents,0);
    feeRatio=recorded/o.feeGoalCents;
    feeCaption=`已记录 ${moneyHere(recorded)} / ${moneyHere(o.feeGoalCents)}`;
  }
  if (fee?.free) {feeRatio=1; feeCaption='本期自动免';}
  else if (fee && o.feeGoalCents) {feeRatio=fee.amount/o.feeGoalCents; feeCaption=feeRatio>=1?'✓ 本期已达标':moneyHere(fee.amount)+' / '+moneyHere(o.feeGoalCents);}
  else if (fee) feeCaption='免费期已结束';
  const feeTitle=[!fee && '显示开户以来已记录金额；设置计算周期后按期统计，当前不判定本期免月费。',o.feeNote, fee && `${fee.start} 至 ${fee.end}`,o.feeGoalCents && `门槛 ${moneyHere(o.feeGoalCents)}`,feeCaption].filter(Boolean).join(' · ');
  return <div className={feeOnly?"br-fee-progress":"br-split-progress"}>{!feeOnly && <SummaryMeter label="DD 进度" ratio={depositRatio} caption={depositCaption} title={`${depositCaption} · DD 门槛 ${moneyHere(o.ddAmountCents??0)}`}/> }
    <div className="br-fee-meter"><SummaryMeter label="免月费进度" ratio={feeRatio} caption={feeCaption} title={feeTitle} inlineCaption={!!fee?.free}/></div></div>;
}

export function CycleCompletion({periods}:{periods:ReturnType<typeof ddProgress>['periods']}) {
  const complete=periods.filter(p=>p.metOn).length;
  return <div className="br-cycle-completion" aria-label={`已完成 ${complete}/${periods.length} 期`}>
    <b className="br-cycle-label">DD 进度</b><span className="br-cycle-dots">{periods.map((p,i)=><i key={i} className="br-cycle-dot" data-complete={!!p.metOn} title={`第 ${i+1} 期${p.metOn?'已完成':'未完成'}`}/>)}</span>
    <strong>{complete}/{periods.length}</strong>
  </div>;
}

export default function ConditionProgress({offer,account,dd,today,detail=false,onDepositAction}:{
  key?:string;offer:RewardOffer;account:RewardAccount;dd:ReturnType<typeof ddProgress>;today:string;detail?:boolean;onDepositAction?:(edit:boolean)=>void
}) {
  const [offset,setOffset]=useState(0);
  const fee=detail ? feeProgress(account,offer,dd.all,today,offset) : null;
  const deposit=depositProgress(account,offer,today),transactions=transactionProgress(account,offer,today);
  const compact=!detail && hasMultipleConditions(offer);
  const reminders=[
    offer.promoCode && ['优惠码',offer.promoCode],
    !compact && deposit?.fundingDeadline && ['存入截止',deposit.fundingDeadline+' · '+countdown(deposit.fundingDeadline,today)],
    !compact && transactions.deadline && ['交易截止',transactions.deadline+' · '+countdown(transactions.deadline,today)],
    offer.expiresOn && ['活动截止',offer.expiresOn],
    offer.feeNote && ['免月费',offer.feeNote],
    offer.earlyClosePenalty && ['提前关户',offer.earlyClosePenalty],
  ].filter(Boolean) as string[][];
  return <div className="br-condition-layout" data-compact={compact}><div className="br-condition-board">
    {compact && !dd.periods.length && !!offer.ddAmountCents && <section className="br-condition-period" aria-label="工资 DD 条件"><header><b>工资 DD</b></header><Meter label="工资 DD" amount={dd.totalCents} goal={offer.ddAmountCents} currency={offer.currency}/>{offer.ddCount && <div className="br-condition-date">合格笔数 {dd.count} / {offer.ddCount}</div>}{dd.deadline && <div className="br-condition-date">DD 截止 {dd.deadline} · {countdown(dd.deadline,today)}</div>}</section>}
    {dd.periods.map((p,i)=><section key={i} aria-label={`第 ${i+1} 期条件`} className="br-condition-period" data-status={p.metOn?'met':p.start && p.start<=today && today<=p.end?'current':'other'}>
      <header><b>第 {i+1} 期{p.start && p.start<=today && today<=p.end && <em className="br-period-remaining"> · {today===p.end?"今天截止":`剩 ${daysBetween(today,p.end)} 天`}</em>}</b><span>{p.metOn?'✓ 本期已达标':!p.start?'待填日期':today<p.start?'未开始':today>p.end?'本期未达标':'本期进行中'}</span></header>
      <div className="br-condition-date">{detail ? `第 ${i+1} 期 · ` : ''}{p.start ? p.start+' 至 '+p.end : '待填日期（编辑账户）'}</div>
      {!!offer.ddAmountCents && <Meter label="工资 DD" amount={p.deposits} goal={offer.ddAmountCents} currency={offer.currency}/>}
      {!!offer.cycleDebitCents && <Meter label="借记卡消费" amount={p.spending} goal={offer.cycleDebitCents} currency={offer.currency}/>}
      {!!offer.cycleCreditCents && <Meter label="信用卡消费" amount={p.creditSpending} goal={offer.cycleCreditCents} currency={offer.currency}/>}
    </section>)}
    {!dd.periods.length && !!offer.cycleCreditCents && <section className="br-condition-period"><header><b>信用卡消费条件</b></header><Meter label="信用卡消费" amount={dd.all.filter(e=>e.kind==="credit" && e.date>=account.openedOn && e.date<=today && (!dd.deadline || e.date<=dd.deadline)).reduce((sum,e)=>sum+e.amountCents,0)} goal={offer.cycleCreditCents} currency={offer.currency}/></section>}
    {deposit && <section className="br-condition-period br-deposit-condition" data-status={deposit.done?'met':deposit.broken?'broken':'current'}>
      <header><b>存款与持有时间</b><span>{deposit.broken?'余额 / 期限待核对':deposit.done?'✓ 持有期已完成':deposit.start?'持有中':'等待存入'}</span></header>
      <Meter label="已存金额" amount={deposit.amount} goal={deposit.goal} currency={offer.currency}/>
      {compact && deposit.fundingDeadline && <div className="br-condition-date">存入截止 {deposit.fundingDeadline} · {countdown(deposit.fundingDeadline,today)}</div>}
      <div className="br-condition-meter">
        <div><span>持有倒计时</span><strong>{deposit.broken?'条件中断':deposit.known?deposit.done?'已完成':`还剩 ${deposit.remaining} 天`:'尚未起算'}</strong></div>
        <progress aria-label="持有倒计时" max={1} value={deposit.broken?0:deposit.ratio}/>
      </div>
      {detail && <div className="br-condition-date">{deposit.start&&deposit.end?`${deposit.start} 至 ${deposit.end}`:offer.depositHoldBasis==='opening'?(offer.depositEndOffsetDays!=null?`保持至 ${addDays(account.openedOn,offer.depositEndOffsetDays)}`:'持有完成时间待填写'):`余额达标后保持 ${offer.depositHoldMonths?`${offer.depositHoldMonths} 个月`:`${offer.depositHoldDays??'—'} 天`}`}</div>}
      {detail && <small className="br-balance-caption">按余额记录推算 · {account.depositBalances?.length?'最新记录 '+[...account.depositBalances].map(r=>r.date).sort().at(-1):'尚未记录余额'}</small>}
      {onDepositAction && <div className="br-deposit-actions"><button type="button" onClick={e=>{e.stopPropagation();onDepositAction(false);}}>添加存款记录</button><button type="button" disabled={!account.depositBalances?.length} onClick={e=>{e.stopPropagation();onDepositAction(true);}}>修改金额</button></div>}
      {offer.rewardMode==='separate'&&<p className="br-condition-reward">存款奖励 {money(offer.depositBonusCents??null,offer.currency)} · {account.componentReceipts?.deposit?'已到账 '+account.componentReceipts.deposit.date:'待到账'}</p>}
    </section>}
    {transactions.periods.map((p,i)=>(offer.transactionCycleCount || i===transactions.currentIndex) && <section key={'transaction-'+i} className="br-condition-period" aria-label={`合格交易第 ${i+1} 期`} data-status={p.done?'met':p.start<=today&&today<=p.end?'current':'other'}>
      <header><b>合格交易 · 第 {i+1} 期</b><span>{p.done?'✓ 本期已达标':today<p.start?'未开始':p.late?'本期未达标':'本期进行中'}</span></header>
      <div className="br-condition-date">{p.start} 至 {p.end}</div>
      <div className="br-condition-meter"><div><span>已确认交易</span><strong>{p.count} / {transactions.goal} 笔</strong></div><progress aria-label={`合格交易第 ${i+1} 期进度`} max={transactions.goal} value={Math.min(p.count,transactions.goal)}/></div>
      <div className="br-condition-date">{today<=p.end?'交易截止 '+p.end+' · '+countdown(p.end,today):p.done?'本期已完成':'本期已结束'}</div>
    </section>)}
    {!!transactions.goal && !transactions.periods.length && <section className="br-condition-period" data-status={transactions.done?'met':transactions.late?'broken':'other'}>
      <header><b>{offer.transactionMode==='periodic'?'每期合格交易':'合格交易'}</b><span>{transactions.done?'✓ 已完成':transactions.late?'已过截止日':'待完成'}</span></header>
      <div className="br-condition-meter"><div><span>已确认交易</span><strong>{transactions.count} / {transactions.goal} 笔</strong></div><progress aria-label="合格交易" max={transactions.goal} value={Math.min(transactions.count,transactions.goal)}/></div>
      <div className="br-condition-date">{offer.transactionMode==='periodic'?'每期单独累计':transactions.deadline?(compact?'交易截止 '+transactions.deadline+' · '+countdown(transactions.deadline,today):'截止 '+transactions.deadline):'按活动条款确认每笔是否合格'}</div>
    </section>}
    {detail && (!!offer.feeGoalCents || !!offer.feeFreeCycles) && <section className="br-condition-period br-waiver" data-status={fee && (fee.free || !!offer.feeGoalCents && fee.amount>=offer.feeGoalCents)?'met':'other'} aria-label="免月费条件">
      <header><b>免月费{offer.monthlyFee ? ' · '+offer.monthlyFee : ''}</b><span>{fee?.free?'✓ 开户免月费':fee && !!offer.feeGoalCents && fee.amount>=offer.feeGoalCents?'✓ 条件已满足':'每期单独累计'}</span></header>
      {fee ? <><div className="br-fee-dates"><button type="button" aria-label="上一个免月费周期" disabled={!fee.index} onClick={()=>setOffset(fee.index-fee.current-1)}>‹</button><span>{fee.start} 至 {fee.end}</span><button type="button" aria-label="下一个免月费周期" disabled={fee.index>=fee.current} onClick={()=>setOffset(fee.index-fee.current+1)}>›</button></div>
        {fee.free && <p>第 {fee.index+1} / {offer.feeFreeCycles} 个免费周期 · 本期无需达到金额门槛</p>}
        {!fee.free && !!offer.feeGoalCents && <Meter label={offer.feeMetric==='credit'?'免月费信用卡消费':offer.feeMetric==='debit'?'免月费借记卡消费':'免月费工资 DD'} amount={fee.amount} goal={offer.feeGoalCents} currency={offer.currency}/>}{!fee.free && !offer.feeGoalCents && <p>免费期已结束，后续豁免条件待填写。</p>}</>
        : <p>{!!offer.feeFreeCycles && `开户前 ${offer.feeFreeCycles} 期免月费。`}{!!offer.feeGoalCents && <>每期{offer.feeMetric==='credit'?'信用卡消费':offer.feeMetric==='debit'?'借记卡消费':'工资 DD'} ≥ {money(offer.feeGoalCents,offer.currency)}。</>}{offer.feeBasis==='statement'?'待填写账单结账日。':'待确认计算周期。'}</p>}
    </section>}
  </div>
    {compact && (reminders.length>0||offer.requirements||offer.additionalConditions) && <details className="br-condition-notes"><summary>补充说明{offer.additionalConditions && !account.additionalConditionsMetOn ? ' · 有其他条件待核对' : ''}</summary>
      {reminders.map(([label,value])=><p key={label}><b>{label}</b> · {value}</p>)}
      {offer.additionalConditions&&<p>{account.additionalConditionsMetOn?'✓ 已核对 '+account.additionalConditionsMetOn:'待核对'} · {offer.additionalConditions}</p>}
      {offer.requirements&&<p>{offer.requirements}</p>}
      {offer.rewardMode==='separate'&&<p>DD / 消费奖励 {money(offer.ddBonusCents??null,offer.currency)} · {account.componentReceipts?.dd?'已到账 '+account.componentReceipts.dd.date:'待到账'}</p>}
    </details>}
    {!compact && (reminders.length>0||offer.requirements||offer.additionalConditions) && <aside className="br-condition-reminders" aria-label="规则与提醒">
      <h3>规则与提醒</h3>
      {reminders.map(([label,value])=><div className="br-reminder-line" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      {offer.additionalConditions && <div className="br-extra-conditions"><span>{account.additionalConditionsMetOn?'✓ 已核对 '+account.additionalConditionsMetOn:'待核对'}</span><p>{offer.additionalConditions}</p></div>}
      {offer.requirements&&<details><summary>展开活动细则</summary><p>{offer.requirements}</p></details>}
      {offer.rewardMode==='separate'&&<p className="br-condition-reward">DD / 消费奖励 {money(offer.ddBonusCents??null,offer.currency)} · {account.componentReceipts?.dd?'已到账 '+account.componentReceipts.dd.date:'待到账'}</p>}
    </aside>}
  </div>;
}
