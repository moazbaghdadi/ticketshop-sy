import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CreateBookingRequest, PaymentMethod } from '@ticketshop-sy/shared-models';
import { ApiService } from '../../services/api.service';
import { BookingService } from '../../services/booking.service';
import { HeaderComponent } from '../../shared/header/header';

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [HeaderComponent],
  templateUrl: './payment.html',
  styleUrl: './payment.css',
})
export class PaymentPage {
  private router = inject(Router);
  private api = inject(ApiService);
  booking = inject(BookingService);

  selectedMethod = signal<PaymentMethod | null>(null);
  submitting = signal(false);
  error = signal<string | null>(null);

  trip = computed(() => this.booking.selectedTrip());
  seatCount = computed(() => this.booking.selectedSeats().length);
  seatNumbers = computed(() => this.booking.selectedSeats().join('، '));
  totalPrice = computed(() => this.booking.totalPrice());

  selectMethod(method: PaymentMethod): void {
    this.selectedMethod.set(method);
  }

  pay(): void {
    const trip = this.booking.selectedTrip();
    const method = this.selectedMethod();
    const seatMap = this.booking.selectedSeatMap();
    if (!trip || !method) return;

    const request: CreateBookingRequest = {
      tripId: trip.id,
      seatSelections: Object.entries(seatMap).map(([id, gender]) => ({
        seatId: Number(id),
        gender,
      })),
      paymentMethod: method,
    };

    this.submitting.set(true);
    this.error.set(null);

    this.api.createBooking(request).subscribe({
      next: response => {
        this.booking.paymentMethod.set(method);
        this.booking.bookingResponse.set(response);
        this.submitting.set(false);
        this.router.navigate(['/confirmation', response.reference]);
      },
      error: () => {
        this.error.set('حدث خطأ أثناء الحجز. يرجى المحاولة مرة أخرى.');
        this.submitting.set(false);
      },
    });
  }

  formatPrice(price: number): string {
    return price.toLocaleString('ar-SY') + ' ل.س';
  }
}
