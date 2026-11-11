import React, {useEffect, useRef, useState} from 'react';
import {Download, ImagePlus, X} from 'lucide-react';
import type {EvidenceImage} from '../../services/bank-rewards/types';
import {Modal} from './ui';

function Thumbnail({item,onOpen}: {item:EvidenceImage;onOpen:()=>void}) {
  const [src,setSrc]=useState('');
  const [error,setError]=useState(false);
  useEffect(()=>{
    let active=true;
    window.goldenFleece.imagePreview(item.id,false).then(src=>{if(active)setSrc(src);}).catch(()=>{if(active)setError(true);});
    return ()=>{active=false;};
  },[item.id]);
  return <button type="button" className="br-evidence-thumb" aria-label={'查看图片 '+item.name} onClick={onOpen}>
    {src ? <img src={src} alt={item.name}/> : <span>{error?'图片暂不可用':'正在读取…'}</span>}
  </button>;
}
function ImageViewer({item,onClose}: {item:EvidenceImage;onClose:()=>void}) {
  const [src,setSrc]=useState('');
  const [error,setError]=useState('');
  const [actual,setActual]=useState(false);
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    let active=true;
    window.goldenFleece.imagePreview(item.id,true).then(s=>{if(active)setSrc(s);}).catch(()=>{if(active)setError('无法读取原图，请检查本机图片文件或备份。');});
    return ()=>{active=false;};
  },[item.id]);
  return <Modal title={item.name} onClose={onClose} wide>
    <div className="br-evidence-tools">
      <button type="button" disabled={!src} onClick={()=>setActual(!actual)}>{actual?'适应窗口':'原始尺寸'}</button>
      <button type="button" disabled={!src} onClick={async()=>{
        try {const result=await window.goldenFleece.imageExport(item.id,item.name);if(!result.canceled)setNotice('原图已导出。');}
        catch {setError('导出失败，请重试。');}
      }}><Download size={16}/>导出原图</button>
    </div>
    {error && <p role="alert" className="br-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="br-evidence-view" data-actual={actual}>
      {src && <img src={src} alt={item.name}/>}
    </div>
  </Modal>;
}
export default function EvidenceImages({items=[],onChange}: {
  items?:EvidenceImage[];onChange?:(items:EvidenceImage[])=>void
}) {
  const [view,setView]=useState<EvidenceImage|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const alive=useRef(true);
  const staged=useRef<string[]>([]);
  const latest=useRef(items); latest.current=items;
  useEffect(()=>{alive.current=true;return ()=>{
    alive.current=false;
    void window.goldenFleece.discardImages(staged.current).catch(()=>{});
  };},[]);
  async function add() {
    setBusy(true);setError('');
    try {
      const picked=await window.goldenFleece.selectImages();
      if (!alive.current) {await window.goldenFleece.discardImages(picked.map(p=>p.id));return;}
      staged.current.push(...picked.map(p=>p.id));
      const next=[...latest.current];
      for(const item of picked) if(!next.some(v=>v.id===item.id))next.push(item);
      onChange?.(next);
    } catch {if(alive.current)setError('添加失败。请选择可读取的 PNG、JPEG、WebP、GIF 或 BMP 图片，单张不超过 25 MB。');}
    finally {if(alive.current)setBusy(false);}
  }
  return <section className="br-evidence" aria-label="活动截图">
    <div className="br-evidence-title"><h3>活动截图</h3>{onChange && <button type="button" disabled={busy} onClick={add}><ImagePlus size={16}/>{busy?'正在添加…':'添加图片'}</button>}</div>
    {onChange && <p className="br-hint">可多选活动条款、客服沟通或关户截图。保存活动后保留原图，单张最多 25 MB。</p>}
    {error && <p role="alert" className="br-error">{error}</p>}
    <div className="br-evidence-grid">{items.map(item=><figure key={item.id}>
      <Thumbnail item={item} onOpen={()=>setView(item)}/>
      <figcaption><span title={item.name}>{item.name}</span>{onChange && <button type="button" aria-label={'移除图片 '+item.name} onClick={()=>onChange(items.filter(i=>i.id!==item.id))}><X size={16}/></button>}</figcaption>
    </figure>)}</div>
    {view && <ImageViewer item={view} onClose={()=>setView(null)}/>}
  </section>;
}
