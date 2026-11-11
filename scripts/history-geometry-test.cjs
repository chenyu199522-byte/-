const {_electron,expect}=require('playwright/test');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const bundle=require('esbuild').buildSync({entryPoints:['services/bank-rewards/testBank.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const fixtureModule={exports:{}};new Function('module','exports','require',bundle)(fixtureModule,fixtureModule.exports,require);
const {createTestBank,requirementGroups,toggleTestRequirement}=fixtureModule.exports;
const fixture=createTestBank('local');fixture.offers=[];fixture.accounts=[];fixture.ddEvents=[];fixture.rules=[];
for(let i=0;i<4;i++){
 let s=createTestBank('local');for(const g of requirementGroups)if(!['dd',...(i===0?['debit','cycles']:[])].includes(g.id))s=toggleTestRequirement(s,g.id,false);
 const o=s.offers[0],a=s.accounts[0];o.id='fixture-'+i;o.bankName='演示银行 '+(i+1);a.id='fixture-account-'+i;a.offerId=o.id;
 fixture.offers.push(o);fixture.accounts.push(a);
}

const roots=[];let app;
(async()=>{try{
 const results=[];
 for(const executablePath of [process.argv[2],path.resolve('release/win-unpacked/金羊毛.exe')]) {
  assert.ok(executablePath,'Pass the original 1.0.0 executable as the first argument');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-history-'));roots.push(root);
  fs.writeFileSync(path.join(root,'records.json'),JSON.stringify(fixture));
  app=await _electron.launch({executablePath,args:['--headless','--user-data-dir='+root]});
  const p=await app.firstWindow();p.setDefaultTimeout(15000);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);w.setContentSize(2200,1200);});
  const cdp=await p.context().newCDPSession(p);await cdp.send('Emulation.setDeviceMetricsOverride',{width:2200,height:1200,deviceScaleFactor:1,mobile:false});
  await expect(p.locator('[data-testid=reward-row]')).toHaveCount(4);
  await p.evaluate(()=>document.fonts.ready);
  const metric=await p.evaluate(()=>{
   const css=sel=>getComputedStyle(document.querySelector(sel));
   const box=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {width:r.width,height:r.height};};
   return {table:{layout:css('.br-table').tableLayout,minWidth:css('.br-table').minWidth,spacing:css('.br-table').borderSpacing,font:css('.br-table').fontSize},
    cell:{padding:css('[data-testid=reward-row] td').padding,height:css('[data-testid=reward-row] td').height},
    page:{padding:css('#root').padding,gap:css('.br-center').gap},
    colgroup:document.querySelectorAll('.br-table colgroup').length,
    bank:{font:css('.br-bank-cell strong').fontSize,wrap:css('.br-bank-cell').flexWrap,gap:css('.br-bank-cell').gap},
    period:document.querySelector('.br-condition-period')?{...box('.br-condition-period'),padding:css('.br-condition-period').padding}:null,
    board:document.querySelector('.br-condition-board')?box('.br-condition-board'):null};
  });
  results.push(metric);console.log(await app.evaluate(({app})=>app.getVersion()),JSON.stringify(metric));
  await app.close();app=null;
 }
 assert.deepEqual(results[1],results[0],'Original 1.0.0 geometry must be restored at the same native window size');
 console.log('PASS original 1.0.0 native geometry matches current table, rows, spacing and monthly strip.');
}catch(e){console.error(e);process.exitCode=1;}finally{if(app)await app.close();for(const root of roots)if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('gf-history-'))fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:200});}})();
