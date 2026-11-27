import { Habit } from '../models/habit.model';
import { HabitRecord, recordStatus, uniqueRecords } from '../models/habit-record.model';
import { frequencyAt, ScheduleChange } from './habit-schedule';
import { scheduledOnDay } from './habit-tracking';
import { addDays, DateRange, datesBetween, startOfWeek } from './local-calendar';

export const dayStates = {
  completed: 'Completado', missed: 'Incumplido', pending: 'Pendiente', partial: 'Parcial', flexible: 'Meta semanal',
  off: 'No programado', unknown: 'Sin programación conocida', future: 'Futuro',
} as const;

type DayState = keyof typeof dayStates;
type Unit = 'days' | 'weeks';
type Outcome = { date: string; unit: Unit; state: 'completed' | 'missed' | 'pending' };
type WeeklyResult = {
  start: string; end: string; goal: number; done: number; comparable: boolean; open: boolean;
};
type ProgressHabit = { id: string; name: string; status: 'Activo' | 'Inactivo' | 'Eliminado' };

const inRange = (date: string, range: DateRange) => date >= range.start && date <= range.end;

export function progressHabits(
  habits: readonly Habit[], records: readonly HabitRecord[], schedule: readonly ScheduleChange[],
): ProgressHabit[] {
  const result = new Map<string, ProgressHabit>();
  for (const habit of habits) {
    result.set(habit.id, { id: habit.id, name: habit.name, status: habit.active ? 'Activo' : 'Inactivo' });
  }
  const sorted = [...records].sort((first, second) => second.date.localeCompare(first.date));
  const knownNames = new Map<string, string>();
  for (const record of sorted) {
    if (record.habitName && !knownNames.has(record.habitId)) knownNames.set(record.habitId, record.habitName);
  }
  for (const id of new Set([...sorted.map(({ habitId }) => habitId), ...schedule.map(({ habitId }) => habitId)])) {
    if (!result.has(id)) result.set(id, { id, name: knownNames.get(id) ?? `Hábito eliminado (${id.slice(0, 8)})`, status: 'Eliminado' });
  }
  return [...result.values()];
}

function stateOnDay(
  date: string, today: string, changes: readonly ScheduleChange[], record?: HabitRecord,
): DayState {
  if (date > today) return 'future';
  const frequency = frequencyAt(changes, date);
  if (frequency === undefined) return 'unknown';
  if (frequency === null || !scheduledOnDay(frequency, date)) return 'off';
  const status = recordStatus(record);
  if (status === 'Completado') return 'completed';
  if (date === today && status === 'Parcial') return 'partial';
  if (frequency.kind === 'weekly') return 'flexible';
  return date === today ? 'pending' : 'missed';
}

function weeklyResults(
  changes: readonly ScheduleChange[], records: ReadonlyMap<string, HabitRecord>, first: string, today: string,
): WeeklyResult[] {
  const result: WeeklyResult[] = [];
  for (let start = startOfWeek(first); start <= today; start = addDays(start, 7)) {
    const end = addDays(start, 6);
    const days = [...datesBetween(start, end)].map((date) => ({
      date, frequency: frequencyAt(changes, date > today ? today : date),
    }));
    const weeklyDays = days.flatMap(({ date, frequency }) => frequency?.kind === 'weekly'
      ? [{ date, goal: frequency.times }]
      : []);
    const latestGoal = weeklyDays.at(-1)?.goal;
    if (latestGoal === undefined) continue;

    const matching = weeklyDays.filter(({ goal }) => goal === latestGoal);
    result.push({
      start, end, goal: latestGoal, open: end >= today, comparable: matching.length === 7,
      done: matching.filter(({ date }) => date <= today && records.get(date)?.completed).length,
    });
  }
  return result;
}

