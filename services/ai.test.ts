import {it,expect,afterEach} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {offerFromAI,offerFromAIProposal,aiErrorMessage} from './ai';
const require=createRequire(import.meta.url);
const {createAIService,modelCall,parseResult,sourceUrl,gather}=require('../ai-service.cjs');
const temps:string[]=[];
const control=new AbortController();
function setup(){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gf-ai-unit-'));temps.push(directory);
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s.split('').reverse().join('')),decryptString:(b:Buffer)=>b.toString().split('').reverse().join('')};
  return {directory,service:createAIService({directory,safeStorage,atomicWrite:fs.writeFileSync})};}
afterEach(()=>temps.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true})));
it('keeps multiple encrypted keys out of renderer settings and prevents implicit key migration',()=>{
 const {directory,service}=setup();
 let c=service.save({provider:{name:'First',protocol:'compatible',endpoint:'https://example.com/v1',model:'model',key:'secret-aaa'}});
 const first=c.providers[0];expect(JSON.stringify(c)).not.toContain('secret-aaa');
 expect(fs.readFileSync(path.join(directory,'ai-settings.json'),'utf8')).not.toContain('secret-aaa');
 c=service.save({provider:{name:'Second',protocol:'anthropic',endpoint:'https://api.anthropic.com/v1',model:'model2',key:'secret-bbb'}});
 expect(c.providers).toHaveLength(2);
 expect(()=>service.save({provider:{...first,endpoint:'https://other.example/v1',key:''}})).toThrow('重新填写密钥');
 expect(service.remove(first.id).providers).toHaveLength(1);
 expect(service.save({searchKey:'search-secret'}).hasSearchKey).toBe(true);
 expect(service.save({searchKey:''}).hasSearchKey).toBe(false);
});
it.each(['openai','compatible','anthropic','gemini'])('adapts %s without leaking keys into request bodies',async protocol=>{
 const calls:any[]=[];
 const fetcher=async(url:string,options:any)=>{calls.push({url,...options});
   const value=JSON.stringify({query:'Example Bank'});
   return new Response(JSON.stringify(protocol==='openai'?{output:[{content:[{type:'output_text',text:value}]}]}:protocol==='compatible'?{choices:[{message:{content:value}}]}:
     protocol==='anthropic'?{content:[{type:'text',text:value}]}:{candidates:[{content:{parts:[{text:value}]}}]}),{headers:{'content-type':'application/json'}});
 };
 expect(await modelCall({protocol,endpoint:'https://api.example/v1',model:'test'},'secret','system','prompt',control.signal,fetcher)).toEqual({query:'Example Bank'});
 expect(calls[0].body).not.toContain('secret');expect(calls[0].redirect).toBe('error');
});
it('refuses unsupported evidence and strips invented fields',()=>{
 const sources=[{url:'https://bankbonus.com/example',title:'Example',text:'Example bank requires $2,500 payroll each month.'}];
 const parsed=parseResult({fields:{ddAmountCents:{value:250000,source:1,quote:'requires $2,500 payroll each month.'},
  bonusCents:{value:999000,source:1,quote:'Free money for all'},userId:{value:'other',source:1,quote:'requires $2,500 payroll each month.'}},
  summary:'Summary'},sources,'offer');
 expect(parsed.fields).toEqual({ddAmountCents:250000});expect(parsed.citations).toHaveLength(1);
 expect(parseResult({verdict:'supported',evidence:[{source:99,quote:'invented'}]},sources,'dd').verdict).toBe('unknown');
 expect(sourceUrl('https://bankbonus.com.evil.example/')).toBeNull();
 expect(sourceUrl('https://bankbonus.com@127.0.0.1/')).toBeNull();
 expect(sourceUrl('file:///secrets')).toBeNull();
});
it('generates an isolated validated draft and retains missing cycle boundaries as unconfigured',()=>{
 const result:any={fields:{bankName:'Example Bank',bonusCents:52500,ddAmountCents:250000,cycleDebitCents:100000,rewardCycleCount:3},
 citations:[{field:'bonusCents',url:'https://bankbonus.com/example',title:'Example',quote:'reward amount'}],
 uncertainties:['Membership needs review'],summary:'Test draft',checkedAt:'2026-11-11T00:00:00Z',provider:'Test',pageText:'Full original page terms: maintain $5000 through day 90.'};
 const o=offerFromAI(result,'local');expect(o.id).toBe('');expect(o.cycleBasis).toBe('custom');expect(o.notes).toContain('Membership needs review');expect(o.sourceUrl).toContain('bankbonus');expect(o.notes).toContain('maintain $5000 through day 90');
 expect(()=>offerFromAI({...result,fields:{...result.fields,currency:'invalid'}},'local')).toThrow('币种');
});
it('follows relevant bank links but never follows redirects outside the reference sites',async()=>{
 const visited:string[]=[];
 const fetcher=async(url:string)=>{visited.push(url);
   if(url.startsWith('https://bankbonus.com/')&&url!=='https://bankbonus.com/example-bank')
     return new Response('<title>Banks</title><a href="/example-bank">Example Bank offer</a>'+('Browse banks. '.repeat(15)),{headers:{'content-type':'text/html'}});
   if(url==='https://bankbonus.com/example-bank')return new Response('<title>Example</title>'+('Example Bank qualifying payroll $2500. '.repeat(15)),{headers:{'content-type':'text/html'}});
   return new Response('',{status:302,headers:{location:'https://unrelated.example/secret'}});
 };
 const r=await gather('Example Bank',null,control.signal,fetcher);
 expect(r.sources.some((s:any)=>s.url==='https://bankbonus.com/example-bank')).toBe(true);
 expect(visited.some(url=>url.includes('unrelated.example'))).toBe(false);expect(r.failures.length).toBeGreaterThan(0);
});
it('reports HTTP authorization failures without echoing a provider response or key',async()=>{
 await expect(modelCall({protocol:'compatible',endpoint:'https://api.example/v1',model:'x'},'secret','s','p',control.signal,
   async()=>new Response('secret',{status:401}))).rejects.toThrow('授权失败');
});

