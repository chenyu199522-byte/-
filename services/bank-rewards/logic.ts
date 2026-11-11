import {getUSHolidays} from '../usHolidays';
import {localDateKey} from '../localDate';
// Adapted concepts from Bank Bonus Tracker (MIT): date-only math, month clamping,
// account history anchors and actual receipts. See THIRD_PARTY_NOTICES.md.
import type {
  RewardAccount, RewardDdEvent,
  RewardOffer,
  RewardState,
  EligibilityRule,
  ISODate,
} from "./types";
const DAY = 86400000;
export const todayISO = localDateKey;
export function isISO(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
const ms = (d: string) => {
  if (!isISO(d)) throw new Error("请输入有效日期（年-月-日）。");
  return Date.parse(`${d}T00:00:00Z`);
};
export const daysBetween = (a: string, b: string) =>
  Math.round((ms(b) - ms(a)) / DAY);
export const addDays = (d: string, days: number) =>
  new Date(ms(d) + days * DAY).toISOString().slice(0, 10);
type PayoutTerms = Pick<RewardOffer, 'payoutDays' | 'payoutDayUnit' | 'payoutAnchor' | 'payoutTiming'>;

export function payoutTermLabel(o: PayoutTerms) {
  if (o.payoutDays == null) return '期限待填';
  if (o.payoutDays === 0) return o.payoutAnchor === 'opening' ? '开户当天' : o.payoutAnchor==='qualification_month_end'?'达标当月月底':'达标当天';
  return o.payoutDayUnit === 'business' ? `${o.payoutDays} 个工作日` : `${o.payoutDays} 天`;
}

/** Count from the day after qualification. Federal Reserve Banks observe Sunday
 * holidays on Monday, but stay open on the Friday before a Saturday holiday. */
export function estimatedPayoutDate(start: string | null | undefined, o: PayoutTerms): string | null {
  const days=o.payoutDays;
  if (!start || !isISO(start) || !Number.isSafeInteger(days) || days == null || days<0 || days>36525) return null;
  if (o.payoutDayUnit !== 'business' || !days) {
    const date=addDays(start,days);
    return isISO(date) ? date : null;
  }
  const cursor=new Date(ms(start));
  let remaining=days;
  while (remaining>0) {
    cursor.setUTCDate(cursor.getUTCDate()+1);
    if (cursor.getUTCFullYear()>9999) return null;
    const weekday=cursor.getUTCDay();
    if (weekday===0 || weekday===6) continue;
    const holidays=getUSHolidays(cursor.toISOString().slice(0,10));
    if (!holidays.some(h=>h.kind==='federal' && (!h.observed || weekday===1))) remaining--;
  }
  return cursor.toISOString().slice(0,10);
}

export function rewardPayoutSchedule(terms: PayoutTerms, openedOn?: string | null, qualifiedOn?: string | null) {
  const fromOpening = terms.payoutAnchor === "opening";
  const monthEnd=terms.payoutAnchor==="qualification_month_end";
  const start = fromOpening ? openedOn : monthEnd && qualifiedOn && isISO(qualifiedOn) ? addDays(addMonths(qualifiedOn.slice(0,8)+"01",1),-1) : qualifiedOn;
  return {
    start,
    date: estimatedPayoutDate(start, terms),
    anchorLabel: fromOpening ? "开户日起算" : monthEnd ? "达标当月月底起算" : "条件达标日起算",
    pendingLabel: fromOpening ? "待填写开户日" : "待达标后起算",
    dateLabel: terms.payoutTiming === "after" ? "满期日" : "最迟到账",
  };
}

export function addMonths(d: string, months: number): string {
  const x = new Date(ms(d));
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0),
  ).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return x.toISOString().slice(0, 10);
}
export const daysSince = (d: string | null, today = todayISO()) =>
  d ? daysBetween(d, today) : null;
export function formatDuration(from: string, to: string): string {
  if (from > to) return formatDuration(to, from);
  const a = new Date(ms(from)),
    b = new Date(ms(to));
  let months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    b.getUTCMonth() -
    a.getUTCMonth();
  if (addMonths(from, months) > to) months--;
  const days = daysBetween(addMonths(from, months), to),
    years = Math.floor(months / 12);
  return (
    [
      years ? `${years} 年` : "",
      months % 12 ? `${months % 12} 月` : "",
      days ? `${days} 天` : "",
    ]
      .filter(Boolean)
      .join(" ") || "0 天"
  );
}
export function countdown(
  target: string | null,
  today = todayISO(),
  eligible = false,
) {
  if (!target) return "待记录";
  const days = daysBetween(today, target);
  if (days === 0) return eligible ? "今天可申请" : "今天";
  if (days < 0)
    return `${eligible ? "已可申请" : "已超过"} ${formatDuration(target, today)}`;
  return `还剩 ${formatDuration(today, target)}`;
}
export const money = (cents: number | null, currency = "USD") =>
  cents === null
    ? "待填写"
    : new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency,
        maximumFractionDigits: cents % 100 ? 2 : 0,
      }).format(cents / 100);
