const {_electron,expect}=require('playwright/test');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-public-'));
let app;const errors=[];
async function launch(){
 app=await _electron.launch({executablePath:process.argv[2]||path.resolve('release/win-unpacked/金羊毛.exe'),args:['--headless','--user-data-dir='+root]});
 const p=await app.firstWindow();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
 await expect(p.getByRole('button',{name:'测试模式',exact:true})).toHaveCount(0);
 await expect(p.locator('.gf-test-panel')).toHaveCount(0);
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
 return p;
}
(async()=>{try{
 let p=await launch();await expect(p.getByRole('heading',{name:'从第一个活动开始'})).toBeVisible();
 assert.equal(fs.existsSync(path.join(root,'records.json')),false);assert.equal(fs.existsSync(path.join(root,'ai-settings.json')),false);
 await p.getByRole('button',{name:'新增奖励活动',exact:true}).first().click();await p.getByLabel('机构 / 平台名称 *',{exact:true}).fill('Synthetic release bank');await p.getByRole('button',{name:'保存奖励活动',exact:true}).click();
 await expect(p.locator('[data-testid=reward-row]')).toHaveCount(1);
 const records=fs.readFileSync(path.join(root,'records.json'));
 await p.getByRole('button',{name:'编辑布局',exact:true}).click();await p.getByRole('slider',{name:'界面字号',exact:true}).fill('110');await p.getByRole('button',{name:'保存布局',exact:true}).click();
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'layout.json'))).font,110);
 const cdp=await p.context().newCDPSession(p);
 for(const [width,height]of [[2560,1440],[1280,900],[640,480]]){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));}
 await p.getByRole('button',{name:'DD条件检测',exact:true}).click();await p.getByLabel('检测范围',{exact:true}).selectOption('all');await expect(p.getByRole('button',{name:'检测全部 0 笔 DD',exact:true})).toBeDisabled();await p.getByRole('button',{name:'关闭对话框',exact:true}).click();
 await app.close();app=undefined;p=await launch();await expect(p.locator('[data-testid=reward-row]')).toHaveCount(1);assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).fontSize),'17.6px');assert.ok(fs.readFileSync(path.join(root,'records.json')).equals(records));assert.deepEqual(errors,[]);
 console.log('PASS public build: no test entry/panel; empty first run; add/save/restart; layout persistence; DD scope and responsive views; hidden windows.');
}finally{if(app)await app.close();if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('gf-public-'))fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:200});}})().catch(e=>{console.error(e);process.exitCode=1});
