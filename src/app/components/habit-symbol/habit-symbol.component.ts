import { Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bookOutline, checkmarkCircleOutline, fitnessOutline, layersOutline, leafOutline, timeOutline, waterOutline,
} from 'ionicons/icons';

import { Habit } from '../../models/habit.model';

@Component({
  selector: 'app-habit-symbol',
  imports: [IonIcon],
  template: `
    <span class="habit-symbol" [style.color]="'var(--ion-color-' + (habit().color ?? 'primary') + ')'">
      <ion-icon aria-hidden="true" [name]="habit().icon ?? defaults[habit().type]"></ion-icon>
    </span>
  `,
})
export class HabitSymbolComponent {
  readonly habit = input.required<Habit>();
  protected readonly defaults = {
    boolean: 'checkmark-circle-outline',
    duration: 'time-outline',
    quantity: 'layers-outline',
  } as const;

  constructor() {
    addIcons({ bookOutline, checkmarkCircleOutline, fitnessOutline, layersOutline, leafOutline, timeOutline, waterOutline });
  }
}
