import { describe, it, expect } from 'vitest';
import { compareRewardRows, type RewardSortRow } from './sorting';

function row(id: string, bonus: number | null, amount: number | null, count: number | null,
  openedOn?: string, deadline: string | null = null): RewardSortRow & { id: string } {
  return { id, o: { bonusCents: bonus, ddAmountCents: amount, ddCount: count, expiresOn: null, updatedAt: id },
    a: openedOn ? {openedOn, historyOnly:false,bonusReceivedOn:null,closedOn:null} : undefined,
    dd: deadline ? {deadline,done:false} : null, safe:null, e:{date:null} };
}
const sorted = (rows: ReturnType<typeof row>[], key: string) => [...rows].sort((a,b)=>compareRewardRows(a,b,key)).map(r=>r.id);
describe('bank reward table sorting', () => {
  it('orders whole records by bonus, handles cents, zero and missing values, and preserves ties', () => {
    const rows = [row('missing',null,null,null), row('zero',0,0,0), row('low',20001,0,0),row('high',20002,0,0), row('tied',20002,0,0)];
    expect(sorted(rows,'bonus')).toEqual(['high','tied','low','zero','missing']);
    expect(rows[0].id).toBe('missing');
  });
  it('orders DD requirement amount descending, then count descending, missing last', () => {
    const rows = [row('missing',0,null,null),row('twice',0,50000,2),row('thrice',0,50000,3),row('large',0,100000,1),row('zero',0,0,0)];
    expect(sorted(rows,'ddAmount')).toEqual(['large','thrice','twice','zero','missing']);
  });
  it('sorts real open dates newest first with unopened records last', () => {
    const rows=[row('unopened',0,0,0),row('old',0,0,0,'2025-12-31'),row('new',0,0,0,'2026-10-07')];
    expect(sorted(rows,'open')).toEqual(['new','old','unopened']);
  });
  it('puts earliest unfinished deadlines first and includes activity expiries', () => {
    const rows=[row('later',0,0,0,'2026-10-01','2026-11-01'),row('unknown',0,0,0),row('overdue',0,0,0,'2026-09-01','2026-10-01'),row('today',0,0,0,'2026-10-01','2026-10-07'),row('activity',0,0,0),row('done',0,0,0,'2026-01-01','2026-02-01')];
    rows[4].o.expiresOn='2026-10-06'; rows[5].dd!.done=true;
    expect(sorted(rows,'dd')).toEqual(['overdue','activity','today','later','unknown','done']);
  });
  it('does not treat received, closed or historical accounts as pending deadlines', () => {
    const received=row('received',0,0,0,'2026-01-01','2026-01-02'); received.a!.bonusReceivedOn='2026-01-02';
    const closed=row('closed',0,0,0,'2026-01-01','2026-01-02'); closed.a!.closedOn='2026-01-02';
    const history=row('history',0,0,0,'2026-01-01','2026-01-02'); history.a!.historyOnly=true;
    const pending=row('pending',0,0,0,'2026-10-01','2026-11-01');
    expect(sorted([received,closed,history,pending],'dd')).toEqual(['pending','received','closed','history']);
  });
  it('sorts all matching records before paging instead of each page separately', () => {
    const rows=Array.from({length:45},(_,i)=>row(String(i),i*100,i*500,1));
    const ordered=[...rows].sort((a,b)=>compareRewardRows(a,b,'bonus'));
    expect(ordered.slice(0,20).map(r=>r.id)).toEqual(Array.from({length:20},(_,i)=>String(44-i)));
    expect(ordered.slice(20,40).map(r=>r.id)).toEqual(Array.from({length:20},(_,i)=>String(24-i)));
  });
});

it('groups visible period strips before fee tracking, then ordinary activities, while keeping bonus sorting independent',()=>{
  const regular=row('regular',900,1,1,'2026-11-01'),fee=row('fee',600,1,1,'2026-11-01'),multi=row('multi',100,1,1,'2026-11-01'),inactive=row('none',300,1,1);
  fee.o.feeGoalCents=500000;multi.o.rewardCycleCount=3;inactive.o.rewardCycleCount=12;
  expect(sorted([regular,inactive,fee,multi],'size')).toEqual(['multi','fee','regular','none']);
  expect(sorted([regular,fee,multi],'bonus')).toEqual(['regular','fee','multi']);
});