export const cycleBasisLabels = {opening:'开户日逐月',calendar:'自然月',statement:'账单周期',custom:'自定义日期'};
type CycleAccount = Pick<RewardAccount,"openedOn"|"historyOnly"|"periodRanges">;
export function rewardCycleRange(a: CycleAccount, o: RewardOffer, index: number) {
  if (o.cycleBasis === 'custom') return a.periodRanges?.[index] ?? {start:'',end:''};
  const month = a.openedOn.slice(0,7)+'-01';
  if (o.cycleBasis === 'calendar') return {start:index ? addMonths(month,index) : a.openedOn, end:addDays(addMonths(month,index+1),-1)};
  if (o.cycleBasis === 'statement') {
    if (!o.statementDay) return {start:'',end:''};
    const close = (offset:number) => {
      const base=addMonths(month,offset), last=addDays(addMonths(month,offset+1),-1);
      return base.slice(0,8)+String(Math.min(o.statementDay!,Number(last.slice(8)))).padStart(2,'0');
    };
    const offset = close(0)<a.openedOn ? index+1 : index;
    return {start:index ? addDays(close(offset-1),1) : a.openedOn,end:close(offset)};
  }
  return {start:addMonths(a.openedOn,index),end:addDays(addMonths(a.openedOn,index+1),-1)};
}
/** Fee eligibility uses every recorded payment in its own cycle, even after the bonus deadline. */
export function feeProgress(a: RewardAccount, o: RewardOffer, events: RewardDdEvent[], today: string, offset = 0) {
  if ((!o.feeGoalCents && !o.feeFreeCycles) || a.historyOnly || !o.feeBasis || (o.feeBasis === 'statement' && !o.feeStatementDay)) return null;
  const until = a.closedOn && a.closedOn < today ? a.closedOn : today;
  if (until < a.openedOn) return null;
  const schedule = {...o, cycleBasis:o.feeBasis, statementDay:o.feeStatementDay};
  const month = (date:string) => Number(date.slice(0,4))*12+Number(date.slice(5,7));
  let current = month(until)-month(a.openedOn);
  const candidate = rewardCycleRange(a,schedule,current);
  if (until < candidate.start) current--;
  else if (until > candidate.end) current++;
  const index = Math.max(0,Math.min(current,current+offset));
  const {start,end} = rewardCycleRange(a,schedule,index);
  const amount = events.filter(e=>e.accountId===a.id && e.date>=start && e.date<=end && e.date<=until &&
    (e.kind || 'dd')===(o.feeMetric || 'dd')).reduce((sum,e)=>sum+e.amountCents,0);
  return {start,end,amount,index,current,free:index<(o.feeFreeCycles || 0)};
}
export const ddDeadline = (
  a: CycleAccount,
  o: RewardOffer,
) =>
  !a.historyOnly && o.rewardCycleCount ? rewardCycleRange(a,o,o.rewardCycleCount-1).end || null : !a.historyOnly && o.deadlineDays !== null
    ? addDays(a.openedOn, o.deadlineDays)
    : null;
export const safeCloseOn = (a: RewardAccount) =>
  !a.historyOnly && a.minHoldDays !== null
    ? addDays(a.openedOn, a.minHoldDays)
    : null;
export const expiryCountdown = (o: RewardOffer, today = todayISO()) =>
  o.expiresOn ? countdown(o.expiresOn, today) : "未注明截止日";
