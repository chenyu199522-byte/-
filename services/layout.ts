export const columns = [
  {id:'bank', label:'机构 / 活动', width:215, priority:0},
  {id:'reward', label:'奖励金额', width:130, priority:0},
  {id:'requirements', label:'DD 要求', width:195, priority:1},
  {id:'progress', label:'进度 / 截止', width:260, priority:0},
  {id:'opened', label:'开户日期', width:140, priority:2},
  {id:'payout', label:'奖励到账期限', width:175, priority:1},
  {id:'hold', label:'最低持有', width:130, priority:2},
  {id:'close', label:'安全关户', width:140, priority:2},
  {id:'repeat', label:'重复奖励资格', width:170, priority:2},
  {id:'status', label:'状态', width:130, priority:1},
  {id:'actions', label:'操作', width:160, priority:0},
] as const;
export const cards = ['已到账总额','进行中奖励','已关账户','即将可重奖','本月到账'] as const;
export type ColumnId = typeof columns[number]['id'];
export type CardName = typeof cards[number];
export interface ColumnSetting {id: ColumnId; visible: boolean; width: number}
export interface CardSetting {id: CardName; visible: boolean}
export interface Layout {
  appName: string; version: 1; overallScale: number; font: number; margin: number; gap: number; rowHeight: number; cardWidth: number;
  autoMargin:boolean; tableSizing:'content'|'custom'; scaleWithWindow: boolean; adaptive: boolean; columns: ColumnSetting[]; cards: CardSetting[];
}
export const required = (id: ColumnId) => id === 'bank' || id === 'actions';
export const minimumWidth = (id: ColumnId) => id === 'actions' || id === 'progress' ? 140 : 100;
export function defaultLayout(): Layout {
  return {version:1, appName:"金羊毛", overallScale:100, font:100, margin:24, gap:14, rowHeight:120, cardWidth:165, autoMargin:true, tableSizing:"content", scaleWithWindow:false, adaptive:false,
    columns:columns.map(({id,width})=>({id,width,visible:true})), cards:cards.map(id=>({id,visible:true}))};
}
function bounded(value: unknown, fallback: number, low: number, high: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, Math.round(value))) : fallback;
}
function ordered<T extends {id:string; visible:boolean}>(defaults: T[], saved: unknown): T[] {
  if (!Array.isArray(saved)) return defaults;
  const remaining = new Map(defaults.map(item=>[item.id,item]));
  const result: T[] = [];
  for (const entry of saved) {
    const item = remaining.get(entry?.id);
    if (!item) continue;
    remaining.delete(item.id);
    result.push({...item, visible:entry.visible !== false,
      ...('width' in item ? {width:bounded(entry.width, Number(item.width), minimumWidth(item.id as ColumnId), 460),
        visible:required(item.id as ColumnId) || entry.visible !== false} : {})});
  }
  return [...result,...remaining.values()];
}
export function readLayout(raw: unknown): Layout {
  const d = defaultLayout();
  if (!raw || typeof raw !== 'object' || !('version' in raw) || raw.version !== 1) return d;
  const v = raw as Partial<Layout>;
  return {...d, autoMargin:v.autoMargin === true, tableSizing:v.tableSizing === "content" ? "content" : "custom", appName:typeof v.appName === "string" ? v.appName.replace(/[\x00-\x1f]/g,"").trim().slice(0,40) || d.appName : d.appName,
    overallScale:bounded(v.overallScale,d.overallScale,50,125), font:bounded(v.font,d.font,60,150), margin:bounded(v.margin,d.margin,4,48),
    gap:bounded(v.gap,d.gap,2,28), rowHeight:bounded(v.rowHeight,d.rowHeight,36,160),
    cardWidth:bounded(v.cardWidth,d.cardWidth,120,300), scaleWithWindow:typeof v.scaleWithWindow === "boolean" ? v.scaleWithWindow : d.scaleWithWindow, adaptive:typeof v.adaptive === "boolean" ? v.adaptive : d.adaptive,
    columns:ordered(d.columns,v.columns), cards:ordered(d.cards,v.cards)};
}
export function visibleColumns(layout: Layout, width: number, showAll: boolean) {
  const enabled = layout.columns.filter(c=>c.visible);
  if (!layout.adaptive || showAll) return enabled;
  const available = width - 2 * layout.margin - 44; // Table insets, borders and scrollbar.
  for (const level of [2,1]) {
    const group = enabled.filter(c=>columns.find(meta=>meta.id===c.id)!.priority <= level);
    if (group.reduce((sum,c)=>sum+c.width,0) <= available) return group;
  }
  return enabled.filter(c=>columns.find(meta=>meta.id===c.id)!.priority === 0);
}

/** Restore geometry only; keep personal names, column order and visibility. */
export function housekeeperLayout(value:Layout):Layout {
  const d=defaultLayout();
  return {...value,font:d.font,margin:d.margin,gap:d.gap,rowHeight:120,autoMargin:d.autoMargin,tableSizing:d.tableSizing,adaptive:d.adaptive};
}
