const {_electron,expect}=require('playwright/test');const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const bundle=require('esbuild').buildSync({entryPoints:['services/bank-rewards/testBank.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;const m={exports:{}};new Function('module','exports','require',bundle)(m,m.exports,require);
let s=m.exports.createTestBank('local');for(const g of m.exports.requirementGroups)if(!['dd','fee'].includes(g.id))s=m.exports.toggleTestRequirement(s,g.id,false);
Object.assign(s.offers[0],{ddAmountCents:500000,ddCount:2,feeBasis:undefined,feeFreeCycles:0,feeGoalCents:50000});
s.ddEvents=[{...s.ddEvents[0],id:'first',amountCents:200000},{...s.ddEvents[0],id:'second',amountCents:300000}];
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-dd-mode-'));const file=path.join(root,'records.json');fs.writeFileSync(file,JSON.stringify(s));let app;
(async()=>{try{
 app=await _electron.launch({executablePath:path.resolve('release/win-unpacked/金羊毛.exe'),args:['--headless','--user-data-dir='+root]});
 const p=await app.firstWindow();p.setDefaultTimeout(15000);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
 const row=p.locator('[data-testid=reward-row]');await expect(row).toContainText('每笔 US$5,000 · 至少 2 笔');
 const mode=async value=>{await row.getByRole('button',{name:'操作 示例银行（虚拟）',exact:true}).click();await p.getByRole('menuitem',{name:'编辑活动',exact:true}).click();await p.getByLabel('DD 金额计算方式',{exact:true}).selectOption(value);await p.getByRole('button',{name:'保存奖励活动',exact:true}).click();};
 await mode('total');await expect(row).toContainText('累计 US$5,000 · 至少 2 笔');await expect(row).toContainText('DD 已完成');await expect(row.getByRole('progressbar',{name:'DD 进度',exact:true})).toHaveAttribute('value','1');
 let saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.offers[0].ddAmountMode,'total');assert.deepEqual(saved.ddEvents,s.ddEvents);
 await mode('per_deposit');await expect(row).not.toContainText('DD 已完成');await expect(row.getByRole('progressbar',{name:'DD 进度',exact:true})).toHaveAttribute('value','0');
 await mode('total');await p.reload();await expect(row).toContainText('累计 US$5,000 · 至少 2 笔');await expect(row).toContainText('DD 已完成');
 assert.deepEqual(JSON.parse(fs.readFileSync(file)).ddEvents,s.ddEvents);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
 console.log('PASS two $2000/$3000 entries complete cumulative $5000+2, remain incomplete per-deposit, editor switch persists across reload, records retained.');
}finally{if(app)await app.close();fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:200});}})().catch(e=>{console.error(e);process.exitCode=1;});
