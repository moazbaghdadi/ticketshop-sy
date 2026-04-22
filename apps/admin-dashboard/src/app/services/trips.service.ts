import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BookingResponse } from '@ticketshop-sy/shared-models';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DashboardTripSummary {
  id: string;
  date: string;
  fromCity: string;
  toCity: string;
  departureTime: string | null;
  arrivalTime: string | null;
  stationsCount: number;
  bookingsCount: number;
  seatsSold: number;
  cancelledAt: string | null;
  cancelledReason: string | null;
}

export interface DashboardTripListResult {
  trips: DashboardTripSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardBookingSummary {
  id: string;
  reference: string;
  passengerName: string;
  passengerPhone: string;
  passengerEmail: string | null;
  seatIds: number[];
  seatDetails: { id: number; gender: 'male' | 'female' }[];
  boardingStationId: string;
  boardingCity: string;
  dropoffStationId: string;
  dropoffCity: string;
  totalPrice: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
}

export interface DashboardTripDetail {
  id: string;
  date: string;
  companyId: string;
  cancelledAt: string | null;
  cancelledReason: string | null;
  stations: {
    cityId: string;
    nameAr: string;
    order: number;
    arrivalTime: string | null;
    departureTime: string | null;
  }[];
  bookings: DashboardBookingSummary[];
}

export interface CreateDashboardBookingRequest {
  tripId: string;
  seatSelections: { seatId: number; gender: 'male' | 'female' }[];
  paymentMethod: 'sham-cash' | 'syriatel-cash';
  boardingStationId: string;
  dropoffStationId: string;
  passenger: { name: string; phone: string; email?: string | null };
}

export interface CreateDashboardTripRequest {
  date: string;
  stations: {
    cityId: string;
    order: number;
    arrivalTime: string | null;
    departureTime: string | null;
  }[];
  segmentPrices: { fromCityId: string; toCityId: string; price: number }[];
}

@Injectable({ providedIn: 'root' })
export class TripsService {
  private http = inject(HttpClient);

  list(opts: { date?: string; page?: number } = {}): Observable<{ data: DashboardTripListResult }> {
    let params = new HttpParams();
    if (opts.date) params = params.set('date', opts.date);
    if (opts.page) params = params.set('page', String(opts.page));
    return this.http.get<{ data: DashboardTripListResult }>(
      `${environment.apiUrl}/dashboard/trips`,
      { params },
    );
  }

  getDetail(tripId: string): Observable<{ data: DashboardTripDetail }> {
    return this.http.get<{ data: DashboardTripDetail }>(
      `${environment.apiUrl}/dashboard/trips/${tripId}/bookings`,
    );
  }

  cancel(tripId: string, reason: string): Observable<{ data: { id: string; cancelledAt: string; cancelledReason: string } }> {
    return this.http.post<{ data: { id: string; cancelledAt: string; cancelledReason: string } }>(
      `${environment.apiUrl}/dashboard/trips/${tripId}/cancel`,
      { reason },
    );
  }

  createBooking(
    body: CreateDashboardBookingRequest,
  ): Observable<{ data: BookingResponse; warning: string | null }> {
    return this.http.post<{ data: BookingResponse; warning: string | null }>(
      `${environment.apiUrl}/dashboard/bookings`,
      body,
    );
  }

  createTrip(body: CreateDashboardTripRequest): Observable<{ data: { id: string } }> {
    return this.http.post<{ data: { id: string } }>(
      `${environment.apiUrl}/dashboard/trips`,
      body,
    );
  }

  emailBooking(reference: string): Observable<void> {
    return this.http.post<void>(
      `${environment.apiUrl}/dashboard/bookings/${reference}/email`,
      {},
    );
  }
}