it('rejects a DD conclusion based on another bank or missing the transfer source',()=>{
 const sources=[{url:'https://bonushq.io/teachers',title:'Teachers Credit Union',text:'Teachers accepts Uber payroll to qualify.'},
 {url:'https://bankbonus.com/stanford',title:'Stanford Federal Credit Union',text:'Stanford requires $2500 payroll deposits.'}];
 const raw={verdict:'supported',summary:'Should not survive',evidence:[{source:1,quote:'Teachers accepts Uber payroll to qualify.'}]};
 expect(parseResult(raw,sources,'dd',{bank:'Stanford Federal Credit Union',origin:'Uber'}).verdict).toBe('unknown');
 expect(parseResult({...raw,evidence:[{source:2,quote:'Stanford requires $2500 payroll deposits.'}]},sources,'dd',{bank:'Stanford Federal Credit Union',origin:'Uber'}).verdict).toBe('unknown');
});
it('does not turn balance-holding days into a safe account closure date',()=>{
 const sources=[{url:'https://example.com/offer',title:'Bank offer',text:'Maintain a $5,000 balance from day 46 through 90.'}];
 expect(parseResult({fields:{minHoldDays:{value:45,source:1,quote:'Maintain a $5,000 balance from day 46 through 90.'}}},sources,'offer').fields).toEqual({});
});
it('allows public HTTPS offer pages and rejects loopback or private destinations',async()=>{
 const {publicUrl,publicAddress}=require('../web-reader.cjs');
 expect(await publicUrl('https://bank.example/offer',async()=>[{address:'8.8.8.8'}])).toBe('https://bank.example/offer');
 for(const url of ['http://bank.example','https://127.0.0.1/','https://10.1.2.3/','https://localhost/','https://a.local/','https://bank.example:8443/','file:///x'])
   await expect(publicUrl(url,async()=>[{address:'8.8.8.8'}])).rejects.toThrow();
 await expect(publicUrl('https://bank.example',async()=>[{address:'192.168.1.1'}])).rejects.toThrow();
 expect(publicAddress('::1')).toBe(false);expect(publicAddress('fc00::1')).toBe(false);
});

