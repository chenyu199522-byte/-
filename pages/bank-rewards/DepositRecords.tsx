import React,{useState} from 'react';
import type {RewardAccount,RewardOffer,RewardState} from '../../services/bank-rewards/types';
import {rewardRepository as repo} from '../../services/bank-rewards/repository';
import {money,todayISO} from '../../services/bank-rewards/logic';
import {DateField,NumberField,Field,ErrorNote} from './ui';

export default function DepositRecords({userId,account:a,offer:o,onSaved}:{userId:string;account:RewardAccount;offer:RewardOffer;onSaved:(s:RewardState)=>void}) {
  const [kind,setKind]=useState<'balance'|'transaction'>(o.depositGoalCents?'balance':'transaction');
  const [rowId,setRowId]=useState(''),[date,setDate]=useState<string|null>(todayISO()),[amount,setAmount]=useState<number|null>(null),[note,setNote]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const run=async(action:()=>Promise<RewardState>)=>{if(busy)return;setBusy(true);setError('');try{onSaved(await action());setRowId('');setAmount(null);setNote('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const balances=[...(a.depositBalances||[])].sort((x,y)=>y.date.localeCompare(x.date));
  const transactions=[...(a.qualifyingTransactions||[])].sort((x,y)=>y.date.localeCompare(x.date));
  return <section className="br-record-editor" aria-label="存款与合格交易记录">
    <h3>存款与合格交易记录</h3><ErrorNote error={error}/>
    <p className="br-hint">余额填写当天账户里符合活动要求的金额，持续沿用至下一条余额记录。DD 不会自动计入余额。合格交易需按银行条款逐笔确认。</p>
    <div className="br-form-grid">
      <Field label="新增记录类型"><select value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setRowId('');setAmount(null);setNote('');}}>
        {!!o.depositGoalCents&&<option value="balance">合格资金余额</option>}
        {!!o.transactionGoal&&<option value="transaction">一笔合格交易</option>}
      </select></Field>
      <DateField label="记录日期" value={date} onChange={setDate}/>
      {kind==='balance'&&<NumberField label="当天合格资金余额" money value={amount} onChange={setAmount}/>}
      <Field label="记录说明"><input value={note} onChange={e=>setNote(e.target.value)} placeholder={kind==='balance'?'例如新资金存入、余额减少':'例如银行认可的借记卡消费'}/></Field>
    </div>
    <button disabled={busy} onClick={()=>run(()=>{
      if(!date)throw new Error('请选择日期。');
      if(kind==='balance'&&amount===null)throw new Error('请填写余额。');
      return kind==='balance'?repo.saveDepositBalance(userId,a.id,{id:rowId||crypto.randomUUID(),date,amountCents:amount!,note}):repo.saveQualifyingTransaction(userId,a.id,{id:rowId||crypto.randomUUID(),date,note});
    })}>{rowId?'保存修改':'添加记录'}</button>
    {rowId&&<button disabled={busy} onClick={()=>{setRowId('');setAmount(null);setNote('');}}>取消修改</button>}
    <div className="br-record-list">
      {[...balances.map(r=>({...r,kind:'balance' as const})),...transactions.map(r=>({...r,amountCents:0,kind:'transaction' as const}))].map(r=><div className="br-record-item" key={r.id}>
        <div><strong>{r.date} · {r.kind==='balance'?'余额 '+money(r.amountCents,o.currency):'合格交易 1 笔'}</strong><small>{r.note||'未填写说明'}</small></div>
        <div className="br-actions"><button disabled={busy} onClick={()=>{setKind(r.kind);setRowId(r.id);setDate(r.date);setAmount(r.amountCents);setNote(r.note);}}>编辑</button><button disabled={busy} onClick={()=>run(()=>r.kind==='balance'?repo.deleteDepositBalance(userId,a.id,r.id):repo.deleteQualifyingTransaction(userId,a.id,r.id))}>删除</button></div>
      </div>)}
    </div>
  </section>;
}
