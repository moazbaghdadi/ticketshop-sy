import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../services/booking.service';
import { HeaderComponent } from '../../shared/header/header';
import { PaymentMethod } from '../../models/booking.model';

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [HeaderComponent],
  templateUrl: './payment.html',
  styleUrl: './payment.css',
})
export class PaymentPage {
  private router = inject(Router);
  booking = inject(BookingService);

  selectedMethod = signal<PaymentMethod | null>(null);

  trip = computed(() => this.booking.selectedTrip());
  seatCount = computed(() => this.booking.selectedSeats().length);
  seatNumbers = computed(() => this.booking.selectedSeats().join('، '));
  totalPrice = computed(() => this.booking.totalPrice());

  selectMethod(method: PaymentMethod): void {
    this.selectedMethod.set(method);
  }

  pay(): void {
    this.booking.paymentMethod.set(this.selectedMethod());
    this.router.navigate(['/confirmation']);
  }

  formatPrice(price: number): string {
    return price.toLocaleString('ar-SY') + ' ل.س';
  }
}