export const payoutWait = (
  lastDd: string | null,
  received: string | null,
  today = todayISO(),
) => (lastDd ? daysBetween(lastDd, received || today) : null);
export const churnEligibleOn = (
  anchor: string | null,
  months: number | null,
) => (anchor && months !== null ? addMonths(anchor, months) : null);
export function ddProgress(
  a: RewardAccount,
  o: RewardOffer,
  state: RewardState,
  today = todayISO(),
) {
  const all = state.ddEvents
    .filter((e) => e.accountId === a.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const deadline = ddDeadline(a, o);
  const valid = all.filter(
    (e) => e.date >= a.openedOn && e.date <= today && (!deadline || e.date <= deadline),
  );
  const periods = Array.from({length: a.historyOnly ? 0 : o.rewardCycleCount || 0}, (_, index) => {
    const {start,end} = rewardCycleRange(a,o,index);
    let deposits = 0, spending = 0, creditSpending = 0, metOn: string | null = null;
    for (const event of valid) {
      if (event.date < start || event.date > end || event.date > today) continue;
      if (event.kind === 'credit') creditSpending += event.amountCents;
      else if (event.kind === 'debit') spending += event.amountCents;
      else deposits += event.amountCents;
      if (!metOn && deposits >= (o.ddAmountCents ?? 0) && spending >= (o.cycleDebitCents ?? 0) && creditSpending >= (o.cycleCreditCents ?? 0)) metOn = event.date;
    }
    return {start, end, deposits, spending, creditSpending, metOn};
  });
  const deposits = valid.filter(e => !e.kind || e.kind === 'dd');
  const eligible = deposits.filter(
    (e) =>
      o.ddAmountMode === 'total' ||
      o.ddCount === null ||
      o.ddAmountCents === null ||
      e.amountCents >= o.ddAmountCents,
  );
  const totalCents = deposits.reduce((s, e) => s + e.amountCents, 0),
    required = o.ddCount ?? 0;
  if (periods.length) {
    const count = periods.filter(p => p.metOn).length, done = count === periods.length;
    const last = done ? periods[periods.length - 1].metOn : null;
    return {all, periods, count, totalCents, required: periods.length, done, known:true, ratio:count/periods.length,
      deadline, late:!!deadline && today>deadline && !done,
      near:!!deadline && today<=deadline && daysBetween(today,deadline)<=14 && !done, last, wait:payoutWait(last,a.bonusReceivedOn,today)};
  }
  const ddKnown = o.ddCount !== null || o.ddAmountCents !== null;
  const creditGoal = o.cycleCreditCents || 0;
  const credits = valid.filter(e => e.kind === "credit");
  const creditTotal = credits.reduce((s,e)=>s+e.amountCents,0);
  const known = ddKnown || creditGoal > 0;
  const done =
    known && creditTotal >= creditGoal &&
    (required
      ? eligible.length >= required && (o.ddAmountMode !== 'total' || totalCents >= (o.ddAmountCents ?? 0))
      : totalCents >= (o.ddAmountCents ?? 0));
  const ddRatio = !known
    ? 0
    : required
      ? Math.min(eligible.length / required, o.ddAmountMode === 'total' && o.ddAmountCents ? totalCents/o.ddAmountCents : 1, 1)
      : o.ddAmountCents
        ? Math.min(totalCents / o.ddAmountCents, 1)
        : 1;
  const ratio = creditGoal ? Math.min(ddKnown ? ddRatio : 1, creditTotal / creditGoal, 1) : ddRatio;
  let accumulated = 0;
  const completedOn = !done
    ? null
    : required
      ? o.ddAmountMode === 'total'
        ? [eligible[required-1].date, o.ddAmountCents ? deposits.find(e => (accumulated += e.amountCents) >= o.ddAmountCents!)?.date : a.openedOn].filter(Boolean).sort().at(-1) || null
        : eligible[required - 1].date
      : !ddKnown || o.ddAmountCents === 0
        ? a.openedOn
        : deposits.find(
            (e) => (accumulated += e.amountCents) >= (o.ddAmountCents ?? 0),
          )?.date || null;
  let creditSum = 0;
  const creditOn = creditGoal ? credits.find(e => (creditSum += e.amountCents) >= creditGoal)?.date || null : null;
  const last = done ? [completedOn, creditOn].filter(Boolean).sort().at(-1) || null : null;
  return {
    all,
    periods, count: eligible.length,
    totalCents,
    required,
    done,
    known,
    ratio,
    deadline,
    late: !!deadline && deadline < today && !done,
    near:
      !!deadline &&
      daysBetween(today, deadline) >= 0 &&
      daysBetween(today, deadline) <= 14 &&
      !done,
    last,
    wait: payoutWait(last, a.bonusReceivedOn, today),
  };
}

export const hasDdConditions=(o:RewardOffer)=>o.ddAmountCents!==null || o.ddCount!==null || !!o.rewardCycleCount || !!o.cycleCreditCents;
export function depositProgress(a:RewardAccount,o:RewardOffer,today=todayISO()) {
  if(!o.depositGoalCents || a.historyOnly)return null;
  const until=a.closedOn && a.closedOn<today?a.closedOn:today;
  const rows=[...(a.depositBalances||[])].filter(r=>r.date<=until).sort((x,y)=>x.date.localeCompare(y.date));
  const goal=o.depositGoalCents,amount=rows.at(-1)?.amountCents??0;
  const fundingDeadline=o.depositDeadlineDays!=null?addDays(a.openedOn,o.depositDeadlineDays):null;
  const fixed=o.depositHoldBasis==='opening';
  const fixedStart=fixed && o.depositStartOffsetDays!=null?addDays(a.openedOn,o.depositStartOffsetDays):null;
  const fixedEnd=fixed && o.depositEndOffsetDays!=null?addDays(a.openedOn,o.depositEndOffsetDays):null;
  const endFor=(start:string)=>fixed?fixedEnd:o.depositHoldMonths?addMonths(start,o.depositHoldMonths):o.depositHoldDays!=null?addDays(start,o.depositHoldDays):null;
  let start:string|null=null,end:string|null=null,broken=false,done=false;
  const firstFunded=rows.find(r=>r.amountCents>=goal&&(!fundingDeadline||r.date<=fundingDeadline));
  if(fixedStart) {
    end=fixedEnd;
    const atStart=rows.filter(r=>r.date<=fixedStart).at(-1);
    if(firstFunded && atStart && atStart.amountCents>=goal)start=fixedStart;
    if(until>=fixedStart)broken=!start||rows.some(r=>r.date>=fixedStart&&(!end||r.date<=end)&&r.amountCents<goal);
    if(!firstFunded&&fundingDeadline&&until>fundingDeadline)broken=true;
  } else {
    for(const row of rows) {
      if(end && row.date>end && !broken && start) {done=true;break;}
      if(row.amountCents>=goal) {
        if(!start && (!fundingDeadline||row.date<=fundingDeadline||!fixed&&o.depositRestart&&firstFunded)) {start=row.date;end=endFor(start);}
      } else if(start) {
        if(!fixed && o.depositRestart) {start=null;end=null;} else broken=true;
      }
    }
    if(!start && fundingDeadline && until>fundingDeadline)broken=true;
  }
  if(start && end && until>=end && !broken)done=true;
  const days=start&&end?Math.max(0,daysBetween(start,end)):0;
  const elapsed=start?Math.max(0,Math.min(days,daysBetween(start,until))):0;
  return {amount,goal,start,end,done,broken,fundingDeadline,days,elapsed,remaining:end?Math.max(0,daysBetween(until,end)):null,
    ratio:days?elapsed/days:done?1:0,known:!!start&&!!end};
}
export function transactionProgress(a:RewardAccount,o:RewardOffer,today=todayISO()) {
  const periodic=o.transactionMode==='periodic';
  const deadline=!periodic && o.transactionDeadlineDays!=null?addDays(a.openedOn,o.transactionDeadlineDays):null;
  const rows=(a.qualifyingTransactions||[]).filter(r=>r.date>=a.openedOn&&r.date<=today&&(!a.closedOn||r.date<=a.closedOn)&&(!deadline||r.date<=deadline)).sort((x,y)=>x.date.localeCompare(y.date));
  const goal=o.transactionGoal||0;
  type Period={start:string;end:string;count:number;done:boolean;last:string|null;ratio:number;late:boolean};
  const periods:Period[]=[];
  let currentIndex=0;
  if (periodic && goal && o.transactionCycleBasis && (o.transactionCycleBasis!=='statement'||o.transactionStatementDay)) {
    const schedule={...o,cycleBasis:o.transactionCycleBasis,statementDay:o.transactionStatementDay};
    const until=a.closedOn && a.closedOn<today?a.closedOn:today;
    const month=(d:string)=>Number(d.slice(0,4))*12+Number(d.slice(5,7));
    currentIndex=Math.max(0,month(until)-month(a.openedOn));
    const candidate=rewardCycleRange(a,schedule,currentIndex);
    if(until<candidate.start)currentIndex=Math.max(0,currentIndex-1);
    else if(until>candidate.end)currentIndex++;
    const length=o.transactionCycleCount || currentIndex+1;
    for(let i=0;i<length;i++) {
      const {start,end}=rewardCycleRange(a,schedule,i);
      const matches=rows.filter(r=>r.date>=start&&r.date<=end),done=matches.length>=goal;
      periods.push({start,end,count:matches.length,done,last:done?matches[goal-1].date:null,ratio:Math.min(1,matches.length/goal),late:today>end&&!done});
    }
  }
  const completedPeriods=periods.filter(p=>p.done).length;
  if(periodic) {
    const current=periods[Math.min(currentIndex,Math.max(0,periods.length-1))];
    const done=!!o.transactionCycleCount && periods.length===o.transactionCycleCount && completedPeriods===periods.length;
    return {goal,count:current?.count||0,deadline:current?.end||null,done,last:done?periods.at(-1)!.last:null,
      ratio:o.transactionCycleCount?periods.reduce((n,p)=>n+p.ratio,0)/o.transactionCycleCount:current?.ratio||0,
      late:periods.some(p=>p.late),periods,completedPeriods,currentIndex};
  }
  const done=!!goal&&rows.length>=goal;
  return {goal,count:rows.length,deadline,done,last:done?rows[goal-1].date:null,ratio:goal?Math.min(1,rows.length/goal):0,late:!!deadline&&deadline<today&&!done,periods,completedPeriods,currentIndex};
}
export function qualificationProgress(a:RewardAccount,o:RewardOffer,s:RewardState,today=todayISO()) {
  const dd=ddProgress(a,o,s,today),deposit=depositProgress(a,o,today),transactions=transactionProgress(a,o,today);
  if(!deposit&&!transactions.goal&&!o.additionalConditions?.trim())return {...dd,deposit:null,transactions};
  const parts:{done:boolean;ratio:number;last:string|null;late:boolean}[]=[];
  if(hasDdConditions(o))parts.push(dd);
  if(deposit)parts.push({...deposit,last:deposit.done?deposit.end:null,late:deposit.broken});
  if(transactions.goal)parts.push(transactions);
  if(o.additionalConditions?.trim())parts.push({done:!!a.additionalConditionsMetOn&&a.additionalConditionsMetOn<=today,ratio:a.additionalConditionsMetOn&&a.additionalConditionsMetOn<=today?1:0,last:a.additionalConditionsMetOn||null,late:false});
  const done=parts.length>0&&parts.every(p=>p.done);
  const last=done?parts.map(p=>p.last).filter((v):v is string=>!!v).sort().at(-1)||null:null;
  return {...dd,deposit,transactions,done,last,known:parts.length>0,ratio:parts.reduce((sum,p)=>sum+p.ratio,0)/Math.max(1,parts.length),
    late:parts.some(p=>p.late),near:dd.near,partial:parts.some(p=>p.done)};
}
export function actualReceipts(a:RewardAccount) {
  const parts=Object.values(a.componentReceipts||{}).filter((r):r is NonNullable<typeof r>=>!!r?.date);
  return parts.length?parts:a.bonusReceivedOn&&a.bonusReceivedCents!==null?[{date:a.bonusReceivedOn,cents:a.bonusReceivedCents}]:[];
}

export type RuleResult = {
  id: string;
  description: string;
  status: "met" | "blocked" | "waiting" | "unknown";
  eligibleOn: string | null;
  text: string;
};
export function bankAccounts(o: RewardOffer, s: RewardState) {
  const normalize = (n: string) =>
    n.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  const ids = new Set(
    s.offers
      .filter((x) => normalize(x.bankName) === normalize(o.bankName))
      .map((x) => x.id),
  );
  return s.accounts.filter((a) => ids.has(a.offerId));
}
export function ruleState(
  r: EligibilityRule,
  accounts: RewardAccount[],
  today = todayISO(),
): RuleResult {
  const base = {
    id: r.id,
    description: r.description,
    eligibleOn: null as string | null,
  };
  if (r.kind === "current_account")
    return {
      ...base,
      status: accounts.some((a) => !a.closedOn) ? "blocked" : "met",
      text: accounts.some((a) => !a.closedOn)
        ? "仍有未关闭账户"
        : "无未关闭账户",
    };
  if (r.kind === "lifetime_limit" && accounts.some((a) => a.bonusReceivedOn || actualReceipts(a).length))
    return { ...base, status: "blocked", text: "已存在历史领奖记录" };
  if (
    r.anchor &&
    r.months !== null &&
    ["account_history", "bonus_history", "membership_history"].includes(r.kind)
  ) {
    if (r.anchor === "close" && accounts.some((a) => !a.closedOn))
      return { ...base, status: "blocked", text: "关户后才能开始冷却" };
    const dates = accounts
      .map((a) =>
        r.anchor === "open"
          ? a.openedOn
          : r.anchor === "close"
            ? a.closedOn
            : [a.bonusReceivedOn,...actualReceipts(a).map(r=>r.date)].filter(Boolean).sort().at(-1)||null,
      )
      .filter((d): d is string => !!d)
      .sort();
    if (!dates.length)
      return {
        ...base,
        status: "unknown",
        text: "未记录历史基准，请核对完整历史",
      };
    const eligibleOn = addMonths(dates.at(-1)!, r.months);
    return {
      ...base,
      eligibleOn,
      status: eligibleOn <= today ? "met" : "waiting",
      text: countdown(eligibleOn, today, true),
    };
  }
  return {
    ...base,
    status: r.manualResult,
    text:
      r.manualResult === "met"
        ? "已人工核验满足"
        : r.manualResult === "blocked"
          ? "人工核验不满足"
          : "需要人工核验",
  };
}
export function eligibility(
  o: RewardOffer,
  s: RewardState,
  today = todayISO(),
) {
  const accounts = bankAccounts(o, s),
    results = s.rules
      .filter((r) => r.offerId === o.id)
      .map((r) => ruleState(r, accounts, today));
  if (o.repeatable === false)
    results.unshift({
      id: "repeat",
      description: "重复领奖",
      status: "blocked",
      eligibleOn: null,
      text: "活动不支持重复领奖",
    });
  else if (o.repeatable === null)
    results.unshift({
      id: "repeat",
      description: "重复领奖",
      status: "unknown",
      eligibleOn: null,
      text: "重复领奖规则未知",
    });
  else if (o.repeatAnchor && o.repeatIntervalMonths !== null)
    results.unshift(
      ruleState(
        {
          id: "repeat",
          userId: o.userId,
          offerId: o.id,
          kind:
            o.repeatAnchor === "bonus" ? "bonus_history" : "account_history",
          months: o.repeatIntervalMonths,
          anchor: o.repeatAnchor,
          description: `${o.repeatIntervalMonths} 个月 · 从${{ open: "开户", close: "关户", bonus: "奖励到账" }[o.repeatAnchor]}起算`,
          manualResult: "unknown",
        },
        accounts,
        today,
      ),
    );
  else
    results.unshift({
      id: "repeat",
      description: "重复领奖",
      status: "unknown",
      eligibleOn: null,
      text: "请补充冷却期与起算基准",
    });
  const status = results.some((r) => r.status === "blocked")
    ? "blocked"
    : results.some((r) => r.status === "unknown")
      ? "unknown"
      : results.some((r) => r.status === "waiting")
        ? "waiting"
        : "met";
  const date =
    results
      .map((r) => r.eligibleOn)
      .filter((x): x is string => !!x)
      .sort()
      .at(-1) || null;
  return {
    status,
    results,
    date: status === "blocked" || status === "unknown" ? null : date,
    eligible: status === "met",
  };
}
export function accountStatus(
  a: RewardAccount | undefined,
  o: RewardOffer,
  s: RewardState,
  today = todayISO(),
) {
  if (o.archived) return { key: "archived", label: "已归档", tone: "muted" };
  if (o.activityType === "long_term") return {key: o.activityStatus || "active", label: {active:"持续中", paused:"已暂停", ended:"已结束"}[o.activityStatus || "active"], tone:"teal"};
  if (a?.closedOn) {
    const e = eligibility(o, s, today);
    return e.eligible
      ? { key: "eligible", label: "可重奖", tone: "amber" }
      : {
          key: "closed",
          label: e.status === "waiting" ? "冷却中" : "已关户",
          tone: "blue",
        };
  }
  if (a?.bonusReceivedOn)
    return { key: "received", label: "已到账", tone: "purple" };
  if (a) {
    const dd = qualificationProgress(a, o, s, today);
    return {
      key: "active",
      label: a.historyOnly
        ? "历史账户"
        : actualReceipts(a).length
          ? "部分奖励到账"
          : dd.late
          ? (o.depositGoalCents ? "条件待核对" : "DD 已逾期")
          : dd.done
            ? "等待奖励"
            : "进行中",
      tone: dd.late ? "red" : "teal",
    };
  }
  return {
    key: ["denied", "ineligible"].includes(o.applicationStatus)
      ? o.applicationStatus
      : "active",
    label: {
      unreviewed: "待申请",
      ineligible: "不符合资格",
      denied: "申请被拒",
      opened: "待补开户记录",
    }[o.applicationStatus],
    tone: ["ineligible", "denied"].includes(o.applicationStatus)
      ? "red"
      : "muted",
  };
}
export const primaryAccount = (o: RewardOffer, s: RewardState) =>
  s.accounts
    .filter((a) => a.offerId === o.id)
    .sort(
      (a, b) =>
        Number(!!a.closedOn) - Number(!!b.closedOn) ||
        b.openedOn.localeCompare(a.openedOn) || b.updatedAt.localeCompare(a.updatedAt),
    )[0];
export function summary(s: RewardState, currency: string, today = todayISO()) {
  const offers = s.offers.filter((o) => o.currency === currency && o.activityType !== "long_term"),
    ids = new Set(offers.map((o) => o.id)),
    accounts = s.accounts.filter((a) => ids.has(a.offerId));
  const received = accounts.flatMap(actualReceipts),
    month = received.filter(r=>r.date.slice(0,7)===today.slice(0,7));
  const active = offers.filter(
    (o) =>
      !o.archived &&
      !["denied", "ineligible"].includes(o.applicationStatus) &&
      accountStatus(primaryAccount(o, s), o, s, today).key === "active",
  );
  const soon = offers
    .filter((o) => !o.archived)
    .map((o) => eligibility(o, s, today))
    .filter(
      (e) =>
        e.status === "waiting" && e.date && daysBetween(today, e.date) <= 90,
    )
    .sort((a, b) => a.date!.localeCompare(b.date!));
  const safeClosed = accounts.filter(
    (a) =>
      a.closedOn &&
      !a.historyOnly &&
      a.minHoldDays !== null &&
      a.closedOn >= addDays(a.openedOn, a.minHoldDays),
  );
  return {
    total: received.reduce((n, a) => n + a.cents, 0),
    receivedCount: received.length,
    monthTotal: month.reduce((n, a) => n + a.cents, 0),
    monthCount: month.length,
    activeCount: active.length,
    potential: active.reduce((n, o) => n + Math.max(0,(o.bonusCents || 0)-(primaryAccount(o,s)?actualReceipts(primaryAccount(o,s)!).reduce((sum,r)=>sum+r.cents,0):0)), 0),
    closedCount: accounts.filter((a) => a.closedOn).length,
    safeClosed: safeClosed.length,
    soon: soon.length,
    next: soon[0]?.date || null,
  };
}
const nullableInt = (value: unknown, name: string, min = 0) => {
  if (value !== null && (!Number.isSafeInteger(value) || Number(value) < min))
    throw new Error(`${name}必须为不小于 ${min} 的整数。`);
};
const dateField = (value: string | null, label: string, today?: string) => {
  if (value !== null && (!isISO(value) || (today && value > today)))
    throw new Error(`${label}无效${today ? "或晚于今天" : ""}。`);
};
const durationLimit = (value: number | null, months = false) => {
  if (value !== null && value > (months ? 1200 : 36525))
    throw new Error("期限不能超过 100 年，请核对输入。");
};
export function validateState(s: RewardState, today = todayISO()) {
  if (s.version !== 1) throw new Error("不支持的金羊毛数据版本。");
  const ids = new Set<string>();
  for (const item of [...s.offers, ...s.accounts, ...s.ddEvents, ...s.rules, ...(s.entries || [])]) {
    if (item.userId !== s.userId || !item.id || ids.has(item.id))
      throw new Error("记录标识或用户归属无效。");
    ids.add(item.id);
  }
  for (const entry of s.entries || []) {
    const offer = s.offers.find(o => o.id === entry.offerId);
    if (!offer || offer.activityType !== "long_term") throw new Error("明细必须属于长期活动。");
    if (!["earning", "deposit", "withdrawal"].includes(entry.kind)) throw new Error("记录类型无效。");
    if (!Number.isSafeInteger(entry.amountCents) || entry.amountCents === 0 || (entry.kind !== "earning" && entry.amountCents < 0)) throw new Error("收益金额不能为零；存入和提取必须为正数。");
    if (!entry.date) throw new Error("请选择记录日期。");
    dateField(entry.date, "记录日期", today);
    if (typeof entry.title !== "string" || typeof entry.notes !== "string") throw new Error("记录名称或备注无效。");
  }
  for (const o of s.offers) {
    if(o.rewardMode!==undefined && !['combined','separate'].includes(o.rewardMode))throw new Error('奖励组合方式无效。');
    if(o.depositHoldBasis!==undefined && !['funded','opening'].includes(o.depositHoldBasis))throw new Error('存款持有起算方式无效。');
    for(const key of ['depositGoalCents','depositBonusCents','ddBonusCents'] as const)if(o[key]!=null)nullableInt(o[key],key==='depositGoalCents'?'存款门槛':'分项奖励',key==='depositGoalCents'?1:0);
    for(const key of ['depositDeadlineDays','depositHoldDays','depositStartOffsetDays','depositEndOffsetDays'] as const)if(o[key]!=null){nullableInt(o[key],'存款天数',0);durationLimit(o[key]!);}
    if(o.depositHoldMonths!=null){nullableInt(o.depositHoldMonths,'存款持有月数',1);if(o.depositHoldMonths>120)throw new Error('存款持有月数不能超过 120。');}
    if(o.depositHoldDays!=null && o.depositHoldMonths!=null)throw new Error('持有天数和月数只填写一项。');
    if(o.depositGoalCents && o.depositHoldBasis==='opening' && (o.depositEndOffsetDays!=null && o.depositEndOffsetDays<=(o.depositStartOffsetDays||0)))throw new Error('请填写晚于持有开始时间的完成天数。');
    if(o.rewardMode==='separate' && (!o.depositGoalCents || o.depositBonusCents==null || o.ddBonusCents==null || !hasDdConditions(o)))throw new Error('分开领奖须设置存款条件、DD/消费条件及两项奖励金额。');
    if(o.depositRestart!==undefined && typeof o.depositRestart!=='boolean')throw new Error('存款重新计时选项无效。');
    for(const key of ['transactionGoal','transactionDeadlineDays'] as const)if(o[key]!=null)nullableInt(o[key],key,key==='transactionGoal'?1:0);
    if(o.promoCode!==undefined&&typeof o.promoCode!=='string')throw new Error('优惠码格式无效。');
    if(o.additionalConditions!==undefined && typeof o.additionalConditions!=='string')throw new Error('其他条件格式无效。');
    if (o.activityType !== undefined && !["one_time", "long_term"].includes(o.activityType)) throw new Error("活动类型无效。");
    if (o.activityStatus !== undefined && !["active", "paused", "ended"].includes(o.activityStatus)) throw new Error("长期活动状态无效。");
    if (o.activityType === "long_term" && (s.accounts.some(a => a.offerId === o.id) || s.rules.some(r => r.offerId === o.id))) throw new Error("长期活动不能包含银行账户或资格规则。");
    if (!o.bankName.trim()) throw new Error("请填写机构 / 平台名称。");
    if (
      !["USD", "EUR", "CNY", "GBP", "JPY", "CHF", "CAD", "AUD"].includes(
        o.currency,
      )
    )
      throw new Error("币种无效。");
    for (const [v, n, min] of [
      [o.bonusCents, "奖励金额", 0],
      [o.ddAmountCents, "DD 金额", 0],
      [o.ddCount, "DD 次数", 1],
      [o.deadlineDays, "DD 截止天数", 0],
      [o.minHoldDays, "最低持有天数", 0],
      [o.repeatIntervalMonths, "冷却月数", 1],
      [o.payoutDays, "预计到账天数", 0],
    ] as const)
      nullableInt(v, n, min);
    [o.deadlineDays, o.minHoldDays, o.payoutDays].forEach((v) =>
      durationLimit(v),
    );
    if (o.feeFreeCycles != null && (!Number.isInteger(o.feeFreeCycles) || o.feeFreeCycles<0 || o.feeFreeCycles>120)) throw new Error("开户免月费期数须为 0–120 的整数。");
    if (o.payoutAnchor !== undefined && !["qualification","opening","qualification_month_end"].includes(o.payoutAnchor)) throw new Error("奖励到账起算方式无效。");
    if (o.payoutTiming !== undefined && !["within","after"].includes(o.payoutTiming)) throw new Error("奖励发放方式无效。");
    if (o.payoutDayUnit !== undefined && !["calendar","business"].includes(o.payoutDayUnit)) throw new Error("奖励到账期限单位无效。");
    if (o.feeGoalCents != null) nullableInt(o.feeGoalCents,"免月费门槛",1);
    if (o.ddAmountMode !== undefined && !['total','per_deposit'].includes(o.ddAmountMode)) throw new Error("DD 金额计算方式无效。");
    if (o.transactionMode !== undefined && !['total','periodic'].includes(o.transactionMode)) throw new Error('合格交易计算方式无效。');
    if (o.transactionCycleBasis !== undefined && !['opening','calendar','statement'].includes(o.transactionCycleBasis)) throw new Error('合格交易周期无效。');
    if (o.transactionCycleCount!=null && (!Number.isInteger(o.transactionCycleCount)||o.transactionCycleCount<1||o.transactionCycleCount>36)) throw new Error('交易考核期数须为 1–36 的整数。');
    if (o.transactionStatementDay!=null && (!Number.isInteger(o.transactionStatementDay)||o.transactionStatementDay<1||o.transactionStatementDay>31)) throw new Error('交易账单截止日须为 1–31。');
    if (o.feeMetric !== undefined && !["dd","debit","credit"].includes(o.feeMetric)) throw new Error("免月费记录类型无效。");
    if (o.feeBasis !== undefined && !["opening","calendar","statement"].includes(o.feeBasis)) throw new Error("免月费周期无效。");
    if (o.feeStatementDay != null && (!Number.isInteger(o.feeStatementDay) || o.feeStatementDay<1 || o.feeStatementDay>31)) throw new Error("结账日应在 1 至 31 之间。");
    if (o.cycleBasis!==undefined && !Object.hasOwn(cycleBasisLabels,o.cycleBasis)) throw new Error("考核周期无效。");
    if (o.cycleBasis==='statement' && o.rewardCycleCount && (!Number.isInteger(o.statementDay)||o.statementDay<1 || o.statementDay>31)) throw new Error("请填写 1–31 的账单截止日。");
    if (o.rewardCycleCount != null && (!Number.isInteger(o.rewardCycleCount) || o.rewardCycleCount < 1 || o.rewardCycleCount > 36 || !((o.ddAmountCents ?? 0) > 0 || (o.cycleDebitCents ?? 0) > 0 || (o.cycleCreditCents ?? 0) > 0))) throw new Error("按期条件须填写至少一项金额门槛及 1–36 个周期。");
    if (o.cycleCreditCents != null) nullableInt(o.cycleCreditCents, "信用卡消费", 0);
    if (o.cycleDebitCents != null) nullableInt(o.cycleDebitCents, "每月借记卡消费", 0);
    durationLimit(o.repeatIntervalMonths, true);
    dateField(o.startsOn, "开始日期");
    dateField(o.expiresOn, "活动截止日期");
    dateField(o.docCheckedOn, "规则核对日期", today);
    if (o.startsOn && o.expiresOn && o.expiresOn < o.startsOn)
      throw new Error("活动截止不能早于开始日期。");
    if (o.applicationStatus === "denied") {
      if (!o.denialReason.trim() || !o.deniedOn)
        throw new Error("申请被拒必须填写原因和日期。");
      dateField(o.deniedOn, "拒绝日期", today);
    }
    if (o.images !== undefined) {
      if (!Array.isArray(o.images)) throw new Error("图片列表无效。");
      const imageIds = new Set<string>();
      const formats: Record<string,string> = {png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif',bmp:'image/bmp'};
      for (const image of o.images) {
        const match = typeof image?.id === 'string' && /^([a-f0-9]{64})\.(png|jpg|webp|gif|bmp)$/.exec(image.id);
        if (!match || imageIds.has(image.id) || image.mime !== formats[match[2]] ||
            typeof image.name !== 'string' || !image.name.trim() || !Number.isSafeInteger(image.size) ||
            image.size <= 0 || image.size > 25*1024*1024 || !Number.isFinite(Date.parse(image.addedAt)))
          throw new Error("图片信息无效。");
        imageIds.add(image.id);
      }
    }
    for (const url of [
      o.sourceUrl,
      o.referralUrl,
      o.docUrl,
      o.repeatSourceUrl,
      o.closureSourceUrl,
    ])
      if (url && !/^https?:\/\//i.test(url))
        throw new Error("来源链接必须以 http:// 或 https:// 开头。");
  }
  for (const a of s.accounts) {
    if (!s.offers.some((o) => o.id === a.offerId))
      throw new Error("账户所属活动不存在。");
    dateField(a.openedOn, "开户日期", today);
    if (a.periodRanges) {
      let previousEnd='';
      for (const [key,range] of Object.entries(a.periodRanges).sort(([x],[y])=>Number(x)-Number(y))) {
        if (!/^(0|[1-9]\d?)$/.test(key) || Number(key)>=36 || !range || !isISO(range.start) || !isISO(range.end) ||
          range.start<a.openedOn || range.end<range.start || range.start<=previousEnd) throw new Error("自定义期次须按顺序填写起止日期，不能重叠或早于开户。");
        previousEnd=range.end;
      }
    }
    if (!a.openedOn) throw new Error("请填写开户日期。");
    const balanceDates=new Set<string>(),balanceIds=new Set<string>();
    if(a.depositBalances!==undefined && !Array.isArray(a.depositBalances))throw new Error('存款余额记录格式无效。');
    for(const row of a.depositBalances||[]) {
      dateField(row.date,'余额日期',today);nullableInt(row.amountCents,'存款余额',0);
      if(!row.date || row.date<a.openedOn || (a.closedOn && row.date>a.closedOn) || row.amountCents==null ||
        !row.id || balanceIds.has(row.id) || balanceDates.has(row.date) || typeof row.note!=='string')throw new Error('存款余额日期须在账户存续期间，同一天只保留一条余额记录。');
      balanceIds.add(row.id);balanceDates.add(row.date);
    }
    if(a.componentReceipts!==undefined && (!a.componentReceipts || Array.isArray(a.componentReceipts) || typeof a.componentReceipts!=='object'))throw new Error('分项到账记录无效。');
    for(const [kind,r] of Object.entries(a.componentReceipts||{})) {
      if(!['dd','deposit'].includes(kind)||!r)throw new Error('奖励分项无效。');
      dateField(r.date,'分项到账日期',today);nullableInt(r.cents,'分项到账金额',0);
      if(!r.date || r.cents==null || r.date<a.openedOn || (a.closedOn&&r.date>a.closedOn))throw new Error('分项到账日期须在账户存续期间。');
    }
    if(a.qualifyingTransactions!==undefined&&!Array.isArray(a.qualifyingTransactions))throw new Error('合格交易记录无效。');
    const transactionIds=new Set<string>();
    for(const row of a.qualifyingTransactions||[]) {
      if(!row.id||transactionIds.has(row.id)||typeof row.note!=='string')throw new Error('合格交易记录格式错误。');
      transactionIds.add(row.id);dateField(row.date,'合格交易日期',today);
      if(!row.date||row.date<a.openedOn||(a.closedOn&&row.date>a.closedOn))throw new Error('合格交易须在账户存续期间。');
    }
    dateField(a.additionalConditionsMetOn??null,'其他条件完成日期',today);
    if(a.additionalConditionsMetOn && (a.additionalConditionsMetOn<a.openedOn || a.closedOn&&a.additionalConditionsMetOn>a.closedOn))throw new Error('其他条件完成日期须在账户存续期间。');
    dateField(a.bonusReceivedOn, "到账日期", today);
    dateField(a.closedOn, "关户日期", today);
    if (a.bonusReceivedOn && a.bonusReceivedOn < a.openedOn) throw new Error("奖励到账日期不能早于开户日期。");
    if (a.closedOn && a.closedOn < a.openedOn) throw new Error("关户日期不能早于开户日期。");
    if (a.closedOn && a.bonusReceivedOn && a.bonusReceivedOn > a.closedOn)
      throw new Error("到账日期不能晚于关户日期。");
    if (a.bonusReceivedOn && a.bonusReceivedCents === null)
      throw new Error("请填写实际到账金额。");
    nullableInt(a.bonusReceivedCents, "实际到账金额");
    nullableInt(a.minHoldDays, "持有天数");
    durationLimit(a.minHoldDays);
    if (
      a.exchangeRate !== null &&
      (!Number.isFinite(a.exchangeRate) || a.exchangeRate <= 0)
    )
      throw new Error("汇率必须大于零。");
  }
  for (const e of s.ddEvents) {
    const a = s.accounts.find((a) => a.id === e.accountId);
    if (!a) throw new Error("DD 账户不存在。");
    if (a.historyOnly) throw new Error("历史账户不需要补录 DD。");
    if (e.kind !== undefined && !["debit","dd","credit"].includes(e.kind)) throw new Error("记录类型无效。");
    dateField(e.date, "DD 日期", today);
    if (!e.date || e.date < a.openedOn || (a.closedOn && e.date > a.closedOn))
      throw new Error("DD 日期必须在账户存续期间。");
    nullableInt(e.amountCents, "DD 金额", 1);
  }
  for (const r of s.rules) {
    if (!s.offers.some((o) => o.id === r.offerId) || !r.description.trim())
      throw new Error("资格规则必须填写说明并关联活动。");
    nullableInt(r.months, "规则月数", 1);
    durationLimit(r.months, true);
  }
}

/** Deposits and withdrawals never enter earnings; totals retain archived history. */
export function activityTotals(s: RewardState, offerIds: string[], today = todayISO()) {
  const ids = new Set(offerIds);
  const entries = (s.entries || []).filter(e => ids.has(e.offerId));
  const earnings = entries.filter(e => e.kind === "earning");
  const sum = (rows: typeof entries) => rows.reduce((n, e) => n + e.amountCents, 0);
  return {total: sum(earnings), month: sum(earnings.filter(e => e.date.slice(0,7) === today.slice(0,7))),
    deposits: sum(entries.filter(e => e.kind === "deposit")), withdrawals: sum(entries.filter(e => e.kind === "withdrawal")),
    lastDate: entries.map(e => e.date).sort().at(-1) || null, count: earnings.length};
}

export function ddRequirementLabel(o:RewardOffer) {
  if (o.ddAmountCents==null) return o.ddCount ? `至少 ${o.ddCount} 笔` : '要求待填写';
  if (!o.ddCount || o.ddAmountMode==='total') return `累计 ${money(o.ddAmountCents,o.currency)}${o.ddCount ? ` · 至少 ${o.ddCount} 笔` : ''}`;
  return `每笔 ${money(o.ddAmountCents,o.currency)} · 至少 ${o.ddCount} 笔`;
}
