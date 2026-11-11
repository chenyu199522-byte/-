const {_electron,expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-ai-ui-'));
const dev=process.argv[2]==='--source';
let app;
const button=(p,name)=>p.getByRole('button',{name,exact:true});
async function run(){
 app=await _electron.launch({executablePath:dev?require('electron'):process.argv[2]||path.resolve('release/win-unpacked/金羊毛.exe'),
   args:[...(dev?['.']:[]),'--headless','--user-data-dir='+root]});
 const p=await app.firstWindow();p.setDefaultTimeout(15000);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
 await button(p,'DD条件检测').click();await button(p,'AI 设置').click();
 await p.getByLabel('服务名称',{exact:true}).fill('Synthetic AI');
 await p.getByLabel('模型名称',{exact:true}).fill('synthetic-model');
 await p.getByLabel('API 密钥',{exact:true}).fill('test-secret-not-real');
 await button(p,'保存 AI 服务').click();
 await expect(p.getByText('已保存到本机。',{exact:true})).toBeVisible();
 const settings=fs.readFileSync(path.join(root,'ai-settings.json'),'utf8');
 assert.ok(!settings.includes('test-secret-not-real'));
 await button(p,'关闭对话框').click();await button(p,'一次性活动').click();
 await app.evaluate(({ipcMain})=>{
   ipcMain.removeHandler('ai:run');
   ipcMain.handle('ai:run',()=>({kind:'offer',fields:{},verdict:'unknown',summary:'Synthetic offer',uncertainties:[],
     proposals:[{name:'测试活动',fields:{bankName:'测试银行',bonusCents:52500,ddAmountCents:250000,cycleDebitCents:100000,cycleCreditCents:50000,rewardCycleCount:3,cycleBasis:'opening'},
       summary:'Synthetic conditions',uncertainties:[],citations:[{field:'bonusCents',title:'Test source',url:'https://example.com/offer',quote:'Synthetic bonus evidence'}]}],
     citations:[],sources:[],failures:[],checkedAt:new Date().toISOString(),provider:'Synthetic AI'}));
 });
 await button(p,'AI 一键填写').click();
 await p.getByLabel('银行活动链接',{exact:true}).fill('https://example.com/offer');
 await button(p,'查询并生成草稿').click();await button(p,'填写此活动：测试活动').click();
 await expect(p.getByLabel('每期信用卡消费最低金额',{exact:true})).toHaveValue('500');
 await expect(p.getByLabel('每期工资 DD 累计最低金额',{exact:true})).toHaveValue('2500');
 assert.ok(!fs.existsSync(path.join(root,'records.json')));
 await button(p,'保存奖励活动').click();
 const menu=()=>button(p,'操作 测试银行');
 await menu().click();await p.getByRole('menuitem',{name:'记录开户',exact:true}).click();await button(p,'保存记录').click();
 for(const [kind,amount] of [['dd','2500'],['debit','1000'],['credit','500']]){
  await menu().click();await p.getByRole('menuitem',{name:'记录 DD',exact:true}).click();
  await p.getByLabel('记录类型',{exact:true}).selectOption(kind);
  await p.getByLabel(kind==='dd'?'到账金额 *':'消费金额 *',{exact:true}).fill(amount);
  await p.getByLabel('来源 / 备注',{exact:true}).fill(kind==='dd'?'Synthetic payroll':'Synthetic store');
  await button(p,'保存记录').click();
 }
 const first=p.getByRole('region',{name:'第 1 期条件'}); // section with accessible name
 await expect(first).toHaveAttribute('data-status','met');
 await expect(first.getByRole('progressbar',{name:'信用卡消费',exact:true})).toHaveAttribute('value','50000');
 const state=JSON.parse(fs.readFileSync(path.join(root,'records.json'),'utf8'));
 assert.deepEqual(state.ddEvents.map(e=>e.kind),['dd','debit','credit']);
 await button(p,'DD条件检测').click();
 await p.getByLabel('从已有 DD 带入',{exact:true}).selectOption(state.ddEvents[0].id);
 await expect(p.getByLabel('DD 来源 / 备注',{exact:true})).toHaveValue('Synthetic payroll');
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
 const cdp=await p.context().newCDPSession(p);
 for(const [width,height] of [[1280,900],[640,480]]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
 }
 console.log('PASS: encrypted AI setup, link-generated draft, manual save, three separate progress meters, DD source prefill and narrow layout.');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(app)await app.close();
 if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('gf-ai-ui-'))fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:200});
});
