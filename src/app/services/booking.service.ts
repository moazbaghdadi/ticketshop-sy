import { computed, Injectable, signal } from '@angular/core';
import { City, PaymentMethod, Trip } from '../models/booking.model';

@Injectable({ providedIn: 'root' })
export class BookingService {
  readonly fromCity = signal<City | null>(null);
  readonly toCity = signal<City | null>(null);
  readonly travelDate = signal<string>(new Date().toISOString().split('T')[0]);
  readonly selectedTrip = signal<Trip | null>(null);
  readonly selectedSeats = signal<number[]>([]);
  readonly paymentMethod = signal<PaymentMethod | null>(null);

  readonly bookingRef = computed(
    () => 'SY-' + Math.random().toString(36).substring(2, 8).toUpperCase()
  );

  readonly totalPrice = computed(() => {
    const trip = this.selectedTrip();
    const seats = this.selectedSeats();
    return trip ? trip.price * seats.length : 0;
  });

  swapCities(): void {
    const from = this.fromCity();
    const to = this.toCity();
    this.fromCity.set(to);
    this.toCity.set(from);
  }

  reset(): void {
    this.fromCity.set(null);
    this.toCity.set(null);
    this.travelDate.set(new Date().toISOString().split('T')[0]);
    this.selectedTrip.set(null);
    this.selectedSeats.set([]);
    this.paymentMethod.set(null);
  }
}
