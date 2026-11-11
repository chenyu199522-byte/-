export type ISODate = string;
export type RewardAnchor = "open" | "close" | "bonus";
export type RuleKind =
  | "current_account"
  | "account_history"
  | "bonus_history"
  | "membership_history"
  | "calendar_limit"
  | "household_limit"
  | "lifetime_limit"
  | "other";
export type ApplicationStatus =
  "unreviewed" | "ineligible" | "denied" | "opened";
export type ActivityType = "one_time" | "long_term";
export type ActivityStatus = "active" | "paused" | "ended";
export type EntryKind = "earning" | "deposit" | "withdrawal";
export interface ActivityEntry {
  id: string; userId: string; offerId: string; kind: EntryKind; date: ISODate;
  amountCents: number; title: string; notes: string; createdAt: string; updatedAt: string;
}
export interface EvidenceImage {
  id: string; name: string; mime: string; size: number; addedAt: string;
}
export interface DepositBalance {id:string;date:ISODate;amountCents:number;note:string}
export interface ComponentReceipt {date:ISODate;cents:number}
export interface RewardOffer {
  promoCode?:string;
  transactionGoal?:number|null;
  transactionDeadlineDays?:number|null;
  depositGoalCents?:number|null;
  depositDeadlineDays?:number|null;
  depositHoldBasis?:'funded'|'opening';
  depositHoldDays?:number|null;
  depositHoldMonths?:number|null;
  depositStartOffsetDays?:number|null;
  depositEndOffsetDays?:number|null;
  depositRestart?:boolean;
  rewardMode?:'combined'|'separate';
  depositBonusCents?:number|null;
  ddBonusCents?:number|null;
  additionalConditions?:string;
  images?: EvidenceImage[];
  referralUrl?: string;
  /** Missing on legacy offers means one_time. */
  activityType?: ActivityType;
  activityStatus?: ActivityStatus;
  id: string;
  userId: string;
  bankName: string;
  productName: string;
  accountType: string;
  currency: string;
  bonusCents: number | null;
  requirements: string;
  ddAmountCents: number | null;
  ddCount: number | null;
  cycleBasis?: 'opening' | 'calendar' | 'statement' | 'custom';
  statementDay?: number | null;
  rewardCycleCount?: number | null;
  cycleDebitCents?: number | null;
  cycleCreditCents?: number | null;
  deadlineDays: number | null;
  minHoldDays: number | null;
  monthlyFee: string;
  feeNote: string;
  feeFreeCycles?: number | null;
  feeGoalCents?: number | null;
  feeMetric?: 'dd' | 'debit' | 'credit';
  feeBasis?: 'calendar' | 'opening' | 'statement';
  feeStatementDay?: number | null;
  earlyClosePenalty: string;
  startsOn: ISODate | null;
  expiresOn: ISODate | null;
  payoutDays: number | null;
  payoutAnchor?: "qualification" | "opening" | "qualification_month_end";
  payoutTiming?: "within" | "after";
  payoutDayUnit?: "calendar" | "business";
  repeatable: boolean | null;
  repeatIntervalMonths: number | null;
  repeatAnchor: RewardAnchor | null;
  sourceUrl: string;
  docUrl: string;
  docCheckedOn: ISODate | null;
  repeatSourceUrl: string;
  closureMethod: string;
  closureSourceUrl: string;
  notes: string;
  applicationStatus: ApplicationStatus;
  deniedOn: ISODate | null;
  denialReason: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface RewardAccount {
  qualifyingTransactions?:{id:string;date:ISODate;note:string}[];
  depositBalances?:DepositBalance[];
  componentReceipts?:Partial<Record<'dd'|'deposit',ComponentReceipt>>;
  additionalConditionsMetOn?:ISODate|null;
  id: string;
  userId: string;
  offerId: string;
  name: string;
  openedOn: ISODate;
  bonusReceivedOn: ISODate | null;
  bonusReceivedCents: number | null;
  closedOn: ISODate | null;
  minHoldDays: number | null;
  notes: string;
  closureMethod: string;
  historyOnly: boolean;
  minHoldOverride?: boolean;
  periodRanges?: Record<string,{start:string;end:string}>;
  bonusNotes?: string;
  closureNotes?: string;
  /** Legacy backup field only; Jin Yang Mao never writes finance transactions. */
  syncIncome: boolean;
  exchangeRate: number | null;
  incomeCurrency: string;
  createdAt: string;
  updatedAt: string;
}
export interface RewardDdEvent {
  kind?: "dd" | "debit" | "credit";
  id: string;
  userId: string;
  accountId: string;
  date: ISODate;
  amountCents: number;
  sourceNote: string;
}
export interface EligibilityRule {
  id: string;
  userId: string;
  offerId: string;
  kind: RuleKind;
  months: number | null;
  anchor: RewardAnchor | null;
  description: string;
  manualResult: "unknown" | "met" | "blocked";
}
export interface RewardState {
  version: 1;
  userId: string;
  offers: RewardOffer[];
  accounts: RewardAccount[];
  ddEvents: RewardDdEvent[];
  rules: EligibilityRule[];
  entries?: ActivityEntry[];
}
export const emptyState = (userId: string): RewardState => ({
  version: 1,
  userId,
  offers: [],
  accounts: [],
  ddEvents: [],
  rules: [],
});
export const emptyOffer = (userId: string): RewardOffer => ({
  id: "",
  userId,
  bankName: "",
  productName: "",
  activityType: "one_time",
  activityStatus: "active",
  accountType: "支票账户",
  currency: "USD",
  bonusCents: null,
  requirements: "",
  ddAmountCents: null,
  ddCount: null,
  deadlineDays: null,
  minHoldDays: null,
  monthlyFee: "",
  feeNote: "",
  earlyClosePenalty: "",
  startsOn: null,
  expiresOn: null,
  payoutDays: null,
  repeatable: null,
  repeatIntervalMonths: null,
  repeatAnchor: null,
  sourceUrl: "",
  docUrl: "",
  docCheckedOn: null,
  repeatSourceUrl: "",
  closureMethod: "",
  closureSourceUrl: "",
  notes: "",
  applicationStatus: "unreviewed",
  deniedOn: null,
  denialReason: "",
  archived: false,
  createdAt: "",
  updatedAt: "",
});
