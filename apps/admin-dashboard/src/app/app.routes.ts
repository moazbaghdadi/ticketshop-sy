import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
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
        path: 'trips/new',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/new-trip/new-trip').then((m) => m.NewTripPage),
      },
      {
        path: 'drivers',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/drivers/drivers').then((m) => m.DriversPage),
      },
      {
        path: 'trips/:id/reservations',
        loadComponent: () =>
          import('./pages/reservations/reservations').then((m) => m.ReservationsPage),
      },
      {
        path: 'reports',
        loadComponent: () => import('./pages/reports/reports').then((m) => m.ReportsPage),
      },
      {
        path: 'bookings',
        loadComponent: () =>
          import('./pages/bookings-search/bookings-search').then((m) => m.BookingsSearchPage),
      },
      {
        path: 'bookings/:reference',
        loadComponent: () =>
          import('./pages/booking-detail/booking-detail').then((m) => m.BookingDetailPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
