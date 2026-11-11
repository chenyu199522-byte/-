import React,{useEffect,useRef,useState} from 'react';
import {AISettings} from './AIAssistant';
import ReferenceSites from './ReferenceSites';
import {Field,Modal,ErrorNote} from './ui';
import type {RewardState,RewardDdEvent} from '../../services/bank-rewards/types';
import type {AIConfig,AIResult} from '../../services/ai';
import {aiErrorMessage} from '../../services/ai';
import {money,ddRequirementLabel} from '../../services/bank-rewards/logic';
import {ddRecordsForSelection} from '../../services/bank-rewards/ddSelection';
import {rewardRepository} from '../../services/bank-rewards/repository';
type Checked={event:RewardDdEvent;name:string;currency:string;result?:AIResult;error?:string;status:'pending'|'running'|'done'|'error'};
const verdicts={supported:'找到支持线索',unsupported:'找到不支持线索',mixed:'资料存在分歧',unknown:'待核实'};
export default function DDActivityCheck({state,onSaved}:{state:RewardState;onSaved:(s:RewardState)=>void}) {
 const [config,setConfig]=useState<AIConfig>({providers:[],hasSearchKey:false}),[provider,setProvider]=useState(''),[settings,setSettings]=useState(false);
 const [offerId,setOfferId]=useState(''),[scope,setScope]=useState<'activity'|'bank'|'all'>('activity'),[error,setError]=useState('');
 const [missing,setMissing]=useState<RewardDdEvent[]>([]),[notes,setNotes]=useState<Record<string,string>>({}),[saving,setSaving]=useState(false);
 const [busy,setBusy]=useState(false),[results,setResults]=useState<Checked[]>([]),[stopped,setStopped]=useState(false);
 const stop=useRef(false),inFlight=useRef(false);
 const refresh=()=>window.goldenFleece.aiRead().then(c=>{setConfig(c);setProvider(id=>c.providers.some(p=>p.id===id)?id:c.providers[0]?.id||'');}).catch(e=>setError(aiErrorMessage(e)));
 useEffect(()=>{void refresh();return()=>{stop.current=true;if(inFlight.current)void window.goldenFleece.aiCancel();};},[]);
 const records=ddRecordsForSelection(state,offerId,scope);
 const info=(event:RewardDdEvent,s=state)=>{const a=s.accounts.find(a=>a.id===event.accountId)!;const o=s.offers.find(o=>o.id===a.offerId)!;return {a,o,name:[o.bankName,o.productName,a.name].filter(Boolean).join(' · ')};};
 const reset=()=>{setResults([]);setError('');setStopped(false);};
 async function check(events:RewardDdEvent[],snapshot:RewardState) {
  if(inFlight.current)return;inFlight.current=true;stop.current=false;setStopped(false);setBusy(true);setError('');
  setResults(events.map(event=>({event,name:info(event,snapshot).name,currency:info(event,snapshot).o.currency,status:'pending'})));
  try{for(const event of events){if(stop.current)break;setResults(old=>old.map(r=>r.event.id===event.id?{...r,status:'running'}:r));
   const {o}=info(event,snapshot);
   try{const result=await window.goldenFleece.aiRun({kind:'dd',providerId:provider,query:[o.bankName,o.productName].filter(Boolean).join(' · '),sourceNote:event.sourceNote,date:event.date,requirements:[ddRequirementLabel(o),o.requirements,o.sourceUrl].filter(Boolean).join('\n')});if(stop.current)break;setResults(old=>old.map(r=>r.event.id===event.id?{...r,result,status:'done'}:r));}
   catch(e){if(stop.current)break;setResults(old=>old.map(r=>r.event.id===event.id?{...r,error:aiErrorMessage(e),status:'error'}:r));}
  }}finally{inFlight.current=false;setBusy(false);if(stop.current){setStopped(true);setResults(old=>old.map(r=>r.status==='running'?{...r,status:'pending'}:r));}}
 }
 function start(){if(busy||!provider||!records.length)return;reset();const absent=records.filter(e=>!e.sourceNote.trim());if(absent.length){setNotes(Object.fromEntries(absent.map(e=>[e.id,''])));setMissing(absent);}else void check(records,state);}
 async function saveNotes(){if(saving)return;setError('');if(missing.some(e=>!notes[e.id]?.trim())){setError('请补全每笔 DD 的来源备注。');return;}setSaving(true);try{const updated=await rewardRepository.saveDdSources(state.userId,missing.map(e=>({id:e.id,note:notes[e.id]})));onSaved(updated);setMissing([]);await check(ddRecordsForSelection(updated,offerId,scope),updated);}catch(e){setError(aiErrorMessage(e));}finally{setSaving(false);}}
 return <div className="br-dd-check">
  <div className="br-evidence-title"><h2>按活动检查 DD</h2><button onClick={()=>setSettings(true)} disabled={busy}>AI 设置</button></div>
  <p className="br-hint">选定范围后逐笔查询工资 DD。缺少来源备注时先补填；借记卡、信用卡消费和存款余额不参与此检查。</p>
  <ErrorNote error={missing.length?'':error}/>
  <fieldset disabled={busy} className="br-ai-fields"><div className="br-form-grid">
   <Field label="本次使用的 AI"><select value={provider} onChange={e=>{setProvider(e.target.value);reset();}}><option value="">请选择 AI 服务</option>{config.providers.map(p=><option value={p.id} key={p.id}>{p.name} · {p.model}</option>)}</select></Field>
   <Field label="选择活动"><select disabled={scope==='all'} value={offerId} onChange={e=>{setOfferId(e.target.value);reset();}}><option value="">请选择要检查的活动</option>{state.offers.filter(o=>o.activityType!=='long_term').map(o=><option key={o.id} value={o.id}>{o.bankName} · {o.productName||'未注明活动'}{o.archived?'（已归档）':''}</option>)}</select></Field>
   <Field label="检测范围"><select value={scope} onChange={e=>{setScope(e.target.value as typeof scope);reset();}}><option value="activity">仅所选活动的全部 DD</option><option value="bank">同一家银行全部活动的 DD</option><option value="all">所有活动的全部 DD</option></select></Field>
  </div></fieldset>
  <p className="br-hint">{offerId||scope==='all'?`共 ${records.length} 笔 DD，${records.filter(e=>!e.sourceNote.trim()).length} 笔待补来源备注。`:'请先选择活动。'}逐笔查询会使用所选服务的 API；结果供核对，不会自动修改达标状态。</p>
  <div className="br-actions"><button className="br-primary" disabled={busy||!provider||!records.length} onClick={start}>{busy?`正在检查 · ${results.filter(r=>r.status==='done'||r.status==='error').length}/${results.length}`:`检测全部 ${records.length} 笔 DD`}</button>{busy&&<button onClick={()=>{stop.current=true;void window.goldenFleece.aiCancel();}}>停止检测</button>}</div>
  {stopped&&<p role="status">已停止，已完成的结果保留，剩余记录未检测。</p>}
  <div className="br-dd-check-results">{results.map(r=><article className="br-section" key={r.event.id}><h3>{r.event.date} · {money(r.event.amountCents,r.currency)} · {r.name}</h3><p>{r.event.sourceNote}</p><strong>{r.result?verdicts[r.result.verdict]:r.status==='running'?'正在查询…':r.error?'查询失败':'待检测'}</strong>{r.error&&<p role="alert">{r.error}</p>}{r.result&&<><p>{r.result.summary}</p><ul>{r.result.uncertainties.map((s,i)=><li key={i}>{s}</li>)}</ul><details><summary>查看依据与检索情况</summary>{r.result.citations.map((c,i)=><blockquote key={i}><p>{c.quote}</p><a href={c.url} target="_blank" rel="noreferrer">{c.title}</a></blockquote>)}{r.result.failures.map((f,i)=><p key={i}>{f}</p>)}</details></>}</article>)}</div>
  <ReferenceSites kind="dd" state={state} showAI={false}/>
  {!!missing.length&&<Modal title="补充 DD 来源备注" onClose={()=>{if(!saving){setMissing([]);setError('');}}} wide><p className="br-hint">填写发起银行、工资平台或转账方式，AI 才能核对是否符合条件。</p><ErrorNote error={error}/><div className="br-dd-missing">{missing.map((event,i)=><section key={event.id}><p>{event.date} · {money(event.amountCents,info(event).o.currency)} · {info(event).name}</p><Field label={`第 ${i+1} 笔来源备注`}><textarea disabled={saving} value={notes[event.id]||''} maxLength={1000} onChange={e=>setNotes(old=>({...old,[event.id]:e.target.value}))} placeholder="例如 Uber 工资入账、Chase ACH push"/></Field></section>)}</div><footer className="br-modal-footer"><button disabled={saving} onClick={()=>setMissing([])}>取消</button><button className="br-primary" disabled={saving} onClick={saveNotes}>{saving?'正在保存并检测…':'保存备注并开始检测'}</button></footer></Modal>}
  {settings&&<AISettings onClose={()=>{setSettings(false);void refresh();}}/>}
 </div>;
}
