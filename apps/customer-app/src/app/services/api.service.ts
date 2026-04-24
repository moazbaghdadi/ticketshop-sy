import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  BookingResponse,
  CreateBookingRequest,
  Seat,
  Trip,
} from '@ticketshop-sy/shared-models';
import { environment } from '../../environments/environment';

interface DataResponse<T> {
  data: T;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  searchTrips(fromCityId: string, toCityId: string, date: string): Observable<Trip[]> {
    return this.http
      .get<DataResponse<Trip[]>>(`${this.baseUrl}/trips`, {
        params: { fromCityId, toCityId, date },
      })
      .pipe(map(res => res.data));
  }

  getSeats(tripId: string, boardingStationId?: string, dropoffStationId?: string): Observable<Seat[]> {
    const params: Record<string, string> = {};
    if (boardingStationId) params['boardingStationId'] = boardingStationId;
    if (dropoffStationId) params['dropoffStationId'] = dropoffStationId;
    return this.http
      .get<DataResponse<Seat[]>>(`${this.baseUrl}/trips/${tripId}/seats`, { params })
      .pipe(map(res => res.data));
  }

  createBooking(request: CreateBookingRequest): Observable<BookingResponse> {
    return this.http
      .post<DataResponse<BookingResponse>>(`${this.baseUrl}/bookings`, request)
      .pipe(map(res => res.data));
  }

  getBooking(reference: string): Observable<BookingResponse> {
    return this.http
      .get<DataResponse<BookingResponse>>(`${this.baseUrl}/bookings/${reference}`)
      .pipe(map(res => res.data));
  }
}
