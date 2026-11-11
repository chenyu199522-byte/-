import DepositRecords from './DepositRecords';
import ConditionProgress from './ConditionProgress';
import EvidenceImages from "./EvidenceImages";
import SettingsSelect from "../../components/SettingsSelect";
import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import type { User } from "../../types";
import type {
  RewardAccount,
  RewardOffer,
  RewardState,
  RewardDdEvent,
} from "../../services/bank-rewards/types";
import { rewardRepository } from "../../services/bank-rewards/repository";
import {
  bankAccounts,
  countdown,
  ddProgress, qualificationProgress, actualReceipts, rewardPayoutSchedule, payoutTermLabel,
  cycleBasisLabels,
  eligibility,
  money,
  safeCloseOn,
  addDays,
  isISO,
  todayISO,
  formatDuration,
  accountStatus,
} from "../../services/bank-rewards/logic";
import {
  Badge,
  BankMark,
  DateField,
  ErrorNote,
  Field,
  Modal,
  NumberField,
  Progress,
} from "./ui";
export type AccountAction =
  "open" | "new" | "history" | "edit" | "dd" | "receipt" | "close";
export function AccountDialog({
  user,
  offer,
  account,
  ddEvent,
  mode,
  onClose,
  onSaved,
}: {
  user: User;
  offer: RewardOffer;
  account?: RewardAccount;
  ddEvent?: RewardDdEvent;
  mode: AccountAction;
  onClose: () => void;
  onSaved: (s: RewardState) => void;
}) {
  const history = mode === "history",
    title = {
      open: account ? "编辑账户记录" : "记录开户",
      new: "再次开户（新增账户）",
      history: "补录历史账户",
      edit: "编辑账户与历史日期",
      dd: ddEvent ? "编辑 DD / 消费记录" : "工资 DD / 卡片消费",
      receipt: "记录奖励到账",
      close: "记录关户",
    }[mode];
  const submitting = useRef(false);
  const creationId = useRef(crypto.randomUUID());
  const ddId = useRef(ddEvent?.id || crypto.randomUUID());
  const [a, setA] = useState<Partial<RewardAccount>>({
    ...account,
    ...(offer.rewardMode==='separate'?{componentReceipts:account?.componentReceipts||{}}:{}),
    openedOn: account?.openedOn || todayISO(),
    name: account?.name || "",
    bonusReceivedOn:
      mode === "receipt"
        ? account?.bonusReceivedOn || todayISO()
        : account?.bonusReceivedOn || null,
    bonusReceivedCents:
      mode === "receipt"
        ? (account?.bonusReceivedCents ?? offer.bonusCents)
        : (account?.bonusReceivedCents ?? null),
    closedOn:
      mode === "close"
        ? account?.closedOn || todayISO()
        : account?.closedOn || null,
    minHoldDays: history ? null : account ? account.minHoldDays : offer.minHoldDays,
    periodRanges:account?.periodRanges,
    notes: account?.notes || "",
    closureMethod: account?.closureMethod || offer.closureMethod,
    historyOnly: history || account?.historyOnly || false,
    syncIncome: false,
    incomeCurrency: account?.incomeCurrency || user.currency || "USD",
    exchangeRate: account?.exchangeRate || null,
  });
  const [date, setDate] = useState<string | null>(ddEvent?.date || todayISO()),
    [amount, setAmount] = useState<number | null>(ddEvent?.amountCents ?? offer.ddAmountCents),
    [entryKind, setEntryKind] = useState<"debit"|"dd"|"credit">(ddEvent?.kind || "dd"),
    [source, setSource] = useState(ddEvent?.sourceNote || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmEarly, setConfirmEarly] = useState(false);
  const set = <K extends keyof RewardAccount>(k: K, v: RewardAccount[K]) =>
    setA((p) => ({ ...p, [k]: v }));
  const complete = mode === "history" || mode === "edit",
    safe =
      !a.historyOnly &&
      a.openedOn &&
      isISO(a.openedOn) &&
      a.minHoldDays !== null &&
      a.minHoldDays !== undefined &&
      a.minHoldDays >= 0 &&
      a.minHoldDays <= 36525
        ? addDays(a.openedOn, a.minHoldDays)
        : null,
    early = safe && a.closedOn && a.closedOn < safe;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setError("");
    if (early && !confirmEarly) {
      setError("关户日期早于最低持有期，请确认风险后再保存。");
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const s =
        mode === "dd"
          ? await rewardRepository.saveDd(user.id, {
              id: ddId.current,
              userId: user.id,
              accountId: account!.id,
              date: date || "",
              amountCents: amount ?? 0,
              kind:entryKind, sourceNote: source,
            })
          : await rewardRepository.saveAccount(user.id, offer.id, a, { newAccount: mode === "new" || history, creationId: account ? undefined : creationId.current });
      onSaved(s);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={save}>
        <ErrorNote error={error} />
        <p className="br-hint">
          {offer.bankName} · {offer.productName} · {offer.currency}
        </p>
        {history && (
          <div className="br-notice">
            历史账户参与重复领奖资格和实收统计，无需补录
            DD，也不会继承当前活动的持有要求。
          </div>
        )}
        <div className="br-form-grid">
          {mode === "dd" ? (
            <>
              {<Field label="记录类型"><select aria-label="记录类型" value={entryKind} onChange={e=>{setEntryKind(e.target.value as "dd"|"debit"|"credit");setAmount(null);}}><option value="dd">工资直接存款</option><option value="debit">借记卡消费</option><option value="credit">信用卡消费</option></select></Field>}
              <DateField
                label={entryKind!=="dd" ? "消费日期 *" : "DD 到账日期 *"}
                value={date}
                onChange={setDate}
              />
              <NumberField
                label={entryKind!=="dd" ? "消费金额 *" : "到账金额 *"}
                money
                value={amount}
                onChange={setAmount}
              />
              <Field label="来源 / 备注">
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder={entryKind!=="dd" ? "例如商户名称" : "例如工资来源"}
                />
              </Field>
            </>
          ) : (
            <>
              {(complete || mode === "open" || mode === "new") && (
                <>
                  <Field label="账户名称 / 备注标识">
                    <input
                      value={a.name || ""}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder="用于区分多次开户，不需要账号"
                    />
                  </Field>
                  <DateField
                    label="开户日期 *"
                    value={a.openedOn || null}
                    onChange={(v) => set("openedOn", v || "")}
                  />
                  {!a.historyOnly && offer.cycleBasis==="custom" && Array.from({length:offer.rewardCycleCount || 0},(_,index)=>
                    <React.Fragment key={index}>{(["start","end"] as const).map(edge=><React.Fragment key={edge}><DateField label={`第 ${index+1} 期${edge==="start"?"开始":"结束"}日期`}
                      value={a.periodRanges?.[index]?.[edge] || null} onChange={v=>{
                        const ranges={...a.periodRanges}, range={start:"",end:"",...ranges[index],[edge]:v || ""};
                        if (range.start || range.end) ranges[index]=range; else delete ranges[index]; set("periodRanges", ranges);
                      }}/></React.Fragment>)}</React.Fragment>)}
                  {!a.historyOnly && (
                    <NumberField
                      label="此账户最低持有天数"
                      value={a.minHoldDays ?? null}
                      onChange={(v) => { set("minHoldDays", v); set("minHoldOverride", true); }}
                    />
                  )}
                </>
              )}
              {complete && !!offer.additionalConditions && <DateField label="其他条件已核对完成日期（未完成留空）" value={a.additionalConditionsMetOn||null} onChange={v=>set('additionalConditionsMetOn',v)}/>}
              {(complete || mode === "receipt") && (offer.rewardMode==='separate' ? <>
                <p className="br-hint">两项奖励分别登记实际到账；未到账的日期留空。</p>
                {(['dd','deposit'] as const).map(kind=><React.Fragment key={kind}>
                  <DateField label={(kind==='dd'?'DD / 消费':'存款')+'奖励到账日期'} value={a.componentReceipts?.[kind]?.date||null} onChange={date=>{
                    const parts={...a.componentReceipts};
                    if(date)parts[kind]={date,cents:parts[kind]?.cents??(kind==='dd'?offer.ddBonusCents:offer.depositBonusCents)??0};else delete parts[kind];
                    set('componentReceipts',parts);
                  }}/>
                  <NumberField label={(kind==='dd'?'DD / 消费':'存款')+'实际到账金额'} money value={a.componentReceipts?.[kind]?.cents??null} onChange={cents=>{
                    if(!a.componentReceipts?.[kind])return;
                    set('componentReceipts',{...a.componentReceipts,[kind]:{...a.componentReceipts[kind]!,cents:cents??0}});
                  }}/>
                </React.Fragment>)}
              </> : <>
                  <DateField label="奖励到账日期" value={a.bonusReceivedOn || null} onChange={(v) => set("bonusReceivedOn", v)}/>
                  <NumberField label="实际到账金额" money value={a.bonusReceivedCents ?? null} onChange={(v) => set("bonusReceivedCents", v)}/>
              </>)}
              {(complete || mode === "close") && (
                <>
                  <DateField
                    label="关户日期"
                    value={a.closedOn || null}
                    onChange={(v) => set("closedOn", v)}
                  />
                  <Field label="关闭方式">
                    <input
                      value={a.closureMethod || ""}
                      onChange={(e) => set("closureMethod", e.target.value)}
                    />
                  </Field>
                </>
              )}
              <Field label="备注">
                <textarea
                  value={a.notes || ""}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
        {(mode === "close" || early) && (
          <div className="br-notice">
            最低持有期参考日期：{safe || "未知，请核对条款"}
            。这只是按你记录的条款计算，不保证银行不会追回奖励。
            {early && (
              <label className="br-check">
                <input
                  type="checkbox"
                  checked={confirmEarly}
                  onChange={(e) => setConfirmEarly(e.target.checked)}
                />
                确认记录提前关户；已核对潜在费用和奖励追回风险。
              </label>
            )}
          </div>
        )}
        <footer className="br-modal-footer">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="br-primary" disabled={busy}>
            {busy ? "正在保存…" : "保存记录"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export default function AccountPanel({
  initialAccountId,
  initialSection,
  user,
  offer,
  state,
  onClose,
  onSaved,
  onEdit,
  onAction,
  onConfirm,
}: {
  initialAccountId?: string;
  initialSection?: "dd";
  user: User;
  offer: RewardOffer;
  state: RewardState;
  onClose: () => void;
  onSaved: (s: RewardState) => void;
  onEdit: () => void;
  onAction: (m: AccountAction, a?: RewardAccount, event?: RewardDdEvent) => void;
  onConfirm: (title: string, action: () => Promise<RewardState>) => void;
}) {
  const accounts = state.accounts
    .filter((a) => a.offerId === offer.id)
    .sort((a, b) => b.openedOn.localeCompare(a.openedOn));
  const [selected, setSelected] = useState(initialAccountId || accounts[0]?.id || "");
  const ddSection = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (initialSection !== "dd" || !ddSection.current) return;
    ddSection.current.focus({ preventScroll: true });
    ddSection.current.scrollIntoView({ block: "start", behavior: "instant" });
  }, [initialSection, selected]);
  const a = accounts.find((a) => a.id === selected) || accounts[0];
  const dd = a ? ddProgress(a, offer, state) : null,
    e = eligibility(offer, state),
    safe = a ? safeCloseOn(a) : null;
  const qualified=a?qualificationProgress(a,offer,state):null;
  const payout = rewardPayoutSchedule(offer, a?.openedOn, qualified?.last);
  const today = todayISO();
  return (
    <div className="br-detail-backdrop">
      <aside
        className="br-detail"
        role="dialog"
        aria-modal="true"
        aria-label="奖励活动详情"
      >
        <header>
          <div className="br-preview-bank">
            <BankMark name={offer.bankName} />
            <div>
              <h2>{offer.bankName}</h2>
              <p>{offer.productName}</p>
            </div>
          </div>
          <button
            className="br-icon-button"
            aria-label="关闭详情"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div className="br-detail-scroll">
          <section className="br-section">
            <div className="br-section-title">
              <div>
                <small>广告奖励</small>
                <h2 className="br-detail-amount">
                  {money(offer.bonusCents, offer.currency)}
                </h2>
              </div>
              <button onClick={onEdit}>
                <Pencil size={15} />
                编辑活动
              </button>
            </div>
            <p>{offer.requirements || "尚未填写要求说明"}</p>
            <dl className="br-facts">
              <dt>月费 / 豁免</dt>
              <dd>
                {[offer.monthlyFee, offer.feeNote]
                  .filter(Boolean)
                  .join(" · ") || "未注明"}
              </dd>
              <dt>提前关户</dt>
              <dd>{offer.earlyClosePenalty || "未注明"}</dd>
              <dt>活动截止</dt>
              <dd>
                {offer.expiresOn || "未注明"}{" "}
                {offer.expiresOn && countdown(offer.expiresOn)}
              </dd>
              <dt>申请结果</dt>
              <dd>
                {
                  {
                    unreviewed: "未处理",
                    ineligible: "不符合资格",
                    denied: "被拒",
                    opened: "已开户",
                  }[offer.applicationStatus]
                }
                {offer.deniedOn &&
                  ` · ${offer.deniedOn} · 被拒 ${formatDuration(offer.deniedOn, today)}`}
              </dd>
              {offer.denialReason && (
                <>
                  <dt>原因</dt>
                  <dd>{offer.denialReason}</dd>
                </>
              )}
            </dl>
          </section>
          <section className="br-section">
            <div className="br-section-title">
              <h2>账户与生命周期</h2>
              <div className="br-actions">
                <button onClick={() => onAction(a ? "edit" : "open", a)}>
                  <Plus size={15} />
                  {a ? "编辑账户" : "记录开户"}
                </button>
                <button onClick={() => onAction("history")}>补录历史</button>
                {a && <button onClick={() => onAction("new")}>再次开户</button>}
              </div>
            </div>
            {accounts.length > 0 ? (
              <>
                <Field label="选择账户">
                  <SettingsSelect
                    value={a?.id || ""}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name || offer.productName || "账户"} · {a.openedOn}
                        {a.historyOnly ? " · 历史" : ""}
                        {a.closedOn ? " · 已关户" : ""}
                      </option>
                    ))}
                  </SettingsSelect>
                </Field>
                <div className="br-account-toolbar">
                  <Badge tone={accountStatus(a, offer, state).tone}>
                    {accountStatus(a, offer, state).label}
                  </Badge>
                  <button onClick={() => onAction("edit", a)}>
                    修改日期 / 账户
                  </button>
                </div>
                <ol className="br-timeline">
                  {[
                    ["开户", a.openedOn],
                    ["DD 截止", dd?.deadline],
                    ["奖励条件达标", qualified?.last],
                    [`${payout.dateLabel} · ${payout.anchorLabel} · ${payoutTermLabel(offer)}`, payout.date],
                    ["奖励到账", a.bonusReceivedOn],
                    ["最低持有期", safe],
                    ["实际关户", a.closedOn],
                    ["再次可申请", e.date],
                  ].map(([label, date]) => (
                    <li key={label}>
                      <i />
                      <strong>{label}</strong>
                      <span>
                        {date || "待记录 / 未知"}
                        {date && (
                          <small>
                            {label === "开户" ||
                            label === "奖励到账" ||
                            label === "实际关户"
                              ? `已过 ${formatDuration(date, today)}`
                              : countdown(date, today, label === "再次可申请")}
                          </small>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
                {a.historyOnly ? (
                  <p className="br-hint">历史账户仅参与历史实收与资格计算。</p>
                ) : (
                  <div className="br-dd-section" ref={ddSection} tabIndex={-1} role="region" aria-label="逐笔 DD">
                    <div className="br-section-title">
                      <div>
                        <strong>{offer.rewardCycleCount ? cycleBasisLabels[offer.cycleBasis || "opening"]+"核对" : "逐笔 DD"}</strong>
                        <small className="br-dd-account-label">{a.name || offer.productName || "当前账户"} · 开户 {a.openedOn}</small>
                      </div>
                      <button onClick={() => onAction("dd", a)}>
                        <Plus size={15} />
                        {offer.rewardCycleCount ? "记录 DD / 消费" : "记录 DD"}
                      </button>
                    </div>
                    {!dd?.periods.length && <Progress
                      value={dd!.ratio}
                      tone={dd?.late ? "red" : "teal"}
                    />}
                    <p className="br-hint">
                      {offer.rewardCycleCount ? `已完成 ${dd?.count} / ${offer.rewardCycleCount} 期` : `${dd?.count} / ${offer.ddCount ?? "未注明次数"}`} ·
                      合格期间累计 {money(dd!.totalCents, offer.currency)} ·{" "}
                      {dd?.done
                        ? "已完成"
                        : dd?.known
                          ? "尚未完成"
                          : "要求待核对"}
                    </p>
                    {dd && <ConditionProgress key={a.id} offer={offer} account={a} dd={dd} today={today} detail/>}
                    {(!!offer.depositGoalCents||!!offer.transactionGoal)&&<DepositRecords key={"records-"+a.id} userId={user.id} account={a} offer={offer} onSaved={onSaved}/>}
                    {offer.additionalConditions&&<div className="br-record-editor"><p>{offer.additionalConditions}</p><button onClick={()=>onAction('edit',a)}>记录其他条件完成日期</button></div>}
                    <p className="br-hint">{offer.rewardCycleCount ? "按实际日期登记工资 DD、借记卡或信用卡消费。每期独立累计。" : "在下方编辑或删除已有记录；记录 DD 用于新增到账。"}</p>
                    {!dd?.all.length && <p className="br-inline-empty">暂无 DD 记录。到账后点击“记录 DD”添加。</p>}
                    {dd?.all.map((event) => (
                      <div className="br-dd-row" key={event.id}>
                        <div>
                          <strong>
                            {event.kind==="credit" ? "信用卡消费 · " : event.kind==="debit" ? "借记卡消费 · " : ""}{event.date} ·{" "}
                            {money(event.amountCents, offer.currency)}
                          </strong>
                          <small>
                            {event.sourceNote || "未注明来源"}
                            {dd.deadline && event.date > dd.deadline
                              ? " · 截止后到账，不计入达标"
                              : ""}
                          </small>
                        </div>
                        <div className="br-dd-actions">
                          <button aria-label={`编辑 DD：${event.date} ${money(event.amountCents, offer.currency)}`} onClick={() => onAction("dd", a, event)}><Pencil size={15}/>编辑</button>
                          <button
                            className="br-danger"
                            aria-label={`删除 DD：${event.date} ${money(event.amountCents, offer.currency)}`}
                            onClick={() =>
                              onConfirm(`删除 ${event.date} 的 ${money(event.amountCents, offer.currency)} DD 记录？删除后将重新计算 DD 进度，财务流水保持不变。此操作不可撤销；如果只是金额或日期有误，请取消后选择“编辑”。`, () =>
                                rewardRepository.deleteDd(user.id, event.id),
                              )
                            }
                          >
                            <Trash2 size={15} />
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                    {qualified?.done && !a.bonusReceivedOn && (
                      <p className="br-hint">
                        {payout.start && `${payout.anchorLabel}，已过 ${formatDuration(payout.start, today)} · `}{payoutTermLabel(offer)}{payout.date && ` · ${payout.dateLabel} ${payout.date}（${countdown(payout.date, today)}）`}
                      </p>
                    )}
                  </div>
                )}
                <div className="br-account-actions">
                  <button onClick={() => onAction("receipt", a)}>
                    <CheckCircle2 size={15} />
                    {a.bonusReceivedOn ? "修改到账" : "奖励到账"}
                  </button>
                  <button onClick={() => onAction("close", a)}>
                    {a.closedOn ? "修改关户" : "关户"}
                  </button>
                  {actualReceipts(a).length>0 && (
                    <button
                      className="br-danger"
                      onClick={() =>
                        onConfirm(
                          "撤销这条活动到账记录？财务流水保持不变。",
                          () =>
                            rewardRepository.revokeReceipt(user.id, a),
                        )
                      }
                    >
                      撤销到账
                    </button>
                  )}
                  {a.closedOn && <button className="br-danger" onClick={() => onConfirm("撤销关户并恢复为开放账户？", () => rewardRepository.revokeClosure(user.id, a))}>撤销关户</button>}
                  <button
                    className="br-danger"
                    onClick={() =>
                      onConfirm("删除该参与账户及其 DD 记录？财务流水保持不变。", () =>
                        rewardRepository.deleteAccount(user.id, a.id),
                      )
                    }
                  >
                    删除账户
                  </button>
                </div>
                {actualReceipts(a).length>0 && (
                  <p className="br-hint">
                    实际到账 {money(a.bonusReceivedCents, offer.currency)} ·{" "}
                    活动记录，不同步财务
                  </p>
                )}
                {a.notes && <p className="br-note">{a.notes}</p>}
              </>
            ) : (
              <div className="br-inline-empty">
                尚未开户。记录开户后开始追踪 DD 和持有期。
              </div>
            )}
          </section>
          <section className="br-section">
            <h2>重复领奖资格</h2>
            <p className="br-hint">
              按同一银行全部历史账户计算；名称不同的银行需统一名称。
            </p>
            {e.results.map((r) => (
              <div key={r.id} className="br-rule-result">
                <strong>{r.description}</strong>
                <Badge
                  tone={
                    r.status === "met"
                      ? "teal"
                      : r.status === "waiting"
                        ? "amber"
                        : r.status === "blocked"
                          ? "red"
                          : "muted"
                  }
                >
                  {r.text}
                </Badge>
                {r.eligibleOn && <small>{r.eligibleOn}</small>}
              </div>
            ))}
            <div className="br-notice">
              综合结果：
              {
                {
                  met: "记录的规则均已满足，请核对银行最新条款",
                  waiting: "仍在冷却期",
                  blocked: "目前不符合条件",
                  unknown: "存在未知条件，需要人工核验",
                }[e.status]
              }
            </div>
          </section>
          <section className="br-section">
            <h2>同银行历史账户</h2>
            {bankAccounts(offer, state).map((h) => (
              <div className="br-dd-row" key={h.id}>
                <div>
                  <strong>
                    {h.openedOn} → {h.closedOn || "尚未关闭"}
                  </strong>
                  <small>
                    {h.bonusReceivedOn
                      ? `${h.bonusReceivedOn} 到账 ${money(h.bonusReceivedCents, state.offers.find((o) => o.id === h.offerId)?.currency)}`
                      : "未记录奖励到账"}
                  </small>
                </div>
                {h.historyOnly && <Badge>历史</Badge>}
                <button onClick={() => onAction("edit", h)}>编辑账户</button>
                <button className="br-danger" onClick={() => onConfirm("删除该历史账户及其 DD 记录？财务流水保持不变。", () => rewardRepository.deleteAccount(user.id, h.id))}>删除账户</button>
              </div>
            ))}
          </section>
          <section className="br-section">
            <h2>来源与备注</h2>
            {[
              ["活动来源", offer.sourceUrl],
              ["推荐链接", offer.referralUrl],
              ["DoC 规则", offer.docUrl],
              ["重复领奖来源", offer.repeatSourceUrl],
              ["关户来源", offer.closureSourceUrl],
            ]
              .filter(([, url]) => url)
              .map(([label, url]) => (
                <a
                  className="br-source"
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {label}
                  <ExternalLink size={14} />
                </a>
              ))}
            <p className="br-hint">
              规则核对：{offer.docCheckedOn || "未记录"}
            </p>
            <p className="br-note">{offer.notes || "暂无备注"}</p>
            {!!offer.images?.length && <EvidenceImages items={offer.images}/>}
            <p className="br-hint">
              关户方式：{offer.closureMethod || "未记录"}
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
