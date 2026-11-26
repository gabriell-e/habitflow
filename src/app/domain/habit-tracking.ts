import { Habit, HabitFrequency, Weekday } from '../models/habit.model';
import { HabitRecord } from '../models/habit-record.model';
import { frequencyAt, ScheduleChange } from './habit-schedule';
import { calendarDate, startOfWeek } from './local-calendar';

export function scheduledOnDay(frequency: HabitFrequency, date: string): boolean {
  return frequency.kind !== 'weekdays' || frequency.days.includes(calendarDate(date).getDay() as Weekday);
}

export function dailyHabits(
  habits: readonly Habit[], records: readonly HabitRecord[], schedule: readonly ScheduleChange[], date: string,
) {
  const monday = startOfWeek(date);
  const todayRecords = new Map(records.filter((record) => record.date === date).map((record) => [record.habitId, record]));
  const completedThisWeek = records.filter((record) => record.completed && record.date >= monday && record.date <= date);

  return habits.filter((habit) => habit.active && scheduledOnDay(habit.frequency, date))
    .flatMap((habit) => {
      const record = todayRecords.get(habit.id);
      const quota = habit.frequency.kind === 'weekly' ? habit.frequency.times : null;
      const changes = quota === null ? [] : schedule.filter((change) => change.habitId === habit.id);
      const done = quota === null ? 0 : completedThisWeek.filter((item) => {
        if (item.habitId !== habit.id) return false;
        const frequency = frequencyAt(changes, item.date);
        return frequency?.kind === 'weekly' && frequency.times === quota;
      }).length;
      if (quota !== null && done >= quota && !record) return [];

      const status = record?.completed ? 'Completado'
        : typeof record?.value === 'number' && record.value > 0 ? 'Parcial' : 'Pendiente';
      const amount = typeof record?.value === 'number' ? record.value : null;
      const progress = record?.completed ? 1 : status !== 'Parcial' ? 0
        : record?.goal && amount !== null ? Math.min(amount / record.goal.target, 1) : null;
      const canIncrement = !record || (amount !== null && record.goal?.unit === habit.unit);
      return [{ habit, date, record, status, amount, progress, canIncrement, weekly: quota === null ? null : { done, quota } }];
    });
}
