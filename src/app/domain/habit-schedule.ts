import { Habit, HabitFrequency } from '../models/habit.model';

export interface ScheduleChange {
  readonly habitId: string;
  readonly date: string;
  readonly frequency: HabitFrequency | null;
}

export function sameFrequency(first: HabitFrequency | null, second: HabitFrequency | null): boolean {
  if (first === null || second === null) return first === second;
  switch (first.kind) {
    case 'daily': return second.kind === 'daily';
    case 'weekly': return second.kind === 'weekly' && first.times === second.times;
    case 'weekdays': return second.kind === 'weekdays' && first.days.length === second.days.length
      && first.days.every((day) => second.days.includes(day));
  }
}

// La ausencia de una versión significa que la programación de esa fecha es desconocida.
export function frequencyAt(changes: readonly ScheduleChange[], date: string): HabitFrequency | null | undefined {
  let effective: ScheduleChange | undefined;
  for (const change of changes) {
    if (change.date <= date && (!effective || change.date >= effective.date)) effective = change;
  }
  return effective?.frequency;
}

export function currentSchedule(habits: readonly Habit[], date: string): ScheduleChange[] {
  return habits.map((habit) => ({ habitId: habit.id, date, frequency: habit.active ? habit.frequency : null }));
}

export function recordSchedule(
  schedule: readonly ScheduleChange[], habitId: string, date: string, frequency: HabitFrequency | null,
): readonly ScheduleChange[] {
  const changes = schedule.filter((change) => change.habitId === habitId);
  const current = frequencyAt(changes, date);
  if (current !== undefined && sameFrequency(current, frequency)) return schedule;
  return [
    ...schedule.filter((change) => change.habitId !== habitId || change.date !== date),
    { habitId, date, frequency },
  ];
}
