import { describe, it, expect } from "vitest";
import {
  emptyOffer,
  emptyState,
  type RewardAccount,
  type RewardState,
  type EligibilityRule,
} from "./types";
import {
  addDays,
  addMonths,
  daysBetween,
  formatDuration,
  isISO,
  countdown,
  ddProgress, feeProgress, estimatedPayoutDate, rewardPayoutSchedule, payoutTermLabel,
  safeCloseOn,
  eligibility,
  validateState,
  summary,
  accountStatus,
} from "./logic";
describe("reward payout deadline", () => {
  const business = { payoutDays: 15, payoutDayUnit: "business" as const };
  it("counts the day after qualification as the first eligible day", () => {
    expect(estimatedPayoutDate("2026-11-04", { payoutDays: 15 })).toBe("2026-11-19");
    expect(estimatedPayoutDate("2026-11-04", business)).toBe("2026-11-27");
    expect(payoutTermLabel(business)).toBe("15 个工作日");
  });
  it("keeps an opening-based maturity independent of DD completion", () => {
    const terms = { payoutDays: 90, payoutAnchor: "opening", payoutTiming: "after" } as const;
    for (const qualified of [null, "2026-10-05", "2026-12-20"]) {
      expect(rewardPayoutSchedule(terms, "2026-09-18", qualified)).toMatchObject({ date: "2026-12-17", dateLabel: "满期日" });
    }
    expect(rewardPayoutSchedule(terms, "2026-10-24", null).date).toBe("2027-01-22");
    expect(rewardPayoutSchedule(terms, null, "2026-10-05").date).toBeNull();
    expect(rewardPayoutSchedule({payoutDays: 90}, "2026-09-18", null).date).toBeNull();
  });
  it.each([
    ["2026-07-02", "2026-07-03"], // Banks open Friday before a Saturday holiday.
    ["2027-07-02", "2027-07-06"], // Sunday holiday observed Monday.
    ["2026-12-31", "2027-01-04"], // Friday holiday followed by a weekend.
    ["2026-12-23", "2026-12-24"], // Christmas Eve is a regular banking day.
  ])("applies the bank calendar after %s", (start, expected) => {
    expect(estimatedPayoutDate(start, { ...business, payoutDays: 1 })).toBe(expected);
  });
  it("distinguishes same-day terms from unknown terms and incomplete requirements", () => {
    expect(estimatedPayoutDate("2026-11-07", { ...business, payoutDays: 0 })).toBe("2026-11-07");
    expect(estimatedPayoutDate(null, business)).toBeNull();
    expect(estimatedPayoutDate("2026-11-07", { payoutDays: null })).toBeNull();
    expect(estimatedPayoutDate("2026-11-07", { ...business, payoutDays: -1 })).toBeNull();
  });
});
const today = "2026-10-02";
it("excludes rejected applications from the active tab and active totals", () => {
  const s = fixture();
  s.accounts = [];
  s.offers[0].applicationStatus = "denied";
  expect(accountStatus(undefined, s.offers[0], s, today).key).toBe("denied");
  expect(summary(s, "USD", today).activeCount).toBe(0);
});
it("keeps the first DD completion date when extra or late deposits arrive", () => {
  const s = fixture();
  s.ddEvents = ["2026-09-05", "2026-09-12", "2026-09-20", "2026-12-01"].map(
    (date, i) => ({
      id: `d${i}`,
      userId: "u",
      accountId: "a",
      date,
      amountCents: 50000,
      sourceNote: "",
    }),
  );
  const progress = ddProgress(s.accounts[0], s.offers[0], s, today);
  expect(progress.last).toBe("2026-09-12");
  expect(progress.wait).toBe(20);
});
it("rejects extreme durations before persisting them", () => {
  const s = fixture();
  s.offers[0].deadlineDays = 99999999;
  expect(() => validateState(s, today)).toThrow("100 年");
});
function fixture(): RewardState {
  const s = emptyState("u");
  s.offers = [
    {
      ...emptyOffer("u"),
      id: "o",
      bankName: "Example Bank",
      bonusCents: 50000,
      ddAmountCents: 50000,
      ddCount: 2,
      deadlineDays: 60,
      minHoldDays: 90,
      repeatable: true,
      repeatAnchor: "close",
      repeatIntervalMonths: 12,
    },
  ];
  s.accounts = [
    {
      id: "a",
      userId: "u",
      offerId: "o",
      name: "test",
      openedOn: "2026-09-01",
      closedOn: null,
      bonusReceivedOn: null,
      bonusReceivedCents: null,
      minHoldDays: 90,
      notes: "",
      closureMethod: "",
      historyOnly: false,
      syncIncome: true,
      incomeCurrency: "USD",
      exchangeRate: null,
      createdAt: "",
      updatedAt: "",
    },
  ];
  return s;
}
describe("date-only bank calculations", () => {
  it.each([
    ["2025-01-31", 1, "2025-02-28"],
    ["2024-01-31", 1, "2024-02-29"],
    ["2024-02-29", 12, "2025-02-28"],
    ["2025-12-31", 2, "2026-02-28"],
    ["2026-10-01", 24, "2028-10-01"],
    ["2026-01-31", 6, "2026-07-31"],
  ])("calendar clamp %s + %s", (a, n, b) =>
    expect(addMonths(a as string, n as number)).toBe(b),
  );
  it.each([
    ["2026-03-07", "2026-03-09", 2],
    ["2026-10-31", "2026-11-02", 2],
    ["2024-02-28", "2024-03-01", 2],
    ["2025-12-31", "2026-01-01", 1],
  ])("stable DST and calendar %s", (a, b, n) =>
    expect(daysBetween(a as string, b as string)).toBe(n),
  );
  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "x", "2026-1-1"])(
    "rejects impossible %s",
    (d) => expect(isISO(d)).toBe(false),
  );
  it("calendar duration over years", () =>
    expect(formatDuration("2026-10-02", "2028-10-01")).toBe(
      "1 年 11 月 29 天",
    ));
  it("calendar duration Jan31 to Feb28", () =>
    expect(formatDuration("2025-01-31", "2025-02-28")).toBe("1 月"));
  it("countdown thresholds", () => {
    expect(countdown(today, today, true)).toBe("今天可申请");
    expect(countdown("2026-10-01", today, true)).toBe("已可申请 1 天");
    expect(countdown("2026-10-05", today)).toBe("还剩 3 天");
  });
  it("90 days hold", () =>
    expect(addDays("2026-09-01", 90)).toBe("2026-11-30"));
});
describe("DD and lifecycle", () => {
  it.each([0, 1, 2])("%s/2 actual events", (count) => {
    const s = fixture();
    for (let i = 0; i < count; i++)
      s.ddEvents.push({
        id: "d" + i,
        userId: "u",
        accountId: "a",
        date: "2026-09-15",
        amountCents: 50000,
        sourceNote: "",
      });
    const p = ddProgress(s.accounts[0], s.offers[0], s, today);
    expect(p.count).toBe(count);
    expect(p.done).toBe(count === 2);
  });
  it("insufficient per-deposit amount does not count", () => {
    const s = fixture();
    s.ddEvents = [
      {
        id: "d",
        userId: "u",
        accountId: "a",
        date: "2026-09-15",
        amountCents: 49999,
        sourceNote: "",
      },
    ];
    expect(ddProgress(s.accounts[0], s.offers[0], s, today).count).toBe(0);
  });
  it("total amount mode", () => {
    const s = fixture();
    s.offers[0].ddCount = null;
    s.ddEvents = [
      {
        id: "d",
        userId: "u",
        accountId: "a",
        date: "2026-09-15",
        amountCents: 50000,
        sourceNote: "",
      },
    ];
    expect(ddProgress(s.accounts[0], s.offers[0], s, today).done).toBe(true);
  });
  it.each([
    ["2026-10-30", false],
    ["2026-10-31", false],
    ["2026-11-01", true],
  ])("DD deadline %s", (date, late) => {
    const s = fixture();
    expect(ddProgress(s.accounts[0], s.offers[0], s, date as string).late).toBe(
      late,
    );
  });
  it("late deposit is recorded but not qualifying", () => {
    const s = fixture();
    s.ddEvents = [
      {
        id: "d",
        userId: "u",
        accountId: "a",
        date: "2026-11-01",
        amountCents: 50000,
        sourceNote: "",
      },
    ];
    expect(ddProgress(s.accounts[0], s.offers[0], s, "2026-11-02").count).toBe(
      0,
    );
  });
  it("historical account has no current workflow", () => {
    const s = fixture();
    s.accounts[0].historyOnly = true;
    expect(safeCloseOn(s.accounts[0])).toBe(null);
    expect(ddProgress(s.accounts[0], s.offers[0], s, today).deadline).toBe(
      null,
    );
  });
  it("actual receipt amount drives total and month", () => {
    const s = fixture();
    s.accounts[0].bonusReceivedOn = today;
    s.accounts[0].bonusReceivedCents = 52500;
    expect(summary(s, "USD", today)).toMatchObject({
      total: 52500,
      monthTotal: 52500,
      receivedCount: 1,
    });
  });
  it("unreceived never counted", () =>
    expect(summary(fixture(), "USD", today).total).toBe(0));
  it("received and closed statuses", () => {
    const s = fixture(),
      a = s.accounts[0],
      o = s.offers[0];
    a.bonusReceivedOn = today;
    a.bonusReceivedCents = 50000;
    expect(accountStatus(a, o, s, today).key).toBe("received");
    a.closedOn = today;
    expect(accountStatus(a, o, s, today).key).toBe("closed");
  });
  it("archival preserves actual receipt", () => {
    const s = fixture();
    s.offers[0].archived = true;
    s.accounts[0].bonusReceivedOn = today;
    s.accounts[0].bonusReceivedCents = 10000;
    expect(summary(s, "USD", today).total).toBe(10000);
    expect(accountStatus(s.accounts[0], s.offers[0], s, today).key).toBe(
      "archived",
    );
  });
  it.each(["2026-11-29", "2026-11-30", "2026-12-01"])(
    "hold reference around %s",
    (date) => {
      const s = fixture();
      expect(safeCloseOn(s.accounts[0])).toBe("2026-11-30");
      expect(daysBetween(safeCloseOn(s.accounts[0])!, date)).toBe(
        date === "2026-11-29" ? -1 : date === "2026-11-30" ? 0 : 1,
      );
    },
  );
});
describe("combined eligibility and history", () => {
  it.each([6, 12, 24])("close cooldown %s months", (months) => {
    const s = fixture();
    s.accounts[0].closedOn = "2026-09-30";
    s.offers[0].repeatIntervalMonths = months;
    expect(eligibility(s.offers[0], s, today).date).toBe(
      addMonths("2026-09-30", months),
    );
  });
  it.each(["open", "close", "bonus"] as const)("%s anchor", (anchor) => {
    const s = fixture();
    s.offers[0].repeatAnchor = anchor;
    s.accounts[0].closedOn = "2026-09-30";
    s.accounts[0].bonusReceivedOn = "2026-09-15";
    const expected = {
      open: "2027-09-01",
      close: "2027-09-30",
      bonus: "2027-09-15",
    };
    expect(eligibility(s.offers[0], s, today).date).toBe(expected[anchor]);
  });
  it("open account blocks close-based cooldown", () => {
    const s = fixture();
    expect(eligibility(s.offers[0], s, today).status).toBe("blocked");
  });
  it("latest historical account across same bank wins", () => {
    const s = fixture();
    s.accounts[0].closedOn = "2025-09-01";
    s.offers.push({ ...s.offers[0], id: "o2", bankName: "example bank" });
    s.accounts.push({
      ...s.accounts[0],
      id: "a2",
      offerId: "o2",
      historyOnly: true,
      closedOn: "2026-09-30",
    });
    expect(eligibility(s.offers[0], s, today).date).toBe("2027-09-30");
  });
  it("all rules must be met, unknown never green", () => {
    const s = fixture();
    s.offers[0].repeatAnchor = "open";
    s.accounts[0].openedOn = "2024-01-01";
    s.rules = [
      {
        id: "r",
        userId: "u",
        offerId: "o",
        kind: "current_account",
        months: null,
        anchor: null,
        description: "不能持有账户",
        manualResult: "unknown",
      },
    ];
    expect(eligibility(s.offers[0], s, today).status).toBe("blocked");
    s.accounts[0].closedOn = "2025-01-01";
    s.rules[0].kind = "household_limit";
    expect(eligibility(s.offers[0], s, today).status).toBe("unknown");
    s.rules[0].manualResult = "met";
    expect(eligibility(s.offers[0], s, today).eligible).toBe(true);
  });
  it("missing historical anchor requires verification", () => {
    const s = fixture();
    s.offers[0].repeatAnchor = "bonus";
    expect(eligibility(s.offers[0], s, today).status).toBe("unknown");
  });
});
describe("record validation", () => {
  it("denied needs reason and date", () => {
    const s = fixture();
    s.offers[0].applicationStatus = "denied";
    expect(() => validateState(s, today)).toThrow();
    s.offers[0].denialReason = "测试拒绝";
    s.offers[0].deniedOn = today;
    expect(() => validateState(s, today)).not.toThrow();
  });
  it.each(["2026-02-30", "2026-11-01", "2025-01-01"])(
    "reject bad account timeline %s",
    (date) => {
      const s = fixture();
      s.accounts[0].closedOn = date;
      expect(() => validateState(s, today)).toThrow();
    },
  );
  it("DD cannot fall before opening", () => {
    const s = fixture();
    s.ddEvents = [
      {
        id: "d",
        userId: "u",
        accountId: "a",
        date: "2026-08-01",
        amountCents: 100,
        sourceNote: "",
      },
    ];
    expect(() => validateState(s, today)).toThrow();
  });
  it("safe and early closed records are distinguished", () => {
    const s = fixture();
    s.accounts[0].closedOn = "2026-09-30";
    expect(summary(s, "USD", today).safeClosed).toBe(0);
    s.accounts[0].openedOn = "2026-01-01";
    expect(summary(s, "USD", today).safeClosed).toBe(1);
  });
  it("enforces user ownership", () => {
    const s = fixture();
    s.accounts[0].userId = "other";
    expect(() => validateState(s, today)).toThrow();
  });
});

