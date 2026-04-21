export interface City {
  id: string;
  nameAr: string;
}

export interface Company {
  id: string;
  nameAr: string;
}

export interface Trip {
  id: string;
  from: City;
  to: City;
  company: Company;
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

export interface SeatSelection {
  seatId: number;
  gender: SeatGender;
}

export interface CreateBookingRequest {
  tripId: string;
  seatSelections: SeatSelection[];
  paymentMethod: PaymentMethod;
}

export interface SeatDetail {
  id: number;
  row: number;
  col: number;
  gender: SeatGender;
}

export interface BookingResponse {
  id: string;
  reference: string;
  trip: Trip;
  seats: number[];
  seatDetails: SeatDetail[];
  paymentMethod: PaymentMethod;
  totalPrice: number;
  status: string;
  createdAt: string;
}
