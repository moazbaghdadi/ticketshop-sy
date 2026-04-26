import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DriverDto {
  id: string;
  nameAr: string;
  createdAt: string;
}

export interface DriverDeleteConflict {
  message: string;
  upcomingTripCount: number;
  sampleTripDates: string[];
}

@Injectable({ providedIn: 'root' })
export class DriversService {
  private http = inject(HttpClient);

  list(query?: string): Observable<{ data: DriverDto[] }> {
    let params = new HttpParams();
    if (query?.trim()) params = params.set('query', query.trim());
    return this.http.get<{ data: DriverDto[] }>(
      `${environment.apiUrl}/dashboard/drivers`,
      { params },
    );
  }

  get(id: string): Observable<{ data: DriverDto }> {
    return this.http.get<{ data: DriverDto }>(
      `${environment.apiUrl}/dashboard/drivers/${id}`,
    );
  }

  create(nameAr: string): Observable<{ data: DriverDto }> {
    return this.http.post<{ data: DriverDto }>(
      `${environment.apiUrl}/dashboard/drivers`,
      { nameAr },
    );
  }

  rename(id: string, nameAr: string): Observable<{ data: DriverDto }> {
    return this.http.patch<{ data: DriverDto }>(
      `${environment.apiUrl}/dashboard/drivers/${id}`,
      { nameAr },
    );
  }

  /**
   * 204 on success. 409 with `{ upcomingTripCount, sampleTripDates }` when the driver is on
   * upcoming trips and replacementDriverId is omitted — caller is expected to read err.error
   * and re-issue the call with a replacementDriverId.
   */
  remove(id: string, replacementDriverId?: string): Observable<void> {
    let params = new HttpParams();
    if (replacementDriverId) params = params.set('replacementDriverId', replacementDriverId);
    return this.http.delete<void>(
      `${environment.apiUrl}/dashboard/drivers/${id}`,
      { params },
    );
  }
}
