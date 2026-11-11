const {_electron,expect}=require('playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gf-images-test-'));
const profile=path.join(temp,'profile');
let app;
const dev=process.argv[2]==='--source';
async function launch() {
  app=await _electron.launch({executablePath:dev?require('electron'):process.argv[2]||path.resolve('release/win-unpacked/金羊毛.exe'),
    args:[...(dev?['.']:[]),'--headless','--user-data-dir='+profile]});
  const p=await app.firstWindow();p.setDefaultTimeout(10000);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  await p.getByRole('button',{name:'编辑布局',exact:true}).waitFor();
  return p;
}
const button=(p,name)=>p.getByRole('button',{name,exact:true});
async function run(){
  let p=await launch();
  const originals=[path.join(temp,'活动 条款.png'),path.join(temp,'关户凭据.png')];
  const imageBytes=await app.evaluate(({nativeImage})=>[120,210].map(color=>nativeImage.createFromBitmap(Buffer.alloc(20*20*4,color),{width:20,height:20}).toPNG().toString('base64')));
  originals.forEach((file,i)=>fs.writeFileSync(file,Buffer.from(imageBytes[i],'base64')));
  await app.evaluate(({dialog,shell},files)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:files});
    globalThis.testLinks=[];shell.openExternal=async url=>{globalThis.testLinks.push(url);};
  },originals);
  await button(p,'DD条件检测').click();
  await expect(p.locator('.br-reference-grid a')).toHaveCount(9);
  for(const a of await p.locator('.br-reference-grid a').all())await a.click();
  await button(p,'关闭对话框').click();await button(p,'论坛与指南').click();
  await expect(p.locator('.br-reference-grid a')).toHaveCount(3);
  for(const a of await p.locator('.br-reference-grid a').all())await a.click();
  const links=await app.evaluate(()=>globalThis.testLinks);
  assert.equal(links.length,12);
  assert.deepEqual(links,[
    'https://dd.nextbonus.app/bonuses','https://bankrewards.io/','https://bankbonus.com/','https://bonushq.io/bonuses',
    'https://churnables.com/banks','https://www.doctorofcredit.com/best-bank-account-bonuses/',
    'https://bonusclerk.com/','https://www.bonuschurn.com/','https://superchurn.com/',
    'https://www.uscardforum.com/','https://www.uscreditcardguide.com/zh/','https://www.doctorofcredit.com/'
  ]);
  await button(p,'一次性活动').click();
  await button(p,'新增奖励活动').first().click();
  await p.getByLabel('机构 / 平台名称 *',{exact:true}).fill('图片测试银行');
  await p.getByLabel('推荐链接',{exact:true}).fill('https://example.com/referral?code=test');
  await button(p,'添加图片').click();
  await expect(p.locator('.br-evidence-grid figure')).toHaveCount(2);
  await button(p,'添加图片').click();
  await expect(p.locator('.br-evidence-grid figure')).toHaveCount(2);
  assert.ok(!fs.existsSync(path.join(profile,'images')));
  await button(p,'取消').click();
  assert.ok(!fs.existsSync(path.join(profile,'records.json')));
  await button(p,'新增奖励活动').first().click();
  await p.getByLabel('机构 / 平台名称 *',{exact:true}).fill('图片测试银行');
  await p.getByLabel('推荐链接',{exact:true}).fill('https://example.com/referral?code=test');
  await button(p,'添加图片').click();
  await expect(p.locator('.br-evidence-grid figure')).toHaveCount(2);
  await button(p,'保存奖励活动').click();
  await expect(p.locator('[data-testid=reward-row]')).toHaveCount(1);
  const file=path.join(profile,'records.json');
  let state=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(state.offers[0].images.length,2);
  assert.equal(state.offers[0].referralUrl,'https://example.com/referral?code=test');
  for(const [i,item] of state.offers[0].images.entries())
    assert.deepEqual(fs.readFileSync(path.join(profile,'images',item.id)),fs.readFileSync(originals[i]));
  // Simulate removal of the source screenshots; the app must use its own saved copy.
  originals.forEach(f=>fs.unlinkSync(f));
  await p.locator('[data-testid=reward-row]').click();
  await expect(p.getByRole('link',{name:'推荐链接',exact:true})).toHaveAttribute('href',state.offers[0].referralUrl);
  await button(p,'查看图片 活动 条款.png').click();
  await expect(p.locator('.br-evidence-view img')).toBeVisible();
  await button(p,'原始尺寸').click();
  await expect(p.locator('.br-evidence-view')).toHaveAttribute('data-actual','true');
  const exported=path.join(temp,'exported.png');
  await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},exported);
  await button(p,'导出原图').click();
  await expect(p.getByRole('status')).toContainText('原图已导出');
  assert.deepEqual(fs.readFileSync(exported),fs.readFileSync(path.join(profile,'images',state.offers[0].images[0].id)));
  await button(p,'关闭对话框').click();
  await button(p,'关闭详情').click();
  await button(p,'编辑布局').click();
  await p.getByLabel('软件名称',{exact:true}).fill('我的银行记录');
  await button(p,'保存布局').click();
  await expect(p.getByRole('heading',{name:'我的银行记录',exact:true})).toBeVisible();
  await expect(p).toHaveTitle('我的银行记录');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle()),'我的银行记录');
  await app.close();app=undefined;
  p=await launch();
  await expect(p.getByRole('heading',{name:'我的银行记录',exact:true})).toBeVisible();
  await p.locator('[data-testid=reward-row]').click();
  await expect(p.locator('.br-evidence-thumb img')).toHaveCount(2);
  await button(p,'关闭详情').click();
  await button(p,'操作 图片测试银行').click();
  await p.getByRole('menuitem',{name:'编辑活动',exact:true}).click();
  await button(p,'移除图片 活动 条款.png').click();
  await button(p,'保存奖励活动').click();
  await expect(p.locator('[data-testid=reward-row]')).toHaveCount(1);
  state=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(state.offers[0].images.length,1);
  assert.ok(fs.existsSync(path.join(profile,'images',state.offers[0].images[0].id)));
  console.log('PASS: all 12 external links, multi-image import, duplicate/cancel, original-byte persistence, export, restart, remove, referral and app rename.');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  if(app)await app.close();
  if(path.dirname(temp)===os.tmpdir() && path.basename(temp).startsWith('gf-images-test-'))
    fs.rmSync(temp,{recursive:true,force:true,maxRetries:4,retryDelay:200});
});
