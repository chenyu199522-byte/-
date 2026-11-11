import DDActivityCheck from "./DDActivityCheck";
import AIAssistant from './AIAssistant';
import ReferenceSites from './ReferenceSites';
import ConditionProgress, {SplitProgress,hasMultipleConditions,CycleCompletion,hasFeeRequirement} from './ConditionProgress';
import SettingsSelect from "../../components/SettingsSelect";
import {useLocalToday} from '../../services/useLocalToday';
import React, { useEffect, useMemo, useState } from "react";
import {
  Gift,
  Plus,
  Link2,
  Download,
  Info,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  BarChart3,
  Clock3,
  CheckCircle2,
  CalendarDays,
  X,
  Archive,
  ArrowUpRight,
  Wallet,
  SlidersHorizontal,
} from "lucide-react";
import type { User } from "../../types";
import ModalPortal from "../../components/ModalPortal";
import {
  emptyOffer,
  type RewardAccount,
  type RewardOffer,
  type RewardState,
  type RewardDdEvent,
} from "../../services/bank-rewards/types";
import {
  accountStatus,
  countdown,
  ddProgress, ddRequirementLabel, qualificationProgress, rewardPayoutSchedule, payoutTermLabel,
  cycleBasisLabels,
  eligibility,
  primaryAccount,
  safeCloseOn,
  summary,
  money,
  todayISO,
  daysBetween,
  formatDuration,
} from "../../services/bank-rewards/logic";
import {
  rewardRepository,
  toCsv,
} from "../../services/bank-rewards/repository";
import LongTermActivities from "./LongTermActivities";
import OfferEditor from "./OfferEditor";
import AccountPanel, {
  AccountDialog,
  type AccountAction,
} from "./AccountPanel";
import {
  Badge,
  BankMark,
  currencies,
  ErrorNote,
  Field,
  Modal,
  Progress,
} from "./ui";
import "./bank-rewards.css";
import { compareRewardRows, rewardColumnSorts } from '../../services/bank-rewards/sorting';
import {LayoutEditor} from '../../components/LayoutEditor';
import {columns, readLayout, visibleColumns, type ColumnId, type Layout} from '../../services/layout';
const filters = [
  ["all", "全部"],
  ["active", "进行中"],
  ["received", "已到账"],
  ["closed", "已关户"],
  ["eligible", "可重奖"],
  ["archived", "已归档"],
];
export default function BankRewards({ user, focus, initialLayout }: {
  user: User; initialLayout: Layout; focus?: {offerId?:string;accountId?:string;nonce:number};
}) {
  const today = useLocalToday();
  const [aiCreate,setAICreate]=useState(false);
  const [ddCheck,setDdCheck]=useState(false);
  const [savedLayout, setSavedLayout] = useState(initialLayout);
  const [draft, setDraft] = useState<Layout | null>(null);
  const [width,setWidth] = useState(window.innerWidth);
  const [showAll,setShowAll] = useState(false);
  const layout = draft ?? savedLayout;
  useEffect(()=>{
    const resize=()=>setWidth(window.innerWidth);
    window.addEventListener('resize',resize);
    return ()=>window.removeEventListener('resize',resize);
  },[]);
  useEffect(()=>{
    void window.goldenFleece.previewScale(layout.scaleWithWindow,layout.overallScale).catch(()=>{});
  },[layout.scaleWithWindow,layout.overallScale]);
  useEffect(()=>{
    const name=readLayout(layout).appName;
    document.title=name;
    void window.goldenFleece.previewName(name).catch(()=>{});
  },[layout.appName]);
  React.useLayoutEffect(()=>{
    const style=document.documentElement.style;
    style.fontSize = (16 * layout.font / 100) + 'px';
    style.setProperty('--layout-margin', layout.autoMargin ? 'clamp(16px, 2vw, 36px)' : layout.margin+'px');
    style.setProperty('--layout-gap', layout.gap+'px');
    style.setProperty('--layout-card', layout.cardWidth+'px');
    style.setProperty('--layout-row', layout.rowHeight+'px');
  },[layout]);
  const shown = visibleColumns(layout,width,showAll);
  const totalWidth = shown.reduce((sum,c)=>sum+c.width,0);
  const condensed = visibleColumns(layout,width,false).length < layout.columns.filter(c=>c.visible).length;
  const [state, setState] = useState(() => rewardRepository.read(user.id)),
    [activityView,setActivityView] = useState<"one_time"|"long_term"|"guides">("one_time"),
    [filter, setFilter] = useState("active"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("size"),
    [currency, setCurrency] = useState("USD"),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(20),
    [editor, setEditor] = useState<RewardOffer | null>(null),
    [detail, setDetail] = useState<{ offerId: string; accountId?: string; section?: "dd" } | null>(null),
    [longTermFocus, setLongTermFocus] = useState<{ offerId: string; nonce: number } | undefined>(),
    [menu, setMenu] = useState<string | null>(null),
    [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 }),
    [action, setAction] = useState<{
      mode: AccountAction;
      offerId: string;
      account?: RewardAccount;
      ddEvent?: RewardDdEvent;
    } | null>(null),
    [confirmation, setConfirmation] = useState<{
      title: string;
      run: () => Promise<RewardState>;
    } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [showRules, setShowRules] = useState(false),
    [showImport, setShowImport] = useState(false),
    [importUrl, setImportUrl] = useState("");
  useEffect(() => {
    if (!focus?.offerId) return;
    const offer = state.offers.find(o => o.id === focus.offerId);
    if (!offer) return;
    setEditor(null);
    setAction(null);
    setActivityView(offer.activityType || "one_time");
    setLongTermFocus(offer.activityType === "long_term" ? { offerId: offer.id, nonce: focus.nonce } : undefined);
    setDetail(offer.activityType === "long_term" ? null : { offerId: offer.id, accountId: focus.accountId });
  }, [focus]);
  useEffect(() => {
    const refresh = () => setState(rewardRepository.read(user.id));
    window.addEventListener("katanos:bank-rewards-changed", refresh);
    return () => {
      window.removeEventListener("katanos:bank-rewards-changed", refresh);
    };
  }, [user.id]);
  useEffect(() => {
    setPage(1);
  }, [query, sort, filter, currency, pageSize]);
  const metrics = summary(state, currency, today);
  const data = useMemo(
    () =>
      state.offers
        .filter((o) => o.currency === currency && o.activityType !== "long_term")
        .map((o) => {
          const a = primaryAccount(o, state),
            status = accountStatus(a, o, state, today),
            e = eligibility(o, state, today);
          return {
            o,
            a,
            status,
            e,
            dd: a ? qualificationProgress(a, o, state, today) : null,
            safe: a ? safeCloseOn(a) : null,
          };
        }),
    [state, today, currency],
  );
  const match = (row: (typeof data)[number], f: string) =>
    f === "all"
      ? !row.o.archived
      : f === "closed"
        ? !!row.a?.closedOn && !row.o.archived
        : row.status.key === f;
  const rows = data
    .filter(
      (r) =>
        match(r, filter) &&
        `${r.o.bankName} ${r.o.productName} ${r.o.notes} ${state.accounts
          .filter((a) => a.offerId === r.o.id)
          .map((a) => a.notes)
          .join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => compareRewardRows(a, b, sort));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)),
    current = Math.min(page, pages),
    visible = rows.slice((current - 1) * pageSize, current * pageSize);
  const save = (s: RewardState) => {
    setState(s);
    setError("");
  };
  const ask = (title: string, run: () => Promise<RewardState>) => {
    setMenu(null);
    setConfirmation({ title, run });
  };
  const runConfirm = async () => {
    setBusy(true);
    try {
      save(await confirmation!.run());
      setConfirmation(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const doAction = (mode: AccountAction, o: RewardOffer, a?: RewardAccount, ddEvent?: RewardDdEvent) => {
    if (a && a.offerId !== o.id) o = state.offers.find(offer => offer.id === a.offerId)!;
    if (mode === "open") { a = a || primaryAccount(o, state); if (a) mode = "edit"; }

    setMenu(null);
    if (["receipt", "dd", "balance", "balance-edit", "close"].includes(mode) && !a) {
      setAction({ mode: "open", offerId: o.id });
      return;
    }
    setAction({ mode, offerId: o.id, account: a, ddEvent });
  };
  const download = async () => {
    setError("");
    setNotice("");
    if (window.katanos?.exportBankRewardsCsv) {
      try {
        const result = await window.katanos.exportBankRewardsCsv(
          toCsv(state),
          `金羊毛-${today}.csv`,
        );
        if (!result.canceled) setNotice("CSV 已导出。");
      } catch (error) {
        setError(`导出失败：${(error as Error).message}`);
      }
      return;
    }
    const blob = new Blob([toCsv(state)], { type: "text/csv;charset=utf-8;" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `金羊毛-${today}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const activeOffer = state.offers.find((o) => o.id === detail?.offerId);
  if (editor)
    return (
      <div className="br-root">
        <OfferEditor
          user={user}
          initial={editor}
          rules={state.rules.filter((r) => r.offerId === editor.id)}
          onClose={() => setEditor(null)}
          onSaved={(s) => {
            const saved = s.offers.find(o => editor.id ? o.id === editor.id : !state.offers.some(old => old.id === o.id));
            if (saved) setActivityView(saved.activityType || "one_time");
            save(s);
            setEditor(null);
          }}
        />
      </div>
    );
  return (
    <div
      className="br-root br-center" data-layout={layout.tableSizing}
      onKeyDown={(e) => {
        if (e.key === "Escape") setMenu(null);
      }}
    >
      <header className="br-page-header">
        <div className="br-title-group">
          <div className="br-title-icon">
            <Gift size={26} />
          </div>
          <div>
            <h1>{readLayout(layout).appName}</h1>
            <p>
              记录开户活动、工资直存、借记卡与信用卡消费和奖励到账。资料保存在本机。
            </p>
          </div>
        </div>
        <div className="br-actions">
          {(activityView==="one_time" || activityView==="long_term") && <>
          <button
            className="br-primary"
            onClick={() => {
              setDetail(null);
              setEditor({...emptyOffer(user.id),activityType:activityView});
            }}
          >
            <Plus size={17} />
            新增奖励活动
          </button>
          <button onClick={()=>setAICreate(true)}>AI 一键填写</button>
          <button onClick={() => setShowImport(true)}>
            <Link2 size={16} />
            导入链接
          </button>
          <button onClick={download}>
            <Download size={16} />
            导出 CSV
          </button>
          </>}
          <button onClick={()=>setDraft(savedLayout)}><SlidersHorizontal size={16}/>编辑布局</button>
          <button onClick={() => setShowRules(true)}>
            <Info size={16} />
            规则
          </button>
        </div>
      </header>
      {ddCheck&&<Modal title="DD条件检测" wide onClose={()=>setDdCheck(false)}><DDActivityCheck state={state} onSaved={save}/></Modal>}
      {aiCreate&&<Modal title="AI 一键填写活动" wide onClose={()=>setAICreate(false)}><AIAssistant kind="offer" state={state} onDraft={o=>{setAICreate(false);setDetail(null);setEditor(o);}}/></Modal>}
      {draft && <LayoutEditor value={draft} onChange={setDraft} onCancel={()=>setDraft(null)} onSave={async()=>{
        const settings=readLayout(draft);
        await window.goldenFleece.saveLayout(settings);
        setSavedLayout(settings);
        setDraft(null);
      }}/>}
      {notice && (
        <p role="status" className="br-text-teal">
          {notice}
        </p>
      )}
      <ErrorNote error={error} />
      <div className="br-actions br-activity-types" role="group" aria-label="活动类型切换">
        <button className={activityView === "one_time" ? "br-primary" : ""} aria-pressed={activityView === "one_time"} onClick={()=>setActivityView("one_time")}>一次性活动</button>
        <button className={activityView === "long_term" ? "br-primary" : ""} aria-pressed={activityView === "long_term"} onClick={()=>setActivityView("long_term")}>长期活动</button>
        <button className={activityView==="guides"?"br-primary":""} aria-pressed={activityView==="guides"} onClick={()=>setActivityView("guides")}>论坛与指南</button>
      </div>
      {activityView === 'guides' ? <ReferenceSites kind={activityView} state={state}/> : activityView === "long_term" ? <LongTermActivities user={user} state={state} today={today} focus={longTermFocus} onFocusHandled={() => setLongTermFocus(undefined)} onSaved={save} onEdit={setEditor} onDelete={o=>ask("删除该长期活动及全部收益、存入和提取明细？财务账目保持不变。",()=>rewardRepository.deleteOffer(user.id,o.id))}/> : <>
      <div className="br-stats">
        {[
          {
            label: "已到账总额",
            value: money(metrics.total, currency),
            caption: `共 ${metrics.receivedCount} 笔奖励已到账`,
            tone: "teal",
            Icon: BarChart3,
          },
          {
            label: "进行中奖励",
            value: String(metrics.activeCount),
            caption: `潜在奖励 ${money(metrics.potential, currency)}`,
            tone: "blue",
            Icon: Clock3,
          },
          {
            label: "已关账户",
            value: String(metrics.closedCount),
            caption: `${metrics.safeClosed} 个已达到记录的持有期`,
            tone: "purple",
            Icon: CheckCircle2,
          },
          {
            label: "即将可重奖",
            value: String(metrics.soon),
            caption: metrics.next
              ? `最近 ${countdown(metrics.next, today)}`
              : "未来 90 天暂无已知日期",
            tone: "amber",
            Icon: CalendarDays,
          },
          {
            label: "本月到账",
            value: money(metrics.monthTotal, currency),
            caption: `${metrics.monthCount} 笔奖励 · ${today.slice(0, 7)}`,
            tone: "cyan",
            Icon: BarChart3,
          },
        ].filter(c=>layout.cards.some(item=>item.id===c.label && item.visible))
          .sort((a,b)=>layout.cards.findIndex(c=>c.id===a.label)-layout.cards.findIndex(c=>c.id===b.label))
          .map((c) => (
          <article className={`br-stat tone-${c.tone}`} key={c.label}>
            <c.Icon className="br-stat-icon" size={23} />
            <span>{c.label}</span>
            <strong>{c.value}</strong>
            <small>{c.caption}</small>
          </article>
        ))}
      </div>
      <div className="br-toolbar">
        <div className="br-filters">
          {filters.map(([id, label]) => (
            <button
              key={id}
                data-bank-filter={id}
              className={filter === id ? "selected" : ""}
              onClick={() => setFilter(id)}
            >
              <span className={`br-filter-dot dot-${id}`} />
              {label} ({data.filter((r) => match(r, id)).length})
            </button>
          ))}
          <button onClick={()=>setDdCheck(true)}>DD条件检测</button>
        </div>
        <div className="br-search-group">
          <label className="br-search">
            <Search size={16} />
            <input
              aria-label="搜索金羊毛"
              placeholder="搜索机构、平台、活动或备注…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                className="br-icon-button"
                aria-label="清空搜索"
                onClick={() => setQuery("")}
              >
                <X size={14} />
              </button>
            )}
          </label>
          <SettingsSelect
            aria-label="统计币种"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SettingsSelect>
          <SettingsSelect
            aria-label="排序"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="size">大卡优先</option><option value="updated">最近更新</option>
            <option value="bonus">奖励金额</option>
            <option value="ddAmount">DD 要求金额</option>
            <option value="open">开户日期</option>
            <option value="dd">进度 / 截止日期</option>
            <option value="safe">安全关户日期</option>
            <option value="repeat">可再次申请日期</option>
          </SettingsSelect>
        </div>
      </div>
      <div className="br-table-frame">
        <div className="br-table-scroll">
          <table className="br-table" data-sizing={layout.tableSizing} style={{minWidth:layout.tableSizing === "custom" ? totalWidth : 1850}}>
            {layout.tableSizing === "custom" && <colgroup>{shown.map(c=><col key={c.id} style={{width:(100*c.width/totalWidth)+'%'}}/>)}</colgroup>}
            <thead>
              <tr>
                {shown.map(({id}) => {
                  const h = columns.find(c=>c.id===id)!.label;
                  const column = rewardColumnSorts[h];
                  const selected = column?.key === sort;
                  return <th key={h} scope="col" aria-sort={column ? (selected ? column.direction : 'none') : undefined}>
                    {column ? <button type="button" className="br-column-sort" title={column.hint}
                      onClick={() => { setSort(column.key); setPage(1); }}>
                      {h}<span aria-hidden="true" className={selected ? 'br-sort-active' : 'br-sort-idle'}>{column.direction === 'ascending' ? '↑' : '↓'}</span>
                    </button> : h}
                  </th>;
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map(({ o, a, status, e, dd, safe }) => {
                const payout = rewardPayoutSchedule(o, a?.openedOn, dd?.last);
                const nextDeadline=[dd?.done?null:dd?.deadline,dd?.deposit?.done?null:dd?.deposit?.start?dd.deposit.end:dd?.deposit?.fundingDeadline,
                  dd?.transactions?.done?null:dd?.transactions?.deadline].filter((d):d is string=>!!d).sort()[0]||null;

                const hold =
                    a && !a.historyOnly && a.minHoldDays !== null
                      ? {
                          days: Math.max(
                            0,
                            daysBetween(a.openedOn, a.closedOn || today),
                          ),
                          total: a.minHoldDays,
                        }
                      : null,
                  progress = dd?.done ? 1 : dd?.ratio || 0;
                const cells: Record<ColumnId,React.ReactElement> = {
                  bank: <td>
                      <div className="br-bank-cell">
                        <BankMark name={o.bankName} />
                        <div>
                          <div className="br-bank-heading"><strong>{o.bankName}</strong>{o.productName && <span>{o.productName}</span>}</div>
                          <div className="br-mini-tags">
                            <em>{o.accountType || "账户"}</em>
                            {a?.historyOnly && <em>历史</em>}
                            {state.accounts.filter((a) => a.offerId === o.id)
                              .length > 1 && (
                              <em>
                                {
                                  state.accounts.filter(
                                    (a) => a.offerId === o.id,
                                  ).length
                                }{" "}
                                个账户
                              </em>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>,
                  reward: <td>
                      <strong className="br-money">
                        {money(o.bonusCents, o.currency)}
                      </strong>{o.rewardMode==="separate"&&<small>DD {money(o.ddBonusCents??null,o.currency)} + 存款 {money(o.depositBonusCents??null,o.currency)}</small>}
                    </td>,
                  requirements: <td>
                      {a && !a.historyOnly && hasMultipleConditions(o) ? <span>已在下方展示</span> : <>
                      <span>
                        {o.rewardCycleCount ? `每期工资 DD ≥ ${money(o.ddAmountCents,o.currency)}` : o.ddAmountCents!=null || o.ddCount!=null?ddRequirementLabel(o):o.depositGoalCents?"存款持有条件":o.transactionGoal?"合格交易条件":"要求待填写"}
                      </span>
                      {o.rewardCycleCount ? <><small>每期借记卡消费 ≥ {money(o.cycleDebitCents ?? 0,o.currency)}</small>{!!o.cycleCreditCents && <small>每期信用卡消费 ≥ {money(o.cycleCreditCents,o.currency)}</small>}<small>{cycleBasisLabels[o.cycleBasis || "opening"]} · 连续 {o.rewardCycleCount} 期</small></> : <small>{o.depositGoalCents?"保持余额 ≥ "+money(o.depositGoalCents,o.currency):"开户奖励 · 合格直接存款"}</small>}
                      {!!o.transactionGoal&&<small>{o.transactionMode==='periodic'?'每期完成':'累计完成'} {o.transactionGoal} 笔合格交易</small>}
                      {o.feeNote && <small className="br-fee-summary" title={'免月费 · '+o.feeNote+(o.monthlyFee?`（月费 ${o.monthlyFee}）`:'')}>免月费 · {o.feeNote}{o.monthlyFee && `（月费 ${o.monthlyFee}）`}</small>}
                      </> }
                    </td>,
                  progress: <td className="br-progress-cell">
                      {dd && !!dd.periods.length && !a?.historyOnly ? <CycleCompletion periods={dd.periods}/> : <strong
                        className={`br-text-${a?.bonusReceivedOn ? "purple" : dd?.late ? "red" : dd?.near ? "amber" : "teal"}`}
                      >
                        {a?.historyOnly
                          ? "历史账户"
                          : a?.bonusReceivedOn
                            ? `已到账 ${formatDuration(a.bonusReceivedOn, today)}`
                            : dd?.done
                              ? (o.rewardCycleCount ? "各期条件已完成" : o.cycleCreditCents || o.depositGoalCents || o.transactionGoal ? "条件已完成" : "DD 已完成")
                              : nextDeadline
                                ? countdown(nextDeadline, today)
                                : o.expiresOn
                                  ? `活动 ${countdown(o.expiresOn, today)}`
                                  : "开户后开始追踪"}
                      </strong>}
                      {a && dd && !a.historyOnly && hasFeeRequirement(o) ? <SplitProgress offer={o} account={a} dd={dd} today={today} feeOnly={hasMultipleConditions(o)}/> : !(a && !a.historyOnly && hasMultipleConditions(o)) && !dd?.periods.length && <Progress
                        value={a?.bonusReceivedOn ? 1 : progress}
                        tone={
                          a?.bonusReceivedOn
                            ? "purple"
                            : dd?.late
                              ? "red"
                              : "teal"
                        }
                      />}
                      {!(a && !a.historyOnly && hasMultipleConditions(o)) && <small>
                        {nextDeadline || o.expiresOn || "—"}
                        {dd &&
                          !a?.historyOnly &&
                          (o.rewardCycleCount ? ` · ${dd.count}/${o.rewardCycleCount} 期` : ` · ${dd.count}/${o.ddCount ?? "—"} 笔`)}
                      </small>}
                    </td>,
                  opened: <td>
                      <span>{a?.openedOn || "—"}</span>
                      <small>
                        {a
                          ? `已开户 ${formatDuration(a.openedOn, today)}`
                          : "尚未开户"}
                      </small>
                    </td>,
                  payout: <td>
                      <span>{o.payoutDays != null && `${payout.anchorLabel} · `}{payoutTermLabel(o)}</span>
                      <small
                        className={a?.bonusReceivedOn ? "br-text-teal" : ""}
                      >
                        {a?.bonusReceivedOn
                          ? `已到账 ${a.bonusReceivedOn} · ${money(a.bonusReceivedCents, o.currency)}`
                          : payout.date ? `${payout.dateLabel} ${payout.date}` : dd?.done ? "已达标 · 未到账" : o.payoutDays != null ? payout.pendingLabel : "未到账"}
                      </small>
                    </td>,
                  hold: <td>
                      <span>
                        {hold
                          ? `${hold.days} / ${hold.total} 天`
                          : a?.historyOnly
                            ? "历史账户"
                            : "待记录"}
                      </span>
                      <small
                        className={
                          hold && hold.days >= hold.total ? "br-text-teal" : ""
                        }
                      >
                        {hold
                          ? hold.days >= hold.total
                            ? "已满足"
                            : "持有中"
                          : "规则待核对"}
                      </small>
                    </td>,
                  close: <td>
                      <strong
                        className={
                          a?.closedOn || (safe && safe <= today)
                            ? "br-text-teal"
                            : ""
                        }
                      >
                        {a?.closedOn
                          ? "✓ 已关户"
                          : safe
                            ? safe <= today
                              ? "✓ 已满足持有期"
                              : countdown(safe, today)
                            : "—"}
                      </strong>
                      <small>{a?.closedOn || safe || "未记录规则"}</small>
                    </td>,
                  repeat: <td>
                      <span>
                        {o.repeatable === false
                          ? "不可重复"
                          : o.repeatable === null
                            ? "资格未知"
                            : `${o.repeatIntervalMonths ?? "—"} 个月`}
                      </span>
                      <small>
                        {o.repeatAnchor
                          ? `从${{ open: "开户", close: "关户", bonus: "奖励到账" }[o.repeatAnchor]}起算`
                          : "基准待核对"}
                      </small>
                      <span
                        className={`br-eligibility br-text-${e.eligible ? "teal" : e.status === "waiting" ? "amber" : "muted"}`}
                      >
                        {e.date
                          ? countdown(e.date, today, true)
                          : e.status === "blocked"
                            ? "暂不满足"
                            : "需要核验"}
                      </span>
                    </td>,
                  status: <td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>,
                  actions: <td
                      className="br-row-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="br-row-action-buttons">
                        {a && !a.historyOnly && (
                          <button
                            className="br-manage-dd"
                            aria-label={`${o.rewardCycleCount ? "按月核对" : "管理 DD"}：${o.bankName}`}
                            onClick={() => setDetail({ offerId: o.id, accountId: a.id, section: "dd" })}
                          >
                            {o.rewardCycleCount ? "按月核对" : "管理 DD"}
                          </button>
                        )}
                        <button
                          className="br-icon-button"
                          aria-label={`操作 ${o.bankName}`}
                          onClick={(event) => {
                            const box = event.currentTarget.getBoundingClientRect();
                            setMenuPosition({
                              top: Math.max(8, Math.min(box.top, window.innerHeight - 380)),
                              left: Math.max(8, box.left - 178),
                            });
                            setMenu(menu === o.id ? null : o.id);
                          }}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </div>
                      <ModalPortal>{menu === o.id && <>
                          <div
                            className="br-menu-dismiss"
                            onClick={() => setMenu(null)}
                          />
                          <div
                            className="br-row-menu"
                            role="menu"
                            style={menuPosition}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") setMenu(null);
                            }}
                          >
                            {[
                              [
                                "查看详情",
                                () => {
                                  setDetail({ offerId: o.id, accountId: a?.id });
                                  setMenu(null);
                                },
                              ],
                              [
                                "编辑活动",
                                () => {
                                  setEditor(o);
                                  setMenu(null);
                                },
                              ],
                              [a ? "编辑账户" : "记录开户", () => doAction("open", o, a)],
                              ...(a && !a.historyOnly ? [["管理 DD", () => {
                                setDetail({ offerId: o.id, accountId: a?.id, section: "dd" });
                                setMenu(null);
                              }]] : []),
                              ["记录 DD", () => doAction("dd", o, a)],
                              ...(o.depositGoalCents ? [["添加存款记录",()=>doAction("balance",o,a)]] : []),
                              [a?.bonusReceivedOn ? "修改到账" : "奖励到账", () => doAction("receipt", o, a)],
                              [a?.closedOn ? "修改关户" : "关户", () => doAction("close", o, a)],
                              ["新增历史账户", () => doAction("history", o)],
                              [
                                o.archived ? "取消归档" : "归档",
                                () =>
                                  ask(
                                    o.archived
                                      ? "取消归档？"
                                      : "归档活动？历史实收仍保留。",
                                    () =>
                                      rewardRepository.archive(user.id, o.id),
                                  ),
                              ],
                              [
                                "删除活动",
                                () =>
                                  ask(
                                    "删除该活动及全部参与账户、DD 记录？财务流水保持不变，此操作不可撤销。",
                                    () =>
                                      rewardRepository.deleteOffer(
                                        user.id,
                                        o.id,
                                      ),
                                  ),
                              ],
                            ].map(([label, fn]) => (
                              <button
                                role="menuitem"
                                key={label as string}
                                className={
                                  label === "删除活动" ? "br-danger" : ""
                                }
                                onClick={fn as () => void}
                              >
                                {label as string}
                              </button>
                            ))}
                          </div>
                        </>}</ModalPortal>
                    </td>,
                };
                return (
                  <React.Fragment key={o.id}><tr
                    data-testid="reward-row"
                    tabIndex={0}
                    aria-label={`查看活动：${o.bankName} ${o.productName}`}
                    onKeyDown={event => {
                      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault(); setDetail({ offerId: o.id, accountId: a?.id });
                      }
                    }}
                    onClick={() => setDetail({ offerId: o.id, accountId: a?.id })}
                  >
                    {shown.map(c=><React.Fragment key={c.id}>{cells[c.id]}</React.Fragment>)}
                  </tr>
                  {a && dd && !a.historyOnly && (!!dd.periods.length || !!o.cycleCreditCents || !!o.depositGoalCents || !!o.transactionGoal || (hasMultipleConditions(o) && !!o.ddAmountCents)) && <tr className="br-condition-row"><td colSpan={shown.length}>
                    <ConditionProgress key={a.id} offer={o} account={a} dd={dd} today={today} onDepositAction={edit=>doAction(edit?"balance-edit":"balance",o,a)}/>
                  </td></tr>}</React.Fragment>
                );
              })}
            </tbody>
          </table>
          {!rows.length && (
            <div className="br-empty">
              <div className="br-empty-icon">
                <Gift size={38} />
              </div>
              <h2>{query ? "没有匹配的奖励活动" : "从第一个活动开始"}</h2>
              <p>
                {query
                  ? "试试其他机构、平台、活动名称或备注。"
                  : `在 ${currency} 下记录奖励活动，开户后自动计算 DD、持有期与重复领奖资格。`}
              </p>
              <button
                className="br-primary"
                onClick={() => setEditor({ ...emptyOffer(user.id), currency })}
              >
                <Plus size={16} />
                新增奖励活动
              </button>
            </div>
          )}
        </div>
        <footer className="br-table-footer">
          <span>
            显示 {rows.length ? (current - 1) * pageSize + 1 : 0}–
            {Math.min(current * pageSize, rows.length)}，共 {rows.length} 条活动
          </span>
          {condensed && <button className="br-expand-columns" aria-pressed={showAll} onClick={()=>setShowAll(!showAll)}>
            {showAll ? '恢复精简列' : '显示全部列'}</button>}
          <div className="br-pagination">
            <button
              className="br-icon-button"
              aria-label="上一页"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <span>{current}</span>
            <button
              className="br-icon-button"
              aria-label="下一页"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={17} />
            </button>
            <SettingsSelect
              aria-label="每页数量"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {[10, 20, 50].map((n) => (
                <option value={n} key={n}>
                  {n} 条/页
                </option>
              ))}
            </SettingsSelect>
          </div>
        </footer>
      </div>
      </>}
      {activeOffer && activeOffer.activityType !== "long_term" && (
        <div key={`${activeOffer.id}-${detail?.accountId || ""}-${detail?.section || "overview"}-${focus?.nonce || 0}`}><AccountPanel
          initialAccountId={detail?.accountId}
          initialSection={detail?.section}
          user={user}
          offer={activeOffer}
          state={state}
          onClose={() => setDetail(null)}
          onSaved={save}
          onEdit={() => {
            setEditor(activeOffer);
            setDetail(null);
          }}
          onAction={(m, a, event) => doAction(m, activeOffer, a, event)}
          onConfirm={ask}
        /></div>
      )}
      {action && state.offers.find((o) => o.id === action.offerId) && (
        <div key={`${action.mode}-${action.account?.id || "new"}-${action.ddEvent?.id || "new"}`}><AccountDialog
          user={user}
          offer={state.offers.find((o) => o.id === action.offerId)!}
          account={action.account}
          ddEvent={action.ddEvent}
          mode={action.mode}
          onClose={() => setAction(null)}
          onSaved={save}
        /></div>
      )}
      {confirmation && (
        <Modal title="确认操作" onClose={() => setConfirmation(null)}>
          <p className="br-confirm-text">{confirmation.title}</p>
          <ErrorNote error={error} />
          <footer className="br-modal-footer">
            <button onClick={() => setConfirmation(null)}>取消</button>
            <button
              className="br-danger-button"
              disabled={busy}
              onClick={runConfirm}
            >
              {busy ? "处理中…" : "确认"}
            </button>
          </footer>
        </Modal>
      )}
      {showRules && (
        <Modal title="金羊毛记录规则" onClose={() => setShowRules(false)}>
          <div className="br-rule-help">
            <p>
              一次性活动使用实际到账金额；长期活动累计每笔收益（含负数），存入、提取另行统计，均不影响财务。统计按币种区分，保留完整明细。
            </p>
            <p>
              填写 DD 次数时，按每笔金额判断；未填写次数时按累计金额判断。超过
              DD 截止日的存款会保留但不计入达标。
            </p>
            <p>
              最低持有期从开户日期起算。达到该日期只表示满足你记录的天数，仍需核对提前关户费用和追回奖励条款。
            </p>
            <p>
              冷却期按日历月份计算，并使用同银行最近一次有效基准日期。所有资格规则必须共同满足，未知条件不会自动视为合格。
            </p>
            <p>
              历史账户影响资格与实收，不继承当前活动的 DD
              和持有要求。这里的活动与到账记录独立保存，新增、修改或撤销均不改变财务流水。
            </p>
            <p>这里仅统计已登记的活动奖励。实际收入请核对账单或手动记入财务。</p>
          </div>
        </Modal>
      )}
      {showImport && (
        <Modal title="导入活动来源链接" onClose={() => setShowImport(false)}>
          <div className="br-rule-help">
            <p>粘贴活动链接，将来源带入新活动，再核对条款并手动填写。</p>
            <div className="br-notice">
              当前版本不自动抓取或调用
              AI。自动提取将作为后续功能，手动录入始终可用。
            </div>
            <Field label="活动链接">
              <input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <ErrorNote error={error} />
          </div>
          <footer className="br-modal-footer">
            <button onClick={() => setShowImport(false)}>取消</button>
            <button
              className="br-primary"
              onClick={() => {
                try {
                  const u = new URL(importUrl);
                  if (!["https:", "http:"].includes(u.protocol)) throw Error();
                  setEditor({ ...emptyOffer(user.id), sourceUrl: u.href });
                  setShowImport(false);
                  setError("");
                } catch {
                  setError("请输入有效的 http / https 链接。");
                }
              }}
            >
              带入表单并审核
              <ArrowUpRight size={15} />
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
