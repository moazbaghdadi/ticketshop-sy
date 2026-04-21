import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Seat, SeatGender } from '@ticketshop-sy/shared-models';
import { ApiService } from '../../services/api.service';
import { BookingService } from '../../services/booking.service';
import { HeaderComponent } from '../../shared/header/header';

@Component({
  selector: 'app-seat-selection',
  standalone: true,
  imports: [HeaderComponent],
  templateUrl: './seat-selection.html',
  styleUrl: './seat-selection.css',
})
export class SeatSelectionPage implements OnInit {
  private router = inject(Router);
  private api = inject(ApiService);
  booking = inject(BookingService);

  seats = signal<Seat[]>([]);

  /** Map of seatId → chosen gender for seats selected in this session */
  selectedSeatMap = signal<Record<number, SeatGender>>({});

  /** Seat tapped by the user, awaiting gender assignment */
  pendingSeat = signal<Seat | null>(null);

  headerTitle = computed(() => {
    const trip = this.booking.selectedTrip();
    return trip
      ? `${trip.company.nameAr} - ${trip.from.nameAr} → ${trip.to.nameAr}`
      : 'اختيار المقاعد';
  });

  selectedCount = computed(() => Object.keys(this.selectedSeatMap()).length);

  subtotal = computed(() => {
    const trip = this.booking.selectedTrip();
    return trip ? trip.price * this.selectedCount() : 0;
  });

  selectedSeatNumbers = computed(() =>
    Object.entries(this.selectedSeatMap())
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([id, g]) => `${id} (${g === 'male' ? 'ذكر' : 'أنثى'})`)
      .join('، '),
  );

  ngOnInit(): void {
    const trip = this.booking.selectedTrip();
    if (!trip) return;
    this.api.getSeats(trip.id).subscribe({
      next: seats => this.seats.set(seats),
    });
  }

  /**
   * Returns true if assigning `gender` to `seat` would conflict with a
   * pre-occupied neighbour on the same side-pair of the same row.
   * Current-session selections are exempt (family/group exception).
   */
  isGenderConflicting(seat: Seat, gender: SeatGender): boolean {
    const sideCols = seat.col < 2 ? [0, 1] : [2, 3];
    return this.seats().some(
      (s) =>
        s.row === seat.row &&
        sideCols.includes(s.col) &&
        s.id !== seat.id &&
        s.status === 'occupied' &&
        s.gender !== undefined &&
        s.gender !== gender,
    );
  }

  getSeatClass(seat: Seat): string {
    if (seat.status === 'occupied') return `seat occupied-${seat.gender ?? 'male'}`;
    const map = this.selectedSeatMap();
    if (map[seat.id]) return `seat selected-${map[seat.id]}`;
    if (this.pendingSeat()?.id === seat.id) return 'seat pending';
    // Blocked only if BOTH genders conflict (seat is completely unavailable)
    const bothBlocked =
      this.isGenderConflicting(seat, 'male') && this.isGenderConflicting(seat, 'female');
    if (bothBlocked) return 'seat blocked';
    return 'seat available';
  }

  tapSeat(seat: Seat): void {
    if (seat.status === 'occupied') return;

    const map = this.selectedSeatMap();

    // Tapping an already-selected seat deselects it
    if (map[seat.id]) {
      this.selectedSeatMap.update((m) => {
        const next = { ...m };
        delete next[seat.id];
        return next;
      });
      this.pendingSeat.set(null);
      return;
    }

    // Tapping the pending seat again cancels the selection
    if (this.pendingSeat()?.id === seat.id) {
      this.pendingSeat.set(null);
      return;
    }

    this.pendingSeat.set(seat);
  }

  assignGender(gender: SeatGender): void {
    const seat = this.pendingSeat();
    if (!seat) return;
    if (this.isGenderConflicting(seat, gender)) return;

    this.selectedSeatMap.update((m) => ({ ...m, [seat.id]: gender }));
    this.pendingSeat.set(null);
  }

  getGridColumn(col: number): number {
    return col < 2 ? col + 1 : col + 2;
  }

  proceed(): void {
    const ids = Object.keys(this.selectedSeatMap()).map(Number);
    this.booking.selectedSeats.set(ids);
    this.booking.selectedSeatMap.set(this.selectedSeatMap());
    this.router.navigate(['/passenger-info']);
  }

  formatPrice(price: number): string {
    return price.toLocaleString('ar-SY') + ' ل.س';
  }
}
