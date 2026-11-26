import { Injectable } from '@angular/core';

import { buildProgress } from '../domain/habit-progress';
import { Period, periodRange } from '../domain/local-calendar';
import { HabitService } from './habit.service';

@Injectable({ providedIn: 'root' })
export class ProgressService {
  constructor(private readonly habits: HabitService) {}

  summarize(today: string, period: Period, offset: number, habitId: string | null) {
    const range = periodRange(today, period, offset);
    return { range, ...buildProgress(this.habits.habits(), this.habits.records(), this.habits.schedule(), today, range, habitId) };
  }
}
