const {_electron,expect}=require('playwright/test'),fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const bundle=require('esbuild').buildSync({entryPoints:['services/bank-rewards/testBank.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const m={exports:{}};new Function('module','exports','require',bundle)(m,m.exports,require);
const s=m.exports.createTestBank('local'),o=s.offers[0],a=s.accounts[0],e=s.ddEvents[0];o.bankName='Test Bank';o.productName='Offer A';e.sourceNote='';
s.offers.push({...o,id:'second',productName:'Offer B',archived:true},{...o,id:'other',bankName:'Other Bank'});
s.accounts.push({...a,id:'a2',offerId:'second'},{...a,id:'a3',offerId:'other'});
s.ddEvents.push({...e,id:'dd2',accountId:'a2',sourceNote:'Source B'},{...e,id:'dd3',accountId:'a3'}, {...e,id:'debit',kind:'debit'}, {...e,id:'credit',kind:'credit'});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-dd-check-')),file=path.join(root,'records.json');fs.writeFileSync(file,JSON.stringify(s));let app;
const button=(p,name)=>p.getByRole('button',{name,exact:true});
(async()=>{try{
 app=await _electron.launch({executablePath:path.resolve('release/win-unpacked/金羊毛.exe'),args:['--headless','--user-data-dir='+root]});
 const p=await app.firstWindow();p.setDefaultTimeout(15000);
 await app.evaluate(({ipcMain,BrowserWindow})=>{
  BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false);
  globalThis.ddCalls=[];globalThis.slow=false;
  ipcMain.removeHandler('ai:read');ipcMain.handle('ai:read',()=>({providers:[{id:'fake',name:'Test',model:'fake',hasKey:true}],hasSearchKey:false}));
  ipcMain.removeHandler('ai:run');ipcMain.handle('ai:run',async(_,req)=>{
   globalThis.ddCalls.push(req);if(globalThis.slow)await new Promise(r=>setTimeout(r,5000));
   if(req.sourceNote==='Source B')throw new Error('Synthetic query failed');
   return {kind:'dd',verdict:'unknown',summary:'Test evidence only',uncertainties:[],citations:[],failures:[],sources:[],provider:'Test',checkedAt:new Date().toISOString()};
  });
 });
 assert.equal(await p.locator('.br-activity-types').getByRole('button',{name:'DD条件检测',exact:true}).count(),0);
 assert.ok(await button(p,'DD条件检测').evaluate(el=>el.previousElementSibling.textContent.includes('已归档')));
 await button(p,'DD条件检测').click();await p.getByLabel('选择活动',{exact:true}).selectOption(o.id);
 await expect(button(p,'检测全部 1 笔 DD')).toBeEnabled();
 await p.getByLabel('检测范围',{exact:true}).selectOption('bank');await expect(button(p,'检测全部 2 笔 DD')).toBeEnabled();
 await p.getByLabel('检测范围',{exact:true}).selectOption('all');await expect(p.getByLabel('选择活动',{exact:true})).toBeDisabled();await button(p,'检测全部 3 笔 DD').click();
 const missing=p.getByRole('dialog',{name:'补充 DD 来源备注',exact:true});await expect(missing).toBeVisible();assert.equal(await app.evaluate(()=>globalThis.ddCalls.length),0);
 await missing.getByRole('button',{name:'保存备注并开始检测',exact:true}).click();await expect(missing.getByRole('alert')).toContainText('请补全');assert.deepEqual(JSON.parse(fs.readFileSync(file)),s);
 await missing.getByLabel('第 1 笔来源备注',{exact:true}).fill('Source Other');await missing.getByLabel('第 2 笔来源备注',{exact:true}).fill('Source A');
 const cdp=await p.context().newCDPSession(p);for(const [width,height]of [[1280,900],[640,480]]){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await expect(missing.getByRole('button',{name:'保存备注并开始检测',exact:true})).toBeVisible();}
 await missing.getByRole('button',{name:'保存备注并开始检测',exact:true}).click();await expect(missing).toHaveCount(0);await expect(button(p,'检测全部 3 笔 DD')).toBeEnabled();
 await expect(p.locator('.br-dd-check-results article')).toHaveCount(3);await expect(p.locator('.br-dd-check-results').getByText('查询失败',{exact:true})).toHaveCount(1);await expect(p.locator('.br-dd-check-results').getByText('Test evidence only',{exact:true})).toHaveCount(2);
 const calls=await app.evaluate(()=>globalThis.ddCalls);assert.equal(calls.length,3);assert.deepEqual(calls.map(x=>x.sourceNote),['Source B','Source Other','Source A']);assert.ok(calls[0].query.includes('Offer B'));assert.ok(calls[1].query.includes('Other Bank'));
 const saved=JSON.parse(fs.readFileSync(file));assert.deepEqual(saved.ddEvents.map(({sourceNote,...r})=>r),s.ddEvents.map(({sourceNote,...r})=>r));assert.equal(saved.ddEvents.find(x=>x.id==='debit').sourceNote,'');
 await app.evaluate(()=>{globalThis.ddCalls=[];globalThis.slow=true;});await button(p,'检测全部 3 笔 DD').click();await expect(button(p,'停止检测')).toBeVisible();await button(p,'停止检测').click();await expect(p.getByRole('status')).toContainText('已停止');assert.equal(await app.evaluate(()=>globalThis.ddCalls.length),1);assert.deepEqual(JSON.parse(fs.readFileSync(file)),saved);
 await button(p,'关闭对话框').click();await p.reload();await button(p,'DD条件检测').click();await p.getByLabel('检测范围',{exact:true}).selectOption('all');await expect(p.getByText('共 3 笔 DD，0 笔待补来源备注。',{exact:false})).toBeVisible();
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
 console.log('PASS DD toolbar placement, activity/bank/all scope, missing-note gate, atomic save, per-record results/errors, stop, reload and narrow layout; no financial changes.');
}finally{if(app)await app.close();if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('gf-dd-check-'))fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:200});}})().catch(e=>{console.error(e);process.exitCode=1});
