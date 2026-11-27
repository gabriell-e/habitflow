import { Component, computed, OnInit, signal } from '@angular/core';
import { IonBadge } from '@ionic/angular/ion-badge';
import { IonButton } from '@ionic/angular/ion-button';
import { IonCard } from '@ionic/angular/ion-card';
import { IonCardContent } from '@ionic/angular/ion-card-content';
import { IonCardHeader } from '@ionic/angular/ion-card-header';
import { IonCardSubtitle } from '@ionic/angular/ion-card-subtitle';
import { IonCardTitle } from '@ionic/angular/ion-card-title';
import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonInput } from '@ionic/angular/ion-input';
import { IonProgressBar } from '@ionic/angular/ion-progress-bar';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { IonText } from '@ionic/angular/ion-text';
import { IonToolbar } from '@ionic/angular/ion-toolbar';

import { AppBrandComponent } from '../../components/app-brand/app-brand.component';
import { HabitSymbolComponent } from '../../components/habit-symbol/habit-symbol.component';
import { dailyHabits } from '../../domain/habit-tracking';
import { formatLocalDate } from '../../domain/local-calendar';
import { localDateKey } from '../../models/habit-record.model';
import { HabitService } from '../../services/habit.service';
import { LocalCalendarService } from '../../services/local-calendar.service';

type DailyItem = ReturnType<typeof dailyHabits>[number];

@Component({
  selector: 'app-today',
  imports: [
    AppBrandComponent, HabitSymbolComponent, IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader,
    IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonInput, IonProgressBar, IonSpinner, IonText, IonToolbar,
  ],
  templateUrl: './today.page.html',
  styleUrl: './today.page.scss',
})
export class TodayPage implements OnInit {
  protected readonly items = computed(() => dailyHabits(
    this.habitService.habits(), this.habitService.records(), this.habitService.schedule(), this.calendar.today(),
  ));
  protected readonly completed = computed(() => this.items().filter(({ status }) => status === 'Completado').length);
  protected readonly fraction = computed(() => this.items().length ? this.completed() / this.items().length : 0);
  protected readonly percentage = computed(() => Math.round(this.fraction() * 100));
  protected readonly dateLabel = computed(() => formatLocalDate(
    this.calendar.today(), { weekday: 'long', day: 'numeric', month: 'long' },
  ));
  protected readonly actionError = signal<{ id: string; text: string } | null>(null);

  constructor(
    protected readonly habitService: HabitService,
    protected readonly calendar: LocalCalendarService,
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

  protected submitAmount(event: Event, item: DailyItem, raw: string | number | null | undefined): void {
    event.preventDefault();
    this.saveAmount(item, raw);
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
