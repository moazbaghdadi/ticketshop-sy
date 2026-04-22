import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ReportTotals {
  bookings: number;
  seats: number;
  revenue: number;
  trips: number;
}

export interface ReportPerDay {
  date: string;
  bookings: number;
  seats: number;
  revenue: number;
}

export interface ReportPerRoute {
  fromCityId: string;
  fromCity: string;
  toCityId: string;
  toCity: string;
  bookings: number;
  seats: number;
  revenue: number;
}

export interface DashboardReport {
  from: string;
  to: string;
  totals: ReportTotals;
  perDay: ReportPerDay[];
  perRoute: ReportPerRoute[];
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private http = inject(HttpClient);

  generate(from: string, to: string): Observable<{ data: DashboardReport }> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<{ data: DashboardReport }>(
      `${environment.apiUrl}/dashboard/reports`,
      { params },
    );
  }

  email(from: string, to: string, recipient: string): Observable<void> {
    return this.http.post<void>(
      `${environment.apiUrl}/dashboard/reports/email`,
      { from, to, recipient },
    );
  }
}
