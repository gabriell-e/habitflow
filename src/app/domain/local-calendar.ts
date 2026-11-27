import { localDateKey } from '../models/habit-record.model';

export interface DateRange {
  readonly start: string;
  readonly end: string;
}

export type Period = 'week' | 'month';

export function calendarDate(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

export function addDays(key: string, amount: number): string {
  const date = calendarDate(key);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

export function startOfWeek(key: string): string {
  return addDays(key, -((calendarDate(key).getDay() + 6) % 7));
}

export function periodRange(today: string, period: Period, offset: number): DateRange {
  if (period === 'week') {
    const start = addDays(startOfWeek(today), offset * 7);
    return { start, end: addDays(start, 6) };
  }
  const month = calendarDate(today);
  month.setDate(1);
  month.setMonth(month.getMonth() + offset);
  const start = localDateKey(month);
  month.setMonth(month.getMonth() + 1, 0);
  return { start, end: localDateKey(month) };
}

export function* datesBetween(start: string, end: string): Generator<string> {
  const last = calendarDate(end);
  for (const date = calendarDate(start); date <= last; date.setDate(date.getDate() + 1)) {
    yield localDateKey(date);
  }
}

export function formatLocalDate(key: string, options: Intl.DateTimeFormatOptions): string {
  return calendarDate(key).toLocaleDateString('es-PY', options);
}
