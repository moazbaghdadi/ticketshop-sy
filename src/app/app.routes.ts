import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then(m => m.HomePage),
  },
  {
    path: 'timetable',
    loadComponent: () => import('./pages/timetable/timetable').then(m => m.TimetablePage),
  },
  {
    path: 'seat-selection',
    loadComponent: () => import('./pages/seat-selection/seat-selection').then(m => m.SeatSelectionPage),
  },
  {
    path: 'payment',
    loadComponent: () => import('./pages/payment/payment').then(m => m.PaymentPage),
  },
  {
    path: 'confirmation',
    loadComponent: () => import('./pages/confirmation/confirmation').then(m => m.ConfirmationPage),
  },
  { path: '**', redirectTo: '' },
];
