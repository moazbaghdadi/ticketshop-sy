import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BookingResponse } from '@ticketshop-sy/shared-models';
import { ApiService } from '../../services/api.service';
import { BookingService } from '../../services/booking.service';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  templateUrl: './confirmation.html',
  styleUrl: './confirmation.css',
})
export class ConfirmationPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private booking = inject(BookingService);

  response = signal<BookingResponse | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  trip = computed(() => this.response()?.trip ?? null);
  seatNumbers = computed(() => this.response()?.seats.join('، ') ?? '');
  totalPrice = computed(() => this.response()?.totalPrice ?? 0);
  reference = computed(() => this.response()?.reference ?? '');
  passenger = computed(() => this.response()?.passenger ?? null);

  paymentLabel = computed(() => {
    const method = this.response()?.paymentMethod;
    if (method === 'sham-cash') return 'شام كاش';
    if (method === 'syriatel-cash') return 'سيرياتيل كاش';
    return '';
  });

  ngOnInit(): void {
    const ref = this.route.snapshot.paramMap.get('reference');
    if (!ref) {
      this.router.navigate(['/']);
      return;
    }

    // Try to use in-memory booking response first (just completed payment)
    const cached = this.booking.bookingResponse();
    if (cached && cached.reference === ref) {
      this.response.set(cached);
      this.loading.set(false);
      return;
    }

    // Otherwise fetch from backend (page refresh / direct link)
    this.api.getBooking(ref).subscribe({
      next: (res) => {
        this.response.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('لم يتم العثور على الحجز.');
        this.loading.set(false);
      },
    });
  }

  formatPrice(price: number): string {
    return price.toLocaleString('ar-SY') + ' ل.س';
  }

  goHome(): void {
    this.booking.reset();
    this.router.navigate(['/']);
  }
}
