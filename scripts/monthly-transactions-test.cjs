const {_electron,expect}=require('playwright/test');const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const bundle=require('esbuild').buildSync({entryPoints:['services/bank-rewards/testBank.ts','services/bank-rewards/logic.ts'],bundle:true,platform:'node',format:'cjs',write:false,outdir:'unused'}).outputFiles;
const modules=bundle.map(b=>{const m={exports:{}};new Function('module','exports','require',b.text)(m,m.exports,require);return m.exports;});const sample=modules.find(m=>m.createTestBank),logic=modules.find(m=>m.addDays);
let s=sample.createTestBank('local');for(const g of sample.requirementGroups)if(g.id!=='transactions')s=sample.toggleTestRequirement(s,g.id,false);
const today=logic.todayISO(),opened=logic.addDays(logic.addMonths(today,-1),-2);s.accounts[0].openedOn=opened;s.accounts[0].qualifyingTransactions=Array.from({length:10},(_,i)=>({id:'old'+i,date:opened,note:'first cycle'}));
Object.assign(s.offers[0],{transactionGoal:5,transactionDeadlineDays:90});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-monthly-transactions-'));const file=path.join(root,'records.json');fs.writeFileSync(file,JSON.stringify(s));let app;
(async()=>{try{
 app=await _electron.launch({executablePath:path.resolve('release/win-unpacked/金羊毛.exe'),args:['--headless','--user-data-dir='+root]});const p=await app.firstWindow();p.setDefaultTimeout(15000);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
 await p.getByRole('button',{name:'操作 示例银行（虚拟）',exact:true}).click();await p.getByRole('menuitem',{name:'编辑活动',exact:true}).click();
 await p.getByLabel('合格交易计算方式',{exact:true}).selectOption('periodic');await p.getByLabel('合格交易周期',{exact:true}).selectOption('opening');await p.getByLabel('交易考核期数（留空持续按期记录）',{exact:true}).fill('2');await p.getByRole('button',{name:'保存奖励活动',exact:true}).click();
 await expect(p.getByRole('progressbar',{name:'合格交易第 1 期进度',exact:true})).toHaveAttribute('value','5');await expect(p.getByRole('progressbar',{name:'合格交易第 2 期进度',exact:true})).toHaveAttribute('value','0');
 await p.locator('[data-testid=reward-row]').click();const editor=p.getByRole('region',{name:'存款与合格交易记录',exact:true});
 for(let i=0;i<5;i++){await editor.getByLabel('记录说明',{exact:true}).fill('second cycle '+i);await editor.getByRole('button',{name:'添加记录',exact:true}).click();await expect(editor.getByText('second cycle '+i,{exact:true})).toBeVisible();}
 await p.getByRole('button',{name:'关闭详情',exact:true}).click();await expect(p.getByRole('progressbar',{name:'合格交易第 2 期进度',exact:true})).toHaveAttribute('value','5');
 await p.reload();await expect(p.getByRole('progressbar',{name:'合格交易第 2 期进度',exact:true})).toHaveAttribute('value','5');
 const saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.accounts[0].qualifyingTransactions.length,15);assert.equal(saved.offers[0].transactionCycleCount,2);assert.equal(saved.offers[0].rewardCycleCount,null);
 const cdp=await p.context().newCDPSession(p);for(const width of [2200,1280,640]){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));}
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);console.log('PASS monthly transactions: independent periods, no carryover, five entries update current period, persisted across reload, responsive, hidden.');
}finally{if(app)await app.close();fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:200});}})().catch(e=>{console.error(e);process.exitCode=1;});
