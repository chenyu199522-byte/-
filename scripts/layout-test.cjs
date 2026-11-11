const {_electron, expect} = require('playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {windowScale} = require('../window-scale.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(),'gf-layout-test-'));
const dev = process.argv[2] === '--source';
const executablePath = dev ? require('electron') : process.argv[2] || path.resolve('release/win-unpacked/金羊毛.exe');
const samples = [[3840,2160],[2560,1440],[1920,1080],[1536,864],[1366,768],[1280,720],[1024,640],[800,600],[640,480]];
let app;
async function launch() {
  app=await _electron.launch({executablePath,args:[...(dev?['.']:[]),'--headless','--user-data-dir='+profile]});
  const p=await app.firstWindow();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false)); p.setDefaultTimeout(8000);
  assert.deepEqual(await app.evaluate(({app,BrowserWindow})=>[app.getPath('userData'),BrowserWindow.getAllWindows()[0].isVisible()]),[profile,false]);
  await expect(p.getByRole('button',{name:'编辑布局',exact:true})).toBeVisible();
  return p;
}
const open = p=>p.getByRole('button',{name:'编辑布局',exact:true}).click();
const click = (p,name)=>p.getByRole('button',{name,exact:true}).click();
const layoutPath=path.join(profile,'layout.json');
async function sizing(p,enabled=false) {
  // Drive the native window so that resize -> zoom -> CSS breakpoints run together.
  const device = await p.context().newCDPSession(p);
  for(const [width,height] of samples) {
    const info=await app.evaluate(async({BrowserWindow},size)=>{
      const win=BrowserWindow.getAllWindows()[0];win.setContentSize(...size);
      await new Promise(r=>setTimeout(r,100));
      return {size:win.getContentSize(),scale:win.webContents.getZoomFactor()};
    },[width,height]);
    assert.equal(info.size[0],width);assert.equal(info.size[1],height);
    assert.ok(Math.abs(info.scale-windowScale(width,height,enabled,100))<.002);
    // A hidden native window can retain its previous compositor surface. Supply the
    // matching client area explicitly and verify the CSS viewport used by the page.
    const dpr=width===1536 ? 1.25 : width===1280 ? 1.5 : 1;
    await device.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false});
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const geom=await p.evaluate(()=>{
      const doc=document.documentElement, table=document.querySelector('.br-table-scroll');
      return [doc.scrollWidth, innerWidth, table.clientHeight, document.querySelectorAll('thead th').length];
    });
    assert.ok(Math.abs(geom[1]*info.scale-width)<3,JSON.stringify({width,info,geom}));
    assert.ok(geom[0]<=geom[1]+2 && geom[2]>=130, JSON.stringify({width,height,geom}));
    console.log(width+'x'+height, 'zoom', info.scale.toFixed(2),'list height',geom[2],'columns',geom[3]);
  }
}
async function run() {
  let p=await launch();
  await click(p,'规则'); await click(p,'关闭对话框');
  await p.getByRole('button',{name:'新增奖励活动',exact:true}).first().click();
  await p.getByLabel('机构 / 平台名称 *',{exact:true}).fill('测试银行与较长的活动名称 ABCDEFGHIJKLMNOP');
  await click(p,'保存奖励活动');
  const recordFile=path.join(profile,'records.json');
  await expect(p.locator('[data-testid=reward-row]')).toHaveCount(1);
  const records=fs.readFileSync(recordFile);
  await sizing(p);
  await open(p);await click(p,'活动表格');await p.getByLabel('窄窗口优先显示关键列').check();await click(p,'保存布局');
  await click(p,'显示全部列');await expect(p.locator('thead th')).toHaveCount(11);
  await click(p,'恢复精简列');
  await open(p);await p.getByLabel('随窗口等比例缩放').check();await p.getByRole('slider',{name:'界面字号'}).press('End');
  await p.getByRole('slider',{name:'页面边距'}).press('End');
  await click(p,'统计卡片');await p.getByLabel('显示已关账户').uncheck();
  await click(p,'上移进行中奖励');
  await click(p,'活动表格');await p.getByLabel('显示最低持有').uncheck();
  await click(p,'上移奖励金额');await p.getByRole('slider',{name:'奖励金额列宽'}).press('End');
  await click(p,'保存布局');
  assert.equal(JSON.parse(fs.readFileSync(layoutPath)).columns[0].width,460);
  await sizing(p,true);
  assert.equal(await p.locator('thead th').first().innerText().then(s=>s.includes('奖励金额')),true);
  await open(p);await p.getByLabel('随窗口等比例缩放').uncheck();
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())).toBe(1);
  await click(p,'取消');
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())).toBeLessThan(1);
  await click(p,'规则');await expect(p.getByRole('dialog')).toBeVisible();await click(p,'关闭对话框');
  await p.getByRole('button',{name:'新增奖励活动',exact:true}).first().click();
  await expect(p.getByLabel('机构 / 平台名称 *',{exact:true})).toBeVisible();await click(p,'取消');
  await click(p,'长期活动');await expect(p.getByLabel('搜索长期活动')).toBeVisible();
  await app.close();app=undefined;
  p=await launch();
  await expect(p.locator('.br-stat').first()).toContainText('进行中奖励');
  await expect(p.locator('.br-stat')).toHaveCount(4);
  assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).fontSize),'24px');
  await open(p);await click(p,'恢复默认');await click(p,'取消');
  await expect(p.locator('.br-stat')).toHaveCount(4);
  await open(p);await click(p,'恢复默认');await click(p,'保存布局');
  await expect(p.locator('.br-stat')).toHaveCount(5);
  assert.deepEqual(fs.readFileSync(recordFile),records);
  console.log('PASS: native scaling, default and saved layout, compact/full table, previews, reorder, persistence, restore, records unchanged.');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  if(app) await app.close();
  if(path.dirname(profile)===os.tmpdir() && path.basename(profile).startsWith('gf-layout-test-'))
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200});
});
