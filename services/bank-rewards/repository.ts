import { rewardStore } from "../recordStore";
import { financeWrite } from "../financeWriteQueue";
import {
  emptyState,
  type RewardState,
  type ActivityEntry,
  type RewardOffer,
  type RewardAccount,
  type RewardDdEvent,
  type EligibilityRule,
} from "./types";
import { validateState, todayISO } from "./logic";
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export const rewardRepository = {
  read(userId: string): RewardState {
    return structuredClone(rewardStore.read() || emptyState(userId));
  },
  async mutate(
    userId: string,
    change: (state: RewardState) => void,
  ): Promise<RewardState> {
    return financeWrite(async () => {
      const state = this.read(userId);
      change(state);
      validateState(state);
      await rewardStore.commit(state);
      window.dispatchEvent(new CustomEvent("katanos:bank-rewards-changed"));
      return state;
    });

  },
  saveOffer(userId: string, input: RewardOffer, rules: EligibilityRule[]) {
    return this.mutate(userId, (s) => {
      const existing = s.offers.find((o) => o.id === input.id);
      if (input.id && !existing) throw new Error("活动不存在。");
      if (existing && (existing.activityType || "one_time") !== (input.activityType || "one_time") &&
          (s.accounts.some(a => a.offerId === existing.id) || s.rules.some(r => r.offerId === existing.id) || s.entries?.some(e => e.offerId === existing.id)))
        throw new Error("已有明细或银行规则的活动不能切换类型，请新建活动以保留历史。");
      if (existing && existing.currency !== input.currency && s.entries?.some(e => e.offerId === existing.id))
        throw new Error("已有明细的长期活动不能更换币种，请新建对应币种的活动。");
      const previousHold = existing?.minHoldDays;
      const offer = {
        ...input,
        id: existing?.id || id(),
        userId,
        bankName: input.bankName.trim(),
        createdAt: existing?.createdAt || now(),
        updatedAt: now(),
      };
      if (offer.applicationStatus !== "denied") {
        offer.deniedOn = null;
        if (
          offer.applicationStatus === "unreviewed" ||
          offer.applicationStatus === "opened"
        )
          offer.denialReason = "";
      }
      for (const account of s.accounts.filter(a => a.offerId === offer.id && !a.historyOnly)) {
        if (!account.minHoldOverride && account.minHoldDays === previousHold) account.minHoldDays = offer.minHoldDays;
      }
      s.offers = [...s.offers.filter((o) => o.id !== offer.id), offer];
      s.rules = [
        ...s.rules.filter((r) => r.offerId !== offer.id),
        ...rules.map((r) => ({
          ...r,
          id: r.id || id(),
          userId,
          offerId: offer.id,
        })),
      ];
    });
  },
  saveEntry(userId: string, input: ActivityEntry) {
    return this.mutate(userId, s => {
      const offer = s.offers.find(o => o.id === input.offerId);
      if (!offer || offer.activityType !== "long_term") throw new Error("请选择长期活动。");
      const previous = s.entries?.find(e => e.id === input.id);
      if (previous && previous.offerId !== input.offerId) throw new Error("不能把记录移到其他活动。");
      const entry = {...input, id: input.id || id(), userId, createdAt: previous?.createdAt || now(), updatedAt: now()};
      s.entries = [...(s.entries || []).filter(e => e.id !== entry.id), entry];
      offer.updatedAt = now();
    });
  },
  deleteEntry(userId: string, entryId: string) {
    return this.mutate(userId, s => {
      const entry = s.entries?.find(e => e.id === entryId);
      if (!entry) throw new Error("记录不存在。");
      s.entries = s.entries!.filter(e => e.id !== entryId);
      const offer = s.offers.find(o => o.id === entry.offerId);
      if (offer) offer.updatedAt = now();
    });
  },
  saveAccount(userId: string, offerId: string, input: Partial<RewardAccount>, options: { newAccount?: boolean; creationId?: string } = {}) {
    return this.mutate(userId, (s) => {
      const o = s.offers.find((o) => o.id === offerId);
      if (!o) throw new Error("活动不存在。");
      if (o.activityType === "long_term") throw new Error("长期活动请使用收益、存入或提取记录。");
      const previous = input.id
        ? s.accounts.find((a) => a.id === input.id && a.offerId === offerId)
        : options.creationId ? s.accounts.find(a => a.id === options.creationId)
        : !options.newAccount && !input.historyOnly ? s.accounts.filter(a => a.offerId === offerId && !a.historyOnly).sort((a,b) => b.openedOn.localeCompare(a.openedOn) || b.updatedAt.localeCompare(a.updatedAt))[0] : null;
      if (input.id && !previous) throw new Error("账户不存在。");
      const a: RewardAccount = {
        id: options.creationId || id(),
        userId,
        offerId,
        name: "",
        openedOn: todayISO(),
        closedOn: null,
        bonusReceivedOn: null,
        bonusReceivedCents: null,
        minHoldDays: input.historyOnly ? null : o.minHoldDays,
        notes: "",
        closureMethod: o.closureMethod,
        historyOnly: false,
        minHoldOverride: false,
        syncIncome: false,
        exchangeRate: null,
        incomeCurrency: "USD",
        createdAt: now(),
        updatedAt: now(),
        ...previous,
        ...input,
      };
      a.id = previous?.id || a.id;
      a.userId = userId;
      a.offerId = offerId;
      a.updatedAt = now();
      if (!a.bonusReceivedOn) a.bonusReceivedCents = null;
      s.accounts = [...s.accounts.filter((x) => x.id !== a.id), a];
      o.updatedAt = now();
      if (!a.historyOnly) o.applicationStatus = "opened";
    });
  },
  saveDd(userId: string, input: RewardDdEvent) {
    return this.mutate(userId, (s) => {
      const a = s.accounts.find((a) => a.id === input.accountId);
      if (!a) throw new Error("账户不存在。");
      const previous = s.ddEvents.find(e => e.id === input.id);
      if (previous && previous.accountId !== input.accountId) throw new Error("不能把 DD 移到另一个账户。");
      s.ddEvents = [
        ...s.ddEvents.filter((e) => e.id !== input.id),
        { ...input, id: input.id || id(), userId },
      ];
      a.updatedAt = now();
      s.offers.find((o) => o.id === a.offerId)!.updatedAt = now();
    });
  },
  deleteDd(userId: string, eventId: string) {
    return this.mutate(userId, (s) => {
      s.ddEvents = s.ddEvents.filter((e) => e.id !== eventId);
    });
  },
  revokeReceipt(userId: string, account: RewardAccount) {
    return this.saveAccount(userId, account.offerId, { id: account.id, bonusReceivedOn: null, bonusReceivedCents: null });
  },
  revokeClosure(userId: string, account: RewardAccount) {
    return this.saveAccount(userId, account.offerId, { id: account.id, closedOn: null });
  },
  // Explicit correction command. Callers choose the records; no fuzzy bank/name merging.
  mergeAccounts(userId: string, canonicalId: string, duplicateIds: string[]) {
    return this.mutate(userId, s => {
      const canonical = s.accounts.find(a => a.id === canonicalId);
      if (!canonical || duplicateIds.includes(canonicalId)) throw new Error('请选择保留的账户。');
      const duplicates = s.accounts.filter(a => duplicateIds.includes(a.id));
      if (duplicates.length !== new Set(duplicateIds).size || duplicates.some(a => a.offerId !== canonical.offerId)) throw new Error('只能合并同一活动的明确重复账户。');
      s.ddEvents = s.ddEvents.map(e => duplicateIds.includes(e.accountId) ? { ...e, accountId: canonicalId } : e);
      s.accounts = s.accounts.filter(a => !duplicateIds.includes(a.id));
      canonical.updatedAt = now();
    });
  },
  archive(userId: string, offerId: string) {
    return this.mutate(userId, (s) => {
      const o = s.offers.find((o) => o.id === offerId);
      if (o) {
        o.archived = !o.archived;
        o.updatedAt = now();
      }
    });
  },
  deleteOffer(userId: string, offerId: string) {
    return this.mutate(userId, (s) => {
      const accounts = new Set(
        s.accounts.filter((a) => a.offerId === offerId).map((a) => a.id),
      );
      s.offers = s.offers.filter((o) => o.id !== offerId);
      s.accounts = s.accounts.filter((a) => a.offerId !== offerId);
      s.ddEvents = s.ddEvents.filter((e) => !accounts.has(e.accountId));
      s.rules = s.rules.filter((r) => r.offerId !== offerId);
      if (s.entries) s.entries = s.entries.filter(e => e.offerId !== offerId);
    });
  },
  deleteAccount(userId: string, accountId: string) {
    return this.mutate(userId, (s) => {
      s.accounts = s.accounts.filter((a) => a.id !== accountId);
      s.ddEvents = s.ddEvents.filter((e) => e.accountId !== accountId);
    });
  },
};
export function toCsv(state: RewardState): string {
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows: unknown[][] = [
    [
      "机构 / 平台",
      "活动 / 产品",
      "币种",
      "广告奖励",
      "账户",
      "开户日期",
      "实际到账金额",
      "到账日期",
      "关户日期",
      "最低持有天数",
      "历史账户",
      "活动来源",
      "备注", "活动类型", "记录类型", "记录金额", "记录日期", "记录名称",
    ],
  ];
  for (const o of state.offers) {
    if (o.activityType === "long_term") {
      const entries = (state.entries || []).filter(e => e.offerId === o.id);
      for (const e of entries.length ? entries : [undefined]) rows.push([
        o.bankName, o.productName, o.currency, "", "", "", "", "", "", "", "", o.sourceUrl, e?.notes || o.notes,
        "长期活动", e ? {earning:"收益",deposit:"存入",withdrawal:"提取"}[e.kind] : "", e ? e.amountCents / 100 : "", e?.date, e?.title,
      ]);
      continue;
    }
    const accounts = state.accounts.filter((a) => a.offerId === o.id);
    for (const a of accounts.length ? accounts : [undefined])
      rows.push([
        o.bankName,
        o.productName,
        o.currency,
        o.bonusCents === null ? "" : o.bonusCents / 100,
        a?.name,
        a?.openedOn,
        a?.bonusReceivedCents === null || a?.bonusReceivedCents === undefined
          ? ""
          : a.bonusReceivedCents / 100,
        a?.bonusReceivedOn,
        a?.closedOn,
        a?.minHoldDays,
        a?.historyOnly ? "是" : "否",
        o.sourceUrl,
        a?.notes || o.notes, "一次性活动", "", "", "", "",
      ]);
  }
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
