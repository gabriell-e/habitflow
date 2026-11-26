import { Component, computed, OnInit, signal } from '@angular/core';
import {
  IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle,
  IonContent, IonHeader, IonInput, IonProgressBar, IonSpinner, IonText, IonTitle, IonToolbar,
} from '@ionic/angular';

import { dailyHabits } from '../../domain/habit-tracking';
import { formatLocalDate } from '../../domain/local-calendar';
import { localDateKey } from '../../models/habit-record.model';
import { HabitService } from '../../services/habit.service';
import { LocalCalendarService } from '../../services/local-calendar.service';

type DailyItem = ReturnType<typeof dailyHabits>[number];

@Component({
  selector: 'app-today',
  imports: [
    IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle,
    IonContent, IonHeader, IonInput, IonProgressBar, IonSpinner, IonText, IonTitle, IonToolbar,
  ],
  templateUrl: './today.page.html',
})
export class TodayPage implements OnInit {
  protected readonly items = computed(() => dailyHabits(
    this.habitService.habits(), this.habitService.records(), this.habitService.schedule(), this.calendar.today(),
  ));
  protected readonly completed = computed(() => this.items().filter(({ status }) => status === 'Completado').length);
  protected readonly dateLabel = computed(() => formatLocalDate(
    this.calendar.today(), { weekday: 'long', day: 'numeric', month: 'long' },
  ));
  protected readonly actionError = signal<{ id: string; text: string } | null>(null);

  constructor(
    protected readonly habitService: HabitService,
    private readonly calendar: LocalCalendarService,
  ) {}

  ngOnInit(): void {
    void this.habitService.initialize();
  }

  protected toggle(item: DailyItem): void {
    this.perform(item, () => {
      if (item.record?.value === true) this.habitService.removeRecord(item.habit.id, item.date);
      else this.habitService.saveRecord(item.habit.id, true, item.date);
    });
  }

  protected saveAmount(item: DailyItem, raw: string | number | null | undefined): void {
    const value = raw == null || String(raw).trim() === '' ? NaN : Number(raw);
    this.perform(item, () => this.habitService.saveRecord(item.habit.id, value, item.date));
  }

  protected increment(item: DailyItem): void {
    this.perform(item, () => this.habitService.incrementQuantity(item.habit.id, item.date));
  }

  private perform(item: DailyItem, action: () => void): void {
    this.actionError.set(null);
    try {
      if (item.date !== localDateKey()) throw new Error('Ha cambiado el día. Comprueba la fecha antes de registrar.');
      action();
    } catch (error) {
      this.actionError.set({
        id: item.habit.id,
        text: error instanceof Error ? error.message : 'No se pudo actualizar el registro.',
      });
    }
  }
}
