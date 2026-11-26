export interface HabitRecord {
  readonly habitId: string;
  readonly date: string;
  readonly value: boolean | number;
  readonly completed: boolean;
  readonly habitName?: string;
  readonly goal?: { readonly target: number; readonly unit: string };
}

export function uniqueRecords(records: readonly HabitRecord[]): HabitRecord[] {
  const byDay = new Map<string, HabitRecord>();
  for (const record of records) {
    byDay.set(JSON.stringify([record.habitId, record.date]), record);
  }
  return [...byDay.values()];
}

// Esta clave representa un día del calendario local y no un instante UTC.
export function localDateKey(date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isLocalDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
