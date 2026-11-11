import {it,expect,afterEach} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {offerFromAI} from './ai';
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
