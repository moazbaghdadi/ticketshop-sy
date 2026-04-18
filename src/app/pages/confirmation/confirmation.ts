import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  templateUrl: './confirmation.html',
  styleUrl: './confirmation.css',
})
export class ConfirmationPage {
  private router = inject(Router);
  booking = inject(BookingService);

  trip = computed(() => this.booking.selectedTrip());
  seatNumbers = computed(() => this.booking.selectedSeats().join('، '));
  totalPrice = computed(() => this.booking.totalPrice());
  reference = computed(() => this.booking.bookingRef());

  paymentLabel = computed(() => {
    const method = this.booking.paymentMethod();
    if (method === 'sham-cash') return 'شام كاش';
    if (method === 'syriatel-cash') return 'سيرياتيل كاش';
    return '';
  });

  formatPrice(price: number): string {
    return price.toLocaleString('ar-SY') + ' ل.س';
  }

  goHome(): void {
    this.booking.reset();
    this.router.navigate(['/']);
  }
}
