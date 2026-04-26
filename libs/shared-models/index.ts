export interface City {
  id: string;
  nameAr: string;
}

export interface Company {
  id: string;
  nameAr: string;
}

export interface TripStation {
  cityId: string;
  nameAr: string;
  order: number;
  arrivalTime: string | null;
  departureTime: string | null;
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
  stations: TripStation[];
}

export interface Seat {
  id: number;
  row: number;
  col: number;
  status: 'available' | 'occupied';
  gender?: 'male' | 'female';
}

export type SeatGender = 'male' | 'female';

export type PaymentMethod = 'sham-cash' | 'syriatel-cash' | 'cash';

/**
 * Payment methods that customers can self-select on the customer-facing checkout.
 * `cash` is excluded — it's only available to staff via the admin-dashboard.
 */
export const CUSTOMER_PAYMENT_METHODS: readonly PaymentMethod[] = ['sham-cash', 'syriatel-cash'];

/**
 * Payment methods staff can record from the admin-dashboard new-booking modal.
 */
export const DASHBOARD_PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'sham-cash', 'syriatel-cash'];

export interface SeatSelection {
  seatId: number;
  gender: SeatGender;
}

export interface PassengerInfo {
  name: string;
  phone: string;
  email?: string | null;
}

export interface CreateBookingRequest {
  tripId: string;
  seatSelections: SeatSelection[];
  paymentMethod: PaymentMethod;
  boardingStationId: string;
  dropoffStationId: string;
  passenger: PassengerInfo;
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
  boardingStationId: string;
  dropoffStationId: string;
  passenger: PassengerInfo;
  tripCancelled: boolean;
  tripCancelledAt: string | null;
  tripCancelledReason: string | null;
}

export type UserRole = 'admin' | 'sales';

export const USER_ROLES: readonly UserRole[] = ['admin', 'sales'];

export interface Driver {
  id: string;
  nameAr: string;
}

/**
 * Returns true when the two half-open segments [aStart, aEnd) and [bStart, bEnd) overlap.
 * Segments that merely touch (a.end == b.start) do NOT overlap — so a passenger dropping
 * off at station X frees the seat for another passenger boarding at X.
 */
export function segmentsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
