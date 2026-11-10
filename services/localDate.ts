/** A calendar date follows the computer's time zone, never UTC truncation. */
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Date-only business values have no time zone; preserve the selected day. */
export function calendarDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`);
}

export function localDateTime(date = new Date()) {
  return `${localDateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Follow today only when the user hasn't navigated to another calendar date. */
export function followToday(selected: string, previous: string, current: string) {
  return selected === previous ? current : selected;
}

export function computerTimeContext(now = new Date()) {
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(offset) % 60).padStart(2, '0');
  return `${localDateTime(now)}${sign}${hours}:${minutes} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
}
