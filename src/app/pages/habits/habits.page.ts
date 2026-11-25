import { Component, OnInit, signal } from '@angular/core';
import {
  IonAlert, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle,
  IonCardTitle, IonContent, IonHeader, IonIcon, IonModal, IonSpinner, IonText, IonTitle, IonToast, IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { bookOutline, checkmarkCircleOutline, fitnessOutline, leafOutline, timeOutline, waterOutline } from 'ionicons/icons';

import { HabitFormComponent } from '../../components/habit-form/habit-form.component';
import { Habit, HabitFrequency, HabitInput, weekdayLabels } from '../../models/habit.model';
import { HabitService } from '../../services/habit.service';

@Component({
  selector: 'app-habits',
  imports: [
    HabitFormComponent, IonAlert, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
    IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonModal, IonSpinner, IonText, IonTitle,
    IonToast, IonToolbar,
  ],
  templateUrl: './habits.page.html',
})
export class HabitsPage implements OnInit {
  protected readonly editorOpen = signal(false);
  protected readonly editedHabit = signal<Habit | null>(null);
  protected readonly pendingDeletion = signal<Habit | null>(null);
  protected readonly operationError = signal<string | null>(null);
  protected readonly feedback = signal<string | null>(null);
  protected readonly deleteButtons = [
    { text: 'Cancelar', role: 'cancel' },
    { text: 'Eliminar', role: 'destructive' },
  ];

  constructor(protected readonly habitService: HabitService) {
    addIcons({ bookOutline, checkmarkCircleOutline, fitnessOutline, leafOutline, timeOutline, waterOutline });
  }

  ngOnInit(): void {
    void this.habitService.initialize();
  }

  protected openEditor(habit: Habit | null = null): void {
    this.operationError.set(null);
    this.editedHabit.set(habit);
    this.editorOpen.set(true);
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
    this.operationError.set(null);
  }

  protected saveHabit(input: HabitInput): void {
    const habit = this.editedHabit();
    this.performAction(() => {
      if (habit) {
        this.habitService.updateHabit(habit.id, input);
      } else {
        this.habitService.createHabit(input);
      }
      this.closeEditor();
    }, habit ? 'Cambios guardados.' : 'Hábito creado.');
  }

  protected toggleHabit(habit: Habit): void {
    this.performAction(
      () => this.habitService.setHabitActive(habit.id, !habit.active),
      habit.active ? 'Hábito desactivado.' : 'Hábito activado.',
    );
  }

  protected finishDeletion(role?: string): void {
    const habit = this.pendingDeletion();
    this.pendingDeletion.set(null);
    if (habit && role === 'destructive') {
      this.performAction(() => this.habitService.deleteHabit(habit.id), 'Hábito eliminado.');
    }
  }

  protected describeFrequency(frequency: HabitFrequency): string {
    switch (frequency.kind) {
      case 'daily': return 'Todos los días';
      case 'weekdays': return frequency.days.map((day) => weekdayLabels[day]).join(', ');
      case 'weekly': return frequency.times === 1 ? '1 vez por semana' : `${frequency.times} veces por semana`;
    }
  }

  private performAction(action: () => void, successMessage: string): void {
    this.operationError.set(null);
    try {
      action();
      this.feedback.set(successMessage);
    } catch (error) {
      this.operationError.set(error instanceof Error ? error.message : 'No se pudo completar la operación.');
    }
  }
}
