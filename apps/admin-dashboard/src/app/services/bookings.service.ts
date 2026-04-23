import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BookingResponse } from '@ticketshop-sy/shared-models';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type BookingStatusFilter = 'all' | 'past' | 'ongoing' | 'cancelled';

export interface SearchBookingsOptions {
  query?: string;
  date?: string;
  status?: BookingStatusFilter;
  page?: number;
}

export interface DashboardBookingListItem {
  id: string;
  reference: string;
  passengerName: string;
  passengerPhone: string;
  passengerEmail: string | null;
  seatIds: number[];
  boardingStationId: string;
  boardingCity: string;
  dropoffStationId: string;
  dropoffCity: string;
  tripDate: string;
  totalPrice: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  tripCancelled: boolean;
}

export interface BookingsSearchResult {
  bookings: DashboardBookingListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateBookingRequest {
  passenger: {
    name?: string;
    phone?: string;
    email?: string | null;
  };
}

@Injectable({ providedIn: 'root' })
export class BookingsService {
  private http = inject(HttpClient);

  search(opts: SearchBookingsOptions = {}): Observable<{ data: BookingsSearchResult }> {
    let params = new HttpParams();
    if (opts.query) params = params.set('query', opts.query);
    if (opts.date) params = params.set('date', opts.date);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.page) params = params.set('page', String(opts.page));
    return this.http.get<{ data: BookingsSearchResult }>(
      `${environment.apiUrl}/dashboard/bookings`,
      { params },
    );
  }

  getDetail(reference: string): Observable<{ data: BookingResponse }> {
    return this.http.get<{ data: BookingResponse }>(
      `${environment.apiUrl}/dashboard/bookings/${reference}`,
    );
  }

  update(
    reference: string,
    body: UpdateBookingRequest,
  ): Observable<{ data: BookingResponse }> {
    return this.http.patch<{ data: BookingResponse }>(
      `${environment.apiUrl}/dashboard/bookings/${reference}`,
      body,
    );
  }

  cancel(reference: string): Observable<{ data: BookingResponse }> {
    return this.http.post<{ data: BookingResponse }>(
      `${environment.apiUrl}/dashboard/bookings/${reference}/cancel`,
      {},
    );
  }

  reactivate(reference: string): Observable<{ data: BookingResponse }> {
    return this.http.post<{ data: BookingResponse }>(
      `${environment.apiUrl}/dashboard/bookings/${reference}/reactivate`,
      {},
    );
  }

  email(reference: string): Observable<void> {
    return this.http.post<void>(
      `${environment.apiUrl}/dashboard/bookings/${reference}/email`,
      {},
    );
  }
}
