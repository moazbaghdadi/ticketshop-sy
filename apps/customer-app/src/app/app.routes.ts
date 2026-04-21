import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.HomePage),
  },
  {
    path: 'timetable',
    loadComponent: () => import('./pages/timetable/timetable').then((m) => m.TimetablePage),
  },
  {
    path: 'seat-selection',
    loadComponent: () =>
      import('./pages/seat-selection/seat-selection').then((m) => m.SeatSelectionPage),
  },
  {
    path: 'passenger-info',
    loadComponent: () =>
      import('./pages/passenger-info/passenger-info').then((m) => m.PassengerInfoPage),
  },
  {
    path: 'payment',
    loadComponent: () => import('./pages/payment/payment').then((m) => m.PaymentPage),
  },
  {
    path: 'confirmation/:reference',
    loadComponent: () =>
      import('./pages/confirmation/confirmation').then((m) => m.ConfirmationPage),
  },
  { path: '**', redirectTo: '' },
];
