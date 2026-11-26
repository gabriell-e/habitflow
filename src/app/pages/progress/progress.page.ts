import { Component, computed, OnInit, signal } from '@angular/core';
import {
  IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonHeader,
  IonProgressBar, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonSpinner, IonText, IonTitle, IonToolbar,
} from '@ionic/angular';

import { dayStates, progressHabits } from '../../domain/habit-progress';
import { calendarDate, formatLocalDate, Period } from '../../domain/local-calendar';
import { HabitRecord } from '../../models/habit-record.model';
import { HabitService } from '../../services/habit.service';
import { LocalCalendarService } from '../../services/local-calendar.service';
import { ProgressService } from '../../services/progress.service';

@Component({
  selector: 'app-progress',
  imports: [
    IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonHeader,
    IonProgressBar, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonSpinner, IonText, IonTitle, IonToolbar,
  ],
  templateUrl: './progress.page.html',
  styleUrl: './progress.page.scss',
})
export class ProgressPage implements OnInit {
  protected readonly period = signal<Period>('week');
  protected readonly offset = signal(0);
  protected readonly selectedHabit = signal('');
  protected readonly selectedDate = signal<string | null>(null);
  protected readonly dayStates = dayStates;
  protected readonly weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  protected readonly habits = computed(() => progressHabits(
    this.habitService.habits(), this.habitService.records(), this.habitService.schedule(),
  ));
  protected readonly summary = computed(() => this.progress.summarize(
    this.calendar.today(), this.period(), this.offset(), this.selectedHabit() || null,
  ));
  protected readonly cells = computed(() => this.summary().days.map(({ date, habits }) => {
    const states = new Set(habits.map(({ state }) => state));
    const records = habits.filter(({ record }) => record).length;
    const marker = states.has('missed') ? '!' : states.has('completed') ? '✓' : records ? '•' : '';
    const labels = [...states].map((state) => dayStates[state]).join(', ');
    return { date, marker, label: `${this.dateLabel(date)}. ${records} registros. ${labels}` };
  }));
  protected readonly firstColumn = computed(() => ((calendarDate(this.summary().range.start).getDay() + 6) % 7) + 1);
  protected readonly dayDetail = computed(() => {
    const days = this.summary().days;
    return days.find(({ date }) => date === this.selectedDate())
      ?? days.find(({ date }) => date === this.calendar.today());
  });

  constructor(
    protected readonly habitService: HabitService,
    private readonly progress: ProgressService,
    private readonly calendar: LocalCalendarService,
  ) {}

  ngOnInit(): void {
    void this.habitService.initialize();
  }

  protected selectPeriod(period: string | number | undefined): void {
    if (period !== 'week' && period !== 'month') return;
    this.period.set(period);
    this.offset.set(0);
    this.selectedDate.set(null);
  }

  protected movePeriod(delta: number): void {
    this.offset.update((offset) => Math.min(0, offset + delta));
    this.selectedDate.set(null);
  }

  protected dateLabel(date: string): string {
    return formatLocalDate(date, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected recordLabel(record: HabitRecord): string {
    if (typeof record.value === 'boolean') return record.value ? 'Sí · Completado' : 'No · Sin completar';
    const state = record.completed ? 'Completado' : record.value > 0 ? 'Parcial' : 'Sin completar';
    const unit = record.goal ? ` ${record.goal.unit}` : '';
    return `${record.value}${unit} · ${state}`;
  }
}
