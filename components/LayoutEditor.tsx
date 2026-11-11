import React, {useEffect, useRef, useState} from 'react';
import {ArrowDown, ArrowUp, X} from 'lucide-react';
import {columns, defaultLayout, minimumWidth, required, type Layout} from '../services/layout';

interface Props {value:Layout; onChange:(v:Layout)=>void; onCancel:()=>void; onSave:()=>Promise<void>}
function Slider({label,value,low,high,step=1,unit='px',change}: {
  label:string;value:number;low:number;high:number;step?:number;unit?:string;change:(n:number)=>void
}) {
  return <label className="le-slider"><span>{label}</span><output>{value} {unit}</output>
    <input aria-label={label} type="range" min={low} max={high} step={step} value={value}
      onChange={e=>change(Number(e.target.value))}/></label>;
}
export function LayoutEditor({value, onChange, onCancel, onSave}:Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab,setTab] = useState('页面');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  useEffect(()=>{const el=ref.current!; el.showModal(); return ()=>el.close();},[]);
  function move(key:'cards'|'columns', index:number, delta:number) {
    const list = [...value[key]];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[target],list[index]] = [list[index],list[target]];
    onChange({...value,[key]:list});
  }
  const key = tab === '统计卡片' ? 'cards' : 'columns';
  return <dialog ref={ref} className="layout-editor" aria-labelledby="le-title"
    onCancel={e=>{e.preventDefault(); if (!busy) onCancel();}}>
    <header><h2 id="le-title">编辑布局</h2><button aria-label="关闭布局编辑" disabled={busy} onClick={onCancel}><X size={18}/></button></header>
    <nav aria-label="布局设置">{['页面','统计卡片','活动表格'].map(t=><button key={t} aria-pressed={t===tab} onClick={()=>setTab(t)}>{t}</button>)}</nav>
    <section className="le-scroll">
      {tab==='页面' && <>
        <label className="le-name">软件名称<input aria-label="软件名称" maxLength={40} value={value.appName}
          placeholder="金羊毛" onChange={e=>onChange({...value,appName:e.target.value})}/><small>用于软件首页和窗口标题</small></label>
        <label className="le-check"><input type="checkbox" checked={value.scaleWithWindow}
          onChange={e=>onChange({...value,scaleWithWindow:e.target.checked})}/>随窗口等比例缩放</label>
        <Slider label="界面字号" value={value.font} low={85} high={150} step={5} unit="%" change={font=>onChange({...value,font})}/>
        <Slider label="页面边距" value={value.margin} low={8} high={48} change={margin=>onChange({...value,margin})}/>
        <Slider label="区域间距" value={value.gap} low={6} high={28} change={gap=>onChange({...value,gap})}/>
      </>}
      {tab==='统计卡片' && <Slider label="卡片最小宽度" value={value.cardWidth} low={120} high={300}
        change={cardWidth=>onChange({...value,cardWidth})}/>}
      {tab==='活动表格' && <>
        <Slider label="活动行最小高度" value={value.rowHeight} low={60} high={160} change={rowHeight=>onChange({...value,rowHeight})}/>
        <label className="le-check"><input type="checkbox" checked={value.adaptive} onChange={e=>onChange({...value,adaptive:e.target.checked})}/>窄窗口优先显示关键列</label>
      </>}
      {tab!=='页面' && value[key].map((item,index)=>{
        const col = columns.find(c=>c.id===item.id);
        const name = col?.label ?? item.id;
        return <div className="le-item" key={item.id}><div>
          <label className="le-check"><input type="checkbox" aria-label={'显示'+name} disabled={col && required(col.id)} checked={item.visible}
            onChange={e=>onChange({...value,[key]:value[key].map(v=>v.id===item.id?{...v,visible:e.target.checked}:v)})}/>{name}</label>
          <button aria-label={'上移'+name} disabled={!index} onClick={()=>move(key,index,-1)}><ArrowUp size={15}/></button>
          <button aria-label={'下移'+name} disabled={index===value[key].length-1} onClick={()=>move(key,index,1)}><ArrowDown size={15}/></button>
        </div>{col && 'width' in item && <Slider label={name+'列宽'} value={item.width} low={minimumWidth(col.id)} high={460}
          change={width=>onChange({...value,columns:value.columns.map(c=>c.id===item.id?{...c,width}:c)})}/>}</div>;
      })}
    </section>
    {error && <p role="alert">{error}</p>}
    <footer><button disabled={busy} onClick={()=>onChange(defaultLayout())}>恢复默认</button>
      <button disabled={busy} onClick={onCancel}>取消</button><button className="le-save" disabled={busy} onClick={async()=>{
        setBusy(true); try {await onSave();} catch {setError('布局保存失败，请重试。');setBusy(false);}
      }}>保存布局</button></footer>
  </dialog>;
}
