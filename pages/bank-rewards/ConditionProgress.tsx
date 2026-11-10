import React, {useState} from 'react';
import type {RewardOffer, RewardAccount} from '../../services/bank-rewards/types';
import {ddProgress,feeProgress,money} from '../../services/bank-rewards/logic';

function Meter({label,amount,goal,currency}:{label:string;amount:number;goal:number;currency:string}) {
  const remaining=Math.max(0,goal-amount);
  return <div className="br-condition-meter" data-met={remaining===0}>
    <div><span>{label}</span><strong>{money(amount,currency)} / {money(goal,currency)}</strong></div>
    <progress aria-label={label} max={goal} value={Math.min(amount,goal)} />
    <small>{remaining ? `还差 ${money(remaining,currency)}` : '✓ 已达标'}</small>
  </div>;
}

type SummaryProps = {offer:RewardOffer;account:RewardAccount;dd:ReturnType<typeof ddProgress>;today:string};

function SummaryMeter({label,ratio,caption,title}:{label:string;ratio:number|null;caption:string;title:string}) {
  return <div className="br-summary-meter" title={title}><b>{label}</b>
    {ratio===null ? <span className="br-pending-rail" aria-label={caption}/> :
      <progress aria-label={label} max={1} value={Math.max(0,Math.min(1,ratio))}/>}
    <small>{caption}</small></div>;
}

export function SplitProgress({offer:o,account,dd,today}:SummaryProps) {
  const fee=feeProgress(account,o,dd.all,today);
  const period=dd.periods.find(p=>p.start && p.start<=today && today<=p.end);
  const moneyHere=(amount:number)=>money(amount,o.currency);
  const depositRatio=dd.periods.length ? (period && o.ddAmountCents ? period.deposits/o.ddAmountCents : null) : dd.known ? dd.ratio : null;
  const depositCaption=dd.periods.length ? (period ? moneyHere(period.deposits)+' / '+moneyHere(o.ddAmountCents ?? 0) : '当前无考核期') :
    o.ddCount ? `${dd.count}/${o.ddCount} 笔` : dd.known ? moneyHere(dd.totalCents)+' / '+moneyHere(o.ddAmountCents ?? 0) : '要求待核对';
  let feeRatio:number|null=null;
  let feeCaption=o.feeBasis==='statement' && !o.feeStatementDay ? '待填结账日' : o.feeGoalCents || o.feeFreeCycles ? '周期待确认' : '门槛待设置';
  if (fee?.free) {feeRatio=1; feeCaption='本期自动免';}
  else if (fee && o.feeGoalCents) {feeRatio=fee.amount/o.feeGoalCents; feeCaption=feeRatio>=1?'✓ 本期已达标':moneyHere(fee.amount)+' / '+moneyHere(o.feeGoalCents);}
  else if (fee) feeCaption='免费期已结束';
  const feeTitle=[o.feeNote, fee && `${fee.start} 至 ${fee.end}`,o.feeGoalCents && `门槛 ${moneyHere(o.feeGoalCents)}`,feeCaption].filter(Boolean).join(' · ');
  return <div className="br-split-progress"><SummaryMeter label="存款进度" ratio={depositRatio} caption={depositCaption} title={`${depositCaption} · DD 门槛 ${moneyHere(o.ddAmountCents??0)}`}/>
    <SummaryMeter label="免月费进度" ratio={feeRatio} caption={feeCaption} title={feeTitle}/></div>;
}

export default function ConditionProgress({offer,account,dd,today,detail=false}:{
  key?:string;offer:RewardOffer;account:RewardAccount;dd:ReturnType<typeof ddProgress>;today:string;detail?:boolean
}) {
  const [offset,setOffset]=useState(0);
  const fee=detail ? feeProgress(account,offer,dd.all,today,offset) : null;
  return <div className="br-condition-board">
    {dd.periods.map((p,i)=><section key={i} aria-label={`第 ${i+1} 期条件`} className="br-condition-period" data-status={p.metOn?'met':p.start && p.start<=today && today<=p.end?'current':'other'}>
      <header><b>第 {i+1} 期</b><span>{p.metOn?'✓ 本期已达标':!p.start?'待填日期':today<p.start?'未开始':today>p.end?'本期未达标':'本期进行中'}</span></header>
      <div className="br-condition-date">{detail ? `第 ${i+1} 期 · ` : ''}{p.start ? p.start+' 至 '+p.end : '待填日期（编辑账户）'}</div>
      {!!offer.ddAmountCents && <Meter label="工资 DD" amount={p.deposits} goal={offer.ddAmountCents} currency={offer.currency}/>}
      {!!offer.cycleDebitCents && <Meter label="借记卡消费" amount={p.spending} goal={offer.cycleDebitCents} currency={offer.currency}/>}
    </section>)}
    {detail && (!!offer.feeGoalCents || !!offer.feeFreeCycles) && <section className="br-condition-period br-waiver" data-status={fee && (fee.free || !!offer.feeGoalCents && fee.amount>=offer.feeGoalCents)?'met':'other'} aria-label="免月费条件">
      <header><b>免月费{offer.monthlyFee ? ' · '+offer.monthlyFee : ''}</b><span>{fee?.free?'✓ 开户免月费':fee && !!offer.feeGoalCents && fee.amount>=offer.feeGoalCents?'✓ 条件已满足':'每期单独累计'}</span></header>
      {fee ? <><div className="br-fee-dates"><button type="button" aria-label="上一个免月费周期" disabled={!fee.index} onClick={()=>setOffset(fee.index-fee.current-1)}>‹</button><span>{fee.start} 至 {fee.end}</span><button type="button" aria-label="下一个免月费周期" disabled={fee.index>=fee.current} onClick={()=>setOffset(fee.index-fee.current+1)}>›</button></div>
        {fee.free && <p>第 {fee.index+1} / {offer.feeFreeCycles} 个免费周期 · 本期无需达到金额门槛</p>}
        {!fee.free && !!offer.feeGoalCents && <Meter label={offer.feeMetric==='debit'?'免月费借记卡消费':'免月费工资 DD'} amount={fee.amount} goal={offer.feeGoalCents} currency={offer.currency}/>}{!fee.free && !offer.feeGoalCents && <p>免费期已结束，后续豁免条件待填写。</p>}</>
        : <p>{!!offer.feeFreeCycles && `开户前 ${offer.feeFreeCycles} 期免月费。`}{!!offer.feeGoalCents && <>每期{offer.feeMetric==='debit'?'借记卡消费':'工资 DD'} ≥ {money(offer.feeGoalCents,offer.currency)}。</>}{offer.feeBasis==='statement'?'待填写账单结账日。':'待确认计算周期。'}</p>}
    </section>}
  </div>;
}
