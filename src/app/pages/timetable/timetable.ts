import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { HeaderComponent } from '../../shared/header/header';
import { Trip } from '../../models/booking.model';
import { generateTrips } from '../../data/trips.data';

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

  private rawTrips = computed(() => {
    const from = this.booking.fromCity();
    const to = this.booking.toCity();
    if (!from || !to) return [];
    return generateTrips(from, to, this.selectedDate());
  });

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

  formatPrice(price: number): string {
    return price.toLocaleString('ar-SY') + ' ل.س';
  }
}
