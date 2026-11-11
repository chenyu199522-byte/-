const {_electron,expect}=require('playwright/test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-deposit-qa-'));
const dev=process.argv[2]==='--source';
const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
const offer={id:'o',userId:'local',bankName:'演示银行',productName:'多条件活动',accountType:'支票账户',currency:'USD',bonusCents:190000,requirements:'新资金必须来自其他银行；交易以正式入账日期为准。须在规定期限内完成所有条件。',ddAmountCents:250000,ddCount:null,deadlineDays:90,minHoldDays:null,monthlyFee:'25',feeNote:'每月工资 DD 达到门槛可免月费',earlyClosePenalty:'提前关户需核对奖励追回条款',startsOn:null,expiresOn:null,payoutDays:30,payoutAnchor:'qualification_month_end',repeatable:null,repeatIntervalMonths:null,repeatAnchor:null,sourceUrl:'https://example.com/offer',docUrl:'',docCheckedOn:null,repeatSourceUrl:'',closureMethod:'',closureSourceUrl:'',notes:'Synthetic QA',applicationStatus:'opened',deniedOn:null,denialReason:'',archived:false,createdAt:'',updatedAt:'',
 cycleBasis:'opening',rewardCycleCount:3,cycleDebitCents:100000,depositGoalCents:1000000,depositHoldMonths:3,depositHoldBasis:'funded',depositDeadlineDays:30,transactionGoal:6,transactionDeadlineDays:60,promoCode:'DEMO26',rewardMode:'separate',depositBonusCents:150000,ddBonusCents:40000};
const account={id:'a',userId:'local',offerId:'o',name:'演示账户',openedOn:today,bonusReceivedOn:null,bonusReceivedCents:null,closedOn:null,minHoldDays:null,notes:'',closureMethod:'',historyOnly:false,syncIncome:false,exchangeRate:null,incomeCurrency:'USD',createdAt:'',updatedAt:''};
fs.writeFileSync(path.join(root,'records.json'),JSON.stringify({version:1,userId:'local',offers:[offer],accounts:[account],ddEvents:[],rules:[]}));
let app;
const button=(p,name)=>p.getByRole('button',{name,exact:true});
(async()=>{try{
 app=await _electron.launch({executablePath:dev?require('electron'):process.argv[2]||path.resolve('release/win-unpacked/金羊毛.exe'),args:[...(dev?['.']:[]),'--headless','--user-data-dir='+root]});
 const p=await app.firstWindow();p.setDefaultTimeout(15000);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
 await expect(p.getByLabel('规则与提醒').getByText('DEMO26')).toBeVisible();
 await button(p,'按月核对：演示银行').click();
 const editor=p.getByRole('region',{name:'存款与合格交易记录',exact:true});
 await editor.getByLabel('当天合格资金余额',{exact:true}).fill('10000');
 await editor.getByLabel('记录说明',{exact:true}).fill('Synthetic new money');
 await editor.getByRole('button',{name:'添加记录',exact:true}).click();
 await expect(editor.getByText('Synthetic new money',{exact:true})).toBeVisible();
 const detail=p.getByRole('dialog',{name:'奖励活动详情'});
 await expect(detail.getByRole('progressbar',{name:'已存金额',exact:true})).toHaveAttribute('value','1000000');
 await expect(detail.getByRole('progressbar',{name:'持有倒计时',exact:true})).toHaveAttribute('value','0');
 await editor.getByLabel('新增记录类型',{exact:true}).selectOption('transaction');
 for(let i=1;i<=6;i++){
  await editor.getByLabel('记录说明',{exact:true}).fill('Synthetic transaction '+i);
  await editor.getByRole('button',{name:'添加记录',exact:true}).click();
  await expect(editor.getByText('Synthetic transaction '+i,{exact:true})).toBeVisible();
 }
 await expect(detail.getByRole('progressbar',{name:'合格交易',exact:true})).toHaveAttribute('value','6');
 await editor.locator('.br-record-item').filter({hasText:'Synthetic transaction 6'}).getByRole('button',{name:'删除',exact:true}).click();
 await expect(detail.getByRole('progressbar',{name:'合格交易',exact:true})).toHaveAttribute('value','5');
 const close=detail.getByRole('button',{name:'关闭详情',exact:true});
 await close.click();
 const cdp=await p.context().newCDPSession(p);
 for(const [width,height] of [[1920,1080],[1280,800],[800,600],[640,480]]){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const geom=await p.evaluate(()=>{
   const layout=document.querySelector('.br-condition-layout'),board=layout.querySelector('.br-condition-board'),reminders=layout.querySelector('.br-condition-reminders');
   const b=board.getBoundingClientRect(),r=reminders.getBoundingClientRect();
   return {overflow:document.documentElement.scrollWidth>innerWidth+2,overlap:!(r.left>=b.right-2||r.top>=b.bottom-2),remindersOverflow:reminders.scrollWidth>reminders.clientWidth+2};
  });
  assert.equal(geom.overflow,false,JSON.stringify({width,geom}));assert.equal(geom.overlap,false,JSON.stringify({width,geom}));assert.equal(geom.remindersOverflow,false);

 }
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await button(p,'编辑布局').click();await p.getByRole('slider',{name:'界面字号'}).press('End');await button(p,'保存布局').click();
 for(const width of [1280,640]) {
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  const bounds=await p.evaluate(()=>{const layout=document.querySelector('.br-condition-layout'),b=layout.querySelector('.br-condition-board').getBoundingClientRect(),r=layout.querySelector('.br-condition-reminders').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+2,overlap:!(r.left>=b.right-2||r.top>=b.bottom-2)};});
  assert.equal(bounds.overflow,false);assert.equal(bounds.overlap,false);
 }
 await cdp.send('Emulation.clearDeviceMetricsOverride');
 await button(p,'操作 演示银行').click();await p.getByRole('menuitem',{name:'奖励到账',exact:true}).click();
 const receipt=p.getByRole('dialog');
 await receipt.locator('.br-field').filter({hasText:'DD / 消费奖励到账日期'}).getByRole('button',{name:'选择日期',exact:true}).click();
 await p.getByRole('button',{name:'今天',exact:true}).click();
 await button(p,'保存记录').click();
 const state=JSON.parse(fs.readFileSync(path.join(root,'records.json'),'utf8'));
 assert.equal(state.accounts[0].depositBalances[0].amountCents,1000000);
 assert.equal(state.accounts[0].qualifyingTransactions.length,5);
 assert.equal(state.accounts[0].bonusReceivedOn,null);
 assert.equal(state.accounts[0].componentReceipts.dd.cents,40000);
 assert.equal(state.accounts[0].componentReceipts.deposit,undefined);
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
 console.log('PASS: amount/time/count progress, record save/delete, attached responsive reminders and independent partial reward receipt.');
 }catch(e){console.error(e);process.exitCode=1;}
 finally{if(app)await app.close();if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('gf-deposit-qa-'))fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:200});}
})();