it('does not interpret funding within 30 days as an opening-day balance requirement and preserves month-end payout anchoring',()=>{
 const quote='Deposit within 30 days of account open. Maintain through the 60th day. Bonus within 30 days after the month-end in which all offer requirements are met.';
 const parsed=parseResult({fields:{depositHoldBasis:{value:'opening',quote},depositStartOffsetDays:{value:0,quote:'Deposit within 30 days of account open.'},depositEndOffsetDays:{value:60,quote},depositHoldDays:{value:60,quote},payoutDays:{value:30,quote},payoutAnchor:{value:'qualification',quote}}},[{title:'Test',url:'https://example.com',text:quote}],'offer');
 expect(parsed.fields).toEqual({depositHoldBasis:'opening',depositEndOffsetDays:60,payoutDays:30,payoutAnchor:'qualification_month_end'});
});

it('normalizes quoted opening-based balance duration instead of starting another holding period after funding',()=>{
 const quote='Deposit at least $25,000 in new money within 30 days of account open, maintain at least that balance5 for 60 days after opening the account and complete six qualifying transactions.';
 const r=parseResult({fields:{depositGoalCents:{value:2500000,quote},depositHoldDays:{value:60,quote}}},[{title:'Test',url:'https://example.com',text:quote}],'offer');
 expect(r.fields).toEqual({depositGoalCents:2500000,depositHoldBasis:'opening',depositEndOffsetDays:60});
});

it('retains a quoted combined DD minimum when the model omits that field',()=>{
 const quote='Deposit Direct Deposits or other qualifying transactions into your Checking Account in a combined total of $3,000 within 45 calendar days.';
 const r=parseResult({fields:{requirements:{value:'合格入账 3000 美元',quote}}},[{title:'Test',url:'https://example.com',text:quote}],'offer');
 expect(r.fields.ddAmountCents).toBe(300000);expect(r.fields.ddCount).toBeUndefined();
});
it('does not invent monthly assessment periods from a single offer',()=>{
 const quote='Deposit $5,000 within 30 days and maintain it for 60 days.';
 const r=parseResult({fields:{rewardCycleCount:{value:1,quote},cycleBasis:{value:'opening',quote}}},[{title:'Test',url:'https://example.com',text:quote}],'offer');
 expect(r.fields.rewardCycleCount).toBeUndefined();expect(r.fields.cycleBasis).toBeUndefined();
});

it('explains model_not_found without echoing provider messages or secrets',async()=>{
 await expect(modelCall({protocol:'openai',endpoint:'https://api.example/v1',model:'GPT6'},'private-key','s','p',control.signal,
  async()=>new Response(JSON.stringify({error:{code:'model_not_found',message:'private-key should never be shown'}}),{status:404}))).rejects.toThrow('模型名称不存在或当前密钥无权使用');
});
it('distinguishes a missing API route from an inaccessible model',async()=>{
 await expect(modelCall({protocol:'compatible',endpoint:'https://api.example/v1',model:'m'},'private-key','s','p',control.signal,
  async()=>new Response('Proxy route not found',{status:404}))).rejects.toThrow('接口地址或 API 类型不匹配');
});
it('shows readable IPC errors in the AI panel',()=>{
 expect(aiErrorMessage(new Error("Error invoking remote method 'ai:run': Error: 模型名称不存在或当前密钥无权使用。"))).toBe('模型名称不存在或当前密钥无权使用。');
});

it('reports unusable JSON responses without crashing downstream forms',async()=>{
 for(const body of ['null','[]','"text"'])await expect(modelCall({protocol:'compatible',endpoint:'https://example.com/v1',model:'test'},'test','s','p',control.signal,
  async()=>new Response(JSON.stringify({choices:[{message:{content:body}}]})))).rejects.toThrow('AI 返回格式不正确');
});

