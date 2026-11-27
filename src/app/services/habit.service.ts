import { HttpClient } from '@angular/common/http';
import { computed, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { currentSchedule, recordSchedule, ScheduleChange } from '../domain/habit-schedule';
import { Habit, habitColors, habitIcons, HabitInput } from '../models/habit.model';
import { HabitRecord, isLocalDateKey, localDateKey, uniqueRecords } from '../models/habit-record.model';
import { StorageService } from './storage.service';

const storageKey = 'habitflow.data.v1';

interface HabitData {
  readonly habits: readonly Habit[];
  readonly records: readonly HabitRecord[];
  readonly schedule?: readonly ScheduleChange[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function frequencyError(value: unknown): string | null {
  if (!isObject(value)) return 'Selecciona una frecuencia.';

  switch (value['kind']) {
    case 'daily':
      return null;
    case 'weekdays': {
      const days: unknown = value['days'];
      const valid = Array.isArray(days) && days.length > 0 && new Set(days).size === days.length
        && days.every((day: unknown) => isNumber(day) && Number.isInteger(day) && day >= 0 && day <= 6);
      return valid ? null : 'Selecciona al menos un día de la semana.';
    }
    case 'weekly': {
      const times = value['times'];
      const valid = isNumber(times) && Number.isInteger(times) && times >= 1 && times <= 7;
      return valid ? null : 'Selecciona de 1 a 7 veces por semana.';
    }
    default:
      return 'Selecciona una frecuencia válida.';
  }
}

function habitInputError(value: Record<string, unknown>): string | null {
  const { name, description, color, icon, type, frequency, active, target, unit } = value;
  if (!hasText(name)) return 'Escribe un nombre para el hábito.';
  if (description !== undefined && typeof description !== 'string') return 'La descripción debe ser texto.';
  if (color !== undefined && (typeof color !== 'string' || !Object.hasOwn(habitColors, color))) {
    return 'Selecciona un color válido.';
  }
  if (icon !== undefined && (typeof icon !== 'string' || !Object.hasOwn(habitIcons, icon))) {
    return 'Selecciona un icono válido.';
  }
  if (typeof active !== 'boolean') return 'El estado del hábito no es válido.';

  if (type === 'boolean') {
    if (target !== undefined || unit !== undefined) return 'El hábito de sí o no no admite objetivo ni unidad.';
  } else {
    if (type !== 'quantity' && type !== 'duration') return 'Selecciona un tipo de hábito válido.';
    if (!isNumber(target) || target <= 0) return 'Escribe un objetivo mayor que cero.';
    if (!hasText(unit)) return 'Escribe una unidad para el objetivo.';
  }

  return frequencyError(frequency);
}

function isHabit(value: unknown): value is Habit {
  return isObject(value) && hasText(value['id']) && habitInputError(value) === null;
}

function isHabitList(value: unknown): value is readonly Habit[] {
  return Array.isArray(value) && value.every(isHabit)
    && new Set(value.map((habit) => habit.id)).size === value.length;
}

function isRecord(value: unknown): value is HabitRecord {
  if (!isObject(value)) return false;

  const { habitId, date, value: amount, completed, habitName, goal } = value;
  if (!hasText(habitId) || !isLocalDateKey(date) || typeof completed !== 'boolean'
    || (habitName !== undefined && !hasText(habitName))) return false;

  if (typeof amount === 'boolean') return goal === undefined && completed === amount;
  if (!isNumber(amount) || amount < 0) return false;
  if (goal === undefined) return amount > 0 || !completed;
  return isObject(goal) && isNumber(goal['target']) && goal['target'] > 0 && hasText(goal['unit'])
    && completed === (amount >= goal['target']);
}

function isHabitData(value: unknown): value is HabitData {
  return isObject(value) && isHabitList(value['habits'])
    && Array.isArray(value['records']) && value['records'].every(isRecord)
    && (value['schedule'] === undefined || (Array.isArray(value['schedule']) && value['schedule'].every(isScheduleChange)));
}

function isScheduleChange(value: unknown): value is ScheduleChange {
  return isObject(value) && hasText(value['habitId']) && isLocalDateKey(value['date'])
    && (value['frequency'] === null || frequencyError(value['frequency']) === null);
}

@Injectable({ providedIn: 'root' })
export class HabitService {
  private readonly data = signal<HabitData | null>(null);
  private readonly loadingState = signal(false);
  private readonly loadErrorState = signal<string | null>(null);
  private readonly persistenceErrorState = signal<string | null>(null);
  private pendingLoad?: Promise<void>;

  readonly habits = computed(() => this.data()?.habits ?? []);
  readonly records = computed(() => this.data()?.records ?? []);
  readonly schedule = computed(() => this.data()?.schedule ?? []);
  readonly loading = this.loadingState.asReadonly();
  readonly loadError = this.loadErrorState.asReadonly();
  readonly persistenceError = this.persistenceErrorState.asReadonly();

  constructor(
    private readonly http: HttpClient,
    private readonly storage: StorageService,
  ) {}

  initialize(): Promise<void> {
    if (this.pendingLoad) return this.pendingLoad;
    if (this.data()) return Promise.resolve();

    this.loadingState.set(true);
    this.loadErrorState.set(null);
    this.persistenceErrorState.set(null);
    this.pendingLoad = this.load().catch((error: unknown) => {
      this.loadErrorState.set(error instanceof Error ? error.message : 'No se pudieron cargar los hábitos.');
    }).finally(() => {
      this.loadingState.set(false);
      this.pendingLoad = undefined;
    });
    return this.pendingLoad;
  }

  createHabit(input: HabitInput): Habit {
    const habit = this.buildHabit(crypto.randomUUID(), input);
    this.updateData((data) => ({
      ...data,
      habits: [...data.habits, habit],
      schedule: recordSchedule(data.schedule ?? [], habit.id, localDateKey(), habit.active ? habit.frequency : null),
    }));
    return habit;
  }

  updateHabit(id: string, input: HabitInput): Habit {
    const updated = this.buildHabit(id, input);
    this.updateData((data) => {
      this.requireHabit(data, id);
      return this.replaceHabit(data, updated);
    });
    return updated;
  }

  setHabitActive(id: string, active: boolean): void {
    this.updateData((data) => {
      const habit = this.requireHabit(data, id);
      const updated = this.buildHabit(id, { ...habit, active });
      return this.replaceHabit(data, updated);
    });
  }

  deleteHabit(id: string): void {
    this.updateData((data) => {
      this.requireHabit(data, id);
      // Eliminar una definición no elimina sus registros históricos.
      return {
        ...data,
        habits: data.habits.filter((habit) => habit.id !== id),
        schedule: recordSchedule(data.schedule ?? [], id, localDateKey(), null),
      };
    });
  }

  saveRecord(habitId: string, value: boolean | number, date = localDateKey()): HabitRecord {
    return this.writeRecord(habitId, date, () => value);
  }

  incrementQuantity(habitId: string, date: string): void {
    this.writeRecord(habitId, date, (habit, record) => {
      if (habit.type !== 'quantity') throw new Error('Este hábito no admite incrementos de cantidad.');
      if (record && (typeof record.value !== 'number' || record.goal?.unit !== habit.unit)) {
        throw new Error('Corrige el valor según la unidad actual antes de incrementarlo.');
      }
      const amount = typeof record?.value === 'number' ? record.value : 0;
      if (amount >= Number.MAX_SAFE_INTEGER) throw new Error('La cantidad es demasiado grande para sumar 1.');
      return amount + 1;
    });
  }

  removeRecord(habitId: string, date: string): void {
    if (!isLocalDateKey(date)) throw new Error('La fecha del registro debe ser un día válido en formato AAAA-MM-DD.');
    this.updateData((data) => ({
      ...data,
      records: data.records.filter((record) => record.habitId !== habitId || record.date !== date),
    }));
  }

  private writeRecord(
    habitId: string,
    date: string,
    getValue: (habit: Habit, record: HabitRecord | undefined) => boolean | number,
  ): HabitRecord {
    if (!isLocalDateKey(date)) throw new Error('La fecha del registro debe ser un día válido en formato AAAA-MM-DD.');

    return this.updateData((data) => {
      const habit = this.requireHabit(data, habitId);
      const existing = data.records.find((item) => item.habitId === habitId && item.date === date);
      const value = getValue(habit, existing);
      let completed: boolean;
      if (habit.type === 'boolean') {
        if (typeof value !== 'boolean') throw new Error('Este hábito requiere un valor de sí o no.');
        completed = value;
      } else {
        if (!isNumber(value) || value < 0) throw new Error('Este hábito requiere un valor numérico no negativo.');
        completed = value >= habit.target;
      }

      const record: HabitRecord = {
        habitId, date, value, completed, habitName: habit.name,
        ...(habit.type === 'boolean' ? {} : { goal: { target: habit.target, unit: habit.unit } }),
      };
      const records = data.records.filter((item) => item.habitId !== habitId || item.date !== date);
      return { ...data, records: [...records, record] };
    }).records.at(-1)!;
  }

  private async load(): Promise<void> {
    const stored = this.readData();
    if (stored !== null) {
      this.loadStored(stored);
      return;
    }

    let seed: unknown;
    try {
      seed = await firstValueFrom(this.http.get<unknown>(environment.habitsUrl));
    } catch (cause) {
      throw new Error('No se pudieron cargar los hábitos iniciales.', { cause });
    }
    if (!isHabitList(seed)) throw new Error('Los hábitos iniciales tienen un formato inválido.');

    // Otra pestaña pudo guardar datos mientras se descargaba el JSON inicial.
    const latest = this.readData();
    if (latest !== null) {
      this.loadStored(latest);
    } else {
      this.persist({ habits: seed, records: [], schedule: currentSchedule(seed, localDateKey()) });
    }
  }

  private loadStored(data: HabitData): void {
    if (data.schedule === undefined) {
      // El almacenamiento anterior conserva registros, pero carece de programación histórica.
      const tracked = { ...data, schedule: currentSchedule(data.habits, localDateKey()) };
      try {
        this.persist(tracked);
      } catch {
        this.data.set(data);
      }
    } else {
      this.data.set(data);
    }
  }

  private replaceHabit(data: HabitData, habit: Habit): HabitData {
    return {
      ...data,
      habits: data.habits.map((item) => item.id === habit.id ? habit : item),
      schedule: recordSchedule(data.schedule ?? [], habit.id, localDateKey(), habit.active ? habit.frequency : null),
    };
  }

  private buildHabit(id: string, input: HabitInput): Habit {
    const error = habitInputError({ ...input });
    if (error) throw new Error(error);

    const details = {
      ...input,
      id,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
    };
    return structuredClone(input.type === 'boolean'
      ? details
      : { ...details, type: input.type, target: input.target, unit: input.unit.trim() });
  }

  private requireHabit(data: HabitData, id: string): Habit {
    const habit = data.habits.find((item) => item.id === id);
    if (!habit) throw new Error('No se encontró el hábito solicitado.');
    return habit;
  }

  private updateData(change: (data: HabitData) => HabitData): HabitData {
    if (!this.data()) throw new Error('Primero se deben cargar los hábitos.');

    this.persistenceErrorState.set(null);
    const current = this.readData();
    if (current === null) {
      const message = 'Los datos guardados dejaron de estar disponibles. Vuelve a cargar la aplicación.';
      this.persistenceErrorState.set(message);
      throw new Error(message);
    }
    const known = current.schedule === undefined
      ? { ...current, schedule: currentSchedule(current.habits, localDateKey()) }
      : current;
    return this.persist(change(known));
  }

  private readData(): HabitData | null {
    try {
      const stored = this.storage.read(storageKey);
      if (stored === null) return null;
      if (!isHabitData(stored.value)) throw new Error('Los datos guardados tienen un formato inválido.');
      return { ...stored.value, records: uniqueRecords(stored.value.records) };
    } catch (error) {
      if (error instanceof Error) this.persistenceErrorState.set(error.message);
      throw error;
    }
  }

  private persist(data: HabitData): HabitData {
    try {
      this.storage.write(storageKey, data);
      this.data.set(data);
      return data;
    } catch (error) {
      if (error instanceof Error) this.persistenceErrorState.set(error.message);
      throw error;
    }
  }
}
