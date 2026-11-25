import type { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'hoy',
        loadComponent: () => import('../pages/today/today.page').then((m) => m.TodayPage),
      },
      {
        path: 'habitos',
        loadComponent: () => import('../pages/habits/habits.page').then((m) => m.HabitsPage),
      },
      {
        path: 'progreso',
        loadComponent: () => import('../pages/progress/progress.page').then((m) => m.ProgressPage),
      },
      { path: '', redirectTo: 'hoy', pathMatch: 'full' },
    ],
  },
  { path: '', redirectTo: 'tabs/hoy', pathMatch: 'full' },
];