it('connects with only a key, discovers a usable model and preserves the saved key outside renderer output',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gf-ai-unit-'));temps.push(directory);
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s),decryptString:(b:Buffer)=>b.toString()};
 const calls:any[]=[];
 const service=createAIService({directory,safeStorage,atomicWrite:fs.writeFileSync,fetcher:async(url:string,options:any)=>{
  calls.push({url,options});
  if(url.endsWith('/models'))return new Response(JSON.stringify({data:[{id:'gpt-image-1'},{id:'gpt-6-luna'},{id:'gpt-4.1-mini'}]}));
  return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'{"ok":true}'}]}]}));
 }});
 const result=await service.connect({key:'synthetic-private-key'});
 expect(result.model).toBe('gpt-6-luna');expect(result.config.providers[0].name).toBe('OpenAI');
 expect(JSON.stringify(result)).not.toContain('synthetic-private-key');
 expect(calls[0].options.method).toBe('GET');expect(calls[0].options.redirect).toBe('error');
 expect(await service.models(result.config.providers[0].id)).toEqual(['gpt-6-luna','gpt-4.1-mini']);
 expect((await service.connect({providerId:result.config.providers[0].id,model:'gpt-4.1-mini'})).model).toBe('gpt-4.1-mini');
 expect(service.view().providers).toHaveLength(1);
 await expect(service.connect({providerId:result.config.providers[0].id,model:'GPT6'})).rejects.toThrow('不在');
 expect(service.view().providers[0].model).toBe('gpt-4.1-mini');
});
it('does not save a key if model discovery or a real connection probe fails',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gf-ai-unit-'));temps.push(directory);
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:Buffer.from,decryptString:(b:Buffer)=>b.toString()};
 for(const fail of ['list','probe']) {
  const service=createAIService({directory,safeStorage,atomicWrite:fs.writeFileSync,fetcher:async(url:string)=>
   url.endsWith('/models')?fail==='list'?new Response('',{status:401}):new Response(JSON.stringify({data:[{id:'gpt-6-luna'}]})):new Response(JSON.stringify({error:{code:'model_not_found',message:'private-key'}}),{status:404})});
  await expect(service.connect({key:'private-key'})).rejects.toThrow();
  expect(service.view().providers).toHaveLength(0);expect(fs.existsSync(path.join(directory,'ai-settings.json'))).toBe(false);
 }
});
it('never sends a saved third-party key to OpenAI during model discovery',async()=>{
 const {service}=setup();
 const cfg=service.save({provider:{protocol:'compatible',endpoint:'https://other.example/v1',model:'x',name:'Other',key:'other-key'}});
 await expect(service.models(cfg.providers[0].id)).rejects.toThrow('仅用于');
 await expect(service.connect({providerId:cfg.providers[0].id})).rejects.toThrow('仅用于');
});
it('preserves combined DD total with a separate minimum deposit count from AI evidence',()=>{
 const quote='Receive at least 2 direct deposits totaling $5,000 within 60 days.';
 const item=(value:unknown)=>({value,source:1,quote});
 const r=parseResult({fields:{ddAmountMode:item('total'),ddAmountCents:item(500000),ddCount:item(2)}},[{url:'https://example.com/offer',title:'Offer',text:quote}],'offer');
 expect(r.fields).toMatchObject({ddAmountMode:'total',ddAmountCents:500000,ddCount:2});
 const offer=offerFromAI({...r,kind:'offer',provider:'Test',checkedAt:'2026-11-11T12:00:00Z'},'local');expect(offer.ddAmountMode).toBe('total');
});
it('preserves independently scheduled monthly transaction requirements from AI evidence',()=>{
 const quote='Complete 5 qualifying transactions each calendar month for 3 consecutive months.';
 const item=(value:unknown)=>({value,source:1,quote});
 const r=parseResult({fields:{transactionMode:item('periodic'),transactionGoal:item(5),transactionCycleBasis:item('calendar'),transactionCycleCount:item(3)}},[{url:'https://example.com/offer',title:'Offer',text:quote}],'offer');
 expect(r.fields).toMatchObject({transactionMode:'periodic',transactionGoal:5,transactionCycleBasis:'calendar',transactionCycleCount:3});
 const o=offerFromAI({...r,kind:'offer',provider:'Test',checkedAt:'2026-11-11T12:00:00Z'},'local');expect(o.transactionCycleCount).toBe(3);expect(o.rewardCycleCount).toBeFalsy();
});

