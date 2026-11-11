const {_electron,expect}=require('playwright/test');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-connect-ui-'));
let app;
(async()=>{try{
 app=await _electron.launch({executablePath:process.argv[2]||path.resolve('release/win-unpacked/金羊毛.exe'),args:['--headless','--user-data-dir='+root]});
 const p=await app.firstWindow();p.setDefaultTimeout(15000);
 await app.evaluate(({BrowserWindow,ipcMain})=>{
  BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false);
  ipcMain.removeHandler('ai:connect');ipcMain.handle('ai:connect',(_,input)=>{
   if(input.key==='bad')throw new Error('密钥验证失败，请检查是否复制完整。');
   return {config:{providers:[{id:'test',name:'OpenAI',protocol:'openai',endpoint:'https://api.openai.com/v1',model:input.model||'gpt-6-luna',hasKey:true}],hasSearchKey:false},model:input.model||'gpt-6-luna'};
  });
  ipcMain.removeHandler('ai:models');ipcMain.handle('ai:models',()=>['gpt-6-luna','gpt-4.1-mini']);
 });
 await p.getByRole('button',{name:'AI 一键填写',exact:true}).click();
 await p.getByRole('button',{name:'AI 设置',exact:true}).click();
 const dialog=p.getByRole('dialog',{name:'AI 服务设置'});
 await expect(dialog.getByLabel('服务名称',{exact:true})).toHaveCount(0);
 await expect(dialog.getByLabel('模型名称',{exact:true})).toHaveCount(0);
 await dialog.getByLabel('OpenAI API 密钥',{exact:true}).fill('bad');
 await dialog.getByRole('button',{name:'连接并使用',exact:true}).click();
 await expect(dialog.getByRole('alert')).toHaveText('密钥验证失败，请检查是否复制完整。');
 await dialog.getByLabel('OpenAI API 密钥',{exact:true}).fill('synthetic-key');
 await dialog.getByRole('button',{name:'连接并使用',exact:true}).click();
 await expect(dialog.getByRole('status')).toContainText('gpt-6-luna');
 await expect(dialog.getByLabel('OpenAI API 密钥',{exact:true})).toHaveValue('');
 await dialog.getByRole('button',{name:'更换模型',exact:true}).click();
 await dialog.getByLabel('可用模型',{exact:true}).selectOption('gpt-4.1-mini');
 await dialog.getByRole('button',{name:'使用此模型',exact:true}).click();
 await expect(dialog.getByRole('status')).toContainText('gpt-4.1-mini');
 await dialog.getByRole('button',{name:'其他服务 / 高级设置',exact:true}).click();
 await expect(dialog.getByLabel('模型名称',{exact:true})).toBeVisible();
 const cdp=await p.context().newCDPSession(p);
 for(const [width,height] of [[1440,900],[800,600],[640,480]]) {
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await dialog.getByRole('button',{name:'收起高级设置',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'连接并使用',exact:true})).toBeVisible();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await dialog.getByRole('button',{name:'其他服务 / 高级设置',exact:true}).click();
  await expect(dialog.getByLabel('模型名称',{exact:true})).toBeVisible();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
 console.log('PASS: key-only setup, readable error, automatic model, dropdown model change and optional advanced settings.');
}finally{if(app)await app.close();if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('gf-connect-ui-'))fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:200});}
})().catch(e=>{console.error(e);process.exitCode=1;});
