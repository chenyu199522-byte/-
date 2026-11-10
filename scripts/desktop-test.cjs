// Run the packaged app without a visible window, using fresh, isolated Windows profiles.
const {_electron, expect} = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const executablePath = process.argv[2] || path.resolve('release/win-unpacked/金羊毛.exe');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-fleece-qa-'));
const profile = path.join(temp, 'first');
const other = path.join(temp, 'second');
const file = path.join(profile, 'records.json');
let app;
async function launch(directory) {
  app = await _electron.launch({executablePath, args: ['--headless', '--user-data-dir=' + directory]});
  const p = await app.firstWindow();
  const actual = await app.evaluate(({app, BrowserWindow}) => ({
    profile: app.getPath('userData'), hidden: BrowserWindow.getAllWindows().every(w => !w.isVisible()),
  }));
  assert.equal(path.resolve(actual.profile), path.resolve(directory));
  assert.ok(actual.hidden);
  p.setDefaultTimeout(10000);
  return p;
}
async function close() { if (app) { await app.close(); app = undefined; } }
async function run() {
  let p = await launch(profile);
  await expect(p.getByRole('heading', {name:'从第一个活动开始'})).toBeVisible();
  assert.ok(!fs.existsSync(file));
  await p.getByRole('button', {name:'新增奖励活动', exact:true}).first().click();
  await p.getByLabel('机构 / 平台名称 *', {exact:true}).fill('独立版测试银行');
  await p.getByLabel('广告奖励金额', {exact:true}).fill('100');
  await p.getByLabel('每笔 DD 金额 / 单笔要求未知时填总额', {exact:true}).fill('500');
  await p.getByRole('button', {name:'保存奖励活动'}).click();
  const menu = () => p.getByRole('button', {name:'操作 独立版测试银行'});
  await menu().click();
  await p.getByRole('menuitem', {name:'记录开户',exact:true}).click();
  await p.getByRole('button', {name:'保存记录',exact:true}).click();
  await menu().click();
  await p.getByRole('menuitem', {name:'记录 DD',exact:true}).click();
  await p.getByLabel('到账金额 *', {exact:true}).fill('500');
  await p.getByRole('button', {name:'保存记录',exact:true}).click();
  await expect(p.getByText('DD 已完成', {exact:true}).first()).toBeVisible();
  await menu().click();
  await p.getByRole('menuitem', {name:'奖励到账',exact:true}).click();
  await p.getByRole('button', {name:'保存记录',exact:true}).click();
  await expect(p.getByRole('dialog')).toHaveCount(0);
  await p.getByRole('button', {name:'长期活动',exact:true}).click();
  await p.getByRole('button', {name:'新增奖励活动',exact:true}).first().click();
  await p.getByLabel('机构 / 平台名称 *', {exact:true}).fill('长期测试');
  await p.getByRole('button', {name:'保存奖励活动'}).click();
  await expect(p.getByText('长期测试', {exact:true}).first()).toBeVisible();
  const csv = path.join(temp, 'export.csv');
  await app.evaluate(({dialog}, filePath) => {dialog.showSaveDialog = async () => ({filePath,canceled:false});}, csv);
  await p.getByRole('button', {name:'导出 CSV',exact:true}).click();
  await expect(p.getByText('CSV 已导出。')).toBeVisible();
  assert.ok(fs.readFileSync(csv,'utf8').includes('独立版测试银行'));
  await close();
  const raw = fs.readFileSync(file);
  const state = JSON.parse(raw);
  assert.equal(state.offers.length,2);
  assert.equal(state.accounts[0].bonusReceivedCents,10000);
  assert.equal(state.ddEvents[0].amountCents,50000);
  p = await launch(profile);
  await p.getByRole('button',{name:/^已到账/}).click();
  await expect(menu()).toBeVisible();
  assert.deepEqual(fs.readFileSync(file), raw);
  await close();
  p = await launch(other);
  await expect(p.getByRole('heading',{name:'从第一个活动开始'})).toBeVisible();
  await close();
  fs.writeFileSync(path.join(other,'records.json'), 'broken');
  p = await launch(other);
  await expect(p.getByRole('heading',{name:'无法打开银行记录'})).toBeVisible();
  assert.equal(fs.readFileSync(path.join(other,'records.json'),'utf8'),'broken');
  console.log('PASS: empty profile, offer, account, DD, receipt, long-term offer, CSV, restart, isolation and damaged-file protection.');
}
run().catch(error => {console.error(error);process.exitCode=1;}).finally(async () => {
  await close();
  if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('golden-fleece-qa-'))
    fs.rmSync(temp,{recursive:true,force:true,maxRetries:4,retryDelay:200});
});
