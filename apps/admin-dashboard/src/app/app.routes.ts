import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'accept-invitation/:token',
    loadComponent: () =>
      import('./pages/accept-invitation/accept-invitation').then((m) => m.AcceptInvitationPage),
  },
  {
    path: '',
    loadComponent: () => import('./shell/shell').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'trips',
        loadComponent: () => import('./pages/trips/trips').then((m) => m.TripsPage),
      },
      {
        path: 'trips/:id/reservations',
        loadComponent: () =>
          import('./pages/reservations/reservations').then((m) => m.ReservationsPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
