import { Component, input, OnInit, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IonButton, IonInput, IonList, IonSelect, IonSelectOption, IonText, IonTextarea } from '@ionic/angular';

import {
  Habit, habitColors, HabitFrequency, habitIcons, HabitInput, HabitType, Weekday, weekdayLabels,
} from '../../models/habit.model';

@Component({
  selector: 'app-habit-form',
  imports: [ReactiveFormsModule, IonButton, IonInput, IonList, IonSelect, IonSelectOption, IonText, IonTextarea],
  templateUrl: './habit-form.component.html',
  styleUrl: './habit-form.component.scss',
})
export class HabitFormComponent implements OnInit {
  readonly habit = input<Habit | null>(null);
  readonly error = input<string | null>(null);
  readonly save = output<HabitInput>();

  protected readonly colors = Object.entries(habitColors);
  protected readonly icons = Object.entries(habitIcons);
  protected readonly weekdays = weekdayLabels;
  protected readonly weeklyOptions = [1, 2, 3, 4, 5, 6, 7];

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    type: new FormControl<HabitType>('boolean', { nonNullable: true }),
    target: new FormControl<number | null>(null),
    unit: new FormControl('', { nonNullable: true }),
    frequency: new FormControl<HabitFrequency['kind']>('daily', { nonNullable: true }),
    days: new FormControl<readonly Weekday[]>([], { nonNullable: true }),
    times: new FormControl<number | null>(null),
    color: new FormControl<keyof typeof habitColors>('primary', { nonNullable: true }),
    icon: new FormControl<keyof typeof habitIcons>('checkmark-circle-outline', { nonNullable: true }),
  });

  protected readonly type = toSignal(this.form.controls.type.valueChanges, { initialValue: 'boolean' });
  protected readonly frequency = toSignal(this.form.controls.frequency.valueChanges, { initialValue: 'daily' });

  ngOnInit(): void {
    const habit = this.habit();
    if (!habit) return;

    this.form.patchValue({
      name: habit.name,
      description: habit.description ?? '',
      type: habit.type,
      target: habit.target ?? null,
      unit: habit.unit ?? '',
      frequency: habit.frequency.kind,
      days: habit.frequency.kind === 'weekdays' ? habit.frequency.days : [],
      times: habit.frequency.kind === 'weekly' ? habit.frequency.times : null,
      color: habit.color ?? 'primary',
      icon: habit.icon ?? 'checkmark-circle-outline',
    });
  }

  protected submit(): void {
    const values = this.form.getRawValue();
    let frequency: HabitFrequency = { kind: 'daily' };
    if (values.frequency === 'weekdays') {
      frequency = { kind: 'weekdays', days: values.days };
    } else if (values.frequency === 'weekly') {
      frequency = { kind: 'weekly', times: values.times ?? NaN };
    }

    const details = {
      name: values.name,
      description: values.description,
      active: this.habit()?.active ?? true,
      color: values.color,
      icon: values.icon,
      frequency,
    };
    this.save.emit(values.type === 'boolean'
      ? { ...details, type: values.type }
      : { ...details, type: values.type, target: values.target ?? NaN, unit: values.unit });
  }
}
