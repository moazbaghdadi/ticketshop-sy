import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Seat, SeatGender } from '@ticketshop-sy/shared-models';
import { SeatLayoutComponent, SeatLayoutSelection } from '@ticketshop-sy/shared-ui';
import {
  CreateDashboardBookingRequest,
  DashboardBookingSummary,
  DashboardTripDetail,
  TripsService,
} from '../../services/trips.service';

const SEAT_COUNT = 40;

@Component({
  selector: 'app-reservations',
  standalone: true,
  imports: [FormsModule, RouterLink, SeatLayoutComponent],
  templateUrl: './reservations.html',
  styleUrl: './reservations.css',
})
export class ReservationsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private tripsService = inject(TripsService);

  tripId = signal<string>('');
  detail = signal<DashboardTripDetail | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  seats = computed<Seat[]>(() => {
    const d = this.detail();
    if (!d) return [];
    const occupied = new Map<number, SeatGender>();
    for (const b of d.bookings) {
      if (b.status === 'cancelled') continue;
      for (const s of b.seatDetails) occupied.set(s.id, s.gender);
    }
    const seats: Seat[] = [];
    for (let id = 1; id <= SEAT_COUNT; id++) {
      const row = Math.floor((id - 1) / 4);
      const col = (id - 1) % 4;
      const gender = occupied.get(id);
      seats.push({
        id,
        row,
        col,
        status: gender ? 'occupied' : 'available',
        gender,
      });
    }
    return seats;
  });

  showNewBooking = signal(false);
  newSelections = signal<Record<number, SeatGender>>({});
  newBoarding = signal<string>('');
  newDropoff = signal<string>('');
  newPayment = signal<'sham-cash' | 'syriatel-cash'>('sham-cash');
  newName = signal<string>('');
  newPhone = signal<string>('');
  newEmail = signal<string>('');
  creating = signal(false);
  overrideWarning = signal<string | null>(null);
  createError = signal<string | null>(null);

  newSelectionsList = computed<SeatLayoutSelection[]>(() =>
    Object.entries(this.newSelections()).map(([id, g]) => ({ seatId: Number(id), gender: g })),
  );

  selectedSeatsSummary = computed(() =>
    Object.entries(this.newSelections())
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([id, g]) => `${id} (${g === 'male' ? 'ذكر' : 'أنثى'})`)
      .join('، '),
  );

  ngOnInit(): void {
    this.tripId.set(this.route.snapshot.paramMap.get('id') ?? '');
    this.load();
  }

  load(): void {
    const id = this.tripId();
    if (!id) return;
    this.loading.set(true);
    this.error.set(null);
    this.tripsService.getDetail(id).subscribe({
      next: (res) => {
        this.detail.set(res.data);
        this.loading.set(false);
        const stations = res.data.stations;
        if (stations.length >= 2) {
          this.newBoarding.set(stations[0].cityId);
          this.newDropoff.set(stations[stations.length - 1].cityId);
        }
      },
      error: () => {
        this.error.set('تعذر تحميل الحجوزات');
        this.loading.set(false);
      },
    });
  }

  openNewBooking(): void {
    this.showNewBooking.set(true);
    this.newSelections.set({});
    this.newName.set('');
    this.newPhone.set('');
    this.newEmail.set('');
    this.overrideWarning.set(null);
    this.createError.set(null);
  }

  closeNewBooking(): void {
    this.showNewBooking.set(false);
  }

  onSeatTap(seat: Seat): void {
    const current = this.newSelections();
    if (current[seat.id]) {
      const next = { ...current };
      delete next[seat.id];
      this.newSelections.set(next);
      return;
    }
    const gender: SeatGender = 'male';
    this.newSelections.set({ ...current, [seat.id]: gender });
  }

  toggleGender(seatId: number): void {
    const current = this.newSelections();
    const g = current[seatId];
    if (!g) return;
    this.newSelections.set({ ...current, [seatId]: g === 'male' ? 'female' : 'male' });
  }

  removeSeat(seatId: number): void {
    const next = { ...this.newSelections() };
    delete next[seatId];
    this.newSelections.set(next);
  }

  canSubmit(): boolean {
    return (
      Object.keys(this.newSelections()).length > 0 &&
      !!this.newBoarding() &&
      !!this.newDropoff() &&
      this.newBoarding() !== this.newDropoff() &&
      !!this.newName().trim() &&
      !!this.newPhone().trim() &&
      !this.creating()
    );
  }

  submitBooking(): void {
    if (!this.canSubmit()) return;
    this.creating.set(true);
    this.overrideWarning.set(null);
    this.createError.set(null);

    const body: CreateDashboardBookingRequest = {
      tripId: this.tripId(),
      seatSelections: Object.entries(this.newSelections()).map(([id, g]) => ({
        seatId: Number(id),
        gender: g,
      })),
      paymentMethod: this.newPayment(),
      boardingStationId: this.newBoarding(),
      dropoffStationId: this.newDropoff(),
      passenger: {
        name: this.newName().trim(),
        phone: this.newPhone().trim(),
        email: this.newEmail().trim() || null,
      },
    };

    this.tripsService.createBooking(body).subscribe({
      next: (res) => {
        this.creating.set(false);
        if (res.warning) {
          this.overrideWarning.set(res.warning);
        }
        this.closeNewBooking();
        this.load();
      },
      error: (err) => {
        this.creating.set(false);
        const msg =
          typeof err?.error?.message === 'string'
            ? err.error.message
            : Array.isArray(err?.error?.message)
              ? err.error.message.join('، ')
              : 'تعذر إنشاء الحجز';
        this.createError.set(msg);
      },
    });
  }

  emailBooking(booking: DashboardBookingSummary): void {
    if (!booking.passengerEmail) return;
    this.tripsService.emailBooking(booking.reference).subscribe({
      next: () => alert('تم إرسال التذكرة إلى ' + booking.passengerEmail),
      error: () => alert('تعذر إرسال التذكرة'),
    });
  }

  printTarget = signal<DashboardBookingSummary | null>(null);

  printBooking(booking: DashboardBookingSummary): void {
    this.printTarget.set(booking);
    const title = document.title;
    document.title = `Ticket-${booking.reference}`;
    document.body.classList.add('printing-ticket');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('printing-ticket');
      document.title = title;
      this.printTarget.set(null);
    }, 50);
  }

  formatPrice(price: number): string {
    return price.toLocaleString('ar-SY') + ' ل.س';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('ar-SY', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  stationName(cityId: string): string {
    return this.detail()?.stations.find((s) => s.cityId === cityId)?.nameAr ?? cityId;
  }
}
