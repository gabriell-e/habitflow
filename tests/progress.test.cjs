const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');

const scratch = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'habitflow-progress-'));
after(() => {
  const resolved = fs.realpathSync(scratch);
  if (resolved === scratch && path.basename(resolved).startsWith('habitflow-progress-')) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
execFileSync(process.execPath, [
  require.resolve('typescript/bin/tsc'), '--module', 'Node16', '--target', 'ES2022', '--strict',
  '--skipLibCheck', '--rootDir', 'src/app', '--outDir', scratch, 'src/app/domain/habit-progress.ts',
], { stdio: 'inherit' });

const { buildProgress } = require(path.join(scratch, 'domain/habit-progress.js'));
const { recordSchedule } = require(path.join(scratch, 'domain/habit-schedule.js'));
const { dailyHabits } = require(path.join(scratch, 'domain/habit-tracking.js'));
const { addDays, datesBetween, formatDateRange, periodRange, startOfWeek } = require(path.join(scratch, 'domain/local-calendar.js'));
const { isLocalDateKey, uniqueRecords } = require(path.join(scratch, 'models/habit-record.model.js'));

const daily = { kind: 'daily' };
const weekly = { kind: 'weekly', times: 3 };
const habit = { id: 'a', name: 'Leer', type: 'boolean', active: true, frequency: daily };
const record = (date, completed = true, habitId = 'a') => ({ habitId, date, value: completed, completed });
const version = (date, frequency, habitId = 'a') => ({ habitId, date, frequency });
const report = (records, schedule, today, period = 'week', offset = 0, habits = [habit], selectedId = null) =>
  buildProgress(habits, records, schedule, today, periodRange(today, period, offset), selectedId);

test('calendario local con lunes inicial, cruces de mes y año bisiesto', () => {
  assert.equal(startOfWeek('2026-12-01'), '2026-11-30');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(periodRange('2024-03-01', 'month', -1), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(periodRange('2026-12-01', 'week', 0), { start: '2026-11-30', end: '2026-12-06' });
});

test('fechas inválidas, límite ISO y rango compacto con cruces de mes y año', () => {
  assert.equal(isLocalDateKey('2026-02-29'), false);
  assert.equal(isLocalDateKey('0000-01-01'), false);
  assert.deepEqual([...datesBetween('9999-12-30', '9999-12-31')], ['9999-12-30', '9999-12-31']);
  assert.deepEqual([...datesBetween('2026-03-07', '2026-03-10')], [
    '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10',
  ]);
  assert.equal(formatDateRange('2026-11-23', '2026-11-29').match(/2026/g).length, 1);
  assert.match(formatDateRange('2026-11-30', '2026-12-06'), /30.*nov.*6.*dic.*2026/);
  assert.match(formatDateRange('2026-12-28', '2027-01-03'), /28.*dic.*2026.*3.*ene.*2027/);
});

test('un parcial abierto coincide con Hoy y pasa a incumplido al cerrar el día', () => {
  const today = '2026-11-11';
  const measured = { ...habit, type: 'quantity', unit: 'páginas', target: 20 };
  const schedule = [version('2026-11-09', daily)];
  const partial = { habitId: 'a', date: today, value: 4, completed: false, goal: { target: 10, unit: 'páginas' } };
  const items = dailyHabits([measured], [partial], schedule, today);
  assert.equal(items[0].status, 'Parcial');
  assert.equal(items[0].progress, 0.4);
  const open = report([partial], schedule, today, 'week', 0, [measured]);
  assert.equal(open.days[2].habits[0].state, 'partial');
  assert.equal(open.expected, 2);
  const closed = report([partial], schedule, '2026-11-12', 'week', 0, [measured]);
  assert.equal(closed.days[2].habits[0].state, 'missed');
  assert.equal(closed.expected, 3);
  assert.equal(closed.history[0].record, partial);
  assert.equal(report([{ ...partial, value: 0 }], schedule, today, 'week', 0, [measured])
    .days[2].habits[0].state, 'pending');
  assert.equal(report([{ ...partial, value: 10, completed: true }], schedule, today, 'week', 0, [measured])
    .days[2].habits[0].state, 'completed');
});

test('cada día cerrado cuenta y un registro pendiente de hoy no corta la racha', () => {
  const result = report(
    ['09', '10', '12', '13'].map((day) => record('2026-11-' + day)),
    [version('2026-11-09', daily)], '2026-11-14',
  );
  assert.equal(result.percentage, 80);
  assert.deepEqual(result.reports[0].streaks, [{ unit: 'days', current: 2, best: 2 }]);
  assert.deepEqual(result.days.map((day) => day.habits[0].state),
    ['completed', 'completed', 'missed', 'completed', 'completed', 'pending', 'future']);
});

test('días específicos excluyen descansos y los registros fuera de programa del porcentaje', () => {
  const result = report(
    ['09', '10', '11'].map((day) => record('2026-11-' + day)),
    [version('2026-11-09', { kind: 'weekdays', days: [1, 3, 5] })], '2026-11-13',
  );
  assert.equal(result.expected, 2);
  assert.equal(result.percentage, 100);
  assert.equal(result.history.length, 3);
  assert.equal(result.days[1].habits[0].state, 'off');
  assert.deepEqual(result.reports[0].streaks, [{ unit: 'days', current: 2, best: 2 }]);
});

test('una semana flexible abierta conserva la racha y una cerrada suma el avance parcial', () => {
  const dates = ['02', '04', '08', '09', '13', '15', '16', '17'];
  const records = dates.map((day) => record('2026-11-' + day));
  const schedule = [version('2026-11-02', weekly)];
  const sunday = report(records, schedule, '2026-11-22', 'month');
  assert.equal(sunday.percentage, 100);
  assert.deepEqual(sunday.reports[0].weeks.at(-1), {
    start: '2026-11-16', end: '2026-11-22', goal: 3, done: 2, comparable: true, open: true,
  });
  assert.deepEqual(sunday.reports[0].streaks, [{ unit: 'weeks', current: 2, best: 2 }]);
  const monday = report(records, schedule, '2026-11-23', 'month');
  assert.equal(monday.earned, 8);
  assert.equal(monday.expected, 9);
  assert.equal(monday.percentage, 89);
  assert.deepEqual(monday.reports[0].streaks, [{ unit: 'weeks', current: 0, best: 2 }]);
  const achieved = report([...records, record('2026-11-20')], schedule, '2026-11-20', 'month');
  assert.deepEqual(achieved.reports[0].streaks, [{ unit: 'weeks', current: 3, best: 3 }]);
});

test('la cuota semanal se asigna al mes del domingo, con tope en el objetivo', () => {
  const schedule = [version('2026-11-30', weekly)];
  const records = ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03'].map((date) => record(date));
  assert.equal(report(records, schedule, '2026-12-07', 'month', -1).percentage, null);
  const december = report(records, schedule, '2026-12-07', 'month');
  assert.equal(december.earned, 3);
  assert.equal(december.expected, 3);
});

test('un cambio de frecuencia conserva pasado y omite semanas incomparables', () => {
  const records = [record('2026-11-02'), record('2026-11-04'), record('2026-11-10')];
  let schedule = recordSchedule([], 'a', '2026-11-02', daily);
  schedule = recordSchedule(schedule, 'a', '2026-11-05', weekly);
  schedule = recordSchedule(schedule, 'a', '2026-11-08', { kind: 'weekly', times: 2 });
  const result = report(records, schedule, '2026-11-15', 'month');
  assert.equal(result.reports[0].weeks[0].comparable, false);
  assert.equal(result.reports[0].weeks[1].comparable, true);
  assert.deepEqual(result.reports[0].streaks, [
    { unit: 'days', current: null, best: 1 },
  ]);
  assert.equal(result.expected, 3);
});

test('una pausa no rompe la racha y datos previos o eliminados conservan solo el historial conocido', () => {
  const changes = [version('2026-11-09', daily), version('2026-11-11', null), version('2026-11-13', daily)];
  const records = [record('2026-11-08', true, 'removed'), record('2026-11-09'), record('2026-11-10'), record('2026-11-13')];
  const result = report(records, changes, '2026-11-14');
  assert.deepEqual(result.reports[0].streaks, [{ unit: 'days', current: 3, best: 3 }]);
  assert.equal(result.days[2].habits[0].state, 'off');
  const deleted = report(records, changes, '2026-11-14', 'month', 0, [habit], 'removed');
  assert.equal(deleted.percentage, null);
  assert.equal(deleted.history[0].state, 'unknown');
  assert.equal(deleted.reports[0].status, 'Eliminado');
  assert.deepEqual(deleted.reports[0].streaks, []);
  const empty = report([], [], '2026-11-14', 'week', 0, []);
  assert.equal(empty.percentage, null);
  assert.deepEqual(empty.history, []);
  const firstDay = report([], [version('2026-11-14', daily)], '2026-11-14');
  assert.deepEqual(firstDay.reports[0].streaks, []);
});

test('la última corrección gana, y una meta flexible satisfecha sale de Hoy si ese día no hay registro', () => {
  const records = uniqueRecords([
    record('2026-11-09'), record('2026-11-09', false), record('2026-11-10'), record('2026-11-11'), record('2026-11-12'),
  ]);
  const schedule = [version('2026-11-09', weekly)];
  assert.equal(records.length, 4);
  assert.equal(records[0].completed, false);
  assert.equal(report(records, schedule, '2026-11-16', 'week', -1).earned, 3);
  const flexible = { ...habit, frequency: weekly };
  assert.deepEqual(dailyHabits([flexible], records, schedule, '2026-11-13'), []);
  assert.equal(dailyHabits([flexible], records, schedule, '2026-11-12')[0].weekly.done, 3);
  assert.equal(dailyHabits([flexible], records, schedule, '2026-11-16')[0].weekly.done, 0);
});
