export type HabitType = 'boolean' | 'quantity' | 'duration';

// Los días siguen Date.getDay(): 0 es domingo y 6 es sábado.
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type HabitFrequency =
  | { readonly kind: 'daily' }
  | { readonly kind: 'weekdays'; readonly days: readonly Weekday[] }
  | { readonly kind: 'weekly'; readonly times: number };

export const habitColors = {
  primary: 'Azul',
  secondary: 'Celeste',
  tertiary: 'Violeta',
  success: 'Verde',
  warning: 'Amarillo',
  danger: 'Rojo',
} as const;

export const habitIcons = {
  'checkmark-circle-outline': 'Círculo con marca',
  'book-outline': 'Libro',
  'fitness-outline': 'Ejercicio',
  'water-outline': 'Agua',
  'leaf-outline': 'Hoja',
  'time-outline': 'Reloj',
} as const;

export const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface HabitDetails {
  readonly name: string;
  readonly description?: string;
  readonly color?: keyof typeof habitColors;
  readonly icon?: keyof typeof habitIcons;
  readonly frequency: HabitFrequency;
  readonly active: boolean;
}

export type HabitInput = HabitDetails & (
  | { readonly type: 'boolean'; readonly target?: never; readonly unit?: never }
  | { readonly type: 'quantity' | 'duration'; readonly target: number; readonly unit: string }
);

export type Habit = HabitInput & { readonly id: string };
