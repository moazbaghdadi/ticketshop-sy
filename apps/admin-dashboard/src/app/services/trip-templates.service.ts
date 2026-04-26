import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TripTemplateStationDto {
  cityId: string;
  order: number;
  arrivalOffsetMin: number;
  departureOffsetMin: number;
}

export interface TripTemplateSegmentPriceDto {
  fromCityId: string;
  toCityId: string;
  price: number;
}

export interface TripTemplateDto {
  id: string;
  nameAr: string;
  driver: { id: string; nameAr: string };
  stations: TripTemplateStationDto[];
  segmentPrices: TripTemplateSegmentPriceDto[];
  createdAt: string;
}

export interface CreateTripTemplateRequest {
  nameAr: string;
  driver: { id?: string; name?: string };
  stations: TripTemplateStationDto[];
  segmentPrices: TripTemplateSegmentPriceDto[];
}

@Injectable({ providedIn: 'root' })
export class TripTemplatesService {
  private http = inject(HttpClient);

  list(): Observable<{ data: TripTemplateDto[] }> {
    return this.http.get<{ data: TripTemplateDto[] }>(
      `${environment.apiUrl}/dashboard/trip-templates`,
    );
  }

  get(id: string): Observable<{ data: TripTemplateDto }> {
    return this.http.get<{ data: TripTemplateDto }>(
      `${environment.apiUrl}/dashboard/trip-templates/${id}`,
    );
  }

  create(body: CreateTripTemplateRequest): Observable<{ data: TripTemplateDto }> {
    return this.http.post<{ data: TripTemplateDto }>(
      `${environment.apiUrl}/dashboard/trip-templates`,
      body,
    );
  }

  update(id: string, body: CreateTripTemplateRequest): Observable<{ data: TripTemplateDto }> {
    return this.http.patch<{ data: TripTemplateDto }>(
      `${environment.apiUrl}/dashboard/trip-templates/${id}`,
      body,
    );
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(
      `${environment.apiUrl}/dashboard/trip-templates/${id}`,
    );
  }

  instantiate(
    id: string,
    body: { date: string; firstDepartureTime: string },
  ): Observable<{ data: { id: string } }> {
    return this.http.post<{ data: { id: string } }>(
      `${environment.apiUrl}/dashboard/trip-templates/${id}/instantiate`,
      body,
    );
  }

  saveAsTemplate(tripId: string, name: string): Observable<{ data: { id: string } }> {
    return this.http.post<{ data: { id: string } }>(
      `${environment.apiUrl}/dashboard/trips/${tripId}/save-as-template`,
      { name },
    );
  }
}