it('counts both requirements within each opening-month anniversary and keeps debit purchases out of DD',()=>{
  const s=fixture(),a=s.accounts[0],o=s.offers[0];
  a.openedOn='2026-11-02';Object.assign(o,{rewardCycleCount:3,ddAmountCents:250000,cycleDebitCents:100000});
  const add=(date:string,amountCents:number,kind:'dd'|'debit')=>s.ddEvents.push({id:String(s.ddEvents.length),userId:'u',accountId:a.id,date,amountCents,kind,sourceNote:''});
  s.ddEvents=[];add('2026-11-02',500000,'dd');add('2026-12-01',100000,'debit');add('2026-12-02',100000,'debit');
  add('2027-01-02',250000,'dd');add('2027-02-01',100000,'debit');
  const p=ddProgress(a,o,s,'2027-02-02');expect(p.periods.map(x=>[x.start,x.end,x.metOn])).toEqual([
    ['2026-11-02','2026-12-01','2026-12-01'],['2026-12-02','2027-01-01',null],['2027-01-02','2027-02-01','2027-02-01']]);
  expect(p.done).toBe(false);expect(p.totalCents).toBe(750000);
  add('2026-12-10',100000,'dd');add('2027-01-01',150000,'dd');expect(ddProgress(a,o,s,'2027-02-02').done).toBe(true);
});

