import { Component, computed, OnInit, signal } from '@angular/core';
import {
  IonAlert, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle,
  IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal, IonPopover, IonSegment,
  IonSegmentButton, IonSpinner, IonText, IonTitle, IonToast, IonToggle, IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, ellipsisHorizontal, pencilOutline, trashOutline } from 'ionicons/icons';

import { AppBrandComponent } from '../../components/app-brand/app-brand.component';
import { HabitFormComponent } from '../../components/habit-form/habit-form.component';
import { HabitSymbolComponent } from '../../components/habit-symbol/habit-symbol.component';
import { Habit, HabitFrequency, HabitInput, weekdayLabels } from '../../models/habit.model';
import { HabitService } from '../../services/habit.service';

@Component({
  selector: 'app-habits',
  imports: [
    AppBrandComponent, HabitFormComponent, HabitSymbolComponent, IonAlert, IonButton, IonButtons, IonCard,
    IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel,
    IonList, IonModal, IonPopover, IonSegment, IonSegmentButton, IonSpinner, IonText, IonTitle, IonToast, IonToggle,
    IonToolbar,
  ],
  templateUrl: './habits.page.html',
  styleUrl: './habits.page.scss',
})
export class HabitsPage implements OnInit {
  protected readonly editorOpen = signal(false);
  protected readonly editedHabit = signal<Habit | null>(null);
  protected readonly pendingDeletion = signal<Habit | null>(null);
  protected readonly operationError = signal<string | null>(null);
  protected readonly feedback = signal<string | null>(null);
  protected readonly filter = signal<'all' | 'active' | 'inactive'>('all');
  protected readonly visibleHabits = computed(() => {
    const filter = this.filter();
    return this.habitService.habits()
      .filter((habit) => filter === 'all' || habit.active === (filter === 'active'))
      .sort((first, second) => Number(second.active) - Number(first.active) || first.name.localeCompare(second.name, 'es-PY'));
  });
  protected readonly deleteButtons = [
    { text: 'Cancelar', role: 'cancel' },
    { text: 'Eliminar', role: 'destructive' },
  ];

  constructor(protected readonly habitService: HabitService) {
    addIcons({ addOutline, ellipsisHorizontal, pencilOutline, trashOutline });
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

  protected selectFilter(value: string | number | undefined): void {
    if (value === 'all' || value === 'active' || value === 'inactive') this.filter.set(value);
  }

  protected toggleHabit(habit: Habit, toggle: IonToggle, checked: boolean): void {
    const saved = this.performAction(
      () => this.habitService.setHabitActive(habit.id, checked),
      checked ? 'Hábito activado.' : 'Hábito desactivado.',
    );
    if (!saved) toggle.checked = habit.active;
  }

  protected finishMenu(habit: Habit, role?: string): void {
    if (role === 'edit') this.openEditor(habit);
    if (role === 'remove') this.pendingDeletion.set(habit);
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

  private performAction(action: () => void, successMessage: string): boolean {
    this.operationError.set(null);
    try {
      action();
      this.feedback.set(successMessage);
      return true;
    } catch (error) {
      this.feedback.set(null);
      this.operationError.set(error instanceof Error ? error.message : 'No se pudo completar la operación.');
      return false;
    }
  }
}
