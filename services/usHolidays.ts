export interface USHoliday {
  name: string;
  shortName: string;
  kind: 'federal' | 'observance';
  observed?: boolean;
}

// Current nationwide federal schedule (5 USC 6103 / OPM), plus common observances.
// This is calendar decoration only; it never marks a work record as a rest day.
const dateKey = (date: Date) => `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
const nthWeekday = (year: number, month: number, weekday: number, nth: number) => {
  const first = new Date(Date.UTC(year, month - 1, 1));
  return new Date(Date.UTC(year, month - 1, 1 + (weekday - first.getUTCDay() + 7) % 7 + (nth - 1) * 7));
};
const lastMonday = (year: number, month: number) => {
  const last = new Date(Date.UTC(year, month, 0));
  last.setUTCDate(last.getUTCDate() - (last.getUTCDay() + 6) % 7);
  return last;
};

function yearHolidays(year: number): Map<string, USHoliday[]> {
  const result = new Map<string, USHoliday[]>();
  const add = (date: Date, holiday: USHoliday) => {
    const key = dateKey(date);
    result.set(key, [...(result.get(key) || []), holiday]);
  };
  const federal = (date: Date, name: string, shortName = name) => {
    add(date, {name, shortName, kind: 'federal'});
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
      const observed = new Date(date);
      observed.setUTCDate(observed.getUTCDate() + (date.getUTCDay() === 6 ? -1 : 1));
      add(observed, {name: `${name}（补休）`, shortName: `${shortName}补休`, kind: 'federal', observed: true});
    }
  };
  federal(new Date(Date.UTC(year, 0, 1)), '元旦');
  federal(nthWeekday(year, 1, 1, 3), '马丁·路德·金纪念日', '马丁路德金');
  federal(nthWeekday(year, 2, 1, 3), '华盛顿诞辰（总统日）', '总统日');
  federal(lastMonday(year, 5), '阵亡将士纪念日', '阵亡将士日');
  if (year >= 2021) federal(new Date(Date.UTC(year, 5, 19)), '六月节');
  federal(new Date(Date.UTC(year, 6, 4)), '独立日');
  federal(nthWeekday(year, 9, 1, 1), '劳动节');
  federal(nthWeekday(year, 10, 1, 2), '哥伦布日');
  federal(new Date(Date.UTC(year, 10, 11)), '退伍军人节', '退伍军人');
  federal(nthWeekday(year, 11, 4, 4), '感恩节');
  federal(new Date(Date.UTC(year, 11, 25)), '圣诞节', '圣诞节');
  for (const [month, day, name] of [[2, 14, '情人节'], [10, 31, '万圣节'], [12, 24, '平安夜'], [12, 31, '跨年夜']] as const)
    add(new Date(Date.UTC(year, month - 1, day)), {name, shortName: name, kind: 'observance'});
  return result;
}

const cache = new Map<number, Map<string, USHoliday[]>>();
export function getUSHolidays(date: string): readonly USHoliday[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const [year, month, day] = date.split('-').map(Number);
  // All supported app dates use the modern Gregorian calendar and current recurrence rules.
  if (year < 100 || dateKey(new Date(Date.UTC(year, month - 1, day))) !== date) return [];
  let holidays = cache.get(year);
  if (!holidays) {
    holidays = yearHolidays(year);
    // A Saturday New Year's Day is observed on December 31 of the preceding year.
    for (const [key, values] of yearHolidays(year + 1))
      if (key.startsWith(`${year}-`)) holidays.set(key, [...values, ...(holidays.get(key) || [])]);
    cache.set(year, holidays);
    if (cache.size > 12) cache.delete(cache.keys().next().value!);
  }
  return holidays.get(date) || [];
}
