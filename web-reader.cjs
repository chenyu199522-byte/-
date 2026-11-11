const {lookup}=require('node:dns').promises;
const net=require('node:net');
const {randomUUID}=require('node:crypto');
function publicAddress(ip) {
  if(net.isIPv4(ip)){const [a,b]=ip.split('.').map(Number);return !(
    a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||
    a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===192&&b===0);
  }
  if(net.isIPv6(ip)){const s=ip.toLowerCase();return s.startsWith('2')||s.startsWith('3');}
  return false;
}
async function publicUrl(value,resolve=lookup) {
  let url;try{url=new URL(value);}catch{throw new Error('请粘贴完整的银行活动链接。');}
  if(url.protocol!=='https:' || url.username || url.password || url.port && url.port!=='443' ||
    !url.hostname.includes('.') || url.hostname.endsWith('.local') || url.hostname.endsWith('.localhost'))
    throw new Error('请使用公开银行网站的 HTTPS 活动链接。');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=net.isIP(host)?[{address:host}]:await resolve(host,{all:true});
  if(!addresses.length || addresses.some(x=>!publicAddress(x.address)))throw new Error('不能读取本机或内网地址，请使用公开活动页面。');
  return url.href;
}
function createWebReader({BrowserWindow,session}) {
  return async function read(value,signal) {
    const url=await publicUrl(value);
    const isolated=session.fromPartition('offer-reader-'+randomUUID());
    const checks=new Map();let closed=false;
    isolated.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
    isolated.setPermissionCheckHandler(()=>false);
    isolated.on('will-download',event=>event.preventDefault());
    isolated.webRequest.onBeforeRequest((details,callback)=>{
      if(closed)return callback({cancel:true});
      if(details.url.startsWith('data:') && details.resourceType!=='mainFrame')return callback({});
      if(!checks.has(details.url))checks.set(details.url,publicUrl(details.url).then(()=>true,()=>false));
      checks.get(details.url).then(ok=>callback({cancel:!ok}));
    });
    const window=new BrowserWindow({show:false,width:1280,height:900,skipTaskbar:true,
      webPreferences:{session:isolated,sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true,offscreen:true,backgroundThrottling:false}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-attach-webview',event=>event.preventDefault());
    let timer;
    const stop=()=>{if(!window.isDestroyed())window.destroy();};
    signal.addEventListener('abort',stop,{once:true});
    try {
      await Promise.race([window.loadURL(url),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('活动网页加载超时，请稍后重试。')),35000);})]);
      let previous='',stable=0,result;
      for(let i=0;i<14;i++){
        if(signal.aborted)throw new Error('读取已取消。');
        await new Promise(r=>setTimeout(r,600));
        result=await window.webContents.executeJavaScript('(()=>{const root=document.body.cloneNode(true);root.querySelectorAll("script,style,noscript").forEach(e=>e.remove());return {url:location.href,title:document.title,text:root.textContent.replace(/\\\\s+/g," ").trim().slice(0,100000)};})()');
        if(result.text.length>500 && result.text===previous)stable++;else stable=0;
        if(stable>=3)break;previous=result.text;
      }
      await publicUrl(result.url);
      if(!result?.text || result.text.length<200 || /access denied|verify you are human|just a moment|captcha/i.test(result.title))
        throw new Error('网页需要验证、登录或没有可读条款，请使用无需登录的活动详情链接。');
      return {...result,retrieval:'用户提供的活动页面'};
    } finally {clearTimeout(timer);closed=true;signal.removeEventListener('abort',stop);stop();await isolated.clearStorageData().catch(()=>{});}
  };
}
module.exports={publicAddress,publicUrl,createWebReader};