it('supports calendar, statement and freely dated periods per account',()=>{
  const s=fixture(),a=s.accounts[0],o=s.offers[0];a.openedOn='2028-01-31';o.rewardCycleCount=3;
  const ranges=()=>ddProgress(a,o,s,'2028-04-10').periods.map(p=>[p.start,p.end]);
  o.cycleBasis='calendar';expect(ranges().slice(0,2)).toEqual([['2028-01-31','2028-01-31'],['2028-02-01','2028-02-29']]);
  o.cycleBasis='statement';o.statementDay=30;expect(ranges().slice(0,2)).toEqual([['2028-01-31','2028-02-29'],['2028-03-01','2028-03-30']]);
  o.cycleBasis='custom';a.periodRanges={0:{start:'2028-02-02',end:'2028-02-24'}};expect(ranges()).toEqual([['2028-02-02','2028-02-24'],['',''],['','']]);
});

it('uses the current statement separately from the bonus deadline and reevaluates free and historical cycles',()=>{
  const s=fixture(),a=s.accounts[0],o=s.offers[0];a.openedOn='2028-01-31';
  Object.assign(o,{feeBasis:'statement',feeMetric:'dd',feeFreeCycles:2,feeGoalCents:500000});
  const calc=(today:string,offset=0)=>feeProgress(a,o,s.ddEvents,today,offset);
  expect(calc('2028-02-29')).toBeNull();
  o.feeStatementDay=30;
  const row={id:'pay',userId:a.userId,accountId:a.id,date:'2028-04-02',amountCents:250000,sourceNote:''};
  s.ddEvents=[row,{...row,id:'prior',date:'2028-03-30'},{...row,id:'other',accountId:'foreign'},
    {...row,id:'debit',kind:'debit',amountCents:12345},{...row,id:'future',date:'2028-04-05'}];
  expect(calc('2028-03-30')).toMatchObject({start:'2028-03-01',end:'2028-03-30',free:true,index:1});
  expect(calc('2028-04-02')).toMatchObject({start:'2028-03-31',end:'2028-04-30',amount:250000,free:false,index:2});
  expect(calc('2028-04-02',-1)).toMatchObject({amount:250000,free:true});
  o.feeMetric='debit';expect(calc('2028-04-02')?.amount).toBe(12345);
  o.feeBasis='calendar';expect(calc('2028-04-02')?.start).toBe('2028-04-01');
  o.feeBasis='opening';expect(calc('2028-04-02')?.start).toBe('2028-03-31');
  o.feeGoalCents=null;expect(calc('2028-02-01')?.free).toBe(true);
});
