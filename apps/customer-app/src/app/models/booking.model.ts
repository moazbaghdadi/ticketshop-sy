export interface City {
  id: string;
  nameAr: string;
}

export interface Trip {
  id: string;
  from: City;
  to: City;
  company: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  durationMinutes: number;
  stops: number;
  price: number;
  date: string;
}

export interface Seat {
  id: number;
  row: number;
  col: number;
  status: 'available' | 'occupied';
  gender?: 'male' | 'female';
}

export type SeatGender = 'male' | 'female';

export type PaymentMethod = 'sham-cash' | 'syriatel-cash';
