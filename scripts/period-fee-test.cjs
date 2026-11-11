const {_electron,expect}=require('playwright/test');const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const bundle=require('esbuild').buildSync({entryPoints:['services/bank-rewards/testBank.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;const m={exports:{}};new Function('module','exports','require',bundle)(m,m.exports,require);
const s=m.exports.createTestBank('local');Object.assign(s.offers[0],{feeBasis:undefined,feeFreeCycles:0,feeGoalCents:50000});s.ddEvents[0].amountCents=50000;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-period-fee-'));fs.writeFileSync(path.join(root,'records.json'),JSON.stringify(s));let app;
(async()=>{try{
 app=await _electron.launch({executablePath:process.argv[2]||path.resolve('release/win-unpacked/金羊毛.exe'),args:['--headless','--user-data-dir='+root]});
 const p=await app.firstWindow();p.setDefaultTimeout(15000);await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.setContentSize(2200,1200);});
 const row=p.locator('[data-testid=reward-row]');await expect(row.locator('.br-cycle-dot')).toHaveCount(3);await expect(row.locator('.br-cycle-completion')).toHaveAttribute('aria-label','已完成 0/3 期');
 const current=p.locator('.br-condition-period[data-status=current]').first();await expect(current.locator('header')).toContainText('剩');await expect(current.locator('header')).toContainText('本期进行中');
 for(const child of ['b','span'])assert.equal(await current.locator('header '+child).evaluate(e=>getComputedStyle(e).color),'rgb(33, 199, 172)');
 await expect(row.getByRole('progressbar',{name:'免月费进度',exact:true})).toHaveAttribute('value','1');await expect(row).toContainText('已记录 US$500 / US$500');await expect(row).not.toContainText('本期已达标');await expect(row.getByRole('button',{name:'设置免月费周期',exact:true})).toHaveCount(0);await row.getByRole('button',{name:'操作 示例银行（虚拟）',exact:true}).click();await p.getByRole('menuitem',{name:'编辑活动',exact:true}).click();await p.getByLabel('免月费计算周期',{exact:true}).selectOption('opening');await p.getByRole('button',{name:'保存奖励活动',exact:true}).click();
 await expect(row.getByRole('progressbar',{name:'免月费进度',exact:true})).toHaveAttribute('value','1');await expect(row).toContainText('本期已达标');
 const cdp=await p.context().newCDPSession(p);
 for(const width of [2200,1280,800,640]){
 await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
 const geometry=await p.evaluate(()=>{const h=document.querySelector('.br-condition-period[data-status=current] header'),b=h.querySelector('b').getBoundingClientRect(),s=h.querySelector('span').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+2,overlap:!(b.right<=s.left+1||b.bottom<=s.top+1||s.bottom<=b.top+1)};});assert.equal(geometry.overflow,false);assert.equal(geometry.overlap,false);
 }
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
 console.log('PASS period dots, current green heading/countdown/status, $500 fee independent of bonus, configured threshold visible without cycle; configured fee via editor, responsive no overlap, hidden windows.');
}finally{if(app)await app.close();fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:200});}})().catch(e=>{console.error(e);process.exitCode=1;});
