import type { RewardAccount, RewardOffer } from './types';

export interface RewardSortRow {
  o: Pick<RewardOffer, 'bonusCents' | 'ddAmountCents' | 'ddCount' | 'expiresOn' | 'updatedAt' | 'rewardCycleCount' | 'feeGoalCents' | 'feeFreeCycles'>;
  a?: Pick<RewardAccount, 'openedOn' | 'historyOnly' | 'bonusReceivedOn' | 'closedOn'>;
  dd: { deadline: string | null; done: boolean } | null;
  safe: string | null;
  e: { date: string | null };
}

// Match the unfinished countdown shown in the progress column, including offers
// that have an activity expiry but have not yet been opened.
const pendingDeadline = (row: RewardSortRow) =>
  row.a?.historyOnly || row.a?.bonusReceivedOn || row.a?.closedOn || row.dd?.done
    ? null
    : row.dd?.deadline || row.o.expiresOn;

function activitySize(row: RewardSortRow) {
  if (!row.a || row.a.historyOnly) return 0;
  if (row.o.rewardCycleCount) return row.o.rewardCycleCount + 1;
  return row.o.feeGoalCents || row.o.feeFreeCycles ? 1 : 0;
}

export function compareRewardRows(a: RewardSortRow, b: RewardSortRow, sort: string): number {
  switch (sort) {
    case 'size': return activitySize(b)-activitySize(a) || (b.o.bonusCents ?? -1)-(a.o.bonusCents ?? -1) || b.o.updatedAt.localeCompare(a.o.updatedAt);
    case 'bonus': return (b.o.bonusCents ?? -1) - (a.o.bonusCents ?? -1);
    case 'ddAmount':
      return (b.o.ddAmountCents ?? -1) - (a.o.ddAmountCents ?? -1)
        || (b.o.ddCount ?? -1) - (a.o.ddCount ?? -1);
    case 'open': return (b.a?.openedOn || '').localeCompare(a.a?.openedOn || '');
    case 'dd': return (pendingDeadline(a) || '9999').localeCompare(pendingDeadline(b) || '9999');
    case 'safe': return (a.safe || '9999').localeCompare(b.safe || '9999');
    case 'repeat': return (a.e.date || '9999').localeCompare(b.e.date || '9999');
    default: return b.o.updatedAt.localeCompare(a.o.updatedAt);
  }
}

export const rewardColumnSorts: Record<string, { key: string; direction: 'ascending' | 'descending'; hint: string }> = {
  '奖励金额': { key: 'bonus', direction: 'descending', hint: '奖励金额从高到低' },
  'DD 要求': { key: 'ddAmount', direction: 'descending', hint: 'DD 要求金额从高到低；相同金额按次数从多到少' },
  '进度 / 截止': { key: 'dd', direction: 'ascending', hint: '截止日期最早在前；已完成或无日期的放最后' },
  '开户日期': { key: 'open', direction: 'descending', hint: '开户日期从新到旧' },
};
