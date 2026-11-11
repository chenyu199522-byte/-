const {_electron,expect}=require('playwright/test');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const bundle=require('esbuild').buildSync({entryPoints:['services/bank-rewards/testBank.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const m={exports:{}};new Function('module','exports','require',bundle)(m,m.exports,require);
const s=m.exports.createTestBank('local'), simple=structuredClone(s.offers[0]), account=structuredClone(s.accounts[0]);
Object.assign(simple,{id:'completed',bankName:'Received bank',cycleDebitCents:null,cycleCreditCents:null,rewardCycleCount:null,depositGoalCents:null,transactionGoal:null,additionalConditions:""});
account.depositBalances=[];account.qualifyingTransactions=[];
Object.assign(account,{id:'received-account',offerId:simple.id,bonusReceivedOn:account.openedOn,bonusReceivedCents:10000});s.offers.push(simple);s.accounts.push(account);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-condition-list-'));const bytes=Buffer.from(JSON.stringify(s));fs.writeFileSync(path.join(root,'records.json'),bytes);let app;
(async()=>{try{
 app=await _electron.launch({executablePath:process.argv[2]||path.resolve('release/win-unpacked/金羊毛.exe'),args:['--headless','--user-data-dir='+root]});
 const p=await app.firstWindow();p.setDefaultTimeout(15000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
 await p.locator('[data-bank-filter="all"]').click();await expect(p.locator('[data-testid=reward-row]')).toHaveCount(2);
 await expect(p.locator('.br-condition-row')).toHaveCount(1);await expect(p.locator('.br-condition-notes,.br-condition-reminders')).toHaveCount(0);
 await expect(p.locator('.br-condition-board progress')).toHaveCount(12);
 const cdp=await p.context().newCDPSession(p);
 for(const saved of [false,true]){
  if(saved){await p.getByRole('button',{name:'编辑布局',exact:true}).click();await p.getByRole('slider',{name:'界面字号',exact:true}).fill('110');await p.getByRole('button',{name:'保存布局',exact:true}).click();}
  for(const width of [2560,1280,640]){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await expect(p.locator('.br-condition-row')).toHaveCount(1);}
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:2560,height:1440,deviceScaleFactor:1,mobile:false});
 }
 await p.locator('[data-bank-filter="received"]').click();await expect(p.locator('[data-testid=reward-row]')).toHaveCount(1);await expect(p.locator('.br-condition-row')).toHaveCount(0);
 await p.getByRole('button',{name:'操作 Received bank',exact:true}).click();await p.getByRole('menuitem',{name:'查看详情',exact:true}).click();
 await expect(p.getByRole('dialog',{name:'奖励活动详情'})).toContainText(simple.requirements);await expect(p.locator('.br-condition-reminders')).toContainText(simple.promoCode);
 assert.ok(fs.readFileSync(path.join(root,'records.json')).equals(bytes));assert.deepEqual(errors,[]);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
 console.log('PASS condition tails removed; 12 condition meters and detail rules retained; received row no empty tail; data unchanged; 6 default/saved responsive checks; hidden window.');
}catch(e){if(app)console.error(await (await app.firstWindow()).locator('body').innerText());throw e;}finally{if(app)await app.close();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gf-condition-list-'));fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:200});}})().catch(e=>{console.error(e);process.exitCode=1});