function streaks(outcomes: readonly Outcome[], activeUnit: Unit | null) {
  const best: Record<Unit, number> = { days: 0, weeks: 0 };
  const units = new Set<Unit>();
  let previous: Unit | null = null;
  let current = 0;
  for (const { unit, state } of [...outcomes].sort((a, b) => a.date.localeCompare(b.date))) {
    if (unit !== previous) current = 0;
    previous = unit;
    if (state !== 'pending') units.add(unit);
    if (state === 'completed') current++;
    if (state === 'missed') current = 0;
    best[unit] = Math.max(best[unit], current);
  }
  return [...units].map((unit) => ({
    unit, current: activeUnit !== unit ? null : previous === unit ? current : 0, best: best[unit],
  }));
}

function habitProgress(
  habit: ProgressHabit, changes: readonly ScheduleChange[], records: readonly HabitRecord[], today: string, range: DateRange,
) {
  const byDate = new Map(records.map((record) => [record.date, record]));
  const active = frequencyAt(changes, today);
  const first = changes.map(({ date }) => date).sort()[0];
  const weeks = first && first <= today && changes.some(({ frequency }) => frequency?.kind === 'weekly')
    ? weeklyResults(changes, byDate, first, today) : [];
  const outcomes: Outcome[] = [];
  let earned = 0;
  let expected = 0;

  if (first) {
    for (const date of datesBetween(first, today)) {
      const frequency = frequencyAt(changes, date);
      if (!frequency || frequency.kind === 'weekly' || !scheduledOnDay(frequency, date)) continue;
      const state = byDate.get(date)?.completed ? 'completed' : date === today ? 'pending' : 'missed';
      outcomes.push({ date, unit: 'days', state });
      if (inRange(date, range) && state !== 'pending') {
        expected++;
        if (state === 'completed') earned++;
      }
    }
  }

  for (const week of weeks) {
    if (!week.comparable) continue;
    const state = week.done >= week.goal ? 'completed' : week.open ? 'pending' : 'missed';
    outcomes.push({ date: week.open ? today : week.end, unit: 'weeks', state });
    // El domingo asigna cada meta semanal a un único mes.
    if (!week.open && inRange(week.end, range)) {
      expected += week.goal;
      earned += Math.min(week.done, week.goal);
    }
  }

  return {
    ...habit,
    earned,
    expected,
    weeks: weeks.filter((week) => inRange(week.end, range)
      || (week.open && inRange(today, range))),
    streaks: streaks(outcomes, active && habit.status === 'Activo' ? active.kind === 'weekly' ? 'weeks' : 'days' : null),
    days: [...datesBetween(range.start, range.end)].map((date) => ({
      date, state: stateOnDay(date, today, changes, byDate.get(date)), record: byDate.get(date),
    })),
  };
}

export function buildProgress(
  habits: readonly Habit[], records: readonly HabitRecord[], schedule: readonly ScheduleChange[],
  today: string, range: DateRange, selectedId: string | null = null,
) {
  const unique = uniqueRecords(records).filter(({ date }) => date <= today);
  const choices = progressHabits(habits, unique, schedule);
  const reports = choices.filter(({ id }) => !selectedId || id === selectedId).map((habit) => habitProgress(
    habit, schedule.filter(({ habitId }) => habitId === habit.id), unique.filter(({ habitId }) => habitId === habit.id), today, range,
  ));
  const earned = reports.reduce((total, report) => total + report.earned, 0);
  const expected = reports.reduce((total, report) => total + report.expected, 0);
  return {
    earned,
    expected,
    percentage: expected ? Math.round(100 * earned / expected) : null,
    reports,
    days: [...datesBetween(range.start, range.end)].map((date, index) => ({
      date,
      habits: reports.map(({ id, name, days }) => ({ id, name, ...days[index] })),
    })),
    history: reports.flatMap(({ id, name, days }) => days.flatMap(({ state, record }) => record
      ? [{ id, name, state, record }]
      : [])).sort((first, second) => second.record.date.localeCompare(first.record.date)),
  };
}
