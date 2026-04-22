import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UpcomingTripSummary {
  id: string;
  date: string;
  fromCity: string;
  toCity: string;
  departureTime: string | null;
  companyNameAr: string;
  bookingsCount: number;
  seatsSold: number;
}

export interface LatestSaleSummary {
  reference: string;
  totalPrice: number;
  passengerName: string;
  seatsCount: number;
  tripDate: string;
  createdAt: string;
}

export interface CancelledTripSummary {
  id: string;
  date: string;
  fromCity: string;
  toCity: string;
  cancelledAt: string;
  cancelledReason: string;
}

export interface DashboardOverview {
  upcomingTrips: UpcomingTripSummary[];
  latestSales: LatestSaleSummary[];
  balance: number;
  cancelledTrips: CancelledTripSummary[];
}

@Injectable({ providedIn: 'root' })
export class OverviewService {
  private http = inject(HttpClient);

  getOverview(): Observable<{ data: DashboardOverview }> {
    return this.http.get<{ data: DashboardOverview }>(`${environment.apiUrl}/dashboard/overview`);
  }

  dismissCancellation(tripId: string): Observable<void> {
    return this.http.post<void>(
      `${environment.apiUrl}/dashboard/trips/${tripId}/dismiss-cancellation`,
      {},
    );
  }
}
