import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Seat, SeatGender } from '@ticketshop-sy/shared-models';

export interface SeatLayoutSelection {
  seatId: number;
  gender: SeatGender;
}

@Component({
  selector: 'lib-seat-layout',
  standalone: true,
  templateUrl: './seat-layout.html',
  styleUrl: './seat-layout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeatLayoutComponent {
  seats = input.required<Seat[]>();
  selections = input<SeatLayoutSelection[]>([]);
  pendingSeatId = input<number | null>(null);
  disabled = input<boolean>(false);
  showLegend = input<boolean>(true);

  seatTap = output<Seat>();

  selectionMap = computed(() => {
    const map = new Map<number, SeatGender>();
    for (const s of this.selections()) map.set(s.seatId, s.gender);
    return map;
  });

  getSeatClass(seat: Seat): string {
    if (seat.status === 'occupied') return `seat occupied-${seat.gender ?? 'male'}`;
    const selected = this.selectionMap().get(seat.id);
    if (selected) return `seat selected-${selected}`;
    if (this.pendingSeatId() === seat.id) return 'seat pending';
    if (this.isBothBlocked(seat)) return 'seat blocked';
    return 'seat available';
  }

  isBothBlocked(seat: Seat): boolean {
    return this.isGenderConflicting(seat, 'male') && this.isGenderConflicting(seat, 'female');
  }

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

  getGridColumn(col: number): number {
    return col < 2 ? col + 1 : col + 2;
  }

  onTap(seat: Seat): void {
    if (this.disabled()) return;
    if (seat.status === 'occupied') return;
    if (this.getSeatClass(seat) === 'seat blocked') return;
    this.seatTap.emit(seat);
  }
}
