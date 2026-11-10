import SettingsSelect from "../../components/SettingsSelect";
import React, { useState } from "react";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Sparkles,
  CalendarDays,
  Landmark,
} from "lucide-react";
import type { User } from "../../types";
import type {
  EligibilityRule,
  RewardOffer,
  RewardState,
  RuleKind,
} from "../../services/bank-rewards/types";
import { rewardRepository } from "../../services/bank-rewards/repository";
import {
  addDays,
  addMonths,
  cycleBasisLabels, rewardCycleRange, rewardPayoutSchedule, payoutTermLabel,
  money,
  todayISO,
  isISO,
  countdown,
} from "../../services/bank-rewards/logic";
import {
  BankMark,
  Badge,
  currencies,
  DateField,
  ErrorNote,
  Field,
  NumberField,
  Progress,
} from "./ui";
export const ruleKinds: Record<RuleKind, string> = {
  current_account: "不能持有现有账户",
  account_history: "账户历史",
  bonus_history: "领奖历史",
  membership_history: "会员历史",
  calendar_limit: "自然年限制",
  household_limit: "家庭限制",
  lifetime_limit: "终身限制",
  other: "其他限制",
};
function previewOffset(date: string, amount: number | null, months = false) {
  if (
    amount === null ||
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    amount > (months ? 1200 : 36525)
  )
    return null;
  const result = months ? addMonths(date, amount) : addDays(date, amount);
  return isISO(result) ? result : null;
}
export default function OfferEditor({
  user,
  initial,
  rules: initialRules,
  onClose,
  onSaved,
}: {
  user: User;
  initial: RewardOffer;
  rules: EligibilityRule[];
  onClose: () => void;
  onSaved: (s: RewardState) => void;
}) {
  const [o, setO] = useState({ ...initial }),
    [rules, setRules] = useState(initialRules.map((r) => ({ ...r }))),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [previewDate, setPreviewDate] = useState(todayISO());
  const set = <K extends keyof RewardOffer>(key: K, value: RewardOffer[K]) =>
    setO((p) => ({ ...p, [key]: value }));
  const text = (
    key: keyof RewardOffer,
    label: string,
    placeholder = "",
    area = false,
  ) => (
    <Field label={label}>
      {area ? (
        <textarea
          aria-label={label}
          value={String(o[key] ?? "")}
          placeholder={placeholder}
          onChange={(e) => set(key, e.target.value as never)}
        />
      ) : (
        <input
          aria-label={label}
          value={String(o[key] ?? "")}
          placeholder={placeholder}
          onChange={(e) => set(key, e.target.value as never)}
        />
      )}
    </Field>
  );
  const number = (key: keyof RewardOffer, label: string, isMoney = false) => (
    <NumberField
      label={label}
      value={(o[key] ?? null) as number | null}
      money={isMoney}
      onChange={(v) => set(key, v as never)}
    />
  );
  const base = isISO(previewDate) ? previewDate : todayISO(),
    deadline = o.rewardCycleCount ? (o.rewardCycleCount>0 && o.rewardCycleCount<=36 && isISO(base) ? rewardCycleRange({openedOn:base,historyOnly:false},o,o.rewardCycleCount-1).end || null : null) : previewOffset(base, o.deadlineDays),
    schedule = rewardPayoutSchedule(o, base, deadline),
    payout = schedule.date,
    safe = previewOffset(base, o.minHoldDays),
    anchor =
      o.repeatAnchor === "open"
        ? base
        : o.repeatAnchor === "bonus"
          ? payout
          : safe,
    repeat =
      o.repeatable === true && anchor && o.repeatIntervalMonths
        ? previewOffset(anchor, o.repeatIntervalMonths, true)
        : null;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSaved(await rewardRepository.saveOffer(user.id, o, rules));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="br-editor" onSubmit={save}>
      <header className="br-page-header">
        <div className="br-title-group">
          <button
            type="button"
            className="br-icon-button"
            aria-label="返回金羊毛"
            onClick={onClose}
          >
            <ArrowLeft />
          </button>
          <div>
            <h1>{o.id ? "编辑奖励活动" : "新增奖励活动"}</h1>
            <p>记录活动条款，让每个关键日期都有据可循。</p>
          </div>
        </div>
        <div className="br-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="br-primary" disabled={busy}>
            <Save size={16} />
            {busy ? "正在保存…" : "保存奖励活动"}
          </button>
        </div>
      </header>
      <ErrorNote error={error} />
      <Field label="活动类型">
        <SettingsSelect value={o.activityType || "one_time"} onChange={e => set("activityType", e.target.value as RewardOffer["activityType"])}>
          <option value="one_time">一次性活动</option><option value="long_term">长期活动</option>
        </SettingsSelect>
      </Field>
      <div className="br-editor-scroll">
        {o.activityType === "long_term" ? <section className="br-section">
          <h2>长期活动信息</h2>
          <div className="br-form-grid">
            {text("bankName", "机构 / 平台名称 *", "平台名称")}
            {text("productName", "活动名称 / 产品", "长期奖励活动")}
            <Field label="币种"><SettingsSelect value={o.currency} onChange={e => set("currency", e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</SettingsSelect></Field>
            <Field label="活动状态"><SettingsSelect value={o.activityStatus || "active"} onChange={e => set("activityStatus", e.target.value as RewardOffer["activityStatus"])}><option value="active">持续中</option><option value="paused">已暂停</option><option value="ended">已结束</option></SettingsSelect></Field>
            <DateField label="活动开始日期" value={o.startsOn} onChange={v => set("startsOn",v)}/>
            <DateField label="活动结束日期" value={o.expiresOn} onChange={v => set("expiresOn",v)}/>
            {text("sourceUrl", "活动来源链接", "https://…")}
            {text("notes", "备注", "活动说明", true)}
          </div>
          <p className="br-hint">保存后逐笔记录收益、存入和提取。收益按明细累计，存提不计入收益；所有记录均独立于财务。</p>
        </section> : <>

        <div className="br-editor-grid">
          <div className="br-editor-main">
            <section className="br-section">
              <h2>
                <Landmark size={18} />
                基本信息
              </h2>
              <div className="br-form-grid">
                {text("bankName", "机构 / 平台名称 *", "例如 Chase、购物平台")}
                {text("productName", "活动名称 / 产品", "例如开户奖励、消费返现活动")}
                {text("accountType", "账户类型", "支票账户 / 储蓄账户")}
                <Field label="币种">
                  <SettingsSelect
                    value={o.currency}
                    onChange={(e) => set("currency", e.target.value)}
                  >
                    {currencies.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </SettingsSelect>
                </Field>
                {number("bonusCents", "广告奖励金额", true)}
                <Field label="申请结果">
                  <SettingsSelect
                    value={o.applicationStatus}
                    onChange={(e) =>
                      set("applicationStatus", e.target.value as never)
                    }
                  >
                    <option value="unreviewed">未处理</option>
                    <option value="ineligible">不符合资格</option>
                    <option value="denied">申请被拒</option>
                    <option value="opened">已开户（账户详情另行记录）</option>
                  </SettingsSelect>
                </Field>
                <DateField
                  label="活动开始日期"
                  value={o.startsOn}
                  onChange={(v) => set("startsOn", v)}
                />
                <DateField
                  label="活动截止日期"
                  value={o.expiresOn}
                  onChange={(v) => set("expiresOn", v)}
                />
                {o.applicationStatus === "denied" && (
                  <>
                    <DateField
                      label="拒绝日期 *"
                      value={o.deniedOn}
                      onChange={(v) => set("deniedOn", v)}
                    />
                    {text("denialReason", "拒绝原因 *")}
                  </>
                )}
              </div>
            </section>
            <section className="br-section">
              <h2>奖励条件</h2>
              <div className="br-form-grid">
                {number(
                  "ddAmountCents",
                  o.rewardCycleCount ? "每期工资 DD 累计最低金额" : "每笔 DD 金额 / 单笔要求未知时填总额",
                  true,
                )}
                {number("rewardCycleCount", "连续考核期数（按期累计时填写）")}
                {!!o.rewardCycleCount && <Field label="周期计算方式"><SettingsSelect aria-label="周期计算方式" value={o.cycleBasis || "opening"} onChange={e=>set("cycleBasis",e.target.value as RewardOffer["cycleBasis"])}>{Object.entries(cycleBasisLabels).map(([id,label])=><option value={id} key={id}>{label}</option>)}</SettingsSelect></Field>}
                {!!o.rewardCycleCount && o.cycleBasis==="statement" && number("statementDay","每月账单截止日（1–31，短月取月底）")}
                {!!o.rewardCycleCount && o.cycleBasis==="custom" && <p className="br-hint">在账户编辑里填写各期起止日期。</p>}
                {o.rewardCycleCount ? number("cycleDebitCents","每期借记卡消费最低金额",true) : number("ddCount", "DD 次数（留空按累计金额）")}
                {!o.rewardCycleCount && number("deadlineDays", "DD 截止期限（开户后天数）")}
                {number("minHoldDays", "最低持有天数")}
                {number("payoutDays", "奖励到账期限（天数，可留空）")}
                <Field label="到账起算日">
                  <SettingsSelect aria-label="到账起算日" value={o.payoutAnchor || "qualification"} onChange={e => set("payoutAnchor", e.target.value as RewardOffer["payoutAnchor"])}>
                    <option value="qualification">DD 达标日（多期活动以全部条件达标为准）</option>
                    <option value="opening">开户日</option>
                  </SettingsSelect>
                </Field>
                <Field label="发放时间">
                  <SettingsSelect aria-label="发放时间" value={o.payoutTiming || "within"} onChange={e => set("payoutTiming", e.target.value as RewardOffer["payoutTiming"])}>
                    <option value="within">期限内到账</option>
                    <option value="after">满期后发放</option>
                  </SettingsSelect>
                </Field>
                <Field label="到账期限单位"><SettingsSelect aria-label="到账期限单位" value={o.payoutDayUnit || "calendar"} onChange={e=>set("payoutDayUnit",e.target.value as RewardOffer["payoutDayUnit"])}><option value="calendar">自然日</option><option value="business">工作日</option></SettingsSelect>
                  <small className="br-hint">{schedule.anchorLabel}，次日计第 1 天。{o.payoutDayUnit === "business" ? "跳过周末和美国银行休假日。" : "包含周末和节假日。"}{o.payoutTiming === "after" && "满期后仍须满足活动条件，实际发放日以银行入账为准。"}</small>
                </Field>
                {text("monthlyFee", "月费")}
                {text("feeNote", "月费豁免条件")}
                {number("feeGoalCents","每期免月费金额门槛（需要追踪时填写）",true)}
                {number("feeFreeCycles","开户前几期自动免月费（可留空）")}
                {(!!o.feeGoalCents || !!o.feeFreeCycles) && <>
                  <Field label="免月费累计项目"><SettingsSelect aria-label="免月费累计项目" value={o.feeMetric || "dd"} onChange={e=>set("feeMetric",e.target.value as RewardOffer["feeMetric"])}><option value="dd">工资 DD</option><option value="debit">借记卡消费</option></SettingsSelect></Field>
                  <Field label="免月费计算周期"><SettingsSelect aria-label="免月费计算周期" value={o.feeBasis || ""} onChange={e=>set("feeBasis",e.target.value as RewardOffer["feeBasis"])}><option disabled value="">待确认</option><option value="statement">账单周期</option><option value="calendar">自然月</option><option value="opening">开户日逐月</option></SettingsSelect></Field>
                  {o.feeBasis==="statement" && number("feeStatementDay","免月费结账日（未确认可留空）")}
                </>}
                {text(
                  "requirements",
                  "要求说明",
                  "例如工资、养老金等合格直接存款",
                  true,
                )}
              </div>
              <p className="br-hint">
                {o.rewardCycleCount ? "按所选周期计算。工资 DD 和借记卡消费分别累计，两项均达标才完成本期。" : <>填写次数时，每笔 DD
                都需达到金额要求；只填金额时按累计金额计算。未知条款请留空。</>}
              </p>
            </section>
            <section className="br-section">
              <h2>关户与重复领奖规则</h2>
              <div className="br-form-grid">
                {text("earlyClosePenalty", "提前关户惩罚")}
                <Field label="是否允许重复领奖">
                  <SettingsSelect
                    value={
                      o.repeatable === null ? "unknown" : String(o.repeatable)
                    }
                    onChange={(e) =>
                      set(
                        "repeatable",
                        e.target.value === "unknown"
                          ? null
                          : e.target.value === "true",
                      )
                    }
                  >
                    <option value="unknown">未知，需核对</option>
                    <option value="true">允许</option>
                    <option value="false">不允许</option>
                  </SettingsSelect>
                </Field>
                {number("repeatIntervalMonths", "重复领奖间隔（月）")}
                <Field label="重复领奖冷却基准">
                  <SettingsSelect
                    value={o.repeatAnchor || ""}
                    onChange={(e) =>
                      set("repeatAnchor", (e.target.value || null) as never)
                    }
                  >
                    <option value="">未知</option>
                    <option value="open">开户日期</option>
                    <option value="close">关户日期</option>
                    <option value="bonus">奖励到账日期</option>
                  </SettingsSelect>
                </Field>
                {text(
                  "closureMethod",
                  "关户方式说明",
                  "例如通过银行客服关闭账户",
                  true,
                )}
              </div>
            </section>
            <section className="br-section">
              <div className="br-section-title">
                <h2>资格规则</h2>
                <button
                  type="button"
                  onClick={() =>
                    setRules([
                      ...rules,
                      {
                        id: "",
                        userId: user.id,
                        offerId: o.id,
                        kind: "current_account",
                        months: null,
                        anchor: null,
                        description: "申请时不能持有该银行账户",
                        manualResult: "unknown",
                      },
                    ])
                  }
                >
                  <Plus size={15} />
                  添加规则
                </button>
              </div>
              <p className="br-hint">
                所有规则需共同满足。家庭、自然年、会员和其他无法自动验证的条件应人工核验。
              </p>
              {!rules.length && (
                <div className="br-inline-empty">尚未添加额外资格规则</div>
              )}
              {rules.map((r, i) => (
                <div className="br-rule-form" key={r.id || i}>
                  <div className="br-form-grid">
                    <Field label="规则类型">
                      <SettingsSelect
                        value={r.kind}
                        onChange={(e) =>
                          setRules(
                            rules.map((x, j) =>
                              j === i
                                ? { ...x, kind: e.target.value as RuleKind }
                                : x,
                            ),
                          )
                        }
                      >
                        {Object.entries(ruleKinds).map(([v, n]) => (
                          <option value={v} key={v}>
                            {n}
                          </option>
                        ))}
                      </SettingsSelect>
                    </Field>
                    <Field label="基准日期">
                      <SettingsSelect
                        value={r.anchor || ""}
                        onChange={(e) =>
                          setRules(
                            rules.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    anchor: (e.target.value || null) as never,
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="">需人工判断</option>
                        <option value="open">开户日</option>
                        <option value="close">关户日</option>
                        <option value="bonus">奖励到账日</option>
                      </SettingsSelect>
                    </Field>
                    <NumberField
                      label="限制月数"
                      value={r.months}
                      min={1}
                      onChange={(v) =>
                        setRules(
                          rules.map((x, j) =>
                            j === i ? { ...x, months: v } : x,
                          ),
                        )
                      }
                    />
                    <Field label="人工核验">
                      <SettingsSelect
                        value={r.manualResult}
                        onChange={(e) =>
                          setRules(
                            rules.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    manualResult: e.target.value as never,
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="unknown">尚未核验</option>
                        <option value="met">已核验满足</option>
                        <option value="blocked">已核验不满足</option>
                      </SettingsSelect>
                    </Field>
                    <Field label="规则说明 *">
                      <input
                        value={r.description}
                        onChange={(e) =>
                          setRules(
                            rules.map((x, j) =>
                              j === i
                                ? { ...x, description: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </Field>
                    <button
                      type="button"
                      className="br-danger"
                      onClick={() => setRules(rules.filter((_, j) => i !== j))}
                    >
                      <Trash2 size={15} />
                      移除规则
                    </button>
                  </div>
                </div>
              ))}
            </section>
            <section className="br-section">
              <h2>参考与备注</h2>
              <div className="br-form-grid">
                {text("sourceUrl", "活动来源链接", "https://…")}
                {text("docUrl", "Doctor of Credit 链接", "https://…")}
                <DateField
                  label="规则核对日期"
                  value={o.docCheckedOn}
                  onChange={(v) => set("docCheckedOn", v)}
                />
                {text("repeatSourceUrl", "重复领奖来源链接", "https://…")}
                {text("closureSourceUrl", "关户来源链接", "https://…")}
                {text("notes", "备注", "你的记录与提醒", true)}
              </div>
            </section>
          </div>
          <aside className="br-preview">
            <section className="br-section">
              <h2>
                <Sparkles size={17} />
                实时预览
              </h2>
              <div className="br-preview-bank">
                <BankMark name={o.bankName} />
                <div>
                  <h3>{o.bankName || "银行名称"}</h3>
                  <p>{o.productName || "账户产品"}</p>
                </div>
              </div>
              <div className="br-preview-amount">
                {money(o.bonusCents, o.currency)}
              </div>
              <Badge
                tone={
                  ["ineligible", "denied"].includes(o.applicationStatus)
                    ? "red"
                    : "blue"
                }
              >
                {
                  {
                    unreviewed: "待申请",
                    ineligible: "不符合资格",
                    denied: "申请被拒",
                    opened: "已开户",
                  }[o.applicationStatus]
                }
              </Badge>
              <p className="br-hint">
                {o.expiresOn
                  ? `活动截止 ${o.expiresOn} · ${countdown(o.expiresOn)}`
                  : "填入条款后自动生成日期预览"}
              </p>
              <Progress value={0} />
              <p className="br-hint">
                {o.rewardCycleCount ? `连续 ${o.rewardCycleCount} 期 · 每期工资 DD ${money(o.ddAmountCents, o.currency)} + 借记卡消费 ${money(o.cycleDebitCents ?? 0,o.currency)}` : `DD ${o.ddCount || "—"} 次 · ${money(o.ddAmountCents, o.currency)}`}
              </p>
            </section>
            <section className="br-section">
              <h2>
                <CalendarDays size={17} />
                活动时间线
              </h2>
              <DateField
                label="试算开户日期（仅预览）"
                value={previewDate}
                onChange={(v) => setPreviewDate(v || todayISO())}
              />
              <ol className="br-timeline">
                {[
                  ["开户申请", base],
                  ["假设在截止日达标", deadline],
                  [`${schedule.dateLabel} · ${schedule.anchorLabel} · ${payoutTermLabel(o)}`, payout],
                  ["达到最低持有期", safe],
                  ["再次可申请", repeat],
                ].map(([n, d]) => (
                  <li key={n}>
                    <i />
                    <strong>{n}</strong>
                    <span>{d || "待补充规则"}</span>
                  </li>
                ))}
              </ol>
              <p className="br-hint">
                仅按输入规则试算。未实际关户/到账的冷却日期不代表已取得申请资格。
              </p>
            </section>
          </aside>
        </div></>}
      </div>
    </form>
  );
}
