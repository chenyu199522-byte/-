const {_electron,expect}=require('playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-scale-control-'));
let app;
(async()=>{try{
 app=await _electron.launch({executablePath:process.argv[2]||path.resolve('release/win-unpacked/金羊毛.exe'),args:['--headless','--user-data-dir='+root]});
 const p=await app.firstWindow();await p.getByRole('button',{name:'编辑布局',exact:true}).click();
 await p.getByRole('slider',{name:'整体大小',exact:true}).press('Home');
 const zoom=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());
 await expect.poll(zoom).toBeLessThanOrEqual(.5);
 await p.getByRole('button',{name:'取消',exact:true}).click();await expect.poll(zoom).toBeGreaterThan(.5);
 await p.getByRole('button',{name:'编辑布局',exact:true}).click();await p.getByRole('slider',{name:'整体大小',exact:true}).press('Home');
 await p.getByRole('button',{name:'保存布局',exact:true}).click();assert.equal(JSON.parse(fs.readFileSync(path.join(root,'layout.json'))).overallScale,50);
 await p.reload();await expect(p.getByRole('button',{name:'编辑布局',exact:true})).toBeVisible();await expect.poll(zoom).toBeLessThanOrEqual(.5);
 assert.equal(fs.existsSync(path.join(root,'records.json')),false);
 console.log('PASS packaged native overall-size preview, cancel, save and reload; no bank records written.');
}catch(e){console.error(e);process.exitCode=1;}finally{if(app)await app.close();if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('gf-scale-control-'))fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:200});}})();
