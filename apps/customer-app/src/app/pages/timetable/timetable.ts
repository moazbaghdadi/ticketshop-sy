import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Trip } from '@ticketshop-sy/shared-models';
import { ApiService } from '../../services/api.service';
import { BookingService } from '../../services/booking.service';
import { HeaderComponent } from '../../shared/header/header';

type SortMode = 'time' | 'price' | 'duration';

@Component({
  selector: 'app-timetable',
  standalone: true,
  imports: [HeaderComponent],
  templateUrl: './timetable.html',
  styleUrl: './timetable.css',
})
export class TimetablePage {
  private router = inject(Router);
  private api = inject(ApiService);
  booking = inject(BookingService);

  headerTitle = computed(() => {
    const from = this.booking.fromCity();
    const to = this.booking.toCity();
    return from && to ? `${from.nameAr} ← ${to.nameAr}` : 'الرحلات';
  });

  dates = computed(() => {
    const base = new Date(this.booking.travelDate());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      return {
        iso: d.toISOString().split('T')[0],
        dayName: d.toLocaleDateString('ar-SY', { weekday: 'short' }),
        dayNum: d.getDate(),
      };
    });
  });

  selectedDate = signal(this.booking.travelDate());
  sortBy = signal<SortMode>('time');
  rawTrips = signal<Trip[]>([]);
  loading = signal(false);

  trips = computed(() => {
    const list = [...this.rawTrips()];
    switch (this.sortBy()) {
      case 'price':
        return list.sort((a, b) => a.price - b.price);
      case 'duration':
        return list.sort((a, b) => a.durationMinutes - b.durationMinutes);
      default:
        return list.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
    }
  });

  constructor() {
    effect(() => {
      const from = this.booking.fromCity();
      const to = this.booking.toCity();
      const date = this.selectedDate();
      if (!from || !to) return;

      this.loading.set(true);
      this.api.searchTrips(from.id, to.id, date).subscribe({
        next: trips => {
          this.rawTrips.set(trips);
          this.loading.set(false);
        },
        error: () => {
          this.rawTrips.set([]);
          this.loading.set(false);
        },
      });
    });
  }

  selectDate(iso: string): void {
    this.selectedDate.set(iso);
  }

  setSort(mode: SortMode): void {
    this.sortBy.set(mode);
  }

  selectTrip(trip: Trip): void {
    this.booking.selectedTrip.set(trip);
    this.booking.selectedSeats.set([]);
    this.router.navigate(['/seat-selection']);
  }

  formatStops(stops: number): string {
    if (stops === 0) return 'بدون توقف';
    if (stops === 1) return 'محطة واحدة';
    if (stops === 2) return 'محطتان';
    return `${stops} محطات`;
  }

  viaStops(trip: Trip): string | null {
    if (!trip.stations?.length) return null;
    const sorted = [...trip.stations].sort((a, b) => a.order - b.order);
    const fromIdx = sorted.findIndex(s => s.cityId === trip.from.id);
    const toIdx = sorted.findIndex(s => s.cityId === trip.to.id);
    if (fromIdx === -1 || toIdx === -1 || toIdx - fromIdx < 2) return null;
    return sorted
      .slice(fromIdx + 1, toIdx)
      .map(s => s.nameAr)
      .join('، ');
  }

  formatPrice(price: number): string {
    return price.toLocaleString('ar-SY') + ' ل.س';
  }
}
