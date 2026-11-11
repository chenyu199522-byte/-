import React,{useRef,useState} from 'react';
import type {RewardAccount,RewardOffer,RewardState,NewAccountRecord} from '../../services/bank-rewards/types';
import {rewardRepository} from '../../services/bank-rewards/repository';
import {todayISO} from '../../services/bank-rewards/logic';
import {Modal,Field,DateField,NumberField,ErrorNote} from './ui';

type Draft=Omit<NewAccountRecord,'amountCents'> & {amountCents:number|null};
export default function BatchRecordDialog({userId,offer,account,initialKind,onClose,onSaved}:{userId:string;offer:RewardOffer;account:RewardAccount;initialKind:'dd'|'balance';onClose:()=>void;onSaved:(s:RewardState)=>void}) {
 const [rows,setRows]=useState<Draft[]>(()=>[{id:crypto.randomUUID(),kind:initialKind,date:todayISO(),amountCents:null,note:''}]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);const submitting=useRef(false);
 const change=(id:string,patch:Partial<Draft>)=>setRows(old=>old.map(r=>r.id===id?{...r,...patch}:r));
 const close=()=>{if(!submitting.current)onClose();};
 const add=()=>setRows(old=>{const last=old.at(-1)!;return [...old,{id:crypto.randomUUID(),kind:last.kind,date:last.date,amountCents:null,note:last.note}];});
 const save=async(e:React.FormEvent)=>{
  e.preventDefault();if(submitting.current)return;setError('');
  const missing=rows.findIndex(r=>r.amountCents===null);
  if(missing>=0){setError(rows.length===1&&rows[missing].kind==='balance'?'请填写当天实际存款余额。':`第 ${missing+1} 笔请填写金额。`);return;}
  submitting.current=true;setBusy(true);
  try{const result=await rewardRepository.saveRecordBatch(userId,account.id,rows as NewAccountRecord[]);onSaved(result);onClose();}
  catch(e){setError((e as Error).message);}finally{submitting.current=false;setBusy(false);}
 };
 return <Modal title={initialKind==='balance'?'添加存款记录':offer.depositGoalCents?'记录 DD / 消费 / 存款':'工资 DD / 卡片消费'} onClose={close} wide={rows.length>1}>
  <form onSubmit={save}>
   <p className="br-hint">{offer.bankName} · {offer.productName} · {offer.currency}</p>
   <ErrorNote error={error}/>
   <div className="br-batch-records" data-multiple={rows.length>1}>
    {rows.map((row,index)=><fieldset className="br-batch-entry" key={row.id} disabled={busy} aria-label={`第 ${index+1} 笔记录`}>
     {rows.length>1&&<div className="br-batch-heading"><strong>第 {index+1} 笔</strong><button type="button" aria-label={`删除第 ${index+1} 笔`} onClick={()=>setRows(old=>old.filter(r=>r.id!==row.id))}>删除</button></div>}
     <div className="br-form-grid">
      <Field label="记录类型"><select value={row.kind} onChange={e=>change(row.id,{kind:e.target.value as Draft['kind'],amountCents:null})}><option value="dd">工资直接存款</option><option value="debit">借记卡消费</option><option value="credit">信用卡消费</option>{!!offer.depositGoalCents&&<option value="balance">存款余额</option>}</select></Field>
      <DateField label={row.kind==='balance'?'余额日期 *':row.kind==='dd'?'DD 到账日期 *':'消费日期 *'} value={row.date} onChange={v=>change(row.id,{date:v||''})}/>
      <NumberField label={row.kind==='balance'?'当天存款余额 *':row.kind==='dd'?'到账金额 *':'消费金额 *'} money value={row.amountCents} onChange={v=>change(row.id,{amountCents:v})}/>
      <Field label="来源 / 备注"><input value={row.note} onChange={e=>change(row.id,{note:e.target.value})} placeholder={row.kind==='balance'?'例如新资金存入、余额调整':row.kind==='dd'?'例如工资来源':'例如商户名称'}/></Field>
     </div>
     {row.kind==='balance'&&<p className="br-hint">填写当天实际余额，不是本次转入金额。同一天只保留一条余额记录；已有记录请用“修改金额”更正。</p>}
    </fieldset>)}
   </div>
   <div className="br-batch-add"><button type="button" onClick={add} disabled={busy||rows.length>=100}>＋ 再加一笔</button><span>共 {rows.length} 笔 · 可混合不同类型</span></div>
   <footer className="br-modal-footer"><button type="button" onClick={close} disabled={busy}>取消</button><button className="br-primary" disabled={busy}>{busy?'正在保存…':rows.length>1?`保存全部 ${rows.length} 笔`:'保存记录'}</button></footer>
  </form>
 </Modal>;
}