it('routes an enhanced DD completion deadline to DD even if the model calls it a transaction deadline',()=>{
 const quote='Complete one or more Direct Deposits or other qualifying transactions with a minimum combined total of $3,000 into your Checking Account within 45 calendar days from the date you open your Checking Account.';
 const r=parseResult({fields:{ddAmountCents:{value:300000,quote},transactionDeadlineDays:{value:45,quote}}},[{title:'Offer',url:'https://example.com/offer',text:quote}],'offer');
 expect(r.fields.deadlineDays).toBe(45);expect(r.fields.transactionDeadlineDays).toBeUndefined();
});

it('preserves separate website tiers through API parsing and draft creation, tolerating a text uncertainty',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gf-ai-unit-'));temps.push(directory);
 const quote='Example Bank offers payroll each month for 3 consecutive months, a deposit hold, credit and debit spending, and monthly transactions. Receive at least 2 direct deposits totaling $5,000 within 60 days. Fee waived with payroll.';
 const tier={bankName:'Example Bank',productName:'Complete offer',currency:'USD',bonusCents:190000,ddAmountCents:500000,ddCount:2,ddAmountMode:'total',deadlineDays:60,cycleDebitCents:100000,cycleCreditCents:50000,rewardCycleCount:3,cycleBasis:'opening',depositGoalCents:1000000,depositDeadlineDays:30,depositHoldBasis:'funded',depositHoldMonths:3,rewardMode:'separate',ddBonusCents:40000,depositBonusCents:150000,transactionMode:'periodic',transactionGoal:5,transactionCycleBasis:'statement',transactionCycleCount:3,transactionStatementDay:15,monthlyFee:'25',feeGoalCents:500000,feeMetric:'dd',feeBasis:'statement',feeStatementDay:15,feeFreeCycles:2,payoutDays:15,payoutAnchor:'qualification',payoutTiming:'within',payoutDayUnit:'business',additionalConditions:'启用电子账单',promoCode:'TEST',requirements:'完整测试条款',feeNote:'测试免月费条件'};
 const raw={summary:'Two offers',uncertainties:'确认所在地区',offers:[{name:'完整档',fields:Object.fromEntries(Object.entries(tier).map(([k,value])=>[k,{value,quote,source:1}]))},{name:'低档',fields:{bankName:{value:'Example Bank',quote},bonusCents:{value:10000,quote}}}]};
 const service=createAIService({directory,atomicWrite:fs.writeFileSync,safeStorage:{isEncryptionAvailable:()=>true,encryptString:(v:string)=>Buffer.from(v),decryptString:(b:Buffer)=>b.toString()},readOfferPage:async()=>({url:'https://example.com/offer',title:'Test',text:quote,retrieval:'fixture'}),fetcher:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]}))});
 const cfg=service.save({provider:{name:'Test',protocol:'compatible',endpoint:'https://example.com/v1',model:'test',key:'synthetic'}});
 const result=await service.run({kind:'offer',providerId:cfg.providers[0].id,query:'https://example.com/offer'});
 expect(result.proposals).toHaveLength(2);expect(result.proposals[0].fields).toMatchObject(tier);expect(result.proposals[1].fields.bonusCents).toBe(10000);expect(result.proposals[1].fields.depositGoalCents).toBeUndefined();
 const draft=offerFromAIProposal(result,result.proposals[0],'local');expect(draft).toMatchObject(tier);expect(draft.sourceUrl).toBe('https://example.com/offer');expect(result.uncertainties).toContain('确认所在地区');expect(draft.notes).toContain('待核实：确认所在地区');
});
