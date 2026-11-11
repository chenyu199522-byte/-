import React,{useEffect,useState} from 'react';
import {Field,Modal,ErrorNote} from './ui';
import type {RewardState,RewardOffer} from '../../services/bank-rewards/types';
import type {AIProvider,AIConfig,AIResult} from '../../services/ai';
import {aiErrorMessage,fieldLabels,offerFromAI,offerFromAIProposal,displayAIField,displayAIUncertainty} from '../../services/ai';

const blank=()=>({id:'',name:'',protocol:'openai' as AIProvider['protocol'],endpoint:'https://api.openai.com/v1',model:'',key:''});
const defaults={openai:'https://api.openai.com/v1',compatible:'https://api.openai.com/v1',anthropic:'https://api.anthropic.com/v1',gemini:'https://generativelanguage.googleapis.com/v1beta'};
export function AISettings({onClose}:{onClose:()=>void}) {
  const [quickKey,setQuickKey]=useState(''),[advanced,setAdvanced]=useState(false),[modelTarget,setModelTarget]=useState(''),[modelList,setModelList]=useState<string[]>([]),[selectedModel,setSelectedModel]=useState('');
  const [config,setConfig]=useState<AIConfig>({providers:[],hasSearchKey:false}),[draft,setDraft]=useState(blank),
    [searchKey,setSearchKey]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{window.goldenFleece.aiRead().then(setConfig).catch(e=>setError(aiErrorMessage(e)));},[]);
  async function save(input:unknown) {setBusy(true);setError('');setMessage('');
    try{setConfig(await window.goldenFleece.aiSave(input));setDraft(blank());setSearchKey('');setMessage('已保存到本机。');}
    catch(e){setError(aiErrorMessage(e));}finally{setBusy(false);}}
  async function connect(input:{key?:string;providerId?:string;model?:string}){
    setBusy(true);setError('');setMessage('');
    try{const result=await window.goldenFleece.aiConnect(input);setConfig(result.config);setQuickKey('');setModelTarget('');setMessage('连接成功，已使用 '+result.model+'。');}
    catch(e){setError(aiErrorMessage(e));}finally{setBusy(false);}
  }
  async function chooseModel(p:AIProvider){
    setBusy(true);setError('');setMessage('');
    try{const list=await window.goldenFleece.aiModels(p.id);setModelList(list);setSelectedModel(list.includes(p.model)?p.model:list[0]);setModelTarget(p.id);}
    catch(e){setError(aiErrorMessage(e));}finally{setBusy(false);}
  }
  return <Modal title="AI 服务设置" onClose={onClose} wide><div className="br-ai">
    <p className="br-hint">填入 OpenAI 密钥即可连接，软件自动选择可用模型。密钥加密保存在本机，不包含在分享包内。</p>
    <section className="br-section"><h3>连接 OpenAI</h3><Field label="OpenAI API 密钥"><input type="password" autoComplete="off" value={quickKey} onChange={e=>setQuickKey(e.target.value)} placeholder="粘贴密钥即可，无需填写模型名称"/></Field>
      <p className="br-hint">连接时会读取模型列表，并发送一次简短请求验证能否使用。</p><button className="br-primary" disabled={busy||!quickKey.trim()} onClick={()=>connect({key:quickKey})}>{busy?'正在连接…':'连接并使用'}</button>
    </section>
    {modelTarget&&<section className="br-section"><Field label="可用模型"><select disabled={busy} value={selectedModel} onChange={e=>setSelectedModel(e.target.value)}>{modelList.map(id=><option key={id} value={id}>{id}</option>)}</select></Field><div className="br-actions"><button disabled={busy} onClick={()=>connect({providerId:modelTarget,model:selectedModel})}>使用此模型</button><button disabled={busy} onClick={()=>setModelTarget('')}>取消选择</button></div></section>}

    <div className="br-ai-providers">{config.providers.map(p=><div key={p.id}><span><strong>{p.name}</strong><small>{p.model} · {new URL(p.endpoint).hostname}</small></span>
      {p.protocol==='openai'&&p.endpoint==='https://api.openai.com/v1'&&<button disabled={busy} onClick={()=>chooseModel(p)}>更换模型</button>}
      <button disabled={busy} onClick={()=>{setDraft({...p,key:''});setAdvanced(true);setMessage('');}}>编辑</button>
      <button disabled={busy} onClick={async()=>{setBusy(true);try{setConfig(await window.goldenFleece.aiRemove(p.id));if(draft.id===p.id)setDraft(blank());}catch(e){setError(aiErrorMessage(e));}finally{setBusy(false);}}}>移除</button></div>)}</div>
    <button disabled={busy} aria-expanded={advanced} onClick={()=>setAdvanced(!advanced)}>{advanced?'收起高级设置':'其他服务 / 高级设置'}</button>
    {advanced&&<><section className="br-section"><h3>{draft.id?'编辑服务':'添加服务'}</h3><div className="br-form-grid">
      <Field label="服务名称"><input value={draft.name} maxLength={80} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="例如我的 AI 服务"/></Field>
      <Field label="API 类型"><select value={draft.protocol} onChange={e=>{const protocol=e.target.value as AIProvider['protocol'];setDraft({...draft,protocol,endpoint:defaults[protocol],key:''});}}>
        <option value="openai">OpenAI（含联网搜索）</option><option value="compatible">其他 OpenAI 兼容接口</option><option value="anthropic">Claude / Anthropic</option><option value="gemini">Gemini</option></select></Field>
      <Field label="API 基础地址"><input value={draft.endpoint} onChange={e=>setDraft({...draft,endpoint:e.target.value})} placeholder="https://…/v1"/></Field>
      <Field label="模型名称" hint="服务名称用于显示，可随意命名；这里必须填写服务商提供的完整模型 ID。"><input value={draft.model} onChange={e=>setDraft({...draft,model:e.target.value})} placeholder="填写完整模型 ID，不能使用自定义简称"/></Field>
      <Field label="API 密钥"><input type="password" autoComplete="off" value={draft.key} onChange={e=>setDraft({...draft,key:e.target.value})} placeholder={draft.id?'留空保留当前密钥':'填写自己的 API Key'}/></Field>
    </div><div className="br-actions"><button className="br-primary" disabled={busy} onClick={()=>save({provider:draft})}>保存 AI 服务</button>{draft.id&&<button onClick={()=>setDraft(blank())}>取消编辑</button>}</div></section>
    <section className="br-section"><h3>增强网页搜索（可选）</h3><p className="br-hint">OpenAI 类型使用自带联网搜索；其他类型默认读取九个参考网站及相关活动页面。配置 Tavily 搜索密钥后，会额外在这些网站内搜索具体银行和 DD 来源，帮助找到更深层的页面。AI 模型密钥和搜索密钥分别填写。</p>
      <Field label="Tavily 搜索密钥"><input type="password" autoComplete="off" value={searchKey} onChange={e=>setSearchKey(e.target.value)} placeholder={config.hasSearchKey?'已保存，可填入新密钥更换':'可选，未配置也能查询'}/></Field>
      <div className="br-actions"><button disabled={busy||!searchKey.trim()} onClick={()=>save({searchKey})}>保存搜索密钥</button>{config.hasSearchKey&&<button disabled={busy} onClick={()=>save({searchKey:''})}>移除搜索密钥</button>}</div>
    </section></>}<ErrorNote error={error}/>{message&&<p role="status">{message}</p>}
    <p className="br-hint">查询会向选定服务发送当前银行、活动条件及你选中的 DD 来源备注；不会发送全部账目或截图。API 用量按服务商规则计费。</p>
  </div></Modal>;
}
const verdictLabels={supported:'找到支持线索',unsupported:'找到不支持线索',mixed:'资料存在分歧',unknown:'待核实'};
export default function AIAssistant({kind,state,onDraft}:{kind:'offer'|'dd';state:RewardState;onDraft?:(offer:RewardOffer)=>void}) {
  const [config,setConfig]=useState<AIConfig>({providers:[],hasSearchKey:false}),[providerId,setProviderId]=useState(''),
    [settings,setSettings]=useState(false),[query,setQuery]=useState(''),[source,setSource]=useState(''),[eventId,setEventId]=useState(''),
    [offerId,setOfferId]=useState(''),[result,setResult]=useState<AIResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const offer=state.offers.find(o=>o.id===offerId);
  const records=state.ddEvents.filter(e=>!e.kind||e.kind==='dd');
  const refresh=()=>window.goldenFleece.aiRead().then(c=>{setConfig(c);setProviderId(id=>c.providers.some(p=>p.id===id)?id:c.providers[0]?.id||'');}).catch(e=>setError(aiErrorMessage(e)));
  useEffect(()=>{void refresh();},[]);
  useEffect(()=>()=>{void window.goldenFleece.aiCancel();},[]);
  const clear=()=>{setResult(null);setError('');};
  async function run(){setBusy(true);clear();
    try{setResult(await window.goldenFleece.aiRun({kind,providerId,query,sourceNote:source,requirements:offer?.requirements||'',
      date:state.ddEvents.find(e=>e.id===eventId)?.date}));}
    catch(e){setError(aiErrorMessage(e));}finally{setBusy(false);}}
  return <section className="br-ai">
    <div className="br-evidence-title"><h2>{kind==='offer'?'AI 一键填写活动':'AI 查询 DD 条件'}</h2><button onClick={()=>setSettings(true)}>AI 设置</button></div>
    <p className="br-hint">{kind==='offer'?'粘贴银行活动详情链接，AI 读取页面并填写条件。同一页面有多档奖励时分别展示，选择你要参加的一档。':'选择一笔工资 DD，自动带入银行和来源备注，也可手动填写。查询依据来自下面九个网站。'}</p>
    <fieldset disabled={busy} className="br-ai-fields"><div className="br-form-grid">
      <Field label="本次使用的 AI"><select value={providerId} onChange={e=>{setProviderId(e.target.value);clear();}}><option value="">请选择 AI 服务</option>{config.providers.map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></Field>
      {kind==='dd'&&<Field label="从已有 DD 带入"><select value={eventId} onChange={e=>{
        const id=e.target.value,event=state.ddEvents.find(x=>x.id===id),account=state.accounts.find(a=>a.id===event?.accountId),o=state.offers.find(o=>o.id===account?.offerId);
        setEventId(id);setOfferId(o?.id||'');setQuery(o?[o.bankName,o.productName].filter(Boolean).join(' · '):'');setSource(event?.sourceNote||'');clear();
      }}><option value="">手动填写</option>{records.map(e=>{const a=state.accounts.find(a=>a.id===e.accountId),o=state.offers.find(o=>o.id===a?.offerId);return <option key={e.id} value={e.id}>{o?.bankName} · {e.date} · {e.sourceNote||'未填写来源'}</option>;})}</select></Field>}
      <Field label={kind==='offer'?'银行活动链接':'银行 / 活动'}><input maxLength={2000} type={kind==='offer'?'url':'text'} value={query} onChange={e=>{setQuery(e.target.value);setOfferId('');clear();}} placeholder={kind==='offer'?'https://银行官网/活动页面':'例如 Stanford FCU 开户奖励'}/></Field>
      {kind==='dd'&&<Field label="DD 来源 / 备注"><textarea maxLength={1000} value={source} onChange={e=>{setSource(e.target.value);clear();}} placeholder="例如发起银行、工资平台、转账方式、push / pull"/></Field>}
    </div></fieldset>
    <p className="br-hint">{kind==='offer'?'将把这一个活动页面的文字交给所选 AI 整理。读取在后台完成，不登录银行或提交开户申请。':'将发送上述内容给所选 AI 服务。检索受网站访问限制影响；用户经验不等于银行承诺，查询不会修改达标记录。'}</p>
    <div className="br-actions"><button className="br-primary" disabled={busy||!providerId||!query.trim()||(kind==='dd'&&!source.trim())} onClick={run}>{busy?'正在查询网页并整理依据…':kind==='offer'?'查询并生成草稿':'查询 DD 条件'}</button>
      {busy&&<button onClick={()=>window.goldenFleece.aiCancel()}>取消查询</button>}</div>
    <ErrorNote error={error}/>
    {result&&<div className="br-ai-result" aria-live="polite"><header><h3>{kind==='dd'?verdictLabels[result.verdict]:'查询结果 · 待确认草稿'}</h3><small>{result.provider} · {new Date(result.checkedAt).toLocaleString()}</small></header>
      <p className="br-ai-summary">{result.summary}</p>
      {!!result.proposals?.length&&<div className="br-ai-proposals">{result.proposals.map((proposal,i)=><section className="br-section" key={i}><h3>{proposal.name}</h3><p>{proposal.summary}</p>
        <dl className="br-ai-values">{Object.entries(proposal.fields).map(([field,value])=><div key={field}><dt>{fieldLabels[field]||field}</dt><dd>{displayAIField(field,value,proposal.fields.currency)}</dd></div>)}</dl>
        <ul>{proposal.uncertainties.map((t,j)=><li key={j}>{displayAIUncertainty(t)}</li>)}</ul>
        <details><summary>查看这档活动的原文依据（{proposal.citations.length}）</summary>{proposal.citations.map((c,j)=><blockquote key={j}><b>{fieldLabels[c.field||'']}</b><p>{c.quote}</p><a href={c.url} target="_blank" rel="noreferrer">{c.title}</a></blockquote>)}</details>
        <button className="br-primary" disabled={!proposal.citations.length||!Object.keys(proposal.fields).length} onClick={()=>{try{onDraft?.(offerFromAIProposal(result,proposal,state.userId));}catch(e){setError('草稿条件需要核实：'+e.message);}}}>填写此活动：{proposal.name}</button>
      </section>)}</div>}
      {kind==='offer'&&!result.proposals&&<dl className="br-ai-values">{Object.entries(result.fields).map(([field,value])=><div key={field}><dt>{fieldLabels[field]||field}</dt><dd>{displayAIField(field,value,result.fields.currency)}</dd></div>)}</dl>}
      {!!result.uncertainties.length&&<ul>{result.uncertainties.map((text,i)=><li key={i}>{displayAIUncertainty(text)}</li>)}</ul>}
      {!!result.citations.length&&<details open><summary>可核对的原文依据（{result.citations.length}）</summary>{result.citations.map((c,i)=><blockquote key={i}><p>{c.field&&<b>{fieldLabels[c.field]||c.field} · </b>}{c.quote}</p><a href={c.url} target="_blank" rel="noreferrer">{c.title}</a></blockquote>)}</details>}
      {result.pageText&&<details><summary>查看读取的网页原文（所有奖励档位）</summary><p className="br-ai-summary">{result.pageText}</p></details>}
      <details><summary>检索范围与未读到的网页</summary><ul>{result.sources.map((s,i)=><li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> · {s.retrieval}</li>)}{result.failures.map((f,i)=><li key={'f'+i}>{f}</li>)}</ul></details>
      {kind==='offer'&&!result.proposals&&<div className="br-actions"><button className="br-primary" disabled={!result.citations.length||!Object.keys(result.fields).length} onClick={()=>{try{onDraft?.(offerFromAI(result,state.userId));}catch(e){setError('草稿中有不适用的条件：'+e.message+' 请重新查询，或手动填写。');}}}>填入新增活动表单</button></div>}
    </div>}
    {settings&&<AISettings onClose={()=>{setSettings(false);void refresh();}}/>}
  </section>;
}
